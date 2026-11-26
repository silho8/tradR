create policy "Public can read seller reviews" on public.seller_reviews for select to anon, authenticated using (true); grant select on public.seller_reviews to anon, authenticated;
