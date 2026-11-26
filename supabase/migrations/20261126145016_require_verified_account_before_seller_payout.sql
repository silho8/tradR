create or replace function public.admin_record_seller_payout(
  p_payout_id uuid,p_status text,p_reference text default null,p_failure_reason text default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_payout public.seller_payouts%rowtype; v_balance bigint; v_payment_status text;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('processing','succeeded','failed') then raise exception 'Invalid payout status'; end if;
  select * into v_payout from public.seller_payouts where id=p_payout_id for update;
  if not found then raise exception 'Seller payout not found'; end if;
  if v_payout.status='succeeded' then raise exception 'Payout already recorded as paid'; end if;
  if v_payout.eligible_at is not null and v_payout.eligible_at>now() then raise exception 'Payout is not eligible yet'; end if;
  if p_status in ('processing','succeeded') and not exists (
    select 1 from public.vendor_payout_accounts a where a.vendor_id=v_payout.vendor_id and a.status='verified'
      and a.provider='paystack' and a.recipient_code like 'RCP_%'
  ) then raise exception 'Seller has not verified a payout account'; end if;
  if v_payout.order_id is not null then
    select payment_status into v_payment_status from public.orders where id=v_payout.order_id for update;
    if v_payment_status is distinct from 'succeeded' then
      raise exception 'This order is under support review or is not eligible for payout';
    end if;
    if exists(select 1 from public.seller_reports r where r.order_id=v_payout.order_id
      and r.reason='order_support' and r.status in ('pending','reviewing')) then
      raise exception 'Resolve the support case before paying this seller';
    end if;
  end if;
  if p_status='succeeded' then
    if coalesce(length(trim(p_reference)),0)<3 then raise exception 'Enter the bank transfer reference'; end if;
    select coalesce(sum(amount_kobo),0) into v_balance from public.seller_ledger_entries where vendor_id=v_payout.vendor_id;
    if v_balance<v_payout.amount_kobo then raise exception 'Seller ledger balance is insufficient'; end if;
    insert into public.seller_ledger_entries(order_id,vendor_id,entry_type,amount_kobo,reference,metadata)
      values(v_payout.order_id,v_payout.vendor_id,'payout',-v_payout.amount_kobo,'seller-payout-'||v_payout.id::text,
        jsonb_build_object('payout_id',v_payout.id,'bank_reference',p_reference)) on conflict(reference) do nothing;
    update public.seller_payouts set status='succeeded',provider_reference=p_reference,processed_at=now(),failure_reason=null where id=v_payout.id;
  else
    update public.seller_payouts set status=p_status,
      provider_reference=coalesce(nullif(trim(p_reference),''),provider_reference),
      processed_at=case when p_status='failed' then now() else processed_at end,
      failure_reason=case when p_status='failed' then nullif(left(trim(coalesce(p_failure_reason,'')),500),'') else null end
      where id=v_payout.id;
  end if;
  return jsonb_build_object('payout_id',v_payout.id,'status',p_status);
end;
$$;
revoke all on function public.admin_record_seller_payout(uuid,text,text,text) from public,anon;
grant execute on function public.admin_record_seller_payout(uuid,text,text,text) to authenticated;
