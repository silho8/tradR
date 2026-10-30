-- Allow marketplace clients to receive listing changes through Supabase Realtime.
alter publication supabase_realtime add table public.listings;
