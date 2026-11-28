create table if not exists public.admin_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null,
  label text not null default 'Admin',
  withdrawal_alerts_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_notification_recipients_phone_e164_check check (phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  constraint admin_notification_recipients_user_phone_unique unique (user_id, phone_e164)
);
create index if not exists admin_notification_recipients_enabled_idx on public.admin_notification_recipients (withdrawal_alerts_enabled) where withdrawal_alerts_enabled = true;
alter table public.admin_notification_recipients enable row level security;
drop policy if exists "Admins can view notification recipients" on public.admin_notification_recipients;
create policy "Admins can view notification recipients" on public.admin_notification_recipients for select to authenticated using (private.is_admin());
drop policy if exists "Admins can add notification recipients" on public.admin_notification_recipients;
create policy "Admins can add notification recipients" on public.admin_notification_recipients for insert to authenticated with check (private.is_admin());
drop policy if exists "Admins can update notification recipients" on public.admin_notification_recipients;
create policy "Admins can update notification recipients" on public.admin_notification_recipients for update to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "Admins can remove notification recipients" on public.admin_notification_recipients;
create policy "Admins can remove notification recipients" on public.admin_notification_recipients for delete to authenticated using (private.is_admin());
grant select, insert, update, delete on public.admin_notification_recipients to authenticated;
grant all on public.admin_notification_recipients to service_role;
insert into public.admin_notification_recipients (user_id, phone_e164, label, withdrawal_alerts_enabled)
select id, '+2348144364935', 'Primary admin', true from auth.users where id = '314a8a16-072c-4e94-b2d9-3deefca5e0dc'
on conflict (user_id, phone_e164) do update set withdrawal_alerts_enabled = true, updated_at = now();
