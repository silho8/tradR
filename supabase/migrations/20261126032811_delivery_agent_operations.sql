-- Extend the existing private inbox vocabulary for delivery updates.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('shop_status', 'listing_status', 'subscription_status', 'transaction_status', 'report_status', 'delivery_status', 'campus_pick'));
alter table public.notifications drop constraint if exists notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check
  check (entity_type is null or entity_type in ('shop', 'listing', 'subscription', 'transaction', 'report', 'delivery', 'campus'));

-- Delivery operations: agent applications, admin approval/assignment, pickup
-- and buyer-to-agent handover verification. All state changes are trusted RPCs.

create policy delivery_agents_admin_read
  on public.delivery_agents for select to authenticated
  using ((select private.is_admin()));

create or replace function public.apply_as_delivery_agent(
  p_display_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_name text := left(trim(coalesce(p_display_name, '')), 100);
  v_phone text := left(trim(coalesce(p_phone, '')), 30);
  v_agent public.delivery_agents%rowtype;
begin
  if v_user is null then raise exception 'Sign in to apply as a delivery agent'; end if;
  if length(v_name) < 2 then raise exception 'Enter your full name'; end if;
  if length(regexp_replace(v_phone, '[^0-9+]', '', 'g')) < 10 then
    raise exception 'Enter a valid phone number';
  end if;

  select * into v_agent from public.delivery_agents where user_id = v_user for update;
  if found then
    if v_agent.status = 'suspended' then raise exception 'This delivery-agent account is suspended'; end if;
    update public.delivery_agents
      set display_name = v_name, phone = v_phone, updated_at = now()
      where id = v_agent.id
      returning * into v_agent;
  else
    insert into public.delivery_agents (user_id, display_name, phone)
      values (v_user, v_name, v_phone)
      returning * into v_agent;
  end if;

  return jsonb_build_object('id', v_agent.id, 'status', v_agent.status);
end;
$$;

create or replace function public.admin_review_delivery_agent(
  p_agent_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_agent public.delivery_agents%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('approved', 'suspended') then raise exception 'Invalid agent status'; end if;
  update public.delivery_agents
    set status = p_status, updated_at = now()
    where id = p_agent_id
    returning * into v_agent;
  if not found then raise exception 'Delivery-agent application not found'; end if;
  insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
  values (v_agent.user_id, 'delivery_status',
    case when p_status = 'approved' then 'Your delivery-agent application is approved' else 'Your delivery-agent access has changed' end,
    case when p_status = 'approved' then 'You can now open Delivery work to view and manage assigned orders.' else 'Your delivery-agent account is no longer available for assignments. Contact tradR support if you need help.' end,
    'delivery', v_agent.id);
  return jsonb_build_object('id', v_agent.id, 'status', v_agent.status);
end;
$$;

create or replace function public.admin_assign_delivery_agent(
  p_delivery_id uuid,
  p_agent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_agent public.delivery_agents%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'Delivery not found'; end if;
  select * into v_order from public.orders where id = v_delivery.order_id for update;
  select * into v_agent from public.delivery_agents where id = p_agent_id for update;
  if v_agent.id is null then raise exception 'Delivery-agent application not found'; end if;

  if v_delivery.method <> 'tradr' then raise exception 'Only tradR-handled deliveries can be assigned'; end if;
  if v_delivery.status not in ('ready', 'pending') or v_order.order_status <> 'ready_for_handover' then
    raise exception 'This order is not ready for agent assignment';
  end if;
  if v_order.payment_status <> 'succeeded' then raise exception 'Only paid orders can be assigned'; end if;
  if v_agent.status <> 'approved' then raise exception 'Choose an approved delivery agent'; end if;

  update public.deliveries
    set assigned_agent_id = v_agent.id, status = 'assigned', updated_at = now()
    where id = v_delivery.id;

  insert into public.order_events (
    order_id, actor_user_id, actor_type, event_type, from_status, to_status,
    public_message, metadata
  ) values (
    v_order.id, auth.uid(), 'admin', 'agent_assigned', v_order.order_status,
    v_order.order_status, 'A tradR delivery agent has been assigned to your order.',
    jsonb_build_object('agent_name', v_agent.display_name)
  );
  insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
  values
    (v_order.buyer_id, 'delivery_status', 'A delivery agent has been assigned',
      'Your order is being handled by ' || v_agent.display_name || '. Check My orders for delivery updates.', 'delivery', v_delivery.id),
    (v_agent.user_id, 'delivery_status', 'You have a new delivery assignment',
      'Order ' || v_order.public_order_number || ' is ready for collection. Open Delivery work for the pickup details.', 'delivery', v_delivery.id);

  return jsonb_build_object('delivery_id', v_delivery.id, 'agent_id', v_agent.id, 'status', 'assigned');
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
    'destination', d.destination_snapshot,
    'buyer_name', coalesce(o.buyer_contact_snapshot->>'name', 'Buyer'),
    'buyer_phone', o.buyer_contact_snapshot->>'phone',
    'seller_name', v.shop_name,
    'assigned_at', d.updated_at,
    'dispatch_at', d.dispatch_at,
    'created_at', o.created_at
  ) order by o.created_at desc), '[]'::jsonb)
  into v_result
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  join public.vendors v on v.id = o.vendor_id
  where d.assigned_agent_id = v_agent.id;

  return v_result;
end;
$$;

create or replace function public.agent_mark_delivery_picked_up(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_agent public.delivery_agents%rowtype;
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_agent from public.delivery_agents
    where user_id = auth.uid() and status = 'approved';
  if not found then raise exception 'An approved delivery-agent account is required'; end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found or v_delivery.assigned_agent_id is distinct from v_agent.id then
    raise exception 'This delivery is not assigned to your account';
  end if;
  if v_delivery.status <> 'assigned' then raise exception 'This delivery is not awaiting pickup'; end if;

  select * into v_order from public.orders where id = v_delivery.order_id for update;
  if v_order.order_status <> 'ready_for_handover' or v_order.payment_status <> 'succeeded' then
    raise exception 'The shop has not marked this paid order ready for pickup';
  end if;

  update public.deliveries set status = 'picked_up', dispatch_at = now(), updated_at = now()
    where id = v_delivery.id;
  update public.orders set order_status = 'dispatched', updated_at = now()
    where id = v_order.id;
  insert into public.order_events (
    order_id, actor_user_id, actor_type, event_type, from_status, to_status, public_message
  ) values (
    v_order.id, auth.uid(), 'agent', 'delivery_dispatched',
    v_order.order_status, 'dispatched', 'Your order has been picked up by its tradR delivery agent.'
  );
  insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
  values (v_order.buyer_id, 'delivery_status', 'Your order is on its way',
    'Your tradR delivery agent has collected your order. Generate your one-time handover code in My orders when they arrive.', 'delivery', v_delivery.id);

  return jsonb_build_object('delivery_id', v_delivery.id, 'status', 'picked_up');
end;
$$;

create or replace function public.buyer_generate_delivery_code(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_code text;
begin
  select d.* into v_delivery
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = p_delivery_id and o.buyer_id = auth.uid()
  for update of d;
  if not found then raise exception 'Delivery not found'; end if;
  if v_delivery.method <> 'tradr' or v_delivery.status not in ('assigned', 'picked_up') then
    raise exception 'A delivery code is available after an agent has been assigned';
  end if;

  update public.delivery_verifications
    set used_at = now()
    where delivery_id = v_delivery.id and used_at is null;

  v_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
  insert into public.delivery_verifications (delivery_id, code_hash, expires_at)
    values (v_delivery.id, extensions.crypt(v_code, extensions.gen_salt('bf')), now() + interval '24 hours');

  return jsonb_build_object('code', v_code, 'expires_at', now() + interval '24 hours');
end;
$$;

create or replace function public.agent_verify_delivery_code(
  p_delivery_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_agent public.delivery_agents%rowtype;
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_verification public.delivery_verifications%rowtype;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  select * into v_agent from public.delivery_agents
    where user_id = auth.uid() and status = 'approved';
  if not found then raise exception 'An approved delivery-agent account is required'; end if;

  select * into v_delivery from public.deliveries
    where id = p_delivery_id and assigned_agent_id = v_agent.id for update;
  if not found then raise exception 'This delivery is not assigned to your account'; end if;
  if v_delivery.status <> 'picked_up' then raise exception 'Mark the order as picked up before confirming delivery'; end if;

  select * into v_order from public.orders where id = v_delivery.order_id for update;
  if v_order.order_status <> 'dispatched' then raise exception 'This order is not in transit'; end if;

  select * into v_verification from public.delivery_verifications
    where delivery_id = v_delivery.id and used_at is null
    order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('success', false, 'message', 'Ask the buyer to generate a fresh delivery code'); end if;
  if v_verification.expires_at <= now() then
    return jsonb_build_object('success', false, 'message', 'That delivery code has expired. Ask the buyer for a new one.');
  end if;
  if v_verification.attempts >= v_verification.max_attempts then
    return jsonb_build_object('success', false, 'message', 'Too many attempts. Ask the buyer to generate a new code.');
  end if;
  if length(v_code) <> 8 or extensions.crypt(v_code, v_verification.code_hash) <> v_verification.code_hash then
    update public.delivery_verifications set attempts = attempts + 1 where id = v_verification.id;
    return jsonb_build_object('success', false, 'message', 'That code does not match. Check with the buyer and try again.');
  end if;

  update public.delivery_verifications set used_at = now() where id = v_verification.id;
  update public.deliveries set status = 'delivered', delivered_at = now(), updated_at = now()
    where id = v_delivery.id;
  update public.orders set order_status = 'delivered', updated_at = now()
    where id = v_order.id;
  insert into public.order_events (
    order_id, actor_user_id, actor_type, event_type, from_status, to_status, public_message
  ) values (
    v_order.id, auth.uid(), 'agent', 'delivery_completed',
    'dispatched', 'delivered', 'Your delivery agent confirmed handover using your one-time code.'
  );
  insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
  values
    (v_order.buyer_id, 'delivery_status', 'Your order has been delivered',
      'The delivery handover was verified. Open My orders to confirm receipt.', 'delivery', v_delivery.id),
    ((select profile_id from public.vendors where id = v_order.vendor_id), 'delivery_status',
      'Your order has been delivered', 'Order ' || v_order.public_order_number || ' was handed to the buyer and verified.', 'delivery', v_delivery.id);

  return jsonb_build_object('success', true, 'message', 'Delivery verified and marked complete.');
end;
$$;

-- A shop's ready-for-handover action now opens the delivery queue.
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
      where order_id = v_order.id and method = 'tradr' and status = 'pending';
    insert into public.notifications (user_id, kind, title, message, entity_type, entity_id)
    select a.user_id, 'delivery_status', 'Order ready for delivery assignment',
      'Order ' || v_order.public_order_number || ' is ready for a tradR agent. Open Admin → Delivery to assign an approved agent.',
      'delivery', d.id
    from public.admin_users a
    join public.deliveries d on d.order_id = v_order.id;
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
    'order_status', p_next_status, 'updated_at', now());
end;
$$;

revoke all on function public.apply_as_delivery_agent(text, text) from public, anon;
revoke all on function public.admin_review_delivery_agent(uuid, text) from public, anon;
revoke all on function public.admin_assign_delivery_agent(uuid, uuid) from public, anon;
revoke all on function public.agent_list_my_deliveries() from public, anon;
revoke all on function public.agent_mark_delivery_picked_up(uuid) from public, anon;
revoke all on function public.buyer_generate_delivery_code(uuid) from public, anon;
revoke all on function public.agent_verify_delivery_code(uuid, text) from public, anon;
revoke all on function public.seller_update_order_status(uuid, text, text) from public, anon;

grant execute on function public.apply_as_delivery_agent(text, text) to authenticated;
grant execute on function public.admin_review_delivery_agent(uuid, text) to authenticated;
grant execute on function public.admin_assign_delivery_agent(uuid, uuid) to authenticated;
grant execute on function public.agent_list_my_deliveries() to authenticated;
grant execute on function public.agent_mark_delivery_picked_up(uuid) to authenticated;
grant execute on function public.buyer_generate_delivery_code(uuid) to authenticated;
grant execute on function public.agent_verify_delivery_code(uuid, text) to authenticated;
grant execute on function public.seller_update_order_status(uuid, text, text) to authenticated;
