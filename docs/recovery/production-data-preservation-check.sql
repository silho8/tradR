-- Read-only production preservation audit.
-- Safe to run against production before and after a reviewed migration.
-- Does not modify data. Save both result sets and compare them.

select 'profiles' as resource, count(*)::bigint as row_count from public.profiles
union all
select 'vendors' as resource, count(*)::bigint as row_count from public.vendors
union all
select 'listings' as resource, count(*)::bigint as row_count from public.listings
union all
select 'payments' as resource, count(*)::bigint as row_count from public.payments
union all
select 'transactions' as resource, count(*)::bigint as row_count from public.transactions
order by resource;

-- Seller/shop records with no profile owner.
select v.id as vendor_id, v.profile_id, v.shop_name
from public.vendors v
left join public.profiles p on p.id = v.profile_id
where p.id is null
order by v.id;

-- Listings whose vendor/shop record is missing.
select l.id as listing_id, l.vendor_id, l.title
from public.listings l
left join public.vendors v on v.id = l.vendor_id
where v.id is null
order by l.id;

-- Inventory of listing state and approval metadata. Compare before/after.
select id, vendor_id, status, moderation_status, visible_until,
       reviewed_at, reviewed_by, image_urls
from public.listings
order by id;

-- Inventory of shop state and identity metadata. Compare before/after.
select id, profile_id, shop_name, verification_status, logo_url
from public.vendors
order by id;

-- Storage bucket names and visibility. Object counts are grouped by bucket.
select b.id as bucket_id, b.name, b.public,
       count(o.id)::bigint as object_count
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
where b.name in ('listing-images', 'report-evidence')
group by b.id, b.name, b.public
order by b.name;
