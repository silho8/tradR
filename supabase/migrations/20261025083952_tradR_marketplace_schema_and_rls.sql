
-- tradR Phase 2: secure marketplace schema
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  shop_name text not null check (char_length(trim(shop_name)) between 2 and 100),
  bio text not null default '' check (char_length(bio) <= 600),
  whatsapp_number text not null check (whatsapp_number ~ '^234[0-9]{10}$'),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 3000),
  category text not null check (category in (
    'Food & Drinks', 'Fashion & Thrift', 'Electronics', 'Beauty & Hair',
    'Books & Study Materials', 'Tech Services', 'Laundry & Cleaning',
    'Accommodation', 'Other Services'
  )),
  price_ngn bigint not null check (price_ngn >= 0 and price_ngn <= 100000000000),
  image_urls text[] not null default '{}' check (cardinality(image_urls) <= 8),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'suspended')),
  visible_until timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Subscription periods and payment rows are written only by trusted server-side code.
create table public.listing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  amount_ngn integer not null default 500 check (amount_ngn = 500),
  status text not null check (status in ('pending', 'active', 'expired', 'failed', 'cancelled')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  listing_subscription_id uuid not null references public.listing_subscriptions(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  provider text not null default 'flutterwave' check (provider in ('flutterwave')),
  provider_transaction_id text,
  amount_ngn integer not null check (amount_ngn = 500),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_transaction_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  reason text not null check (reason in ('spam', 'scam', 'prohibited_item', 'misleading', 'harassment', 'other')),
  details text not null default '' check (char_length(details) <= 1500),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  check (listing_id is not null or vendor_id is not null)
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index listings_vendor_id_idx on public.listings(vendor_id);
create index listings_category_status_idx on public.listings(category, status, moderation_status);
create index listings_created_at_idx on public.listings(created_at desc);
create index listings_price_idx on public.listings(price_ngn);
create index listings_search_document_idx on public.listings using gin(search_document);
create index listing_subscriptions_listing_id_idx on public.listing_subscriptions(listing_id, created_at desc);
create index listing_subscriptions_vendor_id_idx on public.listing_subscriptions(vendor_id);
create index payments_vendor_id_idx on public.payments(vendor_id, created_at desc);
create index reports_status_created_at_idx on public.reports(status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger vendors_set_updated_at before update on public.vendors
for each row execute function public.set_updated_at();
create trigger listings_set_updated_at before update on public.listings
for each row execute function public.set_updated_at();

-- Protect vendor review state from browser-side edits.
create or replace function public.protect_vendor_verification_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.verification_status := case when tg_op = 'INSERT' then 'pending' else old.verification_status end;
  end if;
  return new;
end;
$$;
create trigger vendors_protect_verification before insert or update on public.vendors
for each row execute function public.protect_vendor_verification_fields();

-- Subscription and moderation fields can only be changed by trusted server-side code.
create or replace function public.protect_listing_system_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.visible_until := null;
      new.moderation_status := 'pending';
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.visible_until := old.visible_until;
      new.moderation_status := old.moderation_status;
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
    end if;
  end if;
  return new;
end;
$$;
create trigger listings_protect_system_fields before insert or update on public.listings
for each row execute function public.protect_listing_system_fields();

alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.listings enable row level security;
alter table public.listing_subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.reports enable row level security;
alter table public.admin_users enable row level security;

-- Profiles are public marketplace identity only; private contact details live on vendors.
create policy "profiles are publicly readable" on public.profiles
for select using (true);
create policy "users can create their own profile" on public.profiles
for insert to authenticated with check (id = (select auth.uid()));
create policy "users can update their own profile" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "approved vendors are publicly readable" on public.vendors
for select using (verification_status = 'approved' or profile_id = (select auth.uid()));
create policy "users can create their own vendor profile" on public.vendors
for insert to authenticated with check (profile_id = (select auth.uid()));
create policy "vendors can update their own profile" on public.vendors
for update to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create policy "active listings and owner listings are readable" on public.listings
for select using (
  (
    status = 'published'
    and moderation_status = 'approved'
    and visible_until > now()
  )
  or exists (
    select 1 from public.vendors v
    where v.id = listings.vendor_id and v.profile_id = (select auth.uid())
  )
);
create policy "vendors can create their own listings" on public.listings
for insert to authenticated with check (
  exists (select 1 from public.vendors v
    where v.id = vendor_id and v.profile_id = (select auth.uid()))
);
create policy "vendors can update their own listings" on public.listings
for update to authenticated
using (exists (select 1 from public.vendors v
  where v.id = listings.vendor_id and v.profile_id = (select auth.uid())))
with check (exists (select 1 from public.vendors v
  where v.id = listings.vendor_id and v.profile_id = (select auth.uid())));
create policy "vendors can delete their own listings" on public.listings
for delete to authenticated using (
  exists (select 1 from public.vendors v
    where v.id = listings.vendor_id and v.profile_id = (select auth.uid()))
);

create policy "vendors can read their listing subscription history" on public.listing_subscriptions
for select to authenticated using (
  exists (select 1 from public.vendors v
    where v.id = listing_subscriptions.vendor_id and v.profile_id = (select auth.uid()))
);

-- Payments are intentionally not readable or writable directly from client sessions.
-- Admin and payment workflows use trusted Edge Functions with the service role.

create policy "users can submit reports" on public.reports
for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "users can read their own reports" on public.reports
for select to authenticated using (reporter_id = (select auth.uid()));

-- Admin membership is managed server-side and cannot be read or changed from the client.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "listing images are publicly readable" on storage.objects
for select using (bucket_id = 'listing-images');
create policy "users can upload to their own folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "users can update files in their own folder" on storage.objects
for update to authenticated
using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users can delete files in their own folder" on storage.objects
for delete to authenticated using (
  bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text
);
;
