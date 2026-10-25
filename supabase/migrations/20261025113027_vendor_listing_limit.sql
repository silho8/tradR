-- Keep marketplace listing growth bounded on the free database tier.
-- Five listing records per vendor, enforced in Postgres so direct API calls cannot bypass it.
create index if not exists listings_vendor_id_idx on public.listings (vendor_id);

create or replace function public.enforce_vendor_listing_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_count integer;
begin
  if tg_op = 'UPDATE' and new.vendor_id = old.vendor_id then
    return new;
  end if;

  -- Serialize listing creation for the same vendor to avoid concurrent inserts
  -- racing past the cap.
  perform 1
  from public.vendors v
  where v.id = new.vendor_id
  for update;

  select count(*)::integer
  into listing_count
  from public.listings l
  where l.vendor_id = new.vendor_id
    and (tg_op <> 'UPDATE' or l.id <> old.id);

  if listing_count >= 5 then
    raise exception using
      errcode = 'check_violation',
      message = 'LISTING_LIMIT_REACHED',
      detail = 'Each shop can store up to 5 listings. Update an existing listing or contact tradR support if you need help managing your shop.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_vendor_listing_limit() from public, anon, authenticated;

drop trigger if exists enforce_vendor_listing_limit on public.listings;
create trigger enforce_vendor_listing_limit
before insert or update of vendor_id on public.listings
for each row execute function public.enforce_vendor_listing_limit();
