-- Shop-wide monthly subscription and signup-based free trial.
create table if not exists public.shop_subscriptions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  amount_ngn integer not null default 500 check (amount_ngn = 500),
  status text not null default 'pending' check (status in ('pending','active','expired','failed','cancelled')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shop_subscriptions_vendor_status_expiry_idx
  on public.shop_subscriptions (vendor_id, status, expires_at desc);

alter table public.payments alter column listing_subscription_id drop not null;
alter table public.payments add column if not exists shop_subscription_id uuid references public.shop_subscriptions(id) on delete restrict;
alter table public.payments drop constraint if exists payments_exactly_one_subscription_check;
alter table public.payments add constraint payments_exactly_one_subscription_check
  check ((listing_subscription_id is not null) <> (shop_subscription_id is not null));

alter table public.shop_subscriptions enable row level security;
drop policy if exists "Sellers can read their shop subscriptions" on public.shop_subscriptions;
create policy "Sellers can read their shop subscriptions"
  on public.shop_subscriptions for select to authenticated
  using (exists (
    select 1 from public.vendors v
    where v.id = shop_subscriptions.vendor_id and v.profile_id = (select auth.uid())
  ));
revoke insert, update, delete on public.shop_subscriptions from anon, authenticated;
grant select on public.shop_subscriptions to authenticated;

-- Atomic activation callable only by trusted server-side code after independent Paystack verification.
create or replace function public.activate_shop_subscription_internal(
  p_tx_ref text,
  p_provider_transaction_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_subscription public.shop_subscriptions%rowtype;
  v_expires_at timestamptz;
begin
  select * into v_payment from public.payments where tx_ref = p_tx_ref for update;
  if not found or v_payment.shop_subscription_id is null then return false; end if;
  if v_payment.status = 'succeeded' then return true; end if;
  if v_payment.status <> 'pending' or v_payment.amount_ngn <> 500 or v_payment.currency <> 'NGN' or v_payment.provider <> 'paystack' then return false; end if;

  select * into v_subscription from public.shop_subscriptions where id = v_payment.shop_subscription_id for update;
  if not found or v_subscription.vendor_id <> v_payment.vendor_id or v_subscription.amount_ngn <> 500 then return false; end if;

  v_expires_at := now() + interval '1 month';
  update public.shop_subscriptions set status = 'expired'
    where vendor_id = v_subscription.vendor_id and status = 'active' and id <> v_subscription.id;
  update public.payments set status = 'succeeded', provider_transaction_id = p_provider_transaction_id, verified_at = now()
    where id = v_payment.id;
  update public.shop_subscriptions set status = 'active', starts_at = now(), expires_at = v_expires_at
    where id = v_subscription.id;
  update public.listings l
    set status = 'published', visible_until = v_expires_at, updated_at = now()
    where l.vendor_id = v_subscription.vendor_id
      and l.moderation_status = 'approved'
      and exists (select 1 from public.vendors v where v.id = l.vendor_id and v.verification_status = 'approved');
  return true;
end;
$$;
revoke all on function public.activate_shop_subscription_internal(text, text) from public, anon, authenticated;
grant execute on function public.activate_shop_subscription_internal(text, text) to service_role;

-- Seller-created drafts are allowed during the signup-based calendar-month trial only.
create or replace function public.guard_seller_listing_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  signup_at timestamptz;
begin
  if actor is null then return new; end if;

  if exists (
    select 1 from public.vendors v
    where v.id = new.vendor_id and v.profile_id = actor
  ) then
    select u.created_at into signup_at from auth.users u where u.id = actor;
    if signup_at is null or now() >= signup_at + interval '1 month' then
      if not exists (
        select 1 from public.shop_subscriptions s
        where s.vendor_id = new.vendor_id and s.status = 'active' and s.expires_at > now()
      ) then
        raise exception 'Your free shop trial has ended. Subscribe for ₦500 per month to create listings.';
      end if;
    end if;
    new.status := 'draft';
    new.moderation_status := 'pending';
    new.visible_until := null;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_seller_listing_insert() from public, anon, authenticated;
drop trigger if exists guard_seller_listing_insert on public.listings;
create trigger guard_seller_listing_insert before insert on public.listings
for each row execute function public.guard_seller_listing_insert();

-- When moderation approves a listing, it may go live only while the shop has trial or paid access.
create or replace function public.publish_approved_listing_with_shop_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signup_at timestamptz;
  v_expiry timestamptz;
begin
  if new.moderation_status <> 'approved' or old.moderation_status = 'approved' then return new; end if;

  select u.created_at into v_signup_at
    from auth.users u join public.vendors v on v.profile_id = u.id
    where v.id = new.vendor_id;
  select max(s.expires_at) into v_expiry from public.shop_subscriptions s
    where s.vendor_id = new.vendor_id and s.status = 'active' and s.expires_at > now();

  if v_expiry is null and v_signup_at is not null and now() < v_signup_at + interval '1 month' then
    v_expiry := v_signup_at + interval '1 month';
  end if;

  if v_expiry is not null and exists (
    select 1 from public.vendors v where v.id = new.vendor_id and v.verification_status = 'approved'
  ) then
    new.status := 'published';
    new.visible_until := v_expiry;
  else
    new.status := 'draft';
    new.visible_until := null;
  end if;
  return new;
end;
$$;
revoke all on function public.publish_approved_listing_with_shop_access() from public, anon, authenticated;
drop trigger if exists publish_approved_listing_with_shop_access on public.listings;
create trigger publish_approved_listing_with_shop_access before update of moderation_status on public.listings
for each row execute function public.publish_approved_listing_with_shop_access();
