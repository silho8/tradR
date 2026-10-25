-- Seller branding and buyer safety reports for tradR.
alter table public.vendors
  add column if not exists logo_url text;

create table if not exists public.seller_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  reason text not null check (reason in ('non_delivery','suspected_scam','misleading_listing','harassment','other')),
  details text not null check (char_length(trim(details)) between 20 and 3000),
  evidence_paths text[] not null default '{}'::text[],
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_reports_no_self_report check (reporter_id is not null)
);

create index if not exists seller_reports_vendor_created_idx on public.seller_reports (vendor_id, created_at desc);
create index if not exists seller_reports_status_created_idx on public.seller_reports (status, created_at desc);
create index if not exists seller_reports_reporter_created_idx on public.seller_reports (reporter_id, created_at desc);

alter table public.seller_reports enable row level security;
revoke all on public.seller_reports from anon, public;
grant select, insert on public.seller_reports to authenticated;

drop policy if exists "users can submit reports about other sellers" on public.seller_reports;
create policy "users can submit reports about other sellers"
  on public.seller_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (select 1 from public.vendors v where v.id = vendor_id and v.profile_id <> (select auth.uid()))
    and (listing_id is null or exists (select 1 from public.listings l where l.id = seller_reports.listing_id and l.vendor_id = seller_reports.vendor_id))
    and cardinality(evidence_paths) <= 5
    and not exists (select 1 from unnest(evidence_paths) as evidence_path where split_part(evidence_path, '/', 1) <> (select auth.uid())::text)
  );

drop policy if exists "reporters can view their own reports" on public.seller_reports;
create policy "reporters can view their own reports"
  on public.seller_reports for select to authenticated using (reporter_id = (select auth.uid()));

grant update on public.seller_reports to authenticated;
drop policy if exists "admins can review seller reports" on public.seller_reports;
create policy "admins can review seller reports"
  on public.seller_reports for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
drop policy if exists "admins can update seller report status" on public.seller_reports;
create policy "admins can update seller report status"
  on public.seller_reports for update to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role') = 'admin')
  with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence','report-evidence',false,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif'];

drop policy if exists "users can upload their own report evidence" on storage.objects;
create policy "users can upload their own report evidence" on storage.objects for insert to authenticated
with check (bucket_id='report-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists "users can view their own report evidence" on storage.objects;
create policy "users can view their own report evidence" on storage.objects for select to authenticated
using (
  bucket_id='report-evidence'
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or (select auth.jwt()->'app_metadata'->>'role') = 'admin'
  )
);

drop policy if exists "users can delete their own report evidence" on storage.objects;
create policy "users can delete their own report evidence" on storage.objects for delete to authenticated
using (bucket_id='report-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);
