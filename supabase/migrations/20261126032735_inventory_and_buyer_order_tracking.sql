-- Phase 2: stock tracking, atomic order reservations and buyer order tracking.
-- Existing listings remain untracked (NULL) until their owners set a quantity.
-- New listings will save an explicit quantity from the seller form.

alter table public.listings
  add column stock_quantity integer
  check (stock_quantity is null or stock_quantity between 0 and 1000000);

alter table public.orders add column inventory_released_at timestamptz;
alter table public.order_items add column stock_reserved boolean not null default false;


create or replace function private.reserve_order_item_stock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_stock integer;
begin
  if new.listing_id is null then
    return new;
  end if;
  select stock_quantity into v_stock
  from public.listings where id = new.listing_id for update;
  if not found then
    raise exception 'This product is no longer available';
  end if;
  new.stock_reserved := v_stock is not null;
  if v_stock is not null then
    if v_stock < new.quantity then
      raise exception 'Not enough stock for "%". Only % available.', new.title_snapshot, v_stock;
    end if;
    update public.listings
    set stock_quantity = stock_quantity - new.quantity,
        updated_at = now()
    where id = new.listing_id;
  end if;
  return new;
end;
$$;
revoke all on function private.reserve_order_item_stock() from public, anon, authenticated;
create trigger order_items_reserve_stock
before insert on public.order_items
for each row execute function private.reserve_order_item_stock();

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
           l.title, l.price_ngn, l.image_urls, l.vendor_id, l.stock_quantity,
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
    if v_item.stock_quantity is not null and v_item.stock_quantity < v_item.quantity then
      raise exception 'Not enough stock for "%". Only % available.', v_item.title, v_item.stock_quantity;
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
create or replace function public.fail_order_payment(p_provider_reference text, p_failure_code text default null)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment public.order_payments%rowtype;
  v_order public.orders%rowtype;
  v_item record;
begin
  select * into v_payment from public.order_payments
  where provider_reference = p_provider_reference for update;
  if not found or v_payment.status not in ('pending', 'processing') then return false; end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  if not found or v_order.payment_status = 'succeeded' then return false; end if;

  update public.order_payments
  set status = 'failed', failure_code = left(coalesce(p_failure_code, 'payment_failed'), 100)
  where id = v_payment.id;
  update public.orders set payment_status = 'failed', updated_at = now()
  where id = v_payment.order_id and payment_status <> 'succeeded';

  if v_order.inventory_released_at is null then
    for v_item in
      select listing_id, quantity from public.order_items
      where order_id = v_order.id and stock_reserved = true and listing_id is not null
    loop
      update public.listings
      set stock_quantity = stock_quantity + v_item.quantity,
          updated_at = now()
      where id = v_item.listing_id and stock_quantity is not null;
    end loop;
    update public.orders set inventory_released_at = now() where id = v_order.id;
  end if;

  insert into public.order_events (order_id, actor_type, event_type, to_status, metadata)
  values (v_payment.order_id, 'system', 'payment_failed', 'awaiting_payment',
          jsonb_build_object('failure_code', left(coalesce(p_failure_code, 'payment_failed'), 100),
                             'reserved_stock_released', true));
  return true;
end;
$$;

DROP FUNCTION public.search_marketplace_listings(text, text, bigint, bigint, text, integer, integer);

CREATE FUNCTION public.search_marketplace_listings(
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_min_price bigint DEFAULT NULL,
  p_max_price bigint DEFAULT NULL,
  p_sort text DEFAULT 'latest',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category text,
  price_ngn bigint,
  stock_quantity integer,
  image_urls text[],
  created_at timestamptz,
  vendor jsonb,
  total_count bigint,
  relevance real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH params AS (
    SELECT
      NULLIF(LEFT(BTRIM(COALESCE(p_search, '')), 120), '') AS search_text,
      CASE
        WHEN NULLIF(LEFT(BTRIM(COALESCE(p_search, '')), 120), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery(
          'simple'::regconfig,
          LEFT(BTRIM(COALESCE(p_search, '')), 120)
        )
      END AS search_query
  ),
  matched AS (
    SELECT
      l.id,
      l.title,
      l.description,
      l.category,
      l.price_ngn,
      l.stock_quantity,
      l.image_urls,
      l.created_at,
      jsonb_build_object(
        'id', v.id,
        'profile_id', v.profile_id,
        'shop_name', v.shop_name,
        'bio', v.bio,
        'whatsapp_number', v.whatsapp_number,
        'logo_url', v.logo_url
      ) AS vendor,
      CASE
        WHEN p.search_text IS NULL THEN 0::real
        ELSE
          (CASE WHEN lower(l.title) = lower(p.search_text) THEN 10 ELSE 0 END) +
          (CASE WHEN position(lower(p.search_text) in lower(l.title)) = 1 THEN 5 ELSE 0 END) +
          (CASE WHEN position(lower(p.search_text) in lower(l.title)) > 0 THEN 3 ELSE 0 END) +
          (CASE WHEN l.search_document @@ p.search_query
            THEN ts_rank_cd(l.search_document, p.search_query) * 2
            ELSE 0 END) +
          (CASE WHEN lower(v.shop_name) = lower(p.search_text) THEN 4
            WHEN position(lower(p.search_text) in lower(v.shop_name)) > 0 THEN 2
            WHEN position(lower(p.search_text) in lower(COALESCE(v.bio, ''))) > 0 THEN 1
            ELSE 0 END)
      END::real AS relevance
    FROM public.listings AS l
    JOIN public.vendors AS v ON v.id = l.vendor_id
    CROSS JOIN params AS p
    WHERE l.status = 'published'
      AND l.moderation_status = 'approved'
      AND l.visible_until > now()
      AND v.verification_status = 'approved'
      AND (p_category IS NULL OR p_category = '' OR p_category = 'All finds' OR l.category = p_category)
      AND (p_min_price IS NULL OR l.price_ngn >= p_min_price)
      AND (p_max_price IS NULL OR l.price_ngn <= p_max_price)
      AND (
        p.search_text IS NULL
        OR l.search_document @@ p.search_query
        OR strpos(lower(COALESCE(v.shop_name, '')), lower(p.search_text)) > 0
        OR strpos(lower(COALESCE(v.bio, '')), lower(p.search_text)) > 0
      )
  ),
  counted AS (
    SELECT matched.*, count(*) OVER () AS total_count
    FROM matched
  )
  SELECT
    counted.id,
    counted.title,
    counted.description,
    counted.category,
    counted.price_ngn,
    counted.stock_quantity,
    counted.image_urls,
    counted.created_at,
    counted.vendor,
    counted.total_count,
    counted.relevance
  FROM counted
  ORDER BY
    CASE WHEN p_sort = 'price-low' THEN counted.price_ngn END ASC NULLS LAST,
    CASE WHEN p_sort = 'price-high' THEN counted.price_ngn END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('price-low', 'price-high')
      AND NULLIF(BTRIM(COALESCE(p_search, '')), '') IS NOT NULL
      THEN counted.relevance END DESC NULLS LAST,
    counted.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 40))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

REVOKE ALL ON FUNCTION public.search_marketplace_listings(text, text, bigint, bigint, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_marketplace_listings(text, text, bigint, bigint, text, integer, integer) TO anon, authenticated;


create or replace function public.buyer_confirm_order_received(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Sign in to confirm receipt'; end if;
  select * into v_order from public.orders
  where id = p_order_id and buyer_id = v_actor
  for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_status <> 'succeeded' then
    raise exception 'Only paid orders can be completed';
  end if;
  if v_order.order_status = 'completed' then
    return jsonb_build_object('order_id', v_order.id, 'order_status', 'completed', 'already_completed', true);
  end if;
  if v_order.order_status <> 'delivered' then
    raise exception 'You can confirm receipt after the order is marked delivered';
  end if;

  update public.orders set order_status = 'completed', completed_at = now(), updated_at = now()
  where id = v_order.id;
  insert into public.order_events (
    order_id, actor_user_id, actor_type, event_type, from_status, to_status, public_message
  ) values (
    v_order.id, v_actor, 'buyer', 'buyer_confirmed_receipt', 'delivered', 'completed',
    'Buyer confirmed that the order was received'
  );
  return jsonb_build_object('order_id', v_order.id, 'order_status', 'completed', 'already_completed', false);
end;
$$;
revoke all on function public.buyer_confirm_order_received(uuid) from public, anon;
grant execute on function public.buyer_confirm_order_received(uuid) to authenticated;
