-- Applied to the tradR Supabase project on 2026-10-25.
-- Adds unique payment references and a server-only atomic activation routine.
alter table public.payments add column if not exists tx_ref text;
create unique index if not exists payments_tx_ref_unique_idx on public.payments (tx_ref) where tx_ref is not null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.activate_listing_subscription(p_tx_ref text, p_provider_transaction_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments%rowtype;
  v_subscription public.listing_subscriptions%rowtype;
  v_expires_at timestamptz;
begin
  select * into v_payment from public.payments where tx_ref = p_tx_ref for update;
  if not found then return false; end if;
  if v_payment.status = 'succeeded' then return true; end if;
  if v_payment.status <> 'pending' or v_payment.amount_ngn <> 500 or v_payment.currency <> 'NGN' then return false; end if;
  select * into v_subscription from public.listing_subscriptions where id = v_payment.listing_subscription_id for update;
  if not found or v_subscription.amount_ngn <> 500 then return false; end if;
  v_expires_at := now() + interval '30 days';
  update public.payments set status = 'succeeded', provider_transaction_id = p_provider_transaction_id, verified_at = now() where id = v_payment.id;
  update public.listing_subscriptions set status = 'active', starts_at = now(), expires_at = v_expires_at where id = v_subscription.id;
  update public.listings l set status = 'published', visible_until = v_expires_at, updated_at = now()
    where l.id = v_subscription.listing_id and l.moderation_status = 'approved'
    and exists (select 1 from public.vendors v where v.id = l.vendor_id and v.verification_status = 'approved');
  return true;
end; $$;
revoke all on function private.activate_listing_subscription(text, text) from public, anon, authenticated;
grant execute on function private.activate_listing_subscription(text, text) to service_role;

create or replace function public.activate_listing_subscription_internal(p_tx_ref text, p_provider_transaction_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments%rowtype;
  v_subscription public.listing_subscriptions%rowtype;
  v_expires_at timestamptz;
begin
  select * into v_payment from public.payments where tx_ref = p_tx_ref for update;
  if not found then return false; end if;
  if v_payment.status = 'succeeded' then return true; end if;
  if v_payment.status <> 'pending' or v_payment.amount_ngn <> 500 or v_payment.currency <> 'NGN' then return false; end if;
  select * into v_subscription from public.listing_subscriptions where id = v_payment.listing_subscription_id for update;
  if not found or v_subscription.amount_ngn <> 500 then return false; end if;
  v_expires_at := now() + interval '30 days';
  update public.payments set status = 'succeeded', provider_transaction_id = p_provider_transaction_id, verified_at = now() where id = v_payment.id;
  update public.listing_subscriptions set status = 'active', starts_at = now(), expires_at = v_expires_at where id = v_subscription.id;
  update public.listings l set status = 'published', visible_until = v_expires_at, updated_at = now()
    where l.id = v_subscription.listing_id and l.moderation_status = 'approved'
    and exists (select 1 from public.vendors v where v.id = l.vendor_id and v.verification_status = 'approved');
  return true;
end; $$;
revoke all on function public.activate_listing_subscription_internal(text, text) from public, anon, authenticated;
grant execute on function public.activate_listing_subscription_internal(text, text) to service_role;
