-- Additional local-only tests for trusted checkout and payment RPCs.
-- Requires synthetic fixtures created by phase2-full-schema-tests.sql.
-- Explicit balance for the tracked-stock tests.
update public.listings set stock_quantity = 5 where id = '30000000-0000-0000-0000-000000000003';
set role service_role;
insert into public.carts (buyer_id, shop_id)
values ('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003');
insert into public.cart_items (cart_id, listing_id, quantity)
select c.id, '30000000-0000-0000-0000-000000000003', 1
from public.carts c where c.buyer_id = '10000000-0000-0000-0000-000000000005';

do $$
declare
  v_result jsonb;
  v_repeat jsonb;
  v_order_id uuid;
  v_count integer;
  v_ok boolean;
begin
  v_result := public.create_order_checkout(
    '10000000-0000-0000-0000-000000000005',
    (select id from public.carts where buyer_id = '10000000-0000-0000-0000-000000000005'),
    'tradr',
    '{"name":"Phase2 Buyer Two","phone":"08012345678"}'::jsonb,
    '{"address":"Block A, Lead City University, Ibadan"}'::jsonb,
    'Please call on arrival',
    'phase2-order-create-001',
    'tradr_order_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  );
  if (v_result->>'amount_kobo')::bigint <> 150000 then
    raise exception 'TEST_FAILURE: checkout total did not include the ₦1,000 agent fee';
  end if;
  if v_result->>'already_exists' <> 'false' then
    raise exception 'TEST_FAILURE: first checkout was incorrectly marked as existing';
  end if;
  v_order_id := (v_result->>'order_id')::uuid;
  if not exists (
    select 1 from public.orders
    where id = v_order_id and items_subtotal_kobo = 50000
      and marketplace_commission_kobo = 2500 and delivery_fee_kobo = 100000
      and buyer_total_kobo = 150000 and seller_net_kobo = 47500
  ) then
    raise exception 'TEST_FAILURE: trusted checkout totals or commission were incorrect';
  end if;
  if not exists (select 1 from public.deliveries where order_id = v_order_id and method = 'tradr' and fee_kobo = 100000) then
    raise exception 'TEST_FAILURE: trusted checkout did not create the ₦1,000 delivery record';
  end if;

  v_repeat := public.create_order_checkout(
    '10000000-0000-0000-0000-000000000005',
    (select id from public.carts where buyer_id = '10000000-0000-0000-0000-000000000005'),
    'tradr',
    '{"name":"Phase2 Buyer Two","phone":"08012345678"}'::jsonb,
    '{"address":"Block A, Lead City University, Ibadan"}'::jsonb,
    'Please call on arrival',
    'phase2-order-create-001',
    'tradr_order_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  );
  if v_repeat->>'already_exists' <> 'true'
     or v_repeat->>'provider_reference' <> 'tradr_order_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' then
    raise exception 'TEST_FAILURE: checkout idempotency did not return the original order/payment';
  end if;

  v_ok := public.confirm_order_payment(
    'tradr_order_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '987654321', 'card', 'paystack_987654321'
  );
  if not v_ok then raise exception 'TEST_FAILURE: payment confirmation RPC failed'; end if;
  v_ok := public.confirm_order_payment(
    'tradr_order_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '987654321', 'card', 'paystack_987654321'
  );
  if not v_ok then raise exception 'TEST_FAILURE: duplicate payment confirmation was not idempotent'; end if;

  select count(*) into v_count from public.seller_ledger_entries
  where reference = 'order-sale-' || v_order_id::text;
  if v_count <> 1 then raise exception 'TEST_FAILURE: seller sale ledger was not written exactly once'; end if;
  select count(*) into v_count from public.marketplace_ledger_entries where order_id = v_order_id;
  if v_count <> 2 then raise exception 'TEST_FAILURE: commission and delivery revenue were not written exactly once'; end if;
  if not exists (select 1 from public.orders where id = v_order_id and payment_status = 'succeeded' and order_status = 'pending_seller_confirmation') then
    raise exception 'TEST_FAILURE: confirmed order status was not updated';
  end if;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', false);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.orders;
  if v_count <> 2 then raise exception 'TEST_FAILURE: checkout buyer cannot read their own orders'; end if;
  select count(*) into v_count from public.order_payments;
  if v_count <> 1 then raise exception 'TEST_FAILURE: checkout buyer cannot read their payment'; end if;
  select count(*) into v_count from public.deliveries;
  if v_count <> 2 then raise exception 'TEST_FAILURE: checkout buyer cannot read their deliveries'; end if;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.orders;
  if v_count <> 1 then raise exception 'TEST_FAILURE: paid order is not visible to its seller'; end if;
  select count(*) into v_count from public.seller_ledger_entries;
  if v_count <> 1 then raise exception 'TEST_FAILURE: seller cannot read their sale ledger'; end if;
end;
$$;
reset role;
select 'phase2_checkout_rpc_tests_passed' as result;

-- Seller order actions: only the owning seller may advance paid orders.
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);
do $$
declare
  v_order_id uuid;
  v_result jsonb;
  v_status text;
begin
  select id into v_order_id from public.orders
  where buyer_id = '10000000-0000-0000-0000-000000000005'
    and vendor_id = '20000000-0000-0000-0000-000000000003'
    and payment_status = 'succeeded'
  order by created_at desc limit 1;
  if v_order_id is null then raise exception 'TEST_FAILURE: paid checkout order not found'; end if;

  v_result := public.seller_update_order_status(v_order_id, 'accepted', 'Order accepted by seller');
  if v_result->>'order_status' <> 'accepted' then raise exception 'TEST_FAILURE: seller could not accept paid order'; end if;
  perform public.seller_update_order_status(v_order_id, 'preparing', null);
  perform public.seller_update_order_status(v_order_id, 'ready_for_handover', 'Ready for agent pickup');
  select order_status into v_status from public.orders where id = v_order_id;
  if v_status <> 'ready_for_handover' then raise exception 'TEST_FAILURE: seller fulfilment progression failed'; end if;

  begin
    perform public.seller_update_order_status(v_order_id, 'delivered', 'Attempt to bypass tradR agent');
    raise exception 'TEST_FAILURE: seller was allowed to mark tradR agent delivery as delivered';
  exception when others then
    if sqlerrm not like 'That order update is not allowed%' then raise; end if;
  end;

  if not exists (
    select 1 from public.order_events
    where order_id = v_order_id and actor_user_id = '10000000-0000-0000-0000-000000000004'
      and to_status = 'ready_for_handover'
  ) then raise exception 'TEST_FAILURE: seller status changes were not audited'; end if;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', false);
do $$
declare v_order_id uuid;
begin
  select id into v_order_id from public.orders
  where buyer_id = '10000000-0000-0000-0000-000000000005'
    and vendor_id = '20000000-0000-0000-0000-000000000003'
    and payment_status = 'succeeded'
  order by created_at desc limit 1;
  begin
    perform public.seller_update_order_status(v_order_id, 'accepted', null);
    raise exception 'TEST_FAILURE: buyer was allowed to act as seller';
  exception when others then
    if sqlerrm not like 'You are not allowed to manage this order%' then raise; end if;
  end;
end;
$$;
reset role;
select 'phase2_checkout_and_seller_order_tests_passed' as result;
