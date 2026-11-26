create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.push_daily_schedule (
  user_id uuid primary key references auth.users(id) on delete cascade,
  next_daily_at timestamptz not null,
  last_daily_sent_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_daily_schedule enable row level security;
revoke all on public.push_daily_schedule from anon, authenticated;
grant all on public.push_daily_schedule to service_role;

create table if not exists public.daily_push_messages (
  weekday smallint primary key check (weekday between 0 and 6),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 240),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.daily_push_messages enable row level security;
revoke all on public.daily_push_messages from anon, authenticated;
grant all on public.daily_push_messages to service_role;

insert into public.daily_push_messages (weekday, title, body) values
  (0, 'Sunday campus discovery', 'Find something useful, tasty or unexpected from the Lead City community on tradR.'),
  (1, 'Monday campus finds', 'Start your week with something good. Explore products and services from LCU sellers.'),
  (2, 'A little treat, anyone?', 'Discover food, drinks and everyday favourites from around Lead City University.'),
  (3, 'Midweek discoveries', 'Browse fashion, gadgets, study materials and services from your campus community.'),
  (4, 'Support a campus plug', 'Find what you need and chat directly with LCU sellers on WhatsApp.'),
  (5, 'Weekend plans start here', 'Explore food, beauty, fashion and useful services from fellow students.'),
  (6, 'Your campus, your marketplace', 'Take a quick look at what students are offering on tradR.')
on conflict (weekday) do nothing;

create table if not exists public.push_cron_secrets (
  id boolean primary key default true check (id),
  token text not null
);
alter table public.push_cron_secrets enable row level security;
revoke all on public.push_cron_secrets from anon, authenticated;
grant select on public.push_cron_secrets to service_role;
insert into public.push_cron_secrets (id, token)
values (true, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

create or replace function public.ensure_daily_push_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.push_daily_schedule (user_id, next_daily_at)
  values (
    new.user_id,
    ((timezone('Africa/Lagos', now())::date + 1)::timestamp + interval '9 hours' + random() * interval '12 hours') at time zone 'Africa/Lagos'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.ensure_daily_push_schedule() from public, anon, authenticated;

drop trigger if exists push_subscription_schedule_daily on public.push_subscriptions;
create trigger push_subscription_schedule_daily
after insert or update on public.push_subscriptions
for each row execute function public.ensure_daily_push_schedule();

insert into public.push_daily_schedule (user_id, next_daily_at)
select distinct user_id,
  ((timezone('Africa/Lagos', now())::date + 1)::timestamp + interval '9 hours' + random() * interval '12 hours') at time zone 'Africa/Lagos'
from public.push_subscriptions
on conflict (user_id) do nothing;

create or replace function public.claim_due_daily_push_users()
returns table(user_id uuid)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select s.user_id
    from public.push_daily_schedule s
    where s.next_daily_at <= now()
      and s.last_daily_sent_on is distinct from (timezone('Africa/Lagos', now())::date)
    order by s.next_daily_at
    for update skip locked
    limit 500
  ),
  claimed as (
    update public.push_daily_schedule s
    set last_daily_sent_on = timezone('Africa/Lagos', now())::date,
        next_daily_at = ((timezone('Africa/Lagos', now())::date + 1)::timestamp + interval '9 hours' + random() * interval '12 hours') at time zone 'Africa/Lagos',
        updated_at = now()
    from due
    where s.user_id = due.user_id
    returning s.user_id
  )
  select claimed.user_id from claimed;
$$;
revoke all on function public.claim_due_daily_push_users() from public, anon, authenticated;
grant execute on function public.claim_due_daily_push_users() to service_role;

select cron.schedule(
  'tradr-daily-campus-push',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://mmwgmgzpxzkhbrabloiq.supabase.co/functions/v1/send-daily-campus-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-tradr-cron-token', (select token from public.push_cron_secrets where id = true)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );
  $job$
);
