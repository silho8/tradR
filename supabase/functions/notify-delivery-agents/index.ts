import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!supabaseUrl || !serviceKey || !publicKey || !privateKey) return respond({ error: 'Push service is not configured.' }, 503);

  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return respond({ error: 'Sign in to notify delivery agents.' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return respond({ error: 'Your session is invalid. Sign in again.' }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = typeof body.order_id === 'string' ? body.order_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return respond({ error: 'A valid order is required.' }, 400);

    const { data: vendor, error: vendorError } = await admin.from('vendors')
      .select('id').eq('profile_id', user.id).maybeSingle();
    if (vendorError) throw vendorError;
    if (!vendor) return respond({ error: 'Only the shop owner can announce a delivery.' }, 403);

    const { data: order, error: orderError } = await admin.from('orders')
      .select('id,public_order_number,order_status,payment_status,delivery_method,vendor_id')
      .eq('id', orderId).eq('vendor_id', vendor.id).maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.delivery_method !== 'tradr' || order.payment_status !== 'succeeded' ||
        order.order_status !== 'ready_for_handover') {
      return respond({ error: 'This order has not entered the tradR delivery queue.' }, 409);
    }
    const { data: readyEvent, error: eventError } = await admin.from('order_events')
      .select('id').eq('order_id', order.id).eq('event_type', 'seller_order_status_updated')
      .eq('to_status', 'ready_for_handover').limit(1).maybeSingle();
    if (eventError) throw eventError;
    if (!readyEvent) return respond({ error: 'The seller has not marked this order ready.' }, 409);

    const { data: delivery, error: deliveryError } = await admin.from('deliveries')
      .select('id,status,method,assigned_agent_id').eq('order_id', order.id).eq('method', 'tradr').maybeSingle();
    if (deliveryError) throw deliveryError;
    if (!delivery || delivery.status !== 'ready' || delivery.assigned_agent_id) {
      return respond({ error: 'This delivery is no longer open for agent acceptance.' }, 409);
    }

    const { data: agents, error: agentsError } = await admin.from('delivery_agents')
      .select('user_id').eq('status', 'approved');
    if (agentsError) throw agentsError;
    const userIds = [...new Set((agents ?? []).map(agent => agent.user_id))];
    if (!userIds.length) return respond({ success: true, eligible_agents: 0, sent: 0 });

    const { data: subscriptions, error: subscriptionsError } = await admin.from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth').in('user_id', userIds);
    if (subscriptionsError) throw subscriptionsError;

    webpush.setVapidDetails('mailto:support@tradrr.store', publicKey, privateKey);
    let sent = 0;
    let failed = 0;
    let removed = 0;
    await Promise.all((subscriptions ?? []).map(async subscription => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({
            title: 'New tradR delivery available',
            body: `Order ${order.public_order_number} is ready for collection. First approved agent to accept gets it.`,
            url: '/?delivery=1',
            tag: `tradr-delivery-${delivery.id}`,
            renotify: true,
          }),
          { urgency: 'high', TTL: 60 * 60 },
        );
        sent++;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', subscription.id);
          removed++;
        } else {
          failed++;
          console.error('Delivery push failed:', statusCode ?? 'unknown');
        }
      }
    }));

    return respond({ success: true, eligible_agents: userIds.length, subscriptions: subscriptions?.length ?? 0, sent, failed, removed });
  } catch (error) {
    console.error('notify-delivery-agents failed:', error instanceof Error ? error.message : 'unknown error');
    return respond({ error: 'Could not notify delivery agents.' }, 500);
  }
});
