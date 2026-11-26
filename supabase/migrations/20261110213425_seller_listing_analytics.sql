
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.listing_analytics_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'whatsapp_click')),
  visitor_key uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists listing_analytics_vendor_created_idx
  on private.listing_analytics_events (vendor_id, created_at desc);
create index if not exists listing_analytics_listing_created_idx
  on private.listing_analytics_events (listing_id, created_at desc);

revoke all on table private.listing_analytics_events from public, anon, authenticated;

create or replace function public.record_listing_event(
  p_listing_id uuid,
  p_event_type text,
  p_visitor_key uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
  v_owner_id uuid;
begin
  if p_event_type not in ('view', 'whatsapp_click') or p_visitor_key is null then
    return;
  end if;

  select l.vendor_id, v.profile_id
    into v_vendor_id, v_owner_id
  from public.listings l
  join public.vendors v on v.id = l.vendor_id
  where l.id = p_listing_id
    and l.status = 'published'
    and l.moderation_status = 'approved'
    and l.visible_until > now()
    and v.verification_status = 'approved';

  if v_vendor_id is null then
    return;
  end if;

  -- Do not count a seller opening or contacting their own listing.
  if auth.uid() is not null and auth.uid() = v_owner_id then
    return;
  end if;

  -- Count a given action once per listing and browser session every 30 minutes.
  if exists (
    select 1
    from private.listing_analytics_events e
    where e.listing_id = p_listing_id
      and e.event_type = p_event_type
      and e.visitor_key = p_visitor_key
      and e.created_at > now() - interval '30 minutes'
  ) then
    return;
  end if;

  insert into private.listing_analytics_events (listing_id, vendor_id, event_type, visitor_key)
  values (p_listing_id, v_vendor_id, p_event_type, p_visitor_key);
end;
$$;

revoke all on function public.record_listing_event(uuid, text, uuid) from public;
grant execute on function public.record_listing_event(uuid, text, uuid) to anon, authenticated;

create or replace function public.get_my_shop_analytics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select id into v_vendor_id
  from public.vendors
  where profile_id = auth.uid()
    and verification_status = 'approved'
  limit 1;

  if v_vendor_id is null then
    return jsonb_build_object(
      'period_days', v_days,
      'total_views', 0,
      'total_contacts', 0,
      'unique_visitors', 0,
      'daily', '[]'::jsonb,
      'top_listings', '[]'::jsonb
    );
  end if;

  with period_events as (
    select e.listing_id, e.event_type, e.visitor_key, e.created_at
    from private.listing_analytics_events e
    where e.vendor_id = v_vendor_id
      and e.created_at >= now() - make_interval(days => v_days)
  ),
  summary as (
    select
      count(*) filter (where event_type = 'view')::integer as total_views,
      count(*) filter (where event_type = 'whatsapp_click')::integer as total_contacts,
      count(distinct visitor_key)::integer as unique_visitors
    from period_events
  ),
  daily as (
    select
      d.day::date as day,
      count(e.*) filter (where e.event_type = 'view')::integer as views,
      count(e.*) filter (where e.event_type = 'whatsapp_click')::integer as contacts
    from generate_series(
      current_date - (v_days - 1),
      current_date,
      interval '1 day'
    ) as d(day)
    left join period_events e on e.created_at::date = d.day::date
    group by d.day
    order by d.day
  ),
  top_listings as (
    select
      l.id as listing_id,
      l.title,
      count(*) filter (where e.event_type = 'view')::integer as views,
      count(*) filter (where e.event_type = 'whatsapp_click')::integer as contacts
    from period_events e
    join public.listings l on l.id = e.listing_id
    group by l.id, l.title
    order by views desc, contacts desc, l.title
    limit 5
  )
  select jsonb_build_object(
    'period_days', v_days,
    'total_views', s.total_views,
    'total_contacts', s.total_contacts,
    'unique_visitors', s.unique_visitors,
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'day', d.day,
      'views', d.views,
      'contacts', d.contacts
    ) order by d.day) from daily d), '[]'::jsonb),
    'top_listings', coalesce((select jsonb_agg(jsonb_build_object(
      'listing_id', t.listing_id,
      'title', t.title,
      'views', t.views,
      'contacts', t.contacts
    ) order by t.views desc, t.contacts desc, t.title) from top_listings t), '[]'::jsonb)
  )
  into v_result
  from summary s;

  return v_result;
end;
$$;

revoke all on function public.get_my_shop_analytics(integer) from public, anon;
grant execute on function public.get_my_shop_analytics(integer) to authenticated;
;
