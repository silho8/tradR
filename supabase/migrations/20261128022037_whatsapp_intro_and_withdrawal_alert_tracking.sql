create table if not exists public.whatsapp_contact_introductions (
 phone_e164 text primary key,
 intro_sent_at timestamptz not null default now(),
 intro_template_name text not null,
 created_at timestamptz not null default now()
);
alter table public.whatsapp_contact_introductions enable row level security;
revoke all on public.whatsapp_contact_introductions from public,anon,authenticated;
grant all on public.whatsapp_contact_introductions to service_role;

create table if not exists public.whatsapp_withdrawal_alerts (
 id uuid primary key default gen_random_uuid(),
 withdrawal_request_id uuid not null references public.seller_withdrawal_requests(id) on delete cascade,
 phone_e164 text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 provider_message_id text,
 error_code text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(withdrawal_request_id,phone_e164)
);
alter table public.whatsapp_withdrawal_alerts enable row level security;
revoke all on public.whatsapp_withdrawal_alerts from public,anon,authenticated;
grant all on public.whatsapp_withdrawal_alerts to service_role;