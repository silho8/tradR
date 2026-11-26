-- Trusted checkout creation and idempotent Paystack settlement.
-- Only service_role may execute these RPCs; all prices are re-read server-side.

alter table public.order_payments add column authorization_url text;

create or replace function public.create_order_checkout(
  p_buyer_id uuid,
  p_cart_id uuid,
  p_delivery_method text,
  p_buyer_contact jsonb,
  p_delivery_address jsonb,
  p_buyer_note text,
  p_idempotency_key text,
  p_provider_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_cart public.carts%rowtype;
  v_vendor public.vendors%rowtype;
  v_item record;
  v_order_id uuid;
  v_order_number text;
  v_existing_payment_status text;
  v_existing_provider_reference text;
  v_existing_authorization_url text;
  v_subtotal bigint := 0;
  v_commission bigint;
  v_delivery_fee bigint;
  v_buyer_total bigint;
  v_seller_net bigint;
  v_item_count integer := 0;
begin
  if p_buyer_id is null or p_cart_id is null then
    raise exception 'A buyer and cart are required';
  end if;
  if p_delivery_method is null or p_delivery_method not in ('seller', 'tradr') then
    raise exception 'Choose a valid delivery method';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 128 then
    raise exception 'A valid checkout idempotency key is required';
  end if;
  if p_provider_reference is null or p_provider_reference !~ '^tradr_order_[0-9a-f]{32}$' then
    raise exception 'A valid Paystack reference is required';
  end if;
  if jsonb_typeof(p_buyer_contact) is distinct from 'object'
     or coalesce(length(trim(p_buyer_contact->>'name')), 0) < 2
     or coalesce(length(regexp_replace(p_buyer_contact->>'phone', '[^0-9]', '', 'g')), 0) < 10 then
    raise exception 'Buyer name and a valid phone number are required';
  end if;
  if p_delivery_method = 'tradr'
     and (jsonb_typeof(p_delivery_address) is distinct from 'object'
       or coalesce(length(trim(p_delivery_address->>'address')), 0) < 5) then
    raise exception 'A delivery address is required for tradR agent delivery';
  end if;

  -- Repeated requests with the same buyer/key return the original order/payment.
  select o.id, o.public_order_number, o.buyer_total_kobo, op.status,
         op.provider_reference, op.authorization_url
    into v_order_id, v_order_number, v_buyer_total, v_existing_payment_status,
         v_existing_provider_reference, v_existing_authorization_url
  from public.orders o
  join public.order_payments op on op.order_id = o.id
  where o.buyer_id = p_buyer_id and o.checkout_idempotency_key = p_idempotency_key
  order by op.created_at desc
  limit 1;
  if found then
    return jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'amount_kobo', v_buyer_total,
      'provider_reference', v_existing_provider_reference,
      'payment_status', v_existing_payment_status,
      'authorization_url', v_existing_authorization_url,
      'already_exists', true
    );
  end if;

  select * into v_cart
  from public.carts
  where id = p_cart_id and buyer_id = p_buyer_id and status = 'active'
  for update;
  if not found then
    raise exception 'Your active cart could not be found';
  end if;

  select * into v_vendor from public.vendors where id = v_cart.shop_id for share;
  if not found or v_vendor.verification_status <> 'approved' then
    raise exception 'This shop is not approved for checkout';
  end if;

  -- Lock each listing while its authoritative price and availability are snapshotted.
  for v_item in
    select ci.id as cart_item_id, ci.quantity, l.id as listing_id,
           l.title, l.price_ngn, l.image_urls, l.vendor_id,
           l.status, l.moderation_status, l.visible_until
    from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
    where ci.cart_id = v_cart.id
    order by ci.created_at, ci.id
    for update of ci, l
  loop
    if v_item.vendor_id <> v_cart.shop_id
       or v_item.status <> 'published'
       or v_item.moderation_status <> 'approved'
       or v_item.visible_until is null
       or v_item.visible_until <= now()
       or v_item.price_ngn <= 0 then
      raise exception 'An item in your cart is no longer available';
    end if;
    v_subtotal := v_subtotal + (v_item.price_ngn * 100 * v_item.quantity);
    v_item_count := v_item_count + 1;
  end loop;
  if v_item_count = 0 or v_subtotal <= 0 then
    raise exception 'Your cart is empty';
  end if;

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
    v_order_number, p_idempotency_key, p_buyer_id, v_cart.shop_id,
    v_subtotal, v_delivery_fee, v_commission,
    v_buyer_total, v_seller_net, p_delivery_method,
    p_buyer_contact, case when p_delivery_method = 'tradr' then p_delivery_address else null end,
    nullif(left(trim(coalesce(p_buyer_note, '')), 1000), '')
  ) returning id into v_order_id;

  for v_item in
    select ci.quantity, l.id as listing_id, l.title, l.price_ngn, l.image_urls
    from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
    where ci.cart_id = v_cart.id
    order by ci.created_at, ci.id
  loop
    insert into public.order_items (
      order_id, listing_id, title_snapshot, image_snapshot,
      quantity, unit_price_kobo, line_subtotal_kobo
    ) values (
      v_order_id, v_item.listing_id, v_item.title, v_item.image_urls[1],
      v_item.quantity, v_item.price_ngn * 100,
      v_item.quantity::bigint * v_item.price_ngn * 100
    );
  end loop;

  insert into public.deliveries (order_id, method, fee_kobo, destination_snapshot)
  values (
    v_order_id, p_delivery_method, v_delivery_fee,
    case when p_delivery_method = 'tradr' then p_delivery_address else '{}'::jsonb end
  );

  insert into public.order_payments (order_id, provider_reference, amount_kobo)
  values (v_order_id, p_provider_reference, v_buyer_total);

  insert into public.order_events (order_id, actor_user_id, actor_type, event_type, to_status)
  values (v_order_id, p_buyer_id, 'system', 'order_created', 'awaiting_payment');

  update public.carts set status = 'converted' where id = v_cart.id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'amount_kobo', v_buyer_total,
    'provider_reference', p_provider_reference,
    'payment_status', 'pending',
    'authorization_url', null,
    'already_exists', false
  );
end;
$$;

revoke all on function public.create_order_checkout(uuid, uuid, text, jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_order_checkout(uuid, uuid, text, jsonb, jsonb, text, text, text) to service_role;

create or replace function public.confirm_order_payment(
  p_provider_reference text,
  p_provider_transaction_id text,
  p_channel text default null,
  p_webhook_event_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment public.order_payments%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_payment
  from public.order_payments
  where provider_reference = p_provider_reference
  for update;
  if not found then return false; end if;
  if v_payment.status = 'succeeded' then return true; end if;
  if v_payment.status not in ('pending', 'processing') then return false; end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  if not found then return false; end if;

  update public.order_payments
  set status = 'succeeded',
      provider_transaction_id = p_provider_transaction_id,
      channel = p_channel,
      verified_at = now(),
      webhook_event_id = p_webhook_event_id
  where id = v_payment.id;

  update public.orders
  set payment_status = 'succeeded',
      order_status = case when order_status = 'awaiting_payment' then 'pending_seller_confirmation' else order_status end
  where id = v_order.id;

  insert into public.seller_ledger_entries (order_id, vendor_id, entry_type, amount_kobo, reference)
  values (v_order.id, v_order.vendor_id, 'sale_proceeds', v_order.seller_net_kobo,
          'order-sale-' || v_order.id::text)
  on conflict (reference) do nothing;

  if v_order.marketplace_commission_kobo > 0 then
    insert into public.marketplace_ledger_entries (order_id, vendor_id, entry_type, amount_kobo, reference)
    values (v_order.id, v_order.vendor_id, 'commission_revenue', v_order.marketplace_commission_kobo,
            'order-commission-' || v_order.id::text)
    on conflict (reference) do nothing;
  end if;

  if v_order.delivery_fee_kobo > 0 then
    insert into public.marketplace_ledger_entries (order_id, vendor_id, entry_type, amount_kobo, reference)
    values (v_order.id, v_order.vendor_id, 'delivery_revenue', v_order.delivery_fee_kobo,
            'order-delivery-' || v_order.id::text)
    on conflict (reference) do nothing;
  end if;

  insert into public.order_events (order_id, actor_type, event_type, from_status, to_status)
  values (v_order.id, 'system', 'payment_succeeded', 'awaiting_payment', 'pending_seller_confirmation');

  return true;
end;
$$;

revoke all on function public.confirm_order_payment(text, text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(text, text, text, text) to service_role;

create or replace function public.fail_order_payment(p_provider_reference text, p_failure_code text default null)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment public.order_payments%rowtype;
begin
  select * into v_payment from public.order_payments
  where provider_reference = p_provider_reference for update;
  if not found or v_payment.status not in ('pending', 'processing') then return false; end if;
  update public.order_payments
  set status = 'failed', failure_code = left(coalesce(p_failure_code, 'payment_failed'), 100)
  where id = v_payment.id;
  update public.orders set payment_status = 'failed'
  where id = v_payment.order_id and payment_status <> 'succeeded';
  insert into public.order_events (order_id, actor_type, event_type, to_status, metadata)
  values (v_payment.order_id, 'system', 'payment_failed', 'awaiting_payment',
          jsonb_build_object('failure_code', left(coalesce(p_failure_code, 'payment_failed'), 100)));
  return true;
end;
$$;

revoke all on function public.fail_order_payment(text, text) from public, anon, authenticated;
grant execute on function public.fail_order_payment(text, text) to service_role;
