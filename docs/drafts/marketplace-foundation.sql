-- Reviewable source draft for the additive tradR. marketplace foundation.
-- The versioned local migration is in supabase/migrations/; it has passed a
-- clean local reset and disposable behavior tests but is not deployed.
--
-- Money is stored as integer kobo (NGN). Existing listings.price_ngn is NGN;
-- trusted checkout code must re-read that value and multiply by 100.
-- Pricing policy: 5% marketplace commission on item subtotal; flat NGN 1,000
-- buyer delivery fee when tradR handles delivery; seller-arranged delivery is NGN 0.
-- Amounts are stored in kobo. Processor-fee allocation and payout timing remain open.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Shared private helpers
-- ---------------------------------------------------------------------------

create or replace function private.reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception '% is append-only; write a correcting event instead', tg_table_name;
end;
$$;

revoke all on function private.reject_append_only_mutation() from public, anon, authenticated;

-- admin_users is intentionally not exposed to clients. This narrowly scoped
-- SECURITY DEFINER predicate lets RLS policies check admin status safely.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
  );
$$;

revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Carts: one active cart per buyer, containing items from exactly one shop
-- ---------------------------------------------------------------------------

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  shop_id uuid not null references public.vendors(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'converted', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index carts_one_active_per_buyer_uidx
  on public.carts (buyer_id)
  where status = 'active';
create index carts_shop_id_idx on public.carts (shop_id);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_cart_listing_uidx unique (cart_id, listing_id)
);
create index cart_items_listing_id_idx on public.cart_items (listing_id);

create or replace function private.guard_cart_shop()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_shop_status text;
begin
  select v.verification_status
    into v_shop_status
  from public.vendors v
  where v.id = new.shop_id;

  if v_shop_status is distinct from 'approved' then
    raise exception 'Only an approved shop can be used for checkout';
  end if;

  if tg_op = 'UPDATE'
     and new.shop_id is distinct from old.shop_id
     and exists (
       select 1 from public.cart_items ci where ci.cart_id = old.id
     ) then
    raise exception 'Clear the cart before switching shops';
  end if;

  return new;
end;
$$;
revoke all on function private.guard_cart_shop() from public, anon, authenticated;

create trigger carts_guard_shop
  before insert or update of shop_id on public.carts
  for each row execute function private.guard_cart_shop();

create or replace function private.guard_cart_item_listing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cart_shop uuid;
  v_cart_status text;
  v_listing_shop uuid;
  v_listing_status text;
  v_moderation_status text;
  v_visible_until timestamptz;
  v_shop_status text;
begin
  select
    c.shop_id,
    c.status,
    l.vendor_id,
    l.status,
    l.moderation_status,
    l.visible_until,
    v.verification_status
  into
    v_cart_shop,
    v_cart_status,
    v_listing_shop,
    v_listing_status,
    v_moderation_status,
    v_visible_until,
    v_shop_status
  from public.carts c
  join public.listings l on l.id = new.listing_id
  join public.vendors v on v.id = l.vendor_id
  where c.id = new.cart_id;

  if not found
     or v_cart_status <> 'active'
     or v_cart_shop is distinct from v_listing_shop
     or v_listing_status <> 'published'
     or v_moderation_status <> 'approved'
     or v_visible_until is null
     or v_visible_until <= now()
     or v_shop_status <> 'approved' then
    raise exception 'This item is not currently available in this shop';
  end if;

  return new;
end;
$$;
revoke all on function private.guard_cart_item_listing() from public, anon, authenticated;

create trigger cart_items_guard_listing
  before insert or update of cart_id, listing_id on public.cart_items
  for each row execute function private.guard_cart_item_listing();

-- ---------------------------------------------------------------------------
-- Orders: one vendor per order; snapshots preserve the accepted purchase terms
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_order_number text not null unique,
  checkout_idempotency_key text not null,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  items_subtotal_kobo bigint not null check (items_subtotal_kobo >= 0),
  delivery_fee_kobo bigint not null default 0 check (delivery_fee_kobo >= 0),
  marketplace_commission_kobo bigint not null default 0
    check (marketplace_commission_kobo >= 0 and marketplace_commission_kobo <= items_subtotal_kobo),
  payment_processor_fee_kobo bigint not null default 0
    check (payment_processor_fee_kobo >= 0),
  buyer_total_kobo bigint not null
    check (buyer_total_kobo >= items_subtotal_kobo),
  seller_net_kobo bigint not null
    check (seller_net_kobo >= 0 and seller_net_kobo <= items_subtotal_kobo),
  payment_status text not null default 'pending'
    check (payment_status in (
      'pending', 'processing', 'succeeded', 'failed', 'abandoned',
      'refund_pending', 'partially_refunded', 'refunded', 'disputed'
    )),
  order_status text not null default 'awaiting_payment'
    check (order_status in (
      'awaiting_payment', 'pending_seller_confirmation', 'accepted', 'preparing',
      'ready_for_handover', 'dispatched', 'delivered', 'completed',
      'cancelled', 'refund_pending', 'refunded', 'disputed'
    )),
  delivery_method text not null check (delivery_method in ('seller', 'tradr')),
  buyer_contact_snapshot jsonb not null,
  delivery_address_snapshot jsonb,
  buyer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  constraint orders_checkout_idempotency_uidx
    unique (buyer_id, checkout_idempotency_key),
  constraint orders_commission_policy_check
    check (marketplace_commission_kobo = round(items_subtotal_kobo::numeric * 0.05)::bigint),
  constraint orders_delivery_fee_policy_check
    check (delivery_fee_kobo = case when delivery_method = 'tradr' then 100000 else 0 end),
  constraint orders_buyer_total_check
    check (buyer_total_kobo = items_subtotal_kobo + delivery_fee_kobo),
  constraint orders_seller_net_check
    check (seller_net_kobo = items_subtotal_kobo - marketplace_commission_kobo)
);

create index orders_buyer_created_idx on public.orders (buyer_id, created_at desc);
create index orders_vendor_status_created_idx
  on public.orders (vendor_id, order_status, created_at desc);
create index orders_payment_status_idx on public.orders (payment_status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  listing_id uuid references public.listings(id) on delete set null,
  title_snapshot text not null,
  image_snapshot text,
  variant_snapshot jsonb,
  quantity integer not null check (quantity > 0),
  unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  unit_reference_price_kobo bigint
    check (unit_reference_price_kobo is null or unit_reference_price_kobo >= 0),
  line_subtotal_kobo bigint not null
    check (line_subtotal_kobo = quantity::bigint * unit_price_kobo),
  created_at timestamptz not null default now()
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_listing_id_idx on public.order_items (listing_id);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('buyer', 'seller', 'agent', 'admin', 'system')),
  event_type text not null,
  from_status text,
  to_status text,
  public_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_events_order_created_idx on public.order_events (order_id, created_at);
create trigger order_events_no_mutation
  before update or delete on public.order_events
  for each row execute function private.reject_append_only_mutation();

-- ---------------------------------------------------------------------------
-- Buyer payments: separate from retired seller-subscription payment records
-- ---------------------------------------------------------------------------

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null default 'paystack' check (provider = 'paystack'),
  provider_reference text not null unique,
  provider_transaction_id text unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending'
    check (status in (
      'pending', 'processing', 'succeeded', 'failed', 'abandoned',
      'refund_pending', 'partially_refunded', 'refunded', 'disputed'
    )),
  channel text,
  verified_at timestamptz,
  webhook_event_id text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_payments_order_created_idx
  on public.order_payments (order_id, created_at desc);
create index order_payments_status_created_idx
  on public.order_payments (status, created_at);
create unique index order_payments_webhook_event_id_uidx
  on public.order_payments (webhook_event_id)
  where webhook_event_id is not null;

-- ---------------------------------------------------------------------------
-- Seller and marketplace accounting ledgers
-- Positive seller entries increase seller payable; negative entries reduce it.
-- Positive platform entries increase platform balance; negative entries reduce it.
-- Entries are append-only; corrections use reversing entries.
-- ---------------------------------------------------------------------------

create table public.seller_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  entry_type text not null check (entry_type in (
    'sale_proceeds', 'marketplace_commission', 'processor_fee',
    'refund', 'chargeback', 'payout', 'adjustment'
  )),
  amount_kobo bigint not null check (amount_kobo <> 0),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  reference text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index seller_ledger_vendor_created_idx
  on public.seller_ledger_entries (vendor_id, created_at desc);
create index seller_ledger_order_idx on public.seller_ledger_entries (order_id);
create trigger seller_ledger_entries_no_mutation
  before update or delete on public.seller_ledger_entries
  for each row execute function private.reject_append_only_mutation();

create table public.marketplace_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete restrict,
  vendor_id uuid references public.vendors(id) on delete restrict,
  delivery_id uuid,
  entry_type text not null check (entry_type in (
    'commission_revenue', 'delivery_revenue', 'delivery_cost',
    'processor_fee', 'refund', 'adjustment'
  )),
  amount_kobo bigint not null check (amount_kobo <> 0),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  reference text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index marketplace_ledger_created_idx
  on public.marketplace_ledger_entries (created_at desc);
create index marketplace_ledger_order_idx
  on public.marketplace_ledger_entries (order_id);
create trigger marketplace_ledger_entries_no_mutation
  before update or delete on public.marketplace_ledger_entries
  for each row execute function private.reject_append_only_mutation();

create table public.seller_payouts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency char(3) not null default 'NGN' check (currency = 'NGN'),
  provider text not null default 'paystack',
  provider_reference text unique,
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'succeeded', 'failed', 'cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  failure_reason text
);
create index seller_payouts_vendor_requested_idx
  on public.seller_payouts (vendor_id, requested_at desc);
create index seller_payouts_status_idx on public.seller_payouts (status);

-- ---------------------------------------------------------------------------
-- Delivery operations
-- ---------------------------------------------------------------------------

create table public.delivery_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'suspended')),
  display_name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  method text not null check (method in ('seller', 'tradr')),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'assigned', 'picked_up', 'delivered', 'failed', 'cancelled')),
  fee_kobo bigint not null default 0 check (fee_kobo >= 0),
  pickup_note text,
  destination_snapshot jsonb not null,
  assigned_agent_id uuid references public.delivery_agents(id) on delete restrict,
  dispatch_at timestamptz,
  delivered_at timestamptz,
  proof_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_fee_policy_check
    check (fee_kobo = case when method = 'tradr' then 100000 else 0 end)
);
create index deliveries_assigned_agent_status_idx
  on public.deliveries (assigned_agent_id, status);
create index deliveries_status_created_idx on public.deliveries (status, created_at);

alter table public.marketplace_ledger_entries
  add constraint marketplace_ledger_delivery_id_fkey
  foreign key (delivery_id) references public.deliveries(id) on delete restrict;

create table public.delivery_verifications (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index delivery_verifications_delivery_idx
  on public.delivery_verifications (delivery_id);
create index delivery_verifications_expiry_idx
  on public.delivery_verifications (expires_at)
  where used_at is null;

-- ---------------------------------------------------------------------------
-- Timestamp maintenance
-- ---------------------------------------------------------------------------

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();
create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();
create trigger order_payments_set_updated_at
  before update on public.order_payments
  for each row execute function public.set_updated_at();
create trigger delivery_agents_set_updated_at
  before update on public.delivery_agents
  for each row execute function public.set_updated_at();
create trigger deliveries_set_updated_at
  before update on public.deliveries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.order_payments enable row level security;
alter table public.seller_ledger_entries enable row level security;
alter table public.marketplace_ledger_entries enable row level security;
alter table public.seller_payouts enable row level security;
alter table public.delivery_agents enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_verifications enable row level security;

create policy carts_owner_all
  on public.carts for all to authenticated
  using (buyer_id = (select auth.uid()))
  with check (buyer_id = (select auth.uid()));

create policy cart_items_owner_all
  on public.cart_items for all to authenticated
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.buyer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.buyer_id = (select auth.uid())
    )
  );

create policy orders_participant_read
  on public.orders for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or exists (
      select 1 from public.vendors v
      where v.id = orders.vendor_id
        and v.profile_id = (select auth.uid())
        and orders.payment_status in ('succeeded', 'refund_pending', 'partially_refunded', 'refunded', 'disputed')
    )
    or (select private.is_admin())
  );

create policy order_items_participant_read
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          o.buyer_id = (select auth.uid())
          or exists (
            select 1 from public.vendors v
            where v.id = o.vendor_id
              and v.profile_id = (select auth.uid())
              and o.payment_status in ('succeeded', 'refund_pending', 'partially_refunded', 'refunded', 'disputed')
          )
          or (select private.is_admin())
        )
    )
  );

create policy order_events_participant_read
  on public.order_events for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_events.order_id
        and (
          o.buyer_id = (select auth.uid())
          or exists (
            select 1 from public.vendors v
            where v.id = o.vendor_id
              and v.profile_id = (select auth.uid())
              and o.payment_status in ('succeeded', 'refund_pending', 'partially_refunded', 'refunded', 'disputed')
          )
          or (select private.is_admin())
        )
    )
  );

create policy order_payments_buyer_admin_read
  on public.order_payments for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_payments.order_id
        and (o.buyer_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

create policy seller_ledger_owner_admin_read
  on public.seller_ledger_entries for select to authenticated
  using (
    exists (
      select 1 from public.vendors v
      where v.id = seller_ledger_entries.vendor_id
        and v.profile_id = (select auth.uid())
    )
    or (select private.is_admin())
  );

create policy marketplace_ledger_admin_read
  on public.marketplace_ledger_entries for select to authenticated
  using ((select private.is_admin()));

create policy seller_payouts_owner_admin_read
  on public.seller_payouts for select to authenticated
  using (
    exists (
      select 1 from public.vendors v
      where v.id = seller_payouts.vendor_id
        and v.profile_id = (select auth.uid())
    )
    or (select private.is_admin())
  );

create policy delivery_agents_self_admin_read
  on public.delivery_agents for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy deliveries_participant_read
  on public.deliveries for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = deliveries.order_id
        and (
          o.buyer_id = (select auth.uid())
          or exists (
            select 1 from public.vendors v
            where v.id = o.vendor_id
              and v.profile_id = (select auth.uid())
              and o.payment_status in ('succeeded', 'refund_pending', 'partially_refunded', 'refunded', 'disputed')
          )
        )
    )
    or exists (
      select 1 from public.delivery_agents da
      where da.id = deliveries.assigned_agent_id
        and da.user_id = (select auth.uid())
    )
    or (select private.is_admin())
  );

-- No client-facing policy for delivery_verifications. Verification hashes and
-- attempt counters are accessible only to trusted server-side code.

-- ---------------------------------------------------------------------------
-- Grants: client cart operations and read-only order views only.
-- All order creation, payment, ledger, payout and delivery writes are server-side.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.carts, public.cart_items to authenticated;

grant select on
  public.orders,
  public.order_items,
  public.order_events,
  public.order_payments,
  public.seller_ledger_entries,
  public.marketplace_ledger_entries,
  public.seller_payouts,
  public.delivery_agents,
  public.deliveries
to authenticated;

grant all on
  public.carts,
  public.cart_items,
  public.orders,
  public.order_items,
  public.order_events,
  public.order_payments,
  public.seller_ledger_entries,
  public.marketplace_ledger_entries,
  public.seller_payouts,
  public.delivery_agents,
  public.deliveries,
  public.delivery_verifications
to service_role;
