-- Additive Phase 3 operational controls. Existing marketplace data is preserved.
alter table public.delivery_agents
  add column if not exists government_id_path text,
  add column if not exists selfie_path text,
  add column if not exists identity_verified_at timestamptz;

-- Existing delivery_agents_self_admin_read policy already lets applicants read only their own row.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-agent-verification', 'delivery-agent-verification', false, 5242880,
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists delivery_agent_verification_owner_insert on storage.objects;
create policy delivery_agent_verification_owner_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'delivery-agent-verification'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) in ('jpg','jpeg','png','pdf')
);
drop policy if exists delivery_agent_verification_owner_read on storage.objects;
create policy delivery_agent_verification_owner_read on storage.objects
for select to authenticated using (
  bucket_id = 'delivery-agent-verification'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
);
drop policy if exists delivery_agent_verification_owner_update on storage.objects;
create policy delivery_agent_verification_owner_update on storage.objects
for update to authenticated using (
  bucket_id = 'delivery-agent-verification'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'delivery-agent-verification'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.apply_as_delivery_agent(
  p_display_name text, p_phone text, p_government_id_path text, p_selfie_path text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth, storage
as $$
declare
  v_user uuid := auth.uid();
  v_agent public.delivery_agents%rowtype;
  v_id_mime text;
  v_selfie_mime text;
begin
  if v_user is null then raise exception 'Sign in to apply as a delivery agent'; end if;
  if length(trim(coalesce(p_display_name,''))) not between 2 and 100 then raise exception 'Enter your full name'; end if;
  if length(regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g')) < 10 then raise exception 'Enter a valid phone number'; end if;
  if p_government_id_path !~ ('^' || v_user::text || '/government-id-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|pdf)$')
     or p_selfie_path !~ ('^' || v_user::text || '/selfie-[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$') then
    raise exception 'Upload a government-issued ID and a selfie';
  end if;
  select metadata->>'mimetype' into v_id_mime from storage.objects
    where bucket_id='delivery-agent-verification' and name=p_government_id_path and owner_id=v_user::text;
  if not found or v_id_mime not in ('image/jpeg','image/png','application/pdf') then raise exception 'Government ID upload could not be verified'; end if;
  select metadata->>'mimetype' into v_selfie_mime from storage.objects
    where bucket_id='delivery-agent-verification' and name=p_selfie_path and owner_id=v_user::text;
  if not found or v_selfie_mime not in ('image/jpeg','image/png') then raise exception 'Selfie upload could not be verified'; end if;
  select * into v_agent from public.delivery_agents where user_id=v_user for update;
  if found then
    if v_agent.status='suspended' then raise exception 'This delivery-agent account is suspended'; end if;
    if v_agent.status='approved' then raise exception 'Approved identity details cannot be changed here'; end if;
    update public.delivery_agents set display_name=left(trim(p_display_name),100),
      phone=left(trim(p_phone),30), government_id_path=p_government_id_path,
      selfie_path=p_selfie_path, identity_verified_at=null, updated_at=now()
      where id=v_agent.id returning * into v_agent;
  else
    insert into public.delivery_agents(user_id,display_name,phone,government_id_path,selfie_path)
      values(v_user,left(trim(p_display_name),100),left(trim(p_phone),30),p_government_id_path,p_selfie_path)
      returning * into v_agent;
  end if;
  return jsonb_build_object('id',v_agent.id,'status',v_agent.status);
end;
$$;
revoke all on function public.apply_as_delivery_agent(text,text) from public, anon, authenticated;
revoke all on function public.apply_as_delivery_agent(text,text,text,text) from public, anon;
grant execute on function public.apply_as_delivery_agent(text,text,text,text) to authenticated;

create or replace function public.admin_review_delivery_agent(p_agent_id uuid,p_status text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_agent public.delivery_agents%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('approved','suspended') then raise exception 'Invalid agent status'; end if;
  select * into v_agent from public.delivery_agents where id=p_agent_id for update;
  if not found then raise exception 'Delivery-agent application not found'; end if;
  if p_status='approved' and (v_agent.government_id_path is null or v_agent.selfie_path is null) then
    raise exception 'Government ID and selfie evidence are required before approval';
  end if;
  update public.delivery_agents set status=p_status,
    identity_verified_at=case when p_status='approved' then now() else identity_verified_at end,
    updated_at=now() where id=p_agent_id returning * into v_agent;
  insert into public.notifications(user_id,kind,title,message,entity_type,entity_id)
  values(v_agent.user_id,'delivery_status',
    case when p_status='approved' then 'Your delivery-agent application is approved' else 'Your delivery-agent access has changed' end,
    case when p_status='approved' then 'Your identity has been verified. You can now accept delivery jobs.' else 'Your delivery-agent account is no longer available for assignments.' end,
    'delivery',v_agent.id);
  return jsonb_build_object('id',v_agent.id,'status',v_agent.status,'identity_verified_at',v_agent.identity_verified_at);
end;
$$;
revoke all on function public.admin_review_delivery_agent(uuid,text) from public,anon;
grant execute on function public.admin_review_delivery_agent(uuid,text) to authenticated;

alter table public.seller_payouts
  add column if not exists order_id uuid references public.orders(id) on delete restrict,
  add column if not exists eligible_at timestamptz;
create unique index if not exists seller_payouts_order_uidx on public.seller_payouts(order_id) where order_id is not null;

create table if not exists public.delivery_agent_payouts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.delivery_agents(id) on delete restrict,
  delivery_id uuid not null unique references public.deliveries(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  amount_kobo bigint not null default 100000 check(amount_kobo=100000),
  status text not null default 'requested' check(status in ('requested','processing','succeeded','failed','cancelled')),
  payout_reference text unique, requested_at timestamptz not null default now(),
  processed_at timestamptz, failure_reason text
);
alter table public.delivery_agent_payouts enable row level security;
drop policy if exists delivery_agent_payouts_owner_admin_read on public.delivery_agent_payouts;
create policy delivery_agent_payouts_owner_admin_read on public.delivery_agent_payouts
for select to authenticated using (
  (select private.is_admin()) or exists (
    select 1 from public.delivery_agents a where a.id=delivery_agent_payouts.agent_id and a.user_id=(select auth.uid())
  )
);
drop policy if exists seller_payouts_admin_read on public.seller_payouts;
create policy seller_payouts_admin_read on public.seller_payouts
for select to authenticated using ((select private.is_admin()));

create table if not exists public.delivery_incidents (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  agent_id uuid not null references public.delivery_agents(id) on delete restrict,
  reporter_user_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check(reason in ('buyer_unavailable','address_issue','item_issue','safety_concern','vehicle_issue','other')),
  details text not null check(char_length(trim(details)) between 10 and 2000),
  status text not null default 'pending' check(status in ('pending','reviewing','resolved','refund_required')),
  admin_notes text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), resolved_at timestamptz,
  returned_to_seller_at timestamptz,
  returned_by_admin_id uuid references public.profiles(id) on delete restrict,
  pickup_completed boolean not null default false
);
alter table public.delivery_incidents
  add column if not exists returned_to_seller_at timestamptz,
  add column if not exists returned_by_admin_id uuid references public.profiles(id) on delete restrict,
  add column if not exists pickup_completed boolean not null default false;
create index if not exists delivery_incidents_status_created_idx on public.delivery_incidents(status,created_at desc);
alter table public.delivery_incidents enable row level security;
drop policy if exists delivery_incidents_admin_read on public.delivery_incidents;
create policy delivery_incidents_admin_read on public.delivery_incidents
for select to authenticated using ((select private.is_admin()));

create or replace function public.agent_report_delivery_issue(p_delivery_id uuid,p_reason text,p_details text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_agent public.delivery_agents%rowtype; v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype; v_incident public.delivery_incidents%rowtype;
begin
  select * into v_agent from public.delivery_agents where user_id=auth.uid() and status='approved' for update;
  if not found then raise exception 'An approved delivery-agent account is required'; end if;
  if p_reason not in ('buyer_unavailable','address_issue','item_issue','safety_concern','vehicle_issue','other') then raise exception 'Choose a valid delivery issue'; end if;
  if length(trim(coalesce(p_details,''))) not between 10 and 2000 then raise exception 'Describe the issue in at least 10 characters'; end if;
  select * into v_delivery from public.deliveries where id=p_delivery_id and assigned_agent_id=v_agent.id for update;
  if not found or v_delivery.status not in ('assigned','picked_up') then raise exception 'This delivery cannot accept a failure report'; end if;
  select * into v_order from public.orders where id=v_delivery.order_id for update;
  if v_order.payment_status<>'succeeded' then raise exception 'Only paid deliveries can be reported'; end if;
  insert into public.delivery_incidents(delivery_id,order_id,agent_id,reporter_user_id,reason,details,pickup_completed)
    values(v_delivery.id,v_order.id,v_agent.id,v_agent.user_id,p_reason,left(trim(p_details),2000),v_delivery.status='picked_up') returning * into v_incident;
  update public.deliveries set status='failed',updated_at=now() where id=v_delivery.id;
  update public.orders set order_status='disputed',payment_status='disputed',updated_at=now() where id=v_order.id;
  insert into public.order_events(order_id,actor_user_id,actor_type,event_type,from_status,to_status,public_message,metadata)
    values(v_order.id,v_agent.user_id,'agent','delivery_issue_reported',v_order.order_status,'disputed',
      'The delivery agent reported an issue. tradR is reviewing it.',jsonb_build_object('incident_id',v_incident.id,'reason',p_reason));
  insert into public.notifications(user_id,kind,title,message,entity_type,entity_id)
    values(v_order.buyer_id,'delivery_status','Your delivery needs attention',
      'Your delivery agent reported an issue. tradR is reviewing the situation.','delivery',v_delivery.id);
  insert into public.notifications(user_id,kind,title,message,entity_type,entity_id)
    select profile_id,'delivery_status','A delivery issue was reported',
      'Order '||v_order.public_order_number||' is under review by tradR.','delivery',v_delivery.id
    from public.vendors where id=v_order.vendor_id;
  insert into public.notifications(user_id,kind,title,message,entity_type,entity_id)
    select user_id,'delivery_status','Delivery incident needs review',
      'An agent reported an issue with order '||v_order.public_order_number||'.','delivery',v_delivery.id
    from public.admin_users;
  return jsonb_build_object('incident_id',v_incident.id,'order_id',v_order.id,'status','pending');
end;
$$;
revoke all on function public.agent_report_delivery_issue(uuid,text,text) from public,anon;
grant execute on function public.agent_report_delivery_issue(uuid,text,text) to authenticated;

drop function if exists public.admin_resolve_delivery_incident(uuid,text,text);
create or replace function public.admin_resolve_delivery_incident(
  p_incident_id uuid,p_resolution text,p_admin_notes text default null,p_return_confirmed boolean default false
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_incident public.delivery_incidents%rowtype; v_order public.orders%rowtype; v_delivery public.deliveries%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if p_resolution not in ('reopen_delivery','refund_required','resolved') then raise exception 'Invalid incident resolution'; end if;
  select * into v_incident from public.delivery_incidents where id=p_incident_id for update;
  if not found or v_incident.status not in ('pending','reviewing') then raise exception 'Incident is no longer open'; end if;
  select * into v_order from public.orders where id=v_incident.order_id for update;
  select * into v_delivery from public.deliveries where id=v_incident.delivery_id for update;
  if p_resolution='reopen_delivery' then
    if v_incident.pickup_completed and not p_return_confirmed then
      raise exception 'Confirm the parcel has been returned to the seller before reopening this delivery';
    end if;
    update public.deliveries set status='ready',assigned_agent_id=null,dispatch_at=null,updated_at=now() where id=v_delivery.id;
    update public.orders set order_status='ready_for_handover',payment_status='succeeded',updated_at=now() where id=v_order.id;
    update public.delivery_incidents set status='resolved',resolved_at=now(),updated_at=now(),
      returned_to_seller_at=case when v_incident.pickup_completed then now() else returned_to_seller_at end,
      returned_by_admin_id=case when v_incident.pickup_completed then auth.uid() else returned_by_admin_id end,
      admin_notes=nullif(left(trim(coalesce(p_admin_notes,'')),2000),'') where id=v_incident.id;
  elsif p_resolution='refund_required' then
    update public.orders set order_status='refund_pending',payment_status='refund_pending',updated_at=now() where id=v_order.id;
    update public.delivery_incidents set status='refund_required',updated_at=now(),
      admin_notes=nullif(left(trim(coalesce(p_admin_notes,'')),2000),'') where id=v_incident.id;
  else
    update public.delivery_incidents set status='resolved',resolved_at=now(),updated_at=now(),
      admin_notes=nullif(left(trim(coalesce(p_admin_notes,'')),2000),'') where id=v_incident.id;
  end if;
  insert into public.order_events(order_id,actor_user_id,actor_type,event_type,from_status,to_status,public_message,metadata)
    values(v_order.id,auth.uid(),'admin','delivery_incident_reviewed',v_order.order_status,
      case when p_resolution='refund_required' then 'refund_pending' when p_resolution='reopen_delivery' then 'ready_for_handover' else v_order.order_status end,
      case when p_resolution='reopen_delivery' then 'tradR reopened the delivery for another approved agent.'
        when p_resolution='refund_required' then 'tradR is preparing a refund after investigating the delivery issue.'
        else 'tradR reviewed and resolved the delivery issue.' end,
      jsonb_build_object('incident_id',v_incident.id,'resolution',p_resolution));
  return jsonb_build_object('incident_id',v_incident.id,'resolution',p_resolution);
end;
$$;
revoke all on function public.admin_resolve_delivery_incident(uuid,text,text,boolean) from public,anon;
grant execute on function public.admin_resolve_delivery_incident(uuid,text,text,boolean) to authenticated;

create or replace function public.release_due_seller_payouts()
returns integer language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_count integer:=0;
begin
  insert into public.seller_payouts(order_id,vendor_id,amount_kobo,status,eligible_at)
  select o.id,o.vendor_id,o.seller_net_kobo,'requested',now()
  from public.orders o join public.deliveries d on d.order_id=o.id
  where o.payment_status='succeeded' and o.order_status in ('delivered','completed')
    and d.status='delivered' and d.delivered_at<=now()-interval '48 hours'
  on conflict(order_id) where order_id is not null do nothing;
  get diagnostics v_count=row_count; return v_count;
end;
$$;
revoke all on function public.release_due_seller_payouts() from public,anon,authenticated;
grant execute on function public.release_due_seller_payouts() to postgres,service_role;

create or replace function public.buyer_confirm_order_received(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_order public.orders%rowtype; v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception 'Sign in to confirm receipt'; end if;
  select * into v_order from public.orders where id=p_order_id and buyer_id=v_actor for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_status<>'succeeded' then raise exception 'Only paid orders can be completed'; end if;
  if v_order.order_status='completed' then return jsonb_build_object('order_id',v_order.id,'order_status','completed','already_completed',true); end if;
  if v_order.order_status<>'delivered' then raise exception 'Confirm receipt after delivery is marked delivered'; end if;
  update public.orders set order_status='completed',completed_at=now(),updated_at=now() where id=v_order.id;
  insert into public.seller_payouts(order_id,vendor_id,amount_kobo,status,eligible_at)
    values(v_order.id,v_order.vendor_id,v_order.seller_net_kobo,'requested',now())
    on conflict(order_id) where order_id is not null do nothing;
  insert into public.order_events(order_id,actor_user_id,actor_type,event_type,from_status,to_status,public_message)
    values(v_order.id,v_actor,'buyer','buyer_confirmed_receipt','delivered','completed','Buyer confirmed that the order was received');
  return jsonb_build_object('order_id',v_order.id,'order_status','completed','already_completed',false);
end;
$$;
revoke all on function public.buyer_confirm_order_received(uuid) from public,anon;
grant execute on function public.buyer_confirm_order_received(uuid) to authenticated;

create or replace function public.record_delivered_agent_cost()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_order public.orders%rowtype;
begin
  if new.method='tradr' and new.status='delivered' and old.status is distinct from new.status and new.assigned_agent_id is not null then
    select * into v_order from public.orders where id=new.order_id;
    insert into public.delivery_agent_payouts(agent_id,delivery_id,order_id,amount_kobo,status)
      values(new.assigned_agent_id,new.id,new.order_id,100000,'requested') on conflict(delivery_id) do nothing;
    insert into public.marketplace_ledger_entries(order_id,vendor_id,delivery_id,entry_type,amount_kobo,reference,metadata)
      values(v_order.id,v_order.vendor_id,new.id,'delivery_cost',-100000,'delivery-agent-cost-'||new.id::text,
        jsonb_build_object('agent_id',new.assigned_agent_id,'amount_kobo',100000)) on conflict(reference) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists deliveries_record_agent_cost on public.deliveries;
create trigger deliveries_record_agent_cost after update of status on public.deliveries
for each row execute function public.record_delivered_agent_cost();

create or replace function public.admin_record_seller_payout(p_payout_id uuid,p_status text,p_reference text default null,p_failure_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_payout public.seller_payouts%rowtype; v_balance bigint;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('processing','succeeded','failed') then raise exception 'Invalid payout status'; end if;
  select * into v_payout from public.seller_payouts where id=p_payout_id for update;
  if not found then raise exception 'Seller payout not found'; end if;
  if v_payout.status='succeeded' then raise exception 'Payout already recorded as paid'; end if;
  if v_payout.eligible_at is not null and v_payout.eligible_at>now() then raise exception 'Payout is not eligible yet'; end if;
  if p_status='succeeded' then
    if coalesce(length(trim(p_reference)),0)<3 then raise exception 'Enter the bank transfer reference'; end if;
    select coalesce(sum(amount_kobo),0) into v_balance from public.seller_ledger_entries where vendor_id=v_payout.vendor_id;
    if v_balance<v_payout.amount_kobo then raise exception 'Seller ledger balance is insufficient'; end if;
    insert into public.seller_ledger_entries(order_id,vendor_id,entry_type,amount_kobo,reference,metadata)
      values(v_payout.order_id,v_payout.vendor_id,'payout',-v_payout.amount_kobo,'seller-payout-'||v_payout.id::text,
        jsonb_build_object('payout_id',v_payout.id,'bank_reference',p_reference)) on conflict(reference) do nothing;
    update public.seller_payouts set status='succeeded',provider_reference=p_reference,processed_at=now(),failure_reason=null where id=v_payout.id;
  else
    update public.seller_payouts set status=p_status,provider_reference=coalesce(nullif(trim(p_reference),''),provider_reference),
      processed_at=case when p_status='failed' then now() else processed_at end,
      failure_reason=case when p_status='failed' then nullif(left(trim(coalesce(p_failure_reason,'')),500),'') else null end
      where id=v_payout.id;
  end if;
  return jsonb_build_object('payout_id',v_payout.id,'status',p_status);
end;
$$;
revoke all on function public.admin_record_seller_payout(uuid,text,text,text) from public,anon;
grant execute on function public.admin_record_seller_payout(uuid,text,text,text) to authenticated;

create or replace function public.admin_record_agent_payout(p_payout_id uuid,p_status text,p_reference text default null,p_failure_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_payout public.delivery_agent_payouts%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('processing','succeeded','failed') then raise exception 'Invalid payout status'; end if;
  select * into v_payout from public.delivery_agent_payouts where id=p_payout_id for update;
  if not found then raise exception 'Agent payout not found'; end if;
  if v_payout.status='succeeded' then raise exception 'Payout already recorded as paid'; end if;
  if p_status='succeeded' and coalesce(length(trim(p_reference)),0)<3 then raise exception 'Enter the bank transfer reference'; end if;
  update public.delivery_agent_payouts set status=p_status,
    payout_reference=case when p_status='succeeded' then p_reference else coalesce(nullif(trim(p_reference),''),payout_reference) end,
    processed_at=case when p_status in ('succeeded','failed') then now() else processed_at end,
    failure_reason=case when p_status='failed' then nullif(left(trim(coalesce(p_failure_reason,'')),500),'') else null end
    where id=v_payout.id;
  return jsonb_build_object('payout_id',v_payout.id,'status',p_status);
end;
$$;
revoke all on function public.admin_record_agent_payout(uuid,text,text,text) from public,anon;
grant execute on function public.admin_record_agent_payout(uuid,text,text,text) to authenticated;

do $$ begin
  if to_regnamespace('cron') is not null then
    execute $job$select cron.schedule('tradr-release-due-seller-payouts','*/15 * * * *','select public.release_due_seller_payouts()') where not exists(select 1 from cron.job where jobname='tradr-release-due-seller-payouts')$job$;
  end if;
end $$;

-- Capture the actual Paystack fee from the provider-verified transaction.
-- The original four-argument settlement remains as the idempotent core.
create or replace function public.confirm_order_payment(
  p_provider_reference text,
  p_provider_transaction_id text,
  p_channel text,
  p_webhook_event_id text,
  p_processor_fee_kobo bigint
)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  v_order public.orders%rowtype;
  v_existing_fee bigint;
  v_confirmed boolean;
begin
  if p_processor_fee_kobo is not null and p_processor_fee_kobo < 0 then
    raise exception 'Invalid Paystack processor fee';
  end if;
  v_confirmed := public.confirm_order_payment(
    p_provider_reference,p_provider_transaction_id,p_channel,p_webhook_event_id
  );
  if not v_confirmed then return false; end if;
  if p_processor_fee_kobo is null then return true; end if;
  select o.* into v_order from public.orders o
    join public.order_payments p on p.order_id=o.id
    where p.provider_reference=p_provider_reference for update of o;
  if not found then return false; end if;
  select amount_kobo into v_existing_fee from public.marketplace_ledger_entries
    where reference='order-processor-fee-'||v_order.id::text;
  if found and v_existing_fee <> -p_processor_fee_kobo then
    raise exception 'Paystack fee does not match the previously recorded settlement';
  end if;
  if not found and p_processor_fee_kobo > 0 then
    insert into public.marketplace_ledger_entries(
      order_id,vendor_id,entry_type,amount_kobo,reference,metadata
    ) values(
      v_order.id,v_order.vendor_id,'processor_fee',-p_processor_fee_kobo,
      'order-processor-fee-'||v_order.id::text,
      jsonb_build_object('provider','paystack','provider_transaction_id',p_provider_transaction_id)
    );
  end if;
  update public.orders set payment_processor_fee_kobo=p_processor_fee_kobo
    where id=v_order.id;
  return true;
end;
$$;
revoke all on function public.confirm_order_payment(text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.confirm_order_payment(text,text,text,text,bigint) to service_role;

-- Record a full refund only after the Paystack dashboard confirms the transfer.
create or replace function public.admin_record_order_refund(p_order_id uuid,p_provider_reference text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_order public.orders%rowtype; v_ref text:=trim(coalesce(p_provider_reference,''));
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if length(v_ref)<3 then raise exception 'Enter the Paystack refund reference'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_status='refunded' then return jsonb_build_object('order_id',v_order.id,'already_refunded',true); end if;
  if v_order.payment_status not in ('refund_pending','disputed') then raise exception 'This order is not eligible for a refund'; end if;
  insert into public.marketplace_ledger_entries(order_id,vendor_id,entry_type,amount_kobo,reference,metadata)
    values(v_order.id,v_order.vendor_id,'refund',-v_order.buyer_total_kobo,
      'order-refund-'||v_order.id::text,
      jsonb_build_object('provider','paystack','provider_refund_reference',v_ref,'full_refund',true))
    on conflict(reference) do nothing;
  insert into public.seller_ledger_entries(order_id,vendor_id,entry_type,amount_kobo,reference,metadata)
    values(v_order.id,v_order.vendor_id,'refund',-v_order.seller_net_kobo,
      'order-refund-seller-'||v_order.id::text,
      jsonb_build_object('provider','paystack','provider_refund_reference',v_ref))
    on conflict(reference) do nothing;
  update public.seller_payouts set status='cancelled',failure_reason='Order refunded'
    where order_id=v_order.id and status in ('requested','processing');
  update public.orders set payment_status='refunded',order_status='cancelled',updated_at=now()
    where id=v_order.id;
  update public.delivery_incidents set status='resolved',resolved_at=now(),updated_at=now(),
    admin_notes=concat_ws(E'\\n',nullif(admin_notes,''),'Refund confirmed: '||v_ref)
    where order_id=v_order.id and status='refund_required';
  insert into public.order_events(order_id,actor_user_id,actor_type,event_type,from_status,to_status,public_message,metadata)
    values(v_order.id,auth.uid(),'admin','payment_refunded',v_order.order_status,'cancelled',
      'tradR confirmed the refund for this order.',
      jsonb_build_object('provider','paystack','provider_refund_reference',v_ref));
  insert into public.notifications(user_id,kind,title,message,entity_type,entity_id)
    values(v_order.buyer_id,'delivery_status','Your order has been refunded',
      'tradR has confirmed the refund for order '||v_order.public_order_number||'.','delivery',v_order.id);
  return jsonb_build_object('order_id',v_order.id,'status','refunded','amount_kobo',v_order.buyer_total_kobo);
end;
$$;
revoke all on function public.admin_record_order_refund(uuid,text) from public,anon;
grant execute on function public.admin_record_order_refund(uuid,text) to authenticated;
