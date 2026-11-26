-- Secure seller payout destinations and support-triggered order chat investigations.
-- Existing vendors/listings/orders are preserved; payout rows are added only for new setup.
create table if not exists public.vendor_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references auth.users(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  provider text not null default 'paystack' check (provider = 'paystack'),
  recipient_code text not null,
  bank_code text not null,
  bank_name text not null,
  account_name text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  status text not null default 'verified' check (status in ('verified','failed')),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vendor_payout_accounts_vendor_idx on public.vendor_payout_accounts(vendor_id);
alter table public.vendor_payout_accounts enable row level security;
revoke all on public.vendor_payout_accounts from anon, public, authenticated;
grant all on public.vendor_payout_accounts to service_role;

create or replace function private.require_verified_seller_payout_account()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $$
begin
  if not exists (
    select 1 from public.vendor_payout_accounts a
    where a.profile_id = new.profile_id and a.status = 'verified'
      and a.provider = 'paystack' and a.recipient_code like 'RCP_%'
  ) then
    raise exception 'Add and verify your bank account before completing seller onboarding'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.require_verified_seller_payout_account() from public, anon, authenticated;
drop trigger if exists vendors_require_payout_account on public.vendors;
create trigger vendors_require_payout_account
before insert on public.vendors
for each row execute function private.require_verified_seller_payout_account();

create or replace function private.attach_vendor_payout_account()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $$
begin
  update public.vendor_payout_accounts
  set vendor_id = new.id, updated_at = now()
  where profile_id = new.profile_id and (vendor_id is null or vendor_id = new.id);
  return new;
end;
$$;
revoke all on function private.attach_vendor_payout_account() from public, anon, authenticated;
drop trigger if exists vendors_attach_payout_account on public.vendors;
create trigger vendors_attach_payout_account
after insert on public.vendors
for each row execute function private.attach_vendor_payout_account();

alter table public.seller_reports add column if not exists order_id uuid references public.orders(id) on delete set null;
alter table public.seller_reports drop constraint if exists seller_reports_reason_check;
alter table public.seller_reports add constraint seller_reports_reason_check check (reason in (
  'non_delivery','suspected_scam','misleading_listing','harassment','other','order_support'
));
create index if not exists seller_reports_order_idx on public.seller_reports(order_id) where order_id is not null;
create unique index if not exists seller_reports_one_active_order_support
  on public.seller_reports(order_id)
  where order_id is not null and reason = 'order_support' and status in ('pending','reviewing');

create table if not exists public.support_chat_access_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete restrict,
  report_id uuid not null references public.seller_reports(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  message_count integer not null default 0 check (message_count >= 0),
  accessed_at timestamptz not null default now()
);
create index if not exists support_chat_access_audit_report_idx on public.support_chat_access_audit(report_id,accessed_at desc);
alter table public.support_chat_access_audit enable row level security;
revoke all on public.support_chat_access_audit from anon, public, authenticated;
grant all on public.support_chat_access_audit to service_role;

-- A support case freezes release by moving a paid order to disputed. Restore only
-- genuinely disputed orders when the case is resolved/dismissed; never overwrite refunds.
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
