-- New shops are approved automatically; admins retain post-publication listing moderation.
-- Existing pending/rejected/suspended shops are deliberately not backfilled.
create or replace function public.protect_vendor_verification_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only trusted service-role writes may set a non-default status explicitly.
  -- Browser-created shops become approved immediately; later client updates
  -- cannot change their review/suspension state.
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    new.verification_status := case
      when tg_op = 'INSERT' then 'approved'
      else old.verification_status
    end;
  end if;
  return new;
end;
$$;
