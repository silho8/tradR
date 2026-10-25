-- Keep reporter-owned access and admin review access in one SELECT policy.
-- Wrapping auth functions in scalar subqueries avoids per-row re-evaluation.
drop policy if exists "admins can review seller reports" on public.seller_reports;
drop policy if exists "reporters can view their own reports" on public.seller_reports;
create policy "reporters and admins can view seller reports"
  on public.seller_reports
  for select
  to authenticated
  using (
    reporter_id = (select auth.uid())
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "admins can update seller report status" on public.seller_reports;
create policy "admins can update seller report status"
  on public.seller_reports
  for update
  to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
