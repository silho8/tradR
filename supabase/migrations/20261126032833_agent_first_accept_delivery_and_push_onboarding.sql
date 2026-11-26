-- Open delivery jobs are claimed by the first approved agent to accept.
-- The row lock and conditional state check make this safe under concurrent taps.

create or replace function public.agent_accept_delivery(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_agent public.delivery_agents%rowtype;
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_seller_user uuid;
begin
  select * into v_agent
  from public.delivery_agents
  where user_id = auth.uid() and status = 'approved'
  for update;
  if not found then raise exception 'An approved delivery-agent account is required'; end if;

  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id and method = 'tradr'
  for update;
  if not found then raise exception 'This delivery job is no longer available'; end if;
  if v_delivery.status <> 'ready' or v_delivery.assigned_agent_id is not null then
    raise exception 'Another agent has already accepted this delivery';
  end if;

  select * into v_order from public.orders where id = v_delivery.order_id for update;
  if v_order.order_status <> 'ready_for_handover' or v_order.payment_status <> 'succeeded' then
    raise exception 'This order is not eligible for delivery';
  end if;

  update public.deliveries
    set assigned_agent_id = v_agent.id, status = 'assigned', updated_at = now()
    where id = v_delivery.id and assigned_agent_id is null and status = 'ready';
  if not found then raise exception 'Another agent has already accepted this delivery'; end if;

  select profile_id into v_seller_user from public.vendors where id = v_order.vendor_id;

  insert into public.order_events (
    order_id, actor_user_id, actor_type, event_type, from_status, to_status,
    public_message, metadata
  ) values (
    v_order.id, auth.uid(), 'agent', 'agent_accepted_delivery',
    v_order.order_status, v_order.order_status,
    'A tradR delivery agent has accepted this job.',
    jsonb_build_object('agent_name', v_agent.display_name)
  );

  insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
  values
    (v_order.buyer_id, 'delivery_status', 'A delivery agent accepted your order',
      v_agent.display_name || ' is handling your delivery. You will receive another update when it is picked up.',
      'delivery', v_delivery.id),
    (v_agent.user_id, 'delivery_status', 'Delivery accepted',
      'You have secured order ' || v_order.public_order_number || '. Open Delivery work for the pickup and drop-off details.',
      'delivery', v_delivery.id);
  if v_seller_user is not null then
    insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
    values (v_seller_user, 'delivery_status', 'A delivery agent accepted the order',
      v_agent.display_name || ' has accepted order ' || v_order.public_order_number || '.', 'delivery', v_delivery.id);
  end if;

  -- Tell other approved agents to refresh their open-job list.
  insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
  select a.user_id, 'delivery_status', 'Delivery job already claimed',
    'Another agent accepted order ' || v_order.public_order_number || '. New jobs will appear here as they become ready.',
    'delivery', v_delivery.id
  from public.delivery_agents a
  where a.status = 'approved' and a.id <> v_agent.id;

  return jsonb_build_object(
    'delivery_id', v_delivery.id,
    'order_id', v_order.id,
    'order_number', v_order.public_order_number,
    'agent_id', v_agent.id,
    'status', 'assigned'
  );
end;
$$;

create or replace function public.agent_list_my_deliveries()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_agent public.delivery_agents%rowtype;
  v_result jsonb;
begin
  select * into v_agent from public.delivery_agents where user_id = auth.uid();
  if not found or v_agent.status <> 'approved' then
    raise exception 'An approved delivery-agent account is required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_id', d.id,
    'order_id', o.id,
    'order_number', o.public_order_number,
    'delivery_status', d.status,
    'order_status', o.order_status,
    'is_available', d.status = 'ready' and d.assigned_agent_id is null,
    'destination', case when d.assigned_agent_id = v_agent.id then d.destination_snapshot else null end,
    'buyer_name', case when d.assigned_agent_id = v_agent.id then coalesce(o.buyer_contact_snapshot->>'name', 'Buyer') else null end,
    'buyer_phone', case when d.assigned_agent_id = v_agent.id then o.buyer_contact_snapshot->>'phone' else null end,
    'seller_name', v.shop_name,
    'assigned_at', d.updated_at,
    'dispatch_at', d.dispatch_at,
    'created_at', o.created_at,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object('title', oi.title_snapshot, 'quantity', oi.quantity)), '[]'::jsonb)
      from public.order_items oi where oi.order_id = o.id
    )
  ) order by (d.assigned_agent_id = v_agent.id) desc, o.created_at desc), '[]'::jsonb)
  into v_result
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  join public.vendors v on v.id = o.vendor_id
  where
    (d.status = 'ready' and d.assigned_agent_id is null and o.order_status = 'ready_for_handover' and o.payment_status = 'succeeded')
    or d.assigned_agent_id = v_agent.id;

  return v_result;
end;
$$;

-- A seller marking a tradR delivery ready opens it to every approved agent.
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
  v_delivery_id uuid;
begin
  if v_actor is null then raise exception 'Sign in to manage shop orders'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  select v.id into v_vendor_id from public.vendors v
    where v.id = v_order.vendor_id and v.profile_id = v_actor;
  if v_vendor_id is null then raise exception 'You are not allowed to manage this order'; end if;
  if v_order.payment_status <> 'succeeded' then raise exception 'Only paid orders can be processed'; end if;

  if not (
    (v_order.order_status = 'pending_seller_confirmation' and p_next_status = 'accepted')
    or (v_order.order_status = 'accepted' and p_next_status = 'preparing')
    or (v_order.order_status = 'preparing' and p_next_status = 'ready_for_handover')
    or (v_order.order_status = 'ready_for_handover' and v_order.delivery_method = 'seller' and p_next_status = 'delivered')
  ) then raise exception 'That order update is not allowed from its current status'; end if;

  update public.orders set order_status = p_next_status,
    accepted_at = case when p_next_status = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
    updated_at = now()
    where id = v_order.id;

  if p_next_status = 'ready_for_handover' and v_order.delivery_method = 'tradr' then
    update public.deliveries set status = 'ready', updated_at = now()
      where order_id = v_order.id and method = 'tradr' and status = 'pending'
      returning id into v_delivery_id;
    if v_delivery_id is null then
      select id into v_delivery_id from public.deliveries
        where order_id = v_order.id and method = 'tradr' and status = 'ready';
    end if;
    if v_delivery_id is null then raise exception 'The tradR delivery record is missing'; end if;

    insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
    select a.user_id, 'delivery_status', 'New tradR delivery available',
      'Order ' || v_order.public_order_number || ' is ready for collection. Open Delivery work and accept it. The first approved agent to accept gets the job.',
      'delivery', v_delivery_id
    from public.delivery_agents a
    where a.status = 'approved';
    insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
    select a.user_id, 'delivery_status', 'Order ready for delivery',
      'Order ' || v_order.public_order_number || ' is waiting for an approved agent to accept it.',
      'delivery', v_delivery_id
    from public.admin_users a;
  elsif p_next_status = 'delivered' and v_order.delivery_method = 'seller' then
    update public.deliveries set status = 'delivered', delivered_at = now(), updated_at = now()
      where order_id = v_order.id and method = 'seller';
  end if;

  insert into public.order_events (
    order_id, actor_user_id, actor_type, event_type, from_status, to_status, public_message, metadata
  ) values (
    v_order.id, v_actor, 'seller', 'seller_order_status_updated',
    v_order.order_status, p_next_status, v_message,
    jsonb_build_object('delivery_method', v_order.delivery_method)
  );

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.public_order_number,
    'order_status', p_next_status, 'delivery_id', v_delivery_id, 'updated_at', now());
end;
$$;

-- Manual admin assignment is no longer part of the workflow.
revoke all on function public.admin_assign_delivery_agent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.agent_accept_delivery(uuid) from public, anon;
grant execute on function public.agent_accept_delivery(uuid) to authenticated;
grant execute on function public.agent_list_my_deliveries() to authenticated;
grant execute on function public.seller_update_order_status(uuid, text, text) to authenticated;
