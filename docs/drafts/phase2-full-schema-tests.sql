-- Remove only prior synthetic Phase 2 fixture rows from this disposable local DB.
-- Ledger/event immutability is temporarily disabled only for deleting this test fixture.
alter table public.order_events disable trigger order_events_no_mutation;
alter table public.seller_ledger_entries disable trigger seller_ledger_entries_no_mutation;
alter table public.marketplace_ledger_entries disable trigger marketplace_ledger_entries_no_mutation;
delete from public.delivery_verifications where delivery_id in (
  select d.id from public.deliveries d join public.orders o on o.id = d.order_id
  where o.buyer_id in (
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005'));
delete from public.deliveries where order_id in (
  select id from public.orders where buyer_id in (
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005'));
delete from public.order_events where order_id in (
  select id from public.orders where buyer_id in (
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005'));
delete from public.order_items where order_id in (
  select id from public.orders where buyer_id in (
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005'));
delete from public.order_payments where order_id in (
  select id from public.orders where buyer_id in (
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005'));
delete from public.seller_ledger_entries where vendor_id in (
  '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003');
delete from public.marketplace_ledger_entries where vendor_id in (
  '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003');
delete from public.seller_payouts where vendor_id in (
  '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003');
delete from public.orders where buyer_id in (
  '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005');
alter table public.order_events enable trigger order_events_no_mutation;
alter table public.seller_ledger_entries enable trigger seller_ledger_entries_no_mutation;
alter table public.marketplace_ledger_entries enable trigger marketplace_ledger_entries_no_mutation;
delete from public.carts where buyer_id in (
  '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005');
delete from public.admin_users where user_id in (
  '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005');
delete from public.vendors where id in (
  '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003');
delete from public.delivery_agents where user_id in (
  '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005');
delete from public.profiles where id in (
  '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005');
delete from auth.users where id in (
  '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005');

-- Synthetic auth identities for the full Supabase schema test only.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase2-1@tradrr.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase2-2@tradrr.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'phase2-3@tradrr.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'phase2-4@tradrr.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
('10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'phase2-5@tradrr.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

-- Disposable behaviour tests for the full tradR schema plus Phase 2 tables.
-- Run only against a clean local Supabase database after all active migrations.
-- All identifiers are synthetic. Never run against production.

insert into public.profiles (id, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'Phase2 Buyer'),
  ('10000000-0000-0000-0000-000000000002', 'Phase2 Seller One'),
  ('10000000-0000-0000-0000-000000000003', 'Phase2 Admin'),
  ('10000000-0000-0000-0000-000000000004', 'Phase2 Seller Two'),
  ('10000000-0000-0000-0000-000000000005', 'Phase2 Buyer Two');

insert into public.vendors (id, profile_id, shop_name, whatsapp_number, verification_status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Phase2 Approved Shop', '2348012345678', 'approved'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'Phase2 Pending Shop', '2348012345679', 'pending'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'Phase2 Second Shop', '2348012345680', 'approved');
alter table public.vendors disable trigger vendors_protect_verification;
update public.vendors set verification_status = 'approved'
where id in ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003');
alter table public.vendors enable trigger vendors_protect_verification;

alter table public.listings disable trigger guard_seller_listing_insert;
insert into public.listings (id, vendor_id, title, description, category, price_ngn, status, moderation_status, visible_until) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Phase2 Test Product One', 'Synthetic product for isolated checkout tests.', 'Electronics', 1000, 'published', 'approved', now() + interval '1 day'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Phase2 Test Product Two', 'Synthetic product for isolated checkout tests.', 'Electronics', 500, 'published', 'approved', now() + interval '1 day'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Phase2 Agent Delivery Product', 'Synthetic product for trusted checkout RPC tests.', 'Electronics', 500, 'published', 'approved', now() + interval '1 day');
alter table public.listings enable trigger guard_seller_listing_insert;

insert into public.admin_users (user_id)
values ('10000000-0000-0000-0000-000000000003');

-- Buyer can create a cart for an approved shop and add its live listing.
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

insert into public.carts (buyer_id, shop_id)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');

insert into public.cart_items (cart_id, listing_id, quantity)
select c.id, '30000000-0000-0000-0000-000000000001', 2
from public.carts c
where c.buyer_id = '10000000-0000-0000-0000-000000000001';

-- A listing from a different shop must be rejected by the database trigger.
do $$
declare v_cart_id uuid;
begin
  select id into v_cart_id from public.carts
  where buyer_id = '10000000-0000-0000-0000-000000000001';
  begin
    insert into public.cart_items (cart_id, listing_id, quantity)
    values (v_cart_id, '30000000-0000-0000-0000-000000000002', 1);
    raise exception 'TEST_FAILURE: mixed-shop cart item was accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILURE: mixed-shop cart item was accepted' then raise; end if;
  end;
end;
$$;

-- A cart cannot be created for a shop that is not approved.
do $$
begin
  begin
    insert into public.carts (buyer_id, shop_id)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002');
    raise exception 'TEST_FAILURE: unapproved shop cart was accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILURE: unapproved shop cart was accepted' then raise; end if;
  end;
end;
$$;

-- A buyer cannot create a second active cart.
do $$
begin
  begin
    insert into public.carts (buyer_id, shop_id)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
    raise exception 'TEST_FAILURE: duplicate active cart was accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILURE: duplicate active cart was accepted' then raise; end if;
  end;
end;
$$;

reset role;

-- Trusted server creates synthetic orders and ledger entries.
set role service_role;
insert into public.orders (
  public_order_number, checkout_idempotency_key, buyer_id, vendor_id,
  items_subtotal_kobo, delivery_fee_kobo, marketplace_commission_kobo,
  payment_processor_fee_kobo, buyer_total_kobo, seller_net_kobo, delivery_method,
  buyer_contact_snapshot
) values
  ('TR-TEST-0001', 'retry-key-1', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 200000, 0, 10000, 0, 200000, 190000, 'seller', '{"name":"Test Buyer"}'::jsonb),
  ('TR-TEST-0002', 'retry-key-1', '10000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', 50000, 0, 2500, 0, 50000, 47500, 'seller', '{"name":"Test Admin Buyer"}'::jsonb),
  ('TR-TEST-0003', 'retry-key-3', '10000000-0000-0000-0000-000000000005',
   '20000000-0000-0000-0000-000000000003', 30000, 0, 1500, 0, 30000, 28500, 'seller', '{"name":"Unpaid Order Buyer"}'::jsonb),
  ('TR-TEST-0004', 'retry-key-4', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 200000, 100000, 10000, 0, 300000, 190000, 'tradr', '{"name":"Agent Delivery Buyer"}'::jsonb);

-- Pricing policy rejects a commission other than exactly 5%.
do $$
begin
  begin
    update public.orders
    set marketplace_commission_kobo = 9000, seller_net_kobo = 191000
    where public_order_number = 'TR-TEST-0001';
    raise exception 'TEST_FAILURE: incorrect marketplace commission was accepted';
  exception when check_violation then
    null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.orders (
      public_order_number, checkout_idempotency_key, buyer_id, vendor_id,
      items_subtotal_kobo, delivery_fee_kobo, marketplace_commission_kobo,
      buyer_total_kobo, seller_net_kobo, delivery_method, buyer_contact_snapshot
    ) values (
      'TR-TEST-DUP', 'retry-key-1', '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 10000, 0, 500, 10000, 9500,
      'seller', '{}'::jsonb
    );
    raise exception 'TEST_FAILURE: duplicate buyer checkout key was accepted';
  exception when unique_violation then
    null;
  end;
end;
$$;

insert into public.order_items (
  order_id, listing_id, title_snapshot, quantity, unit_price_kobo, line_subtotal_kobo
)
select o.id, '30000000-0000-0000-0000-000000000001', 'Test item', 2, 100000, 200000
from public.orders o where o.public_order_number = 'TR-TEST-0001';

insert into public.order_items (
  order_id, title_snapshot, quantity, unit_price_kobo, line_subtotal_kobo
)
select o.id, 'Unpaid test item', 1, 30000, 30000
from public.orders o where o.public_order_number = 'TR-TEST-0003';

insert into public.seller_ledger_entries (
  order_id, vendor_id, entry_type, amount_kobo, reference
)
select o.id, o.vendor_id, 'sale_proceeds', 190000, 'test-order-sale-1'
from public.orders o where o.public_order_number = 'TR-TEST-0001';

insert into public.deliveries (order_id, method, fee_kobo, destination_snapshot)
select o.id, o.delivery_method, o.delivery_fee_kobo, '{}'::jsonb
from public.orders o where o.public_order_number = 'TR-TEST-0001';

insert into public.deliveries (order_id, method, fee_kobo, destination_snapshot)
select o.id, o.delivery_method, o.delivery_fee_kobo, '{}'::jsonb
from public.orders o where o.public_order_number in ('TR-TEST-0003', 'TR-TEST-0004');

-- Pricing policy rejects an incorrect tradR delivery fee.
do $$
begin
  begin
    update public.deliveries
    set fee_kobo = 0
    where order_id = (select id from public.orders where public_order_number = 'TR-TEST-0004');
    raise exception 'TEST_FAILURE: incorrect tradR delivery fee was accepted';
  exception when check_violation then
    null;
  end;
end;
$$;

update public.orders
set payment_status = 'succeeded', order_status = 'pending_seller_confirmation'
where public_order_number = 'TR-TEST-0001';

insert into public.order_events (order_id, actor_type, event_type, to_status)
select o.id, 'system', 'payment_succeeded', 'pending_seller_confirmation'
from public.orders o where o.public_order_number = 'TR-TEST-0001';

insert into public.order_events (order_id, actor_type, event_type, to_status)
select o.id, 'system', 'order_created', 'awaiting_payment'
from public.orders o where o.public_order_number = 'TR-TEST-0003';

reset role;

-- Buyer sees only their own order and cannot read seller ledger rows.
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.orders;
  if v_count <> 2 then
    raise exception 'TEST_FAILURE: buyer order RLS expected 2 rows, got %', v_count;
  end if;
  select count(*) into v_count from public.seller_ledger_entries;
  if v_count <> 0 then
    raise exception 'TEST_FAILURE: buyer can read seller ledger';
  end if;
end;
$$;

-- Seller sees their shop's order and ledger, but not another shop's order.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.orders;
  if v_count <> 1 then
    raise exception 'TEST_FAILURE: seller order RLS expected 1 row, got %', v_count;
  end if;
  select count(*) into v_count from public.seller_ledger_entries;
  if v_count <> 1 then
    raise exception 'TEST_FAILURE: seller ledger RLS expected 1 row, got %', v_count;
  end if;
  select count(*) into v_count from public.order_items;
  if v_count <> 1 then
    raise exception 'TEST_FAILURE: seller order item RLS expected 1 row, got %', v_count;
  end if;
  select count(*) into v_count from public.order_events;
  if v_count <> 1 then
    raise exception 'TEST_FAILURE: seller order event RLS expected 1 row, got %', v_count;
  end if;
end;
$$;

-- An unpaid order and its related records are hidden from the seller.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.orders;
  if v_count <> 0 then raise exception 'TEST_FAILURE: seller can read an unpaid order'; end if;
  select count(*) into v_count from public.order_items;
  if v_count <> 0 then raise exception 'TEST_FAILURE: seller can read unpaid order items'; end if;
  select count(*) into v_count from public.order_events;
  if v_count <> 0 then raise exception 'TEST_FAILURE: seller can read unpaid order events'; end if;
  select count(*) into v_count from public.deliveries;
  if v_count <> 0 then raise exception 'TEST_FAILURE: seller can read unpaid delivery details'; end if;
end;
$$;

-- Admin helper is scoped to the trusted admin membership table.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);
do $$
declare v_count integer;
begin
  if not private.is_admin() then
    raise exception 'TEST_FAILURE: admin membership was not recognized';
  end if;
  select count(*) into v_count from public.orders;
  if v_count <> 4 then
    raise exception 'TEST_FAILURE: admin order RLS expected 4 rows, got %', v_count;
  end if;
end;
$$;

-- Ledger rows cannot be edited, even by the trusted server role.
reset role;
set role service_role;
do $$
begin
  begin
    update public.seller_ledger_entries
    set amount_kobo = 1
    where reference = 'test-order-sale-1';
    raise exception 'TEST_FAILURE: append-only ledger update was accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILURE: append-only ledger update was accepted' then raise; end if;
  end;
end;
$$;
reset role;

select 'phase2_disposable_tests_passed' as result;
