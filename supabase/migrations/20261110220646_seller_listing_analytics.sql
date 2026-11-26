-- Lightweight, privacy-conscious listing analytics for approved sellers.
create table if not exists public.listing_analytics_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'contact')),
  visitor_id uuid not null,
  created_at timestamptz not null default now()
);
create unique index if not exists listing_analytics_events_daily_dedupe_idx
  on public.listing_analytics_events (listing_id, event_type, visitor_id, ((created_at at time zone 'UTC')::date));
create index if not exists listing_analytics_events_listing_created_idx
  on public.listing_analytics_events (listing_id, created_at desc);
alter table public.listing_analytics_events enable row level security;
drop policy if exists "Sellers can read analytics for own listings" on public.listing_analytics_events;
create policy "Sellers can read analytics for own listings"
  on public.listing_analytics_events for select to authenticated
  using (exists (
    select 1 from public.listings l
    join public.vendors v on v.id = l.vendor_id
    where l.id = listing_analytics_events.listing_id
      and v.profile_id = (select auth.uid())
  ));
drop policy if exists "Visitors can record active listing analytics" on public.listing_analytics_events;
create policy "Visitors can record active listing analytics"
  on public.listing_analytics_events for insert to anon, authenticated
  with check (event_type in ('view', 'contact') and exists (
    select 1 from public.listings l
    join public.vendors v on v.id = l.vendor_id
    where l.id = listing_analytics_events.listing_id
      and l.status = 'published'
      and l.moderation_status = 'approved'
      and l.visible_until > now()
      and v.verification_status = 'approved'
  ));
grant insert on public.listing_analytics_events to anon, authenticated;
create or replace function public.record_listing_analytics_event(
  p_listing_id uuid, p_event_type text, p_visitor_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_event_type not in ('view', 'contact') or p_visitor_id is null then
    raise exception 'Invalid analytics event';
  end if;
  insert into public.listing_analytics_events (listing_id, event_type, visitor_id)
  select l.id, p_event_type, p_visitor_id
  from public.listings l
  join public.vendors v on v.id = l.vendor_id
  where l.id = p_listing_id
    and l.status = 'published'
    and l.moderation_status = 'approved'
    and l.visible_until > now()
    and v.verification_status = 'approved'
  on conflict do nothing;
end;
$$;
revoke all on function public.record_listing_analytics_event(uuid, text, uuid) from public;
grant execute on function public.record_listing_analytics_event(uuid, text, uuid) to anon, authenticated;
grant select on public.listing_analytics_events to authenticated;
