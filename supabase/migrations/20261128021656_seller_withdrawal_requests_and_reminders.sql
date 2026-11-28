alter table public.seller_payouts add column if not exists withdrawal_request_id uuid;
create table if not exists public.seller_withdrawal_requests (
 id uuid primary key default gen_random_uuid(),
 vendor_id uuid not null references public.vendors(id) on delete restrict,
 profile_id uuid not null references auth.users(id) on delete restrict,
 amount_kobo bigint not null check (amount_kobo > 0),
 currency char(3) not null default 'NGN' check (currency = 'NGN'),
 status text not null default 'requested' check (status in ('requested','approved','paid','rejected','cancelled')),
 payout_recipient_code text not null, bank_code text not null, bank_name text not null,
 account_name text not null, account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
 transfer_reference text, admin_note text, requested_at timestamptz not null default now(),
 reviewed_at timestamptz, reviewed_by uuid references auth.users(id),
 paid_at timestamptz, paid_by uuid references auth.users(id),
 last_reminder_at timestamptz, reminder_count integer not null default 0 check (reminder_count >= 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.seller_payouts drop constraint if exists seller_payouts_withdrawal_request_id_fkey;
alter table public.seller_payouts add constraint seller_payouts_withdrawal_request_id_fkey foreign key (withdrawal_request_id) references public.seller_withdrawal_requests(id) on delete set null;
create index if not exists seller_withdrawal_requests_status_idx on public.seller_withdrawal_requests(status,requested_at desc);
create index if not exists seller_withdrawal_requests_vendor_idx on public.seller_withdrawal_requests(vendor_id,requested_at desc);
create index if not exists seller_payouts_withdrawal_request_idx on public.seller_payouts(withdrawal_request_id) where withdrawal_request_id is not null;
alter table public.seller_withdrawal_requests enable row level security;
revoke all on public.seller_withdrawal_requests from anon, public, authenticated;
grant select on public.seller_withdrawal_requests to authenticated;
grant all on public.seller_withdrawal_requests to service_role;
drop policy if exists seller_withdrawal_request_read on public.seller_withdrawal_requests;
create policy seller_withdrawal_request_read on public.seller_withdrawal_requests for select to authenticated using (profile_id = auth.uid() or private.is_admin());

create or replace function public.seller_request_withdrawal()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth as $$
declare v_user uuid := auth.uid(); v_vendor public.vendors%rowtype; v_account public.vendor_payout_accounts%rowtype; v_amount bigint; v_request public.seller_withdrawal_requests%rowtype; v_count integer;
begin
 if v_user is null then raise exception 'Sign in to request a withdrawal'; end if;
 select * into v_vendor from public.vendors where profile_id=v_user for update;
 if not found then raise exception 'Create your seller shop before requesting a withdrawal'; end if;
 select * into v_account from public.vendor_payout_accounts where profile_id=v_user and vendor_id=v_vendor.id and status='verified' and provider='paystack';
 if not found or v_account.recipient_code not like 'RCP_%' then raise exception 'Add and verify your bank details before requesting a withdrawal'; end if;
 if exists(select 1 from public.seller_withdrawal_requests where vendor_id=v_vendor.id and status in ('requested','approved')) then raise exception 'You already have a withdrawal request awaiting payment'; end if;
 select coalesce(sum(p.amount_kobo),0),count(*) into v_amount,v_count from public.seller_payouts p left join public.orders o on o.id=p.order_id
 where p.vendor_id=v_vendor.id and p.status='requested' and p.withdrawal_request_id is null and (p.eligible_at is null or p.eligible_at<=now())
 and (p.order_id is null or (o.payment_status='succeeded' and not exists(select 1 from public.seller_reports r where r.order_id=o.id and r.reason='order_support' and r.status in ('pending','reviewing'))));
 if v_amount<=0 or v_count=0 then raise exception 'There are no eligible seller earnings available to withdraw yet'; end if;
 insert into public.seller_withdrawal_requests(vendor_id,profile_id,amount_kobo,payout_recipient_code,bank_code,bank_name,account_name,account_last4)
 values(v_vendor.id,v_user,v_amount,v_account.recipient_code,v_account.bank_code,v_account.bank_name,v_account.account_name,v_account.account_last4) returning * into v_request;
 update public.seller_payouts p set status='processing',withdrawal_request_id=v_request.id
 where p.vendor_id=v_vendor.id and p.status='requested' and p.withdrawal_request_id is null and (p.eligible_at is null or p.eligible_at<=now())
 and (p.order_id is null or exists(select 1 from public.orders o where o.id=p.order_id and o.payment_status='succeeded' and not exists(select 1 from public.seller_reports r where r.order_id=o.id and r.reason='order_support' and r.status in ('pending','reviewing'))));
 insert into public.notifications(user_id,kind,title,message,entity_type,entity_id)
 select a.user_id,'transaction_status','Seller withdrawal requested',v_vendor.shop_name || ' requested ₦' || to_char(v_amount/100.0,'FM999,999,990.00') || '. Review the request and arrange the bank transfer.','transaction',v_request.id from public.admin_users a;
 return jsonb_build_object('id',v_request.id,'amount_kobo',v_amount,'status',v_request.status);
end; $$;
revoke all on function public.seller_request_withdrawal() from public,anon;
grant execute on function public.seller_request_withdrawal() to authenticated;

create or replace function public.seller_list_my_withdrawals()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare v_user uuid:=auth.uid(); v_vendor uuid; v_result jsonb; v_available bigint;
begin
 select id into v_vendor from public.vendors where profile_id=v_user;
 if v_vendor is null then raise exception 'Seller shop not found'; end if;
 select coalesce(sum(p.amount_kobo),0) into v_available from public.seller_payouts p left join public.orders o on o.id=p.order_id
 where p.vendor_id=v_vendor and p.status='requested' and p.withdrawal_request_id is null and (p.eligible_at is null or p.eligible_at<=now())
 and (p.order_id is null or (o.payment_status='succeeded' and not exists(select 1 from public.seller_reports r where r.order_id=o.id and r.reason='order_support' and r.status in ('pending','reviewing'))));
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'amount_kobo',amount_kobo,'status',status,'requested_at',requested_at,'transfer_reference',transfer_reference,'admin_note',admin_note) order by requested_at desc),'[]'::jsonb) into v_result from public.seller_withdrawal_requests where profile_id=v_user;
 return jsonb_build_object('available_kobo',v_available,'requests',v_result);
end; $$;
revoke all on function public.seller_list_my_withdrawals() from public,anon;
grant execute on function public.seller_list_my_withdrawals() to authenticated;

create or replace function public.seller_cancel_withdrawal(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_req public.seller_withdrawal_requests%rowtype;
begin
 select * into v_req from public.seller_withdrawal_requests where id=p_request_id and profile_id=auth.uid() for update;
 if not found then raise exception 'Withdrawal request not found'; end if;
 if v_req.status<>'requested' then raise exception 'Only a pending request can be cancelled'; end if;
 update public.seller_payouts set status='requested',withdrawal_request_id=null where withdrawal_request_id=v_req.id and status='processing';
 update public.seller_withdrawal_requests set status='cancelled',updated_at=now() where id=v_req.id;
 return jsonb_build_object('id',v_req.id,'status','cancelled');
end; $$;
revoke all on function public.seller_cancel_withdrawal(uuid) from public,anon;
grant execute on function public.seller_cancel_withdrawal(uuid) to authenticated;

create or replace function public.admin_review_seller_withdrawal(p_request_id uuid,p_status text,p_transfer_reference text default null,p_admin_note text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_req public.seller_withdrawal_requests%rowtype; v_payout record; v_ref text:=nullif(trim(coalesce(p_transfer_reference,'')),'');
begin
 if not private.is_admin() then raise exception 'Admin access required'; end if;
 if p_status not in ('approved','paid','rejected') then raise exception 'Invalid withdrawal action'; end if;
 select * into v_req from public.seller_withdrawal_requests where id=p_request_id for update;
 if not found then raise exception 'Withdrawal request not found'; end if;
 if v_req.status in ('paid','rejected','cancelled') then raise exception 'This withdrawal request is already closed'; end if;
 if p_status='approved' then
  update public.seller_withdrawal_requests set status='approved',reviewed_at=coalesce(reviewed_at,now()),reviewed_by=auth.uid(),admin_note=nullif(left(trim(coalesce(p_admin_note,'')),1000),''),updated_at=now() where id=v_req.id;
 elsif p_status='rejected' then
  update public.seller_payouts set status='requested',withdrawal_request_id=null where withdrawal_request_id=v_req.id and status='processing';
  update public.seller_withdrawal_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),admin_note=nullif(left(trim(coalesce(p_admin_note,'')),1000),''),updated_at=now() where id=v_req.id;
 else
  if length(coalesce(v_ref,''))<3 then raise exception 'Enter the bank transfer reference'; end if;
  if not exists(select 1 from public.seller_payouts where withdrawal_request_id=v_req.id and status='processing') then raise exception 'No reserved seller payouts are attached to this request'; end if;
  for v_payout in select * from public.seller_payouts where withdrawal_request_id=v_req.id and status='processing' for update loop
   insert into public.seller_ledger_entries(order_id,vendor_id,entry_type,amount_kobo,reference,metadata)
   values(v_payout.order_id,v_req.vendor_id,'payout',-v_payout.amount_kobo,'seller-payout-'||v_payout.id::text,jsonb_build_object('withdrawal_request_id',v_req.id,'bank_reference',v_ref)) on conflict(reference) do nothing;
   update public.seller_payouts set status='succeeded',provider_reference=v_ref,processed_at=now() where id=v_payout.id;
  end loop;
  update public.seller_withdrawal_requests set status='paid',transfer_reference=v_ref,paid_at=now(),paid_by=auth.uid(),reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,auth.uid()),admin_note=nullif(left(trim(coalesce(p_admin_note,'')),1000),''),updated_at=now() where id=v_req.id;
 end if;
 return jsonb_build_object('id',v_req.id,'status',p_status);
end; $$;
revoke all on function public.admin_review_seller_withdrawal(uuid,text,text,text) from public,anon;
grant execute on function public.admin_review_seller_withdrawal(uuid,text,text,text) to authenticated;

create or replace function public.notify_unpaid_seller_withdrawals()
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_count integer;
begin
 with due as (
  select r.id,r.vendor_id,r.amount_kobo from public.seller_withdrawal_requests r
  where r.status in ('requested','approved') and (r.last_reminder_at is null or r.last_reminder_at<=now()-interval '5 minutes')
  for update of r skip locked
 ), bumped as (
  update public.seller_withdrawal_requests r set last_reminder_at=now(),reminder_count=reminder_count+1,updated_at=now()
  from due where r.id=due.id returning r.id,r.vendor_id,r.amount_kobo
 ), notices as (
  insert into public.notifications(user_id,kind,title,message,entity_type,entity_id)
  select a.user_id,'transaction_status','Unpaid seller withdrawal reminder',v.shop_name || ' has an unpaid withdrawal of ₦' || to_char(b.amount_kobo/100.0,'FM999,999,990.00') || '. Please review and record the bank transfer.','transaction',b.id
  from bumped b join public.vendors v on v.id=b.vendor_id cross join public.admin_users a returning id
 ) select count(*) into v_count from notices;
 return coalesce(v_count,0);
end; $$;
revoke all on function public.notify_unpaid_seller_withdrawals() from public,anon,authenticated;
grant execute on function public.notify_unpaid_seller_withdrawals() to service_role;
do $$ begin
 if not exists(select 1 from cron.job where jobname='tradr-seller-withdrawal-reminders') then
  perform cron.schedule('tradr-seller-withdrawal-reminders','*/5 * * * *','select public.notify_unpaid_seller_withdrawals();');
 end if;
end $$;