alter table public.orders
  add column if not exists buyer_hidden_at timestamptz;

create index if not exists orders_buyer_visible_history_idx
  on public.orders (buyer_id, created_at desc)
  where buyer_hidden_at is null;

drop policy if exists orders_participant_read on public.orders;
create policy orders_participant_read
  on public.orders for select to authenticated
  using (
    (buyer_id = (select auth.uid()) and buyer_hidden_at is null)
    or exists (
      select 1 from public.vendors v
      where v.id = orders.vendor_id
        and v.profile_id = (select auth.uid())
        and orders.payment_status in ('succeeded', 'refund_pending', 'partially_refunded', 'refunded', 'disputed')
    )
    or (select private.is_admin())
  );

drop policy if exists orders_buyer_hide_uncompleted on public.orders;
create policy orders_buyer_hide_uncompleted
  on public.orders for update to authenticated
  using (
    buyer_id = (select auth.uid())
    and buyer_hidden_at is null
    and order_status <> 'completed'
    and payment_status in ('failed', 'abandoned', 'refunded')
  )
  with check (
    buyer_id = (select auth.uid())
    and buyer_hidden_at is not null
    and order_status <> 'completed'
    and payment_status in ('failed', 'abandoned', 'refunded')
  );

revoke update on public.orders from authenticated;
grant update (buyer_hidden_at) on public.orders to authenticated;