-- Disposable local-only delivery operations test.
-- Run after phase2-full-schema-tests.sql, phase2-checkout-rpc-tests.sql,
-- and phase2-inventory-buyer-tests.sql. Never run against production.

create temporary table phase2_delivery_test (
  order_id uuid not null,
  delivery_id uuid not null,
  first_agent_id uuid,
  second_agent_id uuid,
  code text
);
grant all on phase2_delivery_test to authenticated;

insert into phase2_delivery_test (order_id, delivery_id)
select o.id, d.id
from public.orders o
join public.deliveries d on d.order_id=o.id
where o.buyer_id='10000000-0000-0000-0000-000000000005'
  and o.vendor_id='20000000-0000-0000-0000-000000000003'
  and o.payment_status='succeeded'
  and o.order_status='ready_for_handover'
  and o.delivery_method='tradr'
  and d.status='ready'
  and d.assigned_agent_id is null
order by o.created_at desc limit 1;

do $$ begin
  if not exists(select 1 from phase2_delivery_test) then
    raise exception 'TEST_FAILURE: run checkout/seller tests first and ensure a tradR delivery is ready';
  end if;
end $$;

-- Two applicants are approved.
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
do $$ declare r jsonb; begin
  r:=public.apply_as_delivery_agent('Phase2 First Agent','+2348012345678');
  if r->>'status'<>'pending' then raise exception 'TEST_FAILURE: first agent application not pending'; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
do $$ declare r jsonb; begin
  r:=public.apply_as_delivery_agent('Phase2 Second Agent','+2348098765432');
  if r->>'status'<>'pending' then raise exception 'TEST_FAILURE: second agent application not pending'; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
do $$ declare a1 uuid; a2 uuid; begin
  select id into a1 from public.delivery_agents where user_id='10000000-0000-0000-0000-000000000001';
  select id into a2 from public.delivery_agents where user_id='10000000-0000-0000-0000-000000000002';
  perform public.admin_review_delivery_agent(a1,'approved');
  perform public.admin_review_delivery_agent(a2,'approved');
  update phase2_delivery_test set first_agent_id=a1, second_agent_id=a2;
end $$;
reset role;

-- Replay the seller's ready action after agents are approved to verify fan-out.
update public.orders set order_status='preparing' where id=(select order_id from phase2_delivery_test);
update public.deliveries set status='pending', assigned_agent_id=null where id=(select delivery_id from phase2_delivery_test);
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);
do $$ declare oid uuid; begin
  select order_id into oid from phase2_delivery_test;
  perform public.seller_update_order_status(oid,'ready_for_handover',null);
end $$;
reset role;

do $$ begin
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000001' and title='New tradR delivery available') then
    raise exception 'TEST_FAILURE: first approved agent did not receive open-job notification'; end if;
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000002' and title='New tradR delivery available') then
    raise exception 'TEST_FAILURE: second approved agent did not receive open-job notification'; end if;
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000003' and title='Order ready for delivery') then
    raise exception 'TEST_FAILURE: admin delivery-ready notification missing'; end if;
end $$;

do $$ begin
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000001' and kind='delivery_status' and title='Your delivery-agent application is approved') then
    raise exception 'TEST_FAILURE: first agent approval notification missing'; end if;
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000002' and kind='delivery_status' and title='Your delivery-agent application is approved') then
    raise exception 'TEST_FAILURE: second agent approval notification missing'; end if;
end $$;

-- Both approved agents can see the same open job, without buyer/address details.
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
do $$ declare jobs jsonb; begin
  jobs:=public.agent_list_my_deliveries();
  if not exists(select 1 from jsonb_array_elements(jobs) j where (j->>'is_available')::boolean and j->'destination' = 'null'::jsonb) then
    raise exception 'TEST_FAILURE: first agent cannot see a redacted open job';
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
do $$ declare jobs jsonb; begin
  jobs:=public.agent_list_my_deliveries();
  if not exists(select 1 from jsonb_array_elements(jobs) j where (j->>'is_available')::boolean) then
    raise exception 'TEST_FAILURE: second agent cannot see the same open job';
  end if;
end $$;
reset role;

-- First agent claims the job.
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
do $$ declare did uuid; r jsonb; begin
  select delivery_id into did from phase2_delivery_test;
  r:=public.agent_accept_delivery(did);
  if r->>'status'<>'assigned' then raise exception 'TEST_FAILURE: first agent did not secure job'; end if;
  if not exists(select 1 from public.deliveries where id=did and status='assigned' and assigned_agent_id=(select first_agent_id from phase2_delivery_test)) then
    raise exception 'TEST_FAILURE: first acceptance did not persist'; end if;
end $$;
reset role;

-- Second agent cannot take the same delivery after the first claim.
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
do $$ declare did uuid; caught boolean:=false; begin
  select delivery_id into did from phase2_delivery_test;
  begin
    perform public.agent_accept_delivery(did);
  exception when others then
    if sqlerrm like '%already accepted%' then caught:=true; else raise; end if;
  end;
  if not caught then raise exception 'TEST_FAILURE: second agent was able to claim an already assigned job'; end if;
  if jsonb_array_length(public.agent_list_my_deliveries()) <> 0 then
    raise exception 'TEST_FAILURE: second agent can still see another agent assigned job'; end if;
end $$;
reset role;

do $$ begin
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000005' and title='A delivery agent accepted your order') then
    raise exception 'TEST_FAILURE: buyer acceptance notification missing'; end if;
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000004' and title='A delivery agent accepted the order') then
    raise exception 'TEST_FAILURE: seller acceptance notification missing'; end if;
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000002' and title='Delivery job already claimed') then
    raise exception 'TEST_FAILURE: other agent was not told job was claimed'; end if;
end $$;

-- Claimed agent gets private pickup/drop-off details and completes handover.
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
do $$ declare did uuid; jobs jsonb; r jsonb; begin
  select delivery_id into did from phase2_delivery_test;
  jobs:=public.agent_list_my_deliveries();
  if jsonb_array_length(jobs)<>1 or (jobs->0->>'is_available')::boolean then
    raise exception 'TEST_FAILURE: accepted job is not in the agent task list';
  end if;
  if jobs->0->'destination' = 'null'::jsonb then raise exception 'TEST_FAILURE: accepted agent cannot see drop-off details'; end if;
  perform public.agent_mark_delivery_picked_up(did);
  jobs:=public.agent_list_my_deliveries();
  if jobs->0->>'order_status' <> 'dispatched' then raise exception 'TEST_FAILURE: order not dispatched in agent task'; end if;
end $$;
reset role;

do $$ begin
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000005' and title='Your order is on its way') then
    raise exception 'TEST_FAILURE: buyer pickup notification missing'; end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',false);
do $$ declare did uuid; r jsonb; begin
  select delivery_id into did from phase2_delivery_test;
  r:=public.buyer_generate_delivery_code(did);
  if length(r->>'code')<>8 then raise exception 'TEST_FAILURE: handover code not generated'; end if;
  update phase2_delivery_test set code=r->>'code';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
do $$ declare did uuid; v_code text; r jsonb; begin
  select delivery_id, phase2_delivery_test.code into did,v_code from phase2_delivery_test;
  r:=public.agent_verify_delivery_code(did,'WRONG000');
  if coalesce((r->>'success')::boolean,true) then raise exception 'TEST_FAILURE: wrong code accepted'; end if;
  r:=public.agent_verify_delivery_code(did,v_code);
  if not coalesce((r->>'success')::boolean,false) then raise exception 'TEST_FAILURE: valid code rejected: %',r; end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',false);
do $$ declare oid uuid; begin
  select order_id into oid from phase2_delivery_test;
  if not exists(select 1 from public.orders where id=oid and order_status='delivered') then raise exception 'TEST_FAILURE: verified delivery not recorded'; end if;
  perform public.buyer_confirm_order_received(oid);
  if not exists(select 1 from public.orders where id=oid and order_status='completed') then raise exception 'TEST_FAILURE: buyer receipt confirmation failed'; end if;
end $$;
reset role;

do $$ begin
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000005' and title='Your order has been delivered') then
    raise exception 'TEST_FAILURE: buyer delivery-complete notification missing'; end if;
  if not exists(select 1 from public.notifications where user_id='10000000-0000-0000-0000-000000000004' and title='Your order has been delivered') then
    raise exception 'TEST_FAILURE: seller delivery-complete notification missing'; end if;
end $$;
select 'phase2_delivery_first_acceptance_tests_passed' as result;
