-- Remove the per-shop active listing cap. Shop approval and listing moderation remain enforced.
drop trigger if exists enforce_vendor_listing_limit on public.listings;
drop function if exists public.enforce_vendor_listing_limit();
