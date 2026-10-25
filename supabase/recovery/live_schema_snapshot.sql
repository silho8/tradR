-- GENERATED CURRENT-STATE SNAPSHOT, 2026-10-25
-- Project ref: mmwgmgzpxzkhbrabloiq
-- NOT a production migration. Do not apply directly to the existing live project.
-- Reconstructed from live catalogs to aid migration recovery. Review, compare with the
-- original migrations, and validate in an isolated Supabase/Postgres environment first.
-- This excludes data and Supabase-managed schemas. It assumes auth/storage schemas and
-- roles (anon, authenticated, service_role) already exist as in a Supabase environment.

create schema if not exists private;

-- TABLES
create table public.admin_users (user_id uuid not null,
  created_at timestamp with time zone default now() not null);

create table public.listing_subscriptions (id uuid default gen_random_uuid() not null,
  listing_id uuid not null,
  vendor_id uuid not null,
  amount_ngn integer default 500 not null,
  status text not null,
  starts_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now() not null);

create table public.listings (id uuid default gen_random_uuid() not null,
  vendor_id uuid not null,
  title text not null,
  description text not null,
  category text not null,
  price_ngn bigint not null,
  image_urls text[] default '{}'::text[] not null,
  status text default 'draft'::text not null,
  moderation_status text default 'pending'::text not null,
  visible_until timestamp with time zone,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  search_document tsvector generated always as (to_tsvector('simple'::regconfig, ((((COALESCE(title, ''::text) || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || COALESCE(category, ''::text)))) stored,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table public.payments (id uuid default gen_random_uuid() not null,
  listing_subscription_id uuid not null,
  vendor_id uuid not null,
  provider text default 'flutterwave'::text not null,
  provider_transaction_id text,
  amount_ngn integer not null,
  currency text default 'NGN'::text not null,
  status text default 'pending'::text not null,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  tx_ref text);

create table public.profiles (id uuid not null,
  display_name text not null,
  avatar_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table public.reports (id uuid default gen_random_uuid() not null,
  reporter_id uuid not null,
  listing_id uuid,
  vendor_id uuid,
  reason text not null,
  details text default ''::text not null,
  status text default 'open'::text not null,
  created_at timestamp with time zone default now() not null);

create table public.seller_reports (id uuid default gen_random_uuid() not null,
  reporter_id uuid not null,
  vendor_id uuid not null,
  listing_id uuid,
  reason text not null,
  details text not null,
  evidence_paths text[] default '{}'::text[] not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table public.vendors (id uuid default gen_random_uuid() not null,
  profile_id uuid not null,
  shop_name text not null,
  bio text default ''::text not null,
  whatsapp_number text not null,
  verification_status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  logo_url text);

-- CONSTRAINTS
alter table public.admin_users add constraint admin_users_pkey PRIMARY KEY (user_id);

alter table public.admin_users add constraint admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.listing_subscriptions add constraint listing_subscriptions_amount_ngn_check CHECK ((amount_ngn = 500));

alter table public.listing_subscriptions add constraint listing_subscriptions_check CHECK (((expires_at IS NULL) OR (starts_at IS NULL) OR (expires_at > starts_at)));

alter table public.listing_subscriptions add constraint listing_subscriptions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;

alter table public.listing_subscriptions add constraint listing_subscriptions_pkey PRIMARY KEY (id);

alter table public.listing_subscriptions add constraint listing_subscriptions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'expired'::text, 'failed'::text, 'cancelled'::text])));

alter table public.listing_subscriptions add constraint listing_subscriptions_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;

alter table public.listings add constraint listings_category_check CHECK ((category = ANY (ARRAY['Food & Drinks'::text, 'Fashion & Thrift'::text, 'Electronics'::text, 'Beauty & Hair'::text, 'Books & Study Materials'::text, 'Tech Services'::text, 'Laundry & Cleaning'::text, 'Accommodation'::text, 'Other Services'::text])));

alter table public.listings add constraint listings_description_check CHECK (((char_length(TRIM(BOTH FROM description)) >= 10) AND (char_length(TRIM(BOTH FROM description)) <= 3000)));

alter table public.listings add constraint listings_image_urls_check CHECK ((cardinality(image_urls) <= 8));

alter table public.listings add constraint listings_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'suspended'::text])));

alter table public.listings add constraint listings_pkey PRIMARY KEY (id);

alter table public.listings add constraint listings_price_ngn_check CHECK (((price_ngn >= 0) AND (price_ngn <= '100000000000'::bigint)));

alter table public.listings add constraint listings_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.listings add constraint listings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));

alter table public.listings add constraint listings_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 3) AND (char_length(TRIM(BOTH FROM title)) <= 120)));

alter table public.listings add constraint listings_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;

alter table public.payments add constraint payments_amount_ngn_check CHECK ((amount_ngn = 500));

alter table public.payments add constraint payments_currency_check CHECK ((currency = 'NGN'::text));

alter table public.payments add constraint payments_listing_subscription_id_fkey FOREIGN KEY (listing_subscription_id) REFERENCES listing_subscriptions(id) ON DELETE RESTRICT;

alter table public.payments add constraint payments_pkey PRIMARY KEY (id);

alter table public.payments add constraint payments_provider_check CHECK ((provider = 'flutterwave'::text));

alter table public.payments add constraint payments_provider_provider_transaction_id_key UNIQUE (provider, provider_transaction_id);

alter table public.payments add constraint payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text])));

alter table public.payments add constraint payments_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;

alter table public.profiles add constraint profiles_display_name_check CHECK (((char_length(TRIM(BOTH FROM display_name)) >= 2) AND (char_length(TRIM(BOTH FROM display_name)) <= 80)));

alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

alter table public.reports add constraint reports_check CHECK (((listing_id IS NOT NULL) OR (vendor_id IS NOT NULL)));

alter table public.reports add constraint reports_details_check CHECK ((char_length(details) <= 1500));

alter table public.reports add constraint reports_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;

alter table public.reports add constraint reports_pkey PRIMARY KEY (id);

alter table public.reports add constraint reports_reason_check CHECK ((reason = ANY (ARRAY['spam'::text, 'scam'::text, 'prohibited_item'::text, 'misleading'::text, 'harassment'::text, 'other'::text])));

alter table public.reports add constraint reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.reports add constraint reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text])));

alter table public.reports add constraint reports_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

alter table public.seller_reports add constraint seller_reports_details_check CHECK (((char_length(TRIM(BOTH FROM details)) >= 20) AND (char_length(TRIM(BOTH FROM details)) <= 3000)));

alter table public.seller_reports add constraint seller_reports_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;

alter table public.seller_reports add constraint seller_reports_no_self_report CHECK ((reporter_id IS NOT NULL));

alter table public.seller_reports add constraint seller_reports_pkey PRIMARY KEY (id);

alter table public.seller_reports add constraint seller_reports_reason_check CHECK ((reason = ANY (ARRAY['non_delivery'::text, 'suspected_scam'::text, 'misleading_listing'::text, 'harassment'::text, 'other'::text])));

alter table public.seller_reports add constraint seller_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.seller_reports add constraint seller_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text])));

alter table public.seller_reports add constraint seller_reports_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;

alter table public.vendors add constraint vendors_bio_check CHECK ((char_length(bio) <= 600));

alter table public.vendors add constraint vendors_pkey PRIMARY KEY (id);

alter table public.vendors add constraint vendors_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.vendors add constraint vendors_profile_id_key UNIQUE (profile_id);

alter table public.vendors add constraint vendors_shop_name_check CHECK (((char_length(TRIM(BOTH FROM shop_name)) >= 2) AND (char_length(TRIM(BOTH FROM shop_name)) <= 100)));

alter table public.vendors add constraint vendors_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'suspended'::text])));

alter table public.vendors add constraint vendors_whatsapp_number_check CHECK ((whatsapp_number ~ '^234[0-9]{10}$'::text));

-- APPLICATION INDEXES
CREATE INDEX listing_subscriptions_listing_id_idx ON public.listing_subscriptions USING btree (listing_id, created_at DESC);

CREATE INDEX listing_subscriptions_vendor_id_idx ON public.listing_subscriptions USING btree (vendor_id);

CREATE INDEX listings_vendor_id_idx ON public.listings USING btree (vendor_id);

CREATE INDEX listings_category_status_idx ON public.listings USING btree (category, status, moderation_status);

CREATE INDEX listings_created_at_idx ON public.listings USING btree (created_at DESC);

CREATE INDEX listings_price_idx ON public.listings USING btree (price_ngn);

CREATE INDEX listings_search_document_idx ON public.listings USING gin (search_document);

CREATE INDEX listings_reviewed_by_idx ON public.listings USING btree (reviewed_by);

CREATE INDEX payments_vendor_id_idx ON public.payments USING btree (vendor_id, created_at DESC);

CREATE INDEX payments_subscription_id_idx ON public.payments USING btree (listing_subscription_id);

CREATE UNIQUE INDEX payments_tx_ref_unique_idx ON public.payments USING btree (tx_ref) WHERE (tx_ref IS NOT NULL);

CREATE INDEX reports_status_created_at_idx ON public.reports USING btree (status, created_at DESC);

CREATE INDEX reports_listing_id_idx ON public.reports USING btree (listing_id);

CREATE INDEX reports_reporter_id_idx ON public.reports USING btree (reporter_id);

CREATE INDEX reports_vendor_id_idx ON public.reports USING btree (vendor_id);

CREATE INDEX seller_reports_vendor_created_idx ON public.seller_reports USING btree (vendor_id, created_at DESC);

CREATE INDEX seller_reports_status_created_idx ON public.seller_reports USING btree (status, created_at DESC);

CREATE INDEX seller_reports_reporter_created_idx ON public.seller_reports USING btree (reporter_id, created_at DESC);

CREATE INDEX seller_reports_listing_id_idx ON public.seller_reports USING btree (listing_id);

-- FUNCTIONS
CREATE OR REPLACE FUNCTION private.activate_listing_subscription(p_tx_ref text, p_provider_transaction_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_payment public.payments%rowtype;
  v_subscription public.listing_subscriptions%rowtype;
  v_expires_at timestamptz;
begin
  select * into v_payment
  from public.payments
  where tx_ref = p_tx_ref
  for update;

  if not found then
    return false;
  end if;

  if v_payment.status = 'succeeded' then
    return true;
  end if;

  if v_payment.status <> 'pending'
     or v_payment.amount_ngn <> 500
     or v_payment.currency <> 'NGN' then
    return false;
  end if;

  select * into v_subscription
  from public.listing_subscriptions
  where id = v_payment.listing_subscription_id
  for update;

  if not found or v_subscription.amount_ngn <> 500 then
    return false;
  end if;

  v_expires_at := now() + interval '30 days';

  update public.payments
  set status = 'succeeded',
      provider_transaction_id = p_provider_transaction_id,
      verified_at = now()
  where id = v_payment.id;

  update public.listing_subscriptions
  set status = 'active',
      starts_at = now(),
      expires_at = v_expires_at
  where id = v_subscription.id;

  update public.listings l
  set status = 'published',
      visible_until = v_expires_at,
      updated_at = now()
  where l.id = v_subscription.listing_id
    and l.moderation_status = 'approved'
    and exists (
      select 1
      from public.vendors v
      where v.id = l.vendor_id
        and v.verification_status = 'approved'
    );

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.activate_listing_subscription_internal(p_tx_ref text, p_provider_transaction_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_payment public.payments%rowtype;
  v_subscription public.listing_subscriptions%rowtype;
  v_expires_at timestamptz;
begin
  select * into v_payment
  from public.payments
  where tx_ref = p_tx_ref
  for update;

  if not found then return false; end if;
  if v_payment.status = 'succeeded' then return true; end if;
  if v_payment.status <> 'pending'
     or v_payment.amount_ngn <> 500
     or v_payment.currency <> 'NGN' then
    return false;
  end if;

  select * into v_subscription
  from public.listing_subscriptions
  where id = v_payment.listing_subscription_id
  for update;

  if not found or v_subscription.amount_ngn <> 500 then return false; end if;

  v_expires_at := now() + interval '30 days';

  update public.payments
  set status = 'succeeded',
      provider_transaction_id = p_provider_transaction_id,
      verified_at = now()
  where id = v_payment.id;

  update public.listing_subscriptions
  set status = 'active',
      starts_at = now(),
      expires_at = v_expires_at
  where id = v_subscription.id;

  update public.listings l
  set status = 'published',
      visible_until = v_expires_at,
      updated_at = now()
  where l.id = v_subscription.listing_id
    and l.moderation_status = 'approved'
    and exists (
      select 1 from public.vendors v
      where v.id = l.vendor_id
        and v.verification_status = 'approved'
    );

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_vendor_listing_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.protect_listing_system_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.protect_report_system_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.status := 'open';
    else
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.protect_vendor_verification_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.verification_status := case when tg_op = 'INSERT' then 'pending' else old.verification_status end;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


-- TRIGGERS
CREATE TRIGGER enforce_vendor_listing_limit BEFORE INSERT OR UPDATE OF vendor_id ON public.listings FOR EACH ROW EXECUTE FUNCTION enforce_vendor_listing_limit();

CREATE TRIGGER listings_protect_system_fields BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION protect_listing_system_fields();

CREATE TRIGGER listings_set_updated_at BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER reports_protect_system_fields BEFORE INSERT OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION protect_report_system_fields();

CREATE TRIGGER vendors_protect_verification BEFORE INSERT OR UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION protect_vendor_verification_fields();

CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ROW LEVEL SECURITY
alter table public.admin_users enable row level security;

alter table public.listing_subscriptions enable row level security;

alter table public.listings enable row level security;

alter table public.payments enable row level security;

alter table public.profiles enable row level security;

alter table public.reports enable row level security;

alter table public.seller_reports enable row level security;

alter table public.vendors enable row level security;

-- RLS POLICIES
create policy "admin membership is server managed only" on public.admin_users as permissive for ALL to public using (false) with check (false);

create policy "vendors can read their listing subscription history" on public.listing_subscriptions as permissive for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = listing_subscriptions.vendor_id) AND (v.profile_id = ( SELECT auth.uid() AS uid))))));

create policy "active listings and owner listings are readable" on public.listings as permissive for SELECT to public using ((((status = 'published'::text) AND (moderation_status = 'approved'::text) AND (visible_until > now()) AND (EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = listings.vendor_id) AND (v.verification_status = 'approved'::text))))) OR (EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = listings.vendor_id) AND (v.profile_id = ( SELECT auth.uid() AS uid)))))));

create policy "vendors can create their own listings" on public.listings as permissive for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = listings.vendor_id) AND (v.profile_id = ( SELECT auth.uid() AS uid))))));

create policy "vendors can delete their own listings" on public.listings as permissive for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = listings.vendor_id) AND (v.profile_id = ( SELECT auth.uid() AS uid))))));

create policy "vendors can update their own listings" on public.listings as permissive for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = listings.vendor_id) AND (v.profile_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = listings.vendor_id) AND (v.profile_id = ( SELECT auth.uid() AS uid))))));

create policy "payments are server managed only" on public.payments as permissive for ALL to public using (false) with check (false);

create policy "profiles are publicly readable" on public.profiles as permissive for SELECT to public using (true);

create policy "users can create their own profile" on public.profiles as permissive for INSERT to authenticated with check ((id = ( SELECT auth.uid() AS uid)));

create policy "users can update their own profile" on public.profiles as permissive for UPDATE to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));

create policy "users can read their own reports" on public.reports as permissive for SELECT to authenticated using ((reporter_id = ( SELECT auth.uid() AS uid)));

create policy "users can submit reports" on public.reports as permissive for INSERT to authenticated with check ((reporter_id = ( SELECT auth.uid() AS uid)));

create policy "admins can update seller report status" on public.seller_reports as permissive for UPDATE to authenticated using ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)) with check ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));

create policy "reporters and admins can view seller reports" on public.seller_reports as permissive for SELECT to authenticated using (((reporter_id = ( SELECT auth.uid() AS uid)) OR (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)));

create policy "users can submit reports about other sellers" on public.seller_reports as permissive for INSERT to authenticated with check (((reporter_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = seller_reports.vendor_id) AND (v.profile_id <> ( SELECT auth.uid() AS uid))))) AND ((listing_id IS NULL) OR (EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = seller_reports.listing_id) AND (l.vendor_id = seller_reports.vendor_id))))) AND (cardinality(evidence_paths) <= 5) AND (NOT (EXISTS ( SELECT 1
   FROM unnest(seller_reports.evidence_paths) evidence_path(evidence_path)
  WHERE (split_part(evidence_path.evidence_path, '/'::text, 1) <> (( SELECT auth.uid() AS uid))::text))))));

create policy "approved vendors are publicly readable" on public.vendors as permissive for SELECT to public using (((verification_status = 'approved'::text) OR (profile_id = ( SELECT auth.uid() AS uid))));

create policy "users can create their own vendor profile" on public.vendors as permissive for INSERT to authenticated with check ((profile_id = ( SELECT auth.uid() AS uid)));

create policy "vendors can update their own profile" on public.vendors as permissive for UPDATE to authenticated using ((profile_id = ( SELECT auth.uid() AS uid))) with check ((profile_id = ( SELECT auth.uid() AS uid)));

create policy "listing images are publicly readable" on storage.objects as permissive for SELECT to public using ((bucket_id = 'listing-images'::text));

create policy "users can delete files in their own folder" on storage.objects as permissive for DELETE to authenticated using (((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

create policy "users can delete their own report evidence" on storage.objects as permissive for DELETE to authenticated using (((bucket_id = 'report-evidence'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

create policy "users can update files in their own folder" on storage.objects as permissive for UPDATE to authenticated using (((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))) with check (((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

create policy "users can upload their own report evidence" on storage.objects as permissive for INSERT to authenticated with check (((bucket_id = 'report-evidence'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

create policy "users can upload to their own folder" on storage.objects as permissive for INSERT to authenticated with check (((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

create policy "users can view their own report evidence" on storage.objects as permissive for SELECT to authenticated using (((bucket_id = 'report-evidence'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR (( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text)) = 'admin'::text))));

-- TABLE GRANTS
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_users to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_users to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_users to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.listing_subscriptions to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.listing_subscriptions to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.listing_subscriptions to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.listings to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.listings to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.listings to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.payments to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.payments to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.payments to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.profiles to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.profiles to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.profiles to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.reports to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.reports to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.reports to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.seller_reports to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.seller_reports to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vendors to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vendors to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.vendors to service_role;

-- STORAGE BUCKET CONFIGURATION
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('listing-images','listing-images','t','5242880','{image/jpeg,image/png,image/webp,image/avif}') on conflict (id) do update set name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('report-evidence','report-evidence','f','5242880','{image/jpeg,image/png,image/webp,image/avif}') on conflict (id) do update set name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;


-- FUNCTION PRIVILEGES (apply after function definitions)
-- Reset non-owner grants first so default PUBLIC execution cannot leak onto
-- the two SECURITY DEFINER payment activation functions.
revoke all on function private.activate_listing_subscription(text, text) from public, anon, authenticated, service_role;
revoke all on function public.activate_listing_subscription_internal(text, text) from public, anon, authenticated, service_role;
revoke all on function public.enforce_vendor_listing_limit() from public, anon, authenticated, service_role;
revoke all on function public.protect_listing_system_fields() from public, anon, authenticated, service_role;
revoke all on function public.protect_report_system_fields() from public, anon, authenticated, service_role;
revoke all on function public.protect_vendor_verification_fields() from public, anon, authenticated, service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;

grant execute on function private.activate_listing_subscription(text, text) to service_role;
grant execute on function public.activate_listing_subscription_internal(text, text) to service_role;
grant execute on function public.enforce_vendor_listing_limit() to service_role;
grant execute on function public.protect_listing_system_fields() to public;
grant execute on function public.protect_listing_system_fields() to anon;
grant execute on function public.protect_listing_system_fields() to authenticated;
grant execute on function public.protect_listing_system_fields() to service_role;
grant execute on function public.protect_report_system_fields() to public;
grant execute on function public.protect_report_system_fields() to anon;
grant execute on function public.protect_report_system_fields() to authenticated;
grant execute on function public.protect_report_system_fields() to service_role;
grant execute on function public.protect_vendor_verification_fields() to public;
grant execute on function public.protect_vendor_verification_fields() to anon;
grant execute on function public.protect_vendor_verification_fields() to authenticated;
grant execute on function public.protect_vendor_verification_fields() to service_role;
grant execute on function public.set_updated_at() to public;
grant execute on function public.set_updated_at() to anon;
grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.set_updated_at() to service_role;

-- SCHEMA PRIVILEGES
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
grant usage on schema public to anon, authenticated, service_role;
