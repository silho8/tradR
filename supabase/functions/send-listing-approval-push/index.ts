import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!supabaseUrl || !serviceKey || !publicKey || !privateKey) return respond({ error: 'Push service is not configured.' }, 503);
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) return respond({ error: 'Unauthorized.' }, 401);
  try {
    const body = await req.json();
    const userId = typeof body.user_id === 'string' ? body.user_id : '';
    const title = typeof body.title === 'string' ? body.title.slice(0, 120) : 'Your product is approved! 🎉';
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : 'Your listing passed admin review.';
    const listingId = typeof body.listing_id === 'string' ? body.listing_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return respond({ error: 'A valid seller account is required.' }, 400);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: subscriptions, error } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', userId);
    if (error) throw error;
    if (!subscriptions?.length) return respond({ success: true, sent: 0, reason: 'no_subscriptions' });
    webpush.setVapidDetails('mailto:support@tradrr.store', publicKey, privateKey);
    const results = await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title, body: message, url: listingId ? '/?listing=' + encodeURIComponent(listingId) : '/activity', tag: 'listing-approved-' + listingId }));
        return { id: subscription.id, sent: true };
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', subscription.id);
        console.error('Push delivery failed:', statusCode ?? 'unknown');
        return { id: subscription.id, sent: false, statusCode };
      }
    }));
    return respond({ success: true, sent: results.filter(result => result.sent).length, failed: results.filter(result => !result.sent).length });
  } catch (error) {
    console.error('send-listing-approval-push failed:', error instanceof Error ? error.message : 'unknown error');
    return respond({ error: 'Could not send listing approval notification.' }, 500);
  }
});
