-- Add the missing FK-side index identified by the Supabase performance advisor.
-- This is safe to run on existing databases and does not alter application data.
create index if not exists seller_reports_listing_id_idx on public.seller_reports (listing_id);
