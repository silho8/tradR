create or replace function public.seller_request_withdrawal()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth as $$
declare v_user uuid:=auth.uid(); v_vendor public.vendors%rowtype; v_account public.vendor_payout_accounts%rowtype; v_amount bigint; v_ledger_balance bigint; v_request public.seller_withdrawal_requests%rowtype; v_count integer;
begin
 if v_user is null then raise exception 'Sign in to request a withdrawal'; end if;
 select * into v_vendor from public.vendors where profile_id=v_user for update;
 if not found then raise exception 'Create your seller shop before requesting a withdrawal'; end if;
 select * into v_account from public.vendor_payout_accounts where profile_id=v_user and vendor_id=v_vendor.id and status='verified' and provider='paystack';
 if not found or v_account.recipient_code not like 'RCP_%' then raise exception 'Add and verify your bank details before requesting a withdrawal'; end if;
 if exists(select 1 from public.seller_withdrawal_requests where vendor_id=v_vendor.id and status in ('requested','approved')) then raise exception 'You already have a withdrawal request awaiting payment'; end if;
 perform p.id from public.seller_payouts p left join public.orders o on o.id=p.order_id
 where p.vendor_id=v_vendor.id and p.status='requested' and p.withdrawal_request_id is null and (p.eligible_at is null or p.eligible_at<=now())
 and (p.order_id is null or (o.payment_status='succeeded' and not exists(select 1 from public.seller_reports r where r.order_id=o.id and r.reason='order_support' and r.status in ('pending','reviewing'))))
 for update of p;
 select coalesce(sum(p.amount_kobo),0),count(*) into v_amount,v_count from public.seller_payouts p left join public.orders o on o.id=p.order_id
 where p.vendor_id=v_vendor.id and p.status='requested' and p.withdrawal_request_id is null and (p.eligible_at is null or p.eligible_at<=now())
 and (p.order_id is null or (o.payment_status='succeeded' and not exists(select 1 from public.seller_reports r where r.order_id=o.id and r.reason='order_support' and r.status in ('pending','reviewing'))));
 if v_amount<=0 or v_count=0 then raise exception 'There are no eligible seller earnings available to withdraw yet'; end if;
 select coalesce(sum(amount_kobo),0) into v_ledger_balance from public.seller_ledger_entries where vendor_id=v_vendor.id;
 if v_ledger_balance<v_amount then raise exception 'Eligible payouts exceed the available seller ledger balance. Contact tradR support.'; end if;
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

create or replace function public.admin_review_seller_withdrawal(p_request_id uuid,p_status text,p_transfer_reference text default null,p_admin_note text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_req public.seller_withdrawal_requests%rowtype; v_payout record; v_ref text:=nullif(trim(coalesce(p_transfer_reference,'')),''); v_balance bigint;
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
  select coalesce(sum(amount_kobo),0) into v_balance from public.seller_ledger_entries where vendor_id=v_req.vendor_id;
  if v_balance<v_req.amount_kobo then raise exception 'Seller ledger balance is insufficient to record this withdrawal'; end if;
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