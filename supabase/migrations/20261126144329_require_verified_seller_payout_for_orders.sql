-- Ensure all new paid orders can only be created for sellers with verified payout destinations.
create or replace function private.require_vendor_payout_account_for_order()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $$
begin
  if not exists (
    select 1 from public.vendor_payout_accounts a
    where a.vendor_id = new.vendor_id and a.status = 'verified'
      and a.provider = 'paystack' and a.recipient_code like 'RCP_%'
  ) then
    raise exception 'This seller has not completed payout setup yet'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.require_vendor_payout_account_for_order() from public, anon, authenticated;
drop trigger if exists orders_require_vendor_payout_account on public.orders;
create trigger orders_require_vendor_payout_account
before insert on public.orders
for each row execute function private.require_vendor_payout_account_for_order();

-- Keep these service-role-only records inaccessible while making the deny policy explicit to advisors.
drop policy if exists vendor_payout_accounts_no_direct_access on public.vendor_payout_accounts;
create policy vendor_payout_accounts_no_direct_access on public.vendor_payout_accounts
for all to authenticated using (false) with check (false);
drop policy if exists support_chat_access_audit_no_direct_access on public.support_chat_access_audit;
create policy support_chat_access_audit_no_direct_access on public.support_chat_access_audit
for all to authenticated using (false) with check (false);

create index if not exists support_chat_access_audit_admin_idx on public.support_chat_access_audit(admin_id,accessed_at desc);
create index if not exists support_chat_access_audit_order_idx on public.support_chat_access_audit(order_id,accessed_at desc);
