
-- Phase 2 verification hardening: explicit server-only policies and FK indexes.
create policy "payments are server managed only" on public.payments
for all using (false) with check (false);

create policy "admin membership is server managed only" on public.admin_users
for all using (false) with check (false);

create index listings_reviewed_by_idx on public.listings(reviewed_by);
create index payments_subscription_id_idx on public.payments(listing_subscription_id);
create index reports_listing_id_idx on public.reports(listing_id);
create index reports_reporter_id_idx on public.reports(reporter_id);
create index reports_vendor_id_idx on public.reports(vendor_id);

-- Public listing visibility also requires the vendor to be approved.
drop policy if exists "active listings and owner listings are readable" on public.listings;
create policy "active listings and owner listings are readable" on public.listings
for select using (
  (
    status = 'published'
    and moderation_status = 'approved'
    and visible_until > now()
    and exists (
      select 1 from public.vendors v
      where v.id = listings.vendor_id and v.verification_status = 'approved'
    )
  )
  or exists (
    select 1 from public.vendors v
    where v.id = listings.vendor_id and v.profile_id = (select auth.uid())
  )
);

create or replace function public.protect_report_system_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.status := 'open';
    else
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;
create trigger reports_protect_system_fields before insert or update on public.reports
for each row execute function public.protect_report_system_fields();
;
