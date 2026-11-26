create or replace function public.enforce_vendor_listing_limit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  listing_count integer;
begin
  if tg_op = 'UPDATE' and new.vendor_id = old.vendor_id then
    return new;
  end if;

  perform 1 from public.vendors v where v.id = new.vendor_id for update;

  select count(*)::integer into listing_count
  from public.listings l
  where l.vendor_id = new.vendor_id
    and l.status <> 'archived'
    and (tg_op <> 'UPDATE' or l.id <> old.id);

  if listing_count >= 10 then
    raise exception using
      errcode = 'check_violation',
      message = 'LISTING_LIMIT_REACHED',
      detail = 'Each shop can store up to 10 active listings. Delete an existing listing or contact tradR support if you need help managing your shop.';
  end if;

  return new;
end;
$function$;
