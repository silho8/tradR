begin;
update public.orders set order_status='dispatched',payment_status='succeeded' where id='f1592088-d996-4892-8e48-3956063bd97c';
update public.deliveries set status='picked_up',delivered_at=null where id='2f970bac-9c9f-4b5a-983c-29c1950e3cc6';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.agent_report_delivery_issue('2f970bac-9c9f-4b5a-983c-29c1950e3cc6','buyer_unavailable','Buyer did not answer or come to the agreed drop-off point.');
reset role;
do $$ declare incident_id uuid; caught boolean:=false; begin
  select id into incident_id from public.delivery_incidents where order_id='f1592088-d996-4892-8e48-3956063bd97c' order by created_at desc limit 1;
  if not exists(select 1 from public.delivery_incidents where id=incident_id and pickup_completed) then
    raise exception 'pickup state was not preserved on the incident';
  end if;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
  begin
    perform public.admin_resolve_delivery_incident(incident_id,'reopen_delivery','Test note',false);
  exception when others then
    if sqlerrm like '%returned to the seller%' then caught:=true; else raise; end if;
  end;
  if not caught then raise exception 'reopening without return confirmation was allowed'; end if;
  perform public.admin_resolve_delivery_incident(incident_id,'reopen_delivery','Return confirmed for test',true);
  if not exists(select 1 from public.delivery_incidents where id=incident_id and status='resolved' and returned_to_seller_at is not null and returned_by_admin_id='10000000-0000-0000-0000-000000000003') then
    raise exception 'return confirmation was not recorded';
  end if;
end $$;
rollback;
select 'phase3_incident_return_confirmation_test_passed';
