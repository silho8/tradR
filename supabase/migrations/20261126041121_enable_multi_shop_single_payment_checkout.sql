-- Allow one buyer cart to contain listings from multiple approved shops.
-- A single Paystack reference is stored against each child order so the
-- payment can be settled atomically while seller orders remain independent.
alter table public.order_payments drop constraint if exists order_payments_provider_reference_key;
alter table public.order_payments drop constraint if exists order_payments_provider_transaction_id_key;
drop index if exists public.order_payments_webhook_event_id_uidx;
create index if not exists order_payments_provider_reference_idx on public.order_payments(provider_reference);
create index if not exists order_payments_provider_transaction_id_idx on public.order_payments(provider_transaction_id) where provider_transaction_id is not null;
create index if not exists order_payments_webhook_event_id_idx on public.order_payments(webhook_event_id) where webhook_event_id is not null;

alter table public.orders drop constraint if exists orders_checkout_idempotency_uidx;
create index if not exists orders_buyer_checkout_key_idx on public.orders(buyer_id, checkout_idempotency_key);

create or replace function private.guard_cart_item_listing()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_cart_status text;
  v_listing_status text;
  v_moderation_status text;
  v_visible_until timestamptz;
  v_shop_status text;
begin
  select c.status, l.status, l.moderation_status, l.visible_until, v.verification_status
    into v_cart_status, v_listing_status, v_moderation_status, v_visible_until, v_shop_status
  from public.carts c
  join public.listings l on l.id = new.listing_id
  join public.vendors v on v.id = l.vendor_id
  where c.id = new.cart_id;
  if not found or v_cart_status <> 'active' or v_listing_status <> 'published'
     or v_moderation_status <> 'approved' or v_visible_until is null
     or v_visible_until <= now() or v_shop_status <> 'approved' then
    raise exception 'This item is not currently available in this shop';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_cart_item_listing() from public, anon, authenticated;

create or replace function public.create_order_checkout(
  p_buyer_id uuid, p_cart_id uuid, p_delivery_method text,
  p_buyer_contact jsonb, p_delivery_address jsonb, p_buyer_note text,
  p_idempotency_key text, p_provider_reference text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_cart public.carts%rowtype;
  v_item record;
  v_vendor_id uuid;
  v_order_id uuid;
  v_first_order_id uuid;
  v_order_number text;
  v_first_order_number text;
  v_existing_payment_status text;
  v_existing_provider_reference text;
  v_existing_authorization_url text;
  v_total_subtotal bigint := 0;
  v_total_buyer_amount bigint := 0;
  v_subtotal bigint;
  v_commission bigint;
  v_delivery_fee bigint;
  v_buyer_total bigint;
  v_seller_net bigint;
  v_item_count integer := 0;
  v_order_ids uuid[] := '{}';
  v_order_numbers text[] := '{}';
begin
  if p_buyer_id is null or p_cart_id is null then raise exception 'A buyer and cart are required'; end if;
  if p_delivery_method is null or p_delivery_method not in ('seller', 'tradr') then raise exception 'Choose a valid delivery method'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 128 then raise exception 'A valid checkout idempotency key is required'; end if;
  if p_provider_reference is null or p_provider_reference !~ '^tradr_order_[0-9a-f]{32}$' then raise exception 'A valid Paystack reference is required'; end if;
  if jsonb_typeof(p_buyer_contact) is distinct from 'object'
     or coalesce(length(trim(p_buyer_contact->>'name')), 0) < 2
     or coalesce(length(regexp_replace(p_buyer_contact->>'phone', '[^0-9]', '', 'g')), 0) < 10 then
    raise exception 'Buyer name and a valid phone number are required';
  end if;
  if p_delivery_method = 'tradr' and (jsonb_typeof(p_delivery_address) is distinct from 'object'
     or coalesce(length(trim(p_delivery_address->>'address')), 0) < 5) then
    raise exception 'A delivery address is required for tradR agent delivery';
  end if;

  select o.id, o.public_order_number, op.amount_kobo, op.status, op.provider_reference, op.authorization_url
    into v_first_order_id, v_first_order_number, v_total_buyer_amount,
         v_existing_payment_status, v_existing_provider_reference, v_existing_authorization_url
  from public.orders o join public.order_payments op on op.order_id = o.id
  where o.buyer_id = p_buyer_id and o.checkout_idempotency_key = p_idempotency_key
  order by o.created_at, o.id limit 1;
  if found then
    return jsonb_build_object('order_id', v_first_order_id, 'order_number', v_first_order_number,
      'amount_kobo', v_total_buyer_amount, 'provider_reference', v_existing_provider_reference,
      'payment_status', v_existing_payment_status, 'authorization_url', v_existing_authorization_url,
      'already_exists', true);
  end if;
  -- SELECT INTO sets targets to NULL when no row matches.
  v_total_buyer_amount := 0;

  select * into v_cart from public.carts
  where id = p_cart_id and buyer_id = p_buyer_id and status = 'active' for update;
  if not found then raise exception 'Your active cart could not be found'; end if;

  -- Lock and validate every item before creating any seller orders.
  for v_item in
    select ci.id as cart_item_id, ci.quantity, l.id as listing_id, l.title, l.price_ngn,
      l.vendor_id, l.stock_quantity, l.status, l.moderation_status, l.visible_until,
      v.verification_status as shop_status
    from public.cart_items ci join public.listings l on l.id = ci.listing_id
    join public.vendors v on v.id = l.vendor_id
    where ci.cart_id = v_cart.id order by l.vendor_id, ci.created_at, ci.id
    for update of ci, l
  loop
    if v_item.status <> 'published' or v_item.moderation_status <> 'approved'
       or v_item.visible_until is null or v_item.visible_until <= now()
       or v_item.price_ngn <= 0 or v_item.shop_status <> 'approved' then
      raise exception 'An item in your cart is no longer available';
    end if;
    if v_item.stock_quantity is not null and v_item.stock_quantity < v_item.quantity then
      raise exception 'Not enough stock for "%". Only % available.', v_item.title, v_item.stock_quantity;
    end if;
    v_total_subtotal := v_total_subtotal + (v_item.price_ngn * 100 * v_item.quantity);
    v_item_count := v_item_count + 1;
  end loop;
  if v_item_count = 0 or v_total_subtotal <= 0 then raise exception 'Your cart is empty'; end if;

  -- One child order per seller, all attached to one Paystack reference.
  for v_vendor_id in
    select distinct l.vendor_id from public.cart_items ci join public.listings l on l.id = ci.listing_id
    where ci.cart_id = v_cart.id order by l.vendor_id
  loop
    select coalesce(sum(l.price_ngn * 100 * ci.quantity), 0)::bigint into v_subtotal
    from public.cart_items ci join public.listings l on l.id = ci.listing_id
    where ci.cart_id = v_cart.id and l.vendor_id = v_vendor_id;

    v_commission := round(v_subtotal::numeric * 0.05)::bigint;
    v_delivery_fee := case when p_delivery_method = 'tradr' then 100000 else 0 end;
    v_buyer_total := v_subtotal + v_delivery_fee;
    v_seller_net := v_subtotal - v_commission;
    v_order_number := 'TR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.orders (
      public_order_number, checkout_idempotency_key, buyer_id, vendor_id,
      items_subtotal_kobo, delivery_fee_kobo, marketplace_commission_kobo,
      buyer_total_kobo, seller_net_kobo, delivery_method,
      buyer_contact_snapshot, delivery_address_snapshot, buyer_note
    ) values (
      v_order_number, p_idempotency_key, p_buyer_id, v_vendor_id,
      v_subtotal, v_delivery_fee, v_commission, v_buyer_total, v_seller_net, p_delivery_method,
      p_buyer_contact, case when p_delivery_method = 'tradr' then p_delivery_address else null end,
      nullif(left(trim(coalesce(p_buyer_note, '')), 1000), '')
    ) returning id into v_order_id;

    if v_first_order_id is null then v_first_order_id := v_order_id; v_first_order_number := v_order_number; end if;
    v_order_ids := array_append(v_order_ids, v_order_id);
    v_order_numbers := array_append(v_order_numbers, v_order_number);
    v_total_buyer_amount := v_total_buyer_amount + v_buyer_total;

    for v_item in
      select ci.quantity, l.id as listing_id, l.title, l.price_ngn, l.image_urls
      from public.cart_items ci join public.listings l on l.id = ci.listing_id
      where ci.cart_id = v_cart.id and l.vendor_id = v_vendor_id order by ci.created_at, ci.id
    loop
      insert into public.order_items (order_id, listing_id, title_snapshot, image_snapshot,
        quantity, unit_price_kobo, line_subtotal_kobo)
      values (v_order_id, v_item.listing_id, v_item.title, v_item.image_urls[1],
        v_item.quantity, v_item.price_ngn * 100, v_item.quantity::bigint * v_item.price_ngn * 100);
    end loop;

    insert into public.deliveries (order_id, method, fee_kobo, destination_snapshot)
    values (v_order_id, p_delivery_method, v_delivery_fee,
      case when p_delivery_method = 'tradr' then p_delivery_address else '{}'::jsonb end);
    insert into public.order_payments (order_id, provider_reference, amount_kobo)
    values (v_order_id, p_provider_reference, 1);
    insert into public.order_events (order_id, actor_user_id, actor_type, event_type, to_status)
    values (v_order_id, p_buyer_id, 'system', 'order_created', 'awaiting_payment');
  end loop;

  update public.order_payments set amount_kobo = v_total_buyer_amount where provider_reference = p_provider_reference;
  update public.carts set status = 'converted' where id = v_cart.id;

  return jsonb_build_object('order_id', v_first_order_id, 'order_number', v_first_order_number,
    'order_ids', to_jsonb(v_order_ids), 'order_numbers', to_jsonb(v_order_numbers),
    'shop_count', cardinality(v_order_ids), 'amount_kobo', v_total_buyer_amount,
    'provider_reference', p_provider_reference, 'payment_status', 'pending',
    'authorization_url', null, 'already_exists', false);
end;
$$;

create or replace function public.confirm_order_payment(
  p_provider_reference text, p_provider_transaction_id text,
  p_channel text default null, p_webhook_event_id text default null
)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment public.order_payments%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_payment from public.order_payments
  where provider_reference = p_provider_reference order by created_at, id limit 1 for update;
  if not found then return false; end if;
  if exists (select 1 from public.order_payments where provider_reference = p_provider_reference and status = 'succeeded') then return true; end if;
  if v_payment.status not in ('pending', 'processing') then return false; end if;

  update public.order_payments set status = 'succeeded', provider_transaction_id = p_provider_transaction_id,
    channel = p_channel, verified_at = now(), webhook_event_id = p_webhook_event_id
  where provider_reference = p_provider_reference and status in ('pending', 'processing');

  for v_order in
    select o.* from public.orders o join public.order_payments p on p.order_id = o.id
    where p.provider_reference = p_provider_reference order by o.id for update of o
  loop
    update public.orders set payment_status = 'succeeded',
      order_status = case when order_status = 'awaiting_payment' then 'pending_seller_confirmation' else order_status end
    where id = v_order.id;
    insert into public.seller_ledger_entries (order_id, vendor_id, entry_type, amount_kobo, reference)
    values (v_order.id, v_order.vendor_id, 'sale_proceeds', v_order.seller_net_kobo, 'order-sale-' || v_order.id::text)
    on conflict (reference) do nothing;
    if v_order.marketplace_commission_kobo > 0 then
      insert into public.marketplace_ledger_entries (order_id, vendor_id, entry_type, amount_kobo, reference)
      values (v_order.id, v_order.vendor_id, 'commission_revenue', v_order.marketplace_commission_kobo, 'order-commission-' || v_order.id::text)
      on conflict (reference) do nothing;
    end if;
    if v_order.delivery_fee_kobo > 0 then
      insert into public.marketplace_ledger_entries (order_id, vendor_id, entry_type, amount_kobo, reference)
      values (v_order.id, v_order.vendor_id, 'delivery_revenue', v_order.delivery_fee_kobo, 'order-delivery-' || v_order.id::text)
      on conflict (reference) do nothing;
    end if;
    insert into public.order_events (order_id, actor_type, event_type, from_status, to_status)
    values (v_order.id, 'system', 'payment_succeeded', 'awaiting_payment', 'pending_seller_confirmation');
  end loop;
  return true;
end;
$$;

create or replace function public.confirm_order_payment(
  p_provider_reference text, p_provider_transaction_id text, p_channel text,
  p_webhook_event_id text, p_processor_fee_kobo bigint
)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_total_subtotal bigint;
  v_fee_allocated bigint := 0;
  v_fee_piece bigint;
  v_index integer := 0;
  v_count integer;
  v_confirmed boolean;
begin
  if p_processor_fee_kobo is not null and p_processor_fee_kobo < 0 then raise exception 'Invalid Paystack processor fee'; end if;
  v_confirmed := public.confirm_order_payment(p_provider_reference, p_provider_transaction_id, p_channel, p_webhook_event_id);
  if not v_confirmed or p_processor_fee_kobo is null then return v_confirmed; end if;

  select coalesce(sum(o.items_subtotal_kobo), 0)::bigint, count(*)::integer into v_total_subtotal, v_count
  from public.orders o join public.order_payments p on p.order_id = o.id where p.provider_reference = p_provider_reference;
  if v_total_subtotal <= 0 or v_count = 0 then return false; end if;

  for v_order in
    select o.* from public.orders o join public.order_payments p on p.order_id = o.id
    where p.provider_reference = p_provider_reference order by o.id for update of o
  loop
    v_index := v_index + 1;
    if v_index = v_count then v_fee_piece := p_processor_fee_kobo - v_fee_allocated;
    else
      v_fee_piece := round(p_processor_fee_kobo::numeric * v_order.items_subtotal_kobo / v_total_subtotal)::bigint;
      v_fee_allocated := v_fee_allocated + v_fee_piece;
    end if;
    if v_fee_piece > 0 then
      insert into public.marketplace_ledger_entries (order_id, vendor_id, entry_type, amount_kobo, reference, metadata)
      values (v_order.id, v_order.vendor_id, 'processor_fee', -v_fee_piece,
        'order-processor-fee-' || v_order.id::text,
        jsonb_build_object('provider', 'paystack', 'provider_transaction_id', p_provider_transaction_id))
      on conflict (reference) do nothing;
    end if;
    update public.orders set payment_processor_fee_kobo = v_fee_piece where id = v_order.id;
  end loop;
  return true;
end;
$$;

create or replace function public.fail_order_payment(p_provider_reference text, p_failure_code text default null)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment public.order_payments%rowtype;
  v_order public.orders%rowtype;
  v_item record;
  v_failure text := left(coalesce(p_failure_code, 'payment_failed'), 100);
begin
  select * into v_payment from public.order_payments
  where provider_reference = p_provider_reference order by created_at, id limit 1 for update;
  if not found or v_payment.status not in ('pending', 'processing') then return false; end if;

  update public.order_payments set status = 'failed', failure_code = v_failure
  where provider_reference = p_provider_reference and status in ('pending', 'processing');

  for v_order in
    select o.* from public.orders o join public.order_payments p on p.order_id = o.id
    where p.provider_reference = p_provider_reference order by o.id for update of o
  loop
    if v_order.payment_status = 'succeeded' then continue; end if;
    update public.orders set payment_status = 'failed', updated_at = now() where id = v_order.id and payment_status <> 'succeeded';
    if v_order.inventory_released_at is null then
      for v_item in select listing_id, quantity from public.order_items
        where order_id = v_order.id and stock_reserved = true and listing_id is not null
      loop
        update public.listings set stock_quantity = stock_quantity + v_item.quantity, updated_at = now()
        where id = v_item.listing_id and stock_quantity is not null;
      end loop;
      update public.orders set inventory_released_at = now() where id = v_order.id;
    end if;
    insert into public.order_events (order_id, actor_type, event_type, to_status, metadata)
    values (v_order.id, 'system', 'payment_failed', 'awaiting_payment',
      jsonb_build_object('failure_code', v_failure, 'reserved_stock_released', true));
  end loop;
  return true;
end;
$$;

revoke all on function public.create_order_checkout(uuid,uuid,text,jsonb,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.create_order_checkout(uuid,uuid,text,jsonb,jsonb,text,text,text) to service_role;
revoke all on function public.confirm_order_payment(text,text,text,text) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(text,text,text,text) to service_role;
revoke all on function public.confirm_order_payment(text,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(text,text,text,text,bigint) to service_role;
revoke all on function public.fail_order_payment(text,text) from public, anon, authenticated;
grant execute on function public.fail_order_payment(text,text) to service_role;
