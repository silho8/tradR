-- Re-evaluate approved listings when a shop is approved, and preserve legacy paid listing time.
create or replace function public.publish_approved_listing_with_shop_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signup_at timestamptz;
  v_expiry timestamptz;
  v_legacy_expiry timestamptz;
begin
  if new.moderation_status <> 'approved' then return new; end if;

  select u.created_at into v_signup_at
    from auth.users u join public.vendors v on v.profile_id = u.id
    where v.id = new.vendor_id;

  select max(s.expires_at) into v_expiry
    from public.shop_subscriptions s
    where s.vendor_id = new.vendor_id and s.status = 'active' and s.expires_at > now();

  if v_signup_at is not null and now() < v_signup_at + interval '1 month' then
    v_expiry := greatest(coalesce(v_expiry, v_signup_at + interval '1 month'), v_signup_at + interval '1 month');
  end if;

  select max(ls.expires_at) into v_legacy_expiry
    from public.listing_subscriptions ls
    where ls.listing_id = new.id and ls.status = 'active' and ls.expires_at > now();
  if v_legacy_expiry is not null then
    v_expiry := greatest(coalesce(v_expiry, v_legacy_expiry), v_legacy_expiry);
  end if;

  if v_expiry is not null and exists (
    select 1 from public.vendors v where v.id = new.vendor_id and v.verification_status = 'approved'
  ) then
    new.status := 'published';
    new.visible_until := v_expiry;
  else
    new.status := 'draft';
    new.visible_until := null;
  end if;
  return new;
end;
$$;
revoke all on function public.publish_approved_listing_with_shop_access() from public, anon, authenticated;

create or replace function public.recheck_vendor_listings_after_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verification_status = 'approved' and old.verification_status is distinct from new.verification_status then
    update public.listings
      set moderation_status = 'approved', updated_at = now()
      where vendor_id = new.id and moderation_status = 'approved';
  end if;
  return new;
end;
$$;
revoke all on function public.recheck_vendor_listings_after_approval() from public, anon, authenticated;
drop trigger if exists recheck_vendor_listings_after_approval on public.vendors;
create trigger recheck_vendor_listings_after_approval
after update of verification_status on public.vendors
for each row execute function public.recheck_vendor_listings_after_approval();