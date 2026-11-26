-- Local synthetic tests for inventory reservations and buyer receipt confirmation.
create temporary table phase2_inventory_order_ids (kind text primary key, order_id uuid not null);
grant all on phase2_inventory_order_ids to service_role, authenticated;
set role service_role;
delete from public.carts where buyer_id in ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003') and status='active';
insert into public.carts (buyer_id,shop_id) values ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003');
insert into public.cart_items (cart_id,listing_id,quantity)
select id,'30000000-0000-0000-0000-000000000003',2 from public.carts where buyer_id='10000000-0000-0000-0000-000000000002' and status='active';
do $$
declare r jsonb; oid uuid; ok boolean;
begin
  r:=public.create_order_checkout('10000000-0000-0000-0000-000000000002',
    (select id from public.carts where buyer_id='10000000-0000-0000-0000-000000000002' and status='active'),
    'seller','{"name":"Stock Buyer","phone":"08012345678"}'::jsonb,null,null,
    'phase2-stock-failure-001','tradr_order_cccccccccccccccccccccccccccccccc');
  oid:=(r->>'order_id')::uuid;
  insert into phase2_inventory_order_ids values ('failed',oid);
  if (select stock_quantity from public.listings where id='30000000-0000-0000-0000-000000000003') <> 2 then raise exception 'stock not reserved'; end if;
  ok:=public.fail_order_payment('tradr_order_cccccccccccccccccccccccccccccccc','test_declined');
  if not ok then raise exception 'failed payment not processed'; end if;
  if (select stock_quantity from public.listings where id='30000000-0000-0000-0000-000000000003') <> 4 then raise exception 'stock not restored'; end if;
  ok:=public.fail_order_payment('tradr_order_cccccccccccccccccccccccccccccccc','duplicate');
  if ok then raise exception 'duplicate stock restoration'; end if;
end;
$$;
reset role;
select 'phase2_inventory_release_tests_passed' as result;
