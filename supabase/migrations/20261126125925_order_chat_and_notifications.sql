-- Per-order buyer/seller conversations. Existing marketplace data is untouched.
create table if not exists public.order_chat_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  recipient_read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_chat_messages_sender_idx on public.order_chat_messages(sender_id);
create index if not exists order_chat_messages_order_created_idx on public.order_chat_messages(order_id,created_at desc);
create index if not exists order_chat_messages_unread_idx on public.order_chat_messages(order_id,sender_id,recipient_read_at) where recipient_read_at is null;
alter table public.order_chat_messages enable row level security;
revoke all on public.order_chat_messages from anon,public;
grant select on public.order_chat_messages to authenticated;
grant insert(order_id,sender_id,body) on public.order_chat_messages to authenticated;
grant update(recipient_read_at) on public.order_chat_messages to authenticated;
grant all on public.order_chat_messages to service_role;

drop policy if exists order_chat_messages_participant_read on public.order_chat_messages;
create policy order_chat_messages_participant_read on public.order_chat_messages for select to authenticated using (
  exists(select 1 from public.orders o left join public.vendors v on v.id=o.vendor_id where o.id=order_chat_messages.order_id and (o.buyer_id=(select auth.uid()) or v.profile_id=(select auth.uid())) and o.payment_status in ('succeeded','refund_pending','partially_refunded','refunded','disputed'))
);
drop policy if exists order_chat_messages_participant_insert on public.order_chat_messages;
create policy order_chat_messages_participant_insert on public.order_chat_messages for insert to authenticated with check (
  sender_id=(select auth.uid()) and exists(select 1 from public.orders o left join public.vendors v on v.id=o.vendor_id where o.id=order_chat_messages.order_id and (o.buyer_id=(select auth.uid()) or v.profile_id=(select auth.uid())) and o.payment_status in ('succeeded','refund_pending','partially_refunded','refunded','disputed'))
);
drop policy if exists order_chat_messages_recipient_read on public.order_chat_messages;
create policy order_chat_messages_recipient_read on public.order_chat_messages for update to authenticated using (
  sender_id<>(select auth.uid()) and recipient_read_at is null and exists(select 1 from public.orders o left join public.vendors v on v.id=o.vendor_id where o.id=order_chat_messages.order_id and (o.buyer_id=(select auth.uid()) or v.profile_id=(select auth.uid())))
) with check (
  sender_id<>(select auth.uid()) and recipient_read_at is not null and exists(select 1 from public.orders o left join public.vendors v on v.id=o.vendor_id where o.id=order_chat_messages.order_id and (o.buyer_id=(select auth.uid()) or v.profile_id=(select auth.uid())))
);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind=any(array['shop_status','listing_status','subscription_status','transaction_status','report_status','delivery_status','campus_pick','order_status','chat_message']));
alter table public.notifications drop constraint if exists notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check(entity_type is null or entity_type=any(array['shop','listing','subscription','transaction','report','delivery','campus','order']));

create or replace function private.notify_order_chat_message() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.orders%rowtype; v_seller_user_id uuid; v_sender_name text; v_recipient_id uuid;
begin
  select * into v_order from public.orders where id=new.order_id;
  select profile_id into v_seller_user_id from public.vendors where id=v_order.vendor_id;
  if new.sender_id=v_order.buyer_id then
    v_recipient_id:=v_seller_user_id;v_sender_name:=coalesce(nullif(v_order.buyer_contact_snapshot->>'name',''),'Buyer');
  elsif new.sender_id=v_seller_user_id then
    v_recipient_id:=v_order.buyer_id;select shop_name into v_sender_name from public.vendors where id=v_order.vendor_id;
  else return new; end if;
  if v_recipient_id is not null then
    insert into public.notifications(user_id,kind,title,message,entity_type,entity_id) values(v_recipient_id,'chat_message','New message from '||left(coalesce(v_sender_name,'tradR user'),70),left(new.body,500),'order',new.order_id);
  end if;
  return new;
end $$;
revoke all on function private.notify_order_chat_message() from public,anon,authenticated;
drop trigger if exists order_chat_message_notify on public.order_chat_messages;
create trigger order_chat_message_notify after insert on public.order_chat_messages for each row execute function private.notify_order_chat_message();

create or replace function private.notify_order_event_participant() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.orders%rowtype; v_seller_user_id uuid; v_recipient_id uuid; v_title text; v_message text;
begin
  select * into v_order from public.orders where id=new.order_id;
  select profile_id into v_seller_user_id from public.vendors where id=v_order.vendor_id;
  if new.event_type='payment_succeeded' then
    v_recipient_id:=v_seller_user_id;v_title:='New paid order';v_message:='Order '||v_order.public_order_number||' has been paid. Open your shop to accept it.';
  elsif new.event_type='seller_order_status_updated' then
    v_recipient_id:=v_order.buyer_id;
    v_title:=case new.to_status when 'accepted' then 'Seller accepted your order' when 'preparing' then 'Your order is being prepared' when 'ready_for_handover' then 'Your order is ready' when 'delivered' then 'Seller marked your order delivered' else 'Your order has an update' end;
    v_message:=coalesce(nullif(new.public_message,''),v_title||' · '||v_order.public_order_number);
  elsif new.event_type='buyer_confirmed_receipt' then
    v_recipient_id:=v_seller_user_id;v_title:='Buyer confirmed receipt';v_message:='The buyer confirmed receipt of order '||v_order.public_order_number||'.';
  else return new; end if;
  if v_recipient_id is not null then insert into public.notifications(user_id,kind,title,message,entity_type,entity_id) values(v_recipient_id,'order_status',left(v_title,120),left(v_message,500),'order',v_order.id); end if;
  return new;
end $$;
revoke all on function private.notify_order_event_participant() from public,anon,authenticated;
drop trigger if exists order_event_participant_notify on public.order_events;
create trigger order_event_participant_notify after insert on public.order_events for each row execute function private.notify_order_event_participant();

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_chat_messages') then alter publication supabase_realtime add table public.order_chat_messages; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_events') then alter publication supabase_realtime add table public.order_events; end if;
  end if;
end $$;
