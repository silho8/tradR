begin;
update public.delivery_agents
set status='pending', government_id_path=null, selfie_path=null, identity_verified_at=null
where user_id='10000000-0000-0000-0000-000000000001';
insert into storage.objects(bucket_id,name,owner_id,metadata)
values
('delivery-agent-verification','10000000-0000-0000-0000-000000000001/government-id-test.jpg','10000000-0000-0000-0000-000000000001','{"mimetype":"image/jpeg"}'::jsonb),
('delivery-agent-verification','10000000-0000-0000-0000-000000000001/selfie-test.jpg','10000000-0000-0000-0000-000000000001','{"mimetype":"image/jpeg"}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.apply_as_delivery_agent(
  'Phase3 Verified Agent','+2348012345678',
  '10000000-0000-0000-0000-000000000001/government-id-test.jpg',
  '10000000-0000-0000-0000-000000000001/selfie-test.jpg'
);
reset role;
do $$ begin
  if not exists(select 1 from public.delivery_agents where user_id='10000000-0000-0000-0000-000000000001' and status='pending' and government_id_path is not null and selfie_path is not null) then
    raise exception 'identity upload/application assertion failed';
  end if;
end $$;
rollback;
select 'phase3_agent_identity_upload_test_passed';
