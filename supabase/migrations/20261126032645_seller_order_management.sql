-- Seller order actions: only the verified owner of the paid order's shop may
-- advance the fulfilment state. All changes are recorded in append-only events.

create or replace function public.seller_update_order_status(
  p_order_id uuid,
  p_next_status text,
  p_public_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_vendor_id uuid;
  v_actor uuid := auth.uid();
  v_message text := nullif(left(trim(coalesce(p_public_message, '')), 300), '');
begin
  if v_actor is null then
    raise exception 'Sign in to manage shop orders';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  select v.id into v_vendor_id
  from public.vendors v
  where v.id = v_order.vendor_id
    and v.profile_id = v_actor;
  if v_vendor_id is null then
    raise exception 'You are not allowed to manage this order';
  end if;
  if v_order.payment_status <> 'succeeded' then
    raise exception 'Only paid orders can be processed';
  end if;

  if not (
    (v_order.order_status = 'pending_seller_confirmation' and p_next_status = 'accepted')
    or (v_order.order_status = 'accepted' and p_next_status = 'preparing')
    or (v_order.order_status = 'preparing' and p_next_status = 'ready_for_handover')
    or (v_order.order_status = 'ready_for_handover'
      and v_order.delivery_method = 'seller' and p_next_status = 'delivered')
  ) then
    raise exception 'That order update is not allowed from its current status';
  end if;

  update public.orders
  set order_status = p_next_status,
      accepted_at = case when p_next_status = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
      updated_at = now()
  where id = v_order.id;

  insert into public.order_events (
    order_id, actor_user_id, actor_type, event_type, from_status,
    to_status, public_message, metadata
  ) values (
    v_order.id, v_actor, 'seller', 'seller_order_status_updated',
    v_order.order_status, p_next_status, v_message,
    jsonb_build_object('delivery_method', v_order.delivery_method)
  );

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.public_order_number,
    'order_status', p_next_status,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.seller_update_order_status(uuid, text, text) from public, anon;
grant execute on function public.seller_update_order_status(uuid, text, text) to authenticated;
