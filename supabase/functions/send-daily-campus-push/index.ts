import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-tradr-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const cronToken = req.headers.get('x-tradr-cron-token');
  if (!supabaseUrl || !serviceKey || !publicKey || !privateKey) {
    return respond({ error: 'Daily push service is not configured.' }, 503);
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: secret, error: secretError } = await admin
      .from('push_cron_secrets')
      .select('token')
      .eq('id', true)
      .maybeSingle();
    if (secretError) throw secretError;
    if (!cronToken || !secret?.token || cronToken !== secret.token) {
      return respond({ error: 'Unauthorized.' }, 401);
    }

    const weekdayName = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'Africa/Lagos'
    }).format(new Date());
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
    const { data: message, error: messageError } = await admin
      .from('daily_push_messages')
      .select('title,body')
      .eq('weekday', weekday)
      .eq('enabled', true)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message) return respond({ success: true, claimed: 0, sent: 0, reason: 'no_daily_message' });

    const { data: dueUsers, error: claimError } = await admin.rpc('claim_due_daily_push_users');
    if (claimError) throw claimError;
    const userIds = (dueUsers ?? []).map((row: { user_id: string } | string) =>
      typeof row === 'string' ? row : row.user_id
    );
    if (!userIds.length) return respond({ success: true, claimed: 0, sent: 0 });

    webpush.setVapidDetails('mailto:support@tradrr.store', publicKey, privateKey);
    let sent = 0;
    let failed = 0;
    let removed = 0;

    for (const userId of userIds) {
      const { error: inboxError } = await admin.from('notifications').insert({ user_id: userId, kind: 'campus_pick', title: message.title, message: message.body, entity_type: 'campus' });
      if (inboxError) console.error('Daily campus inbox save failed:', inboxError.message);
      const { data: subscriptions, error: subscriptionsError } = await admin
        .from('push_subscriptions')
        .select('id,endpoint,p256dh,auth')
        .eq('user_id', userId);
      if (subscriptionsError) {
        failed++;
        continue;
      }

      for (const subscription of subscriptions ?? []) {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth }
            },
            JSON.stringify({
              title: message.title,
              body: message.body,
              url: '/?activity=1',
              tag: 'tradr-daily-campus-pick',
              renotify: false
            })
          );
          sent++;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('id', subscription.id);
            removed++;
          } else {
            failed++;
            console.error('Daily push delivery failed:', statusCode ?? 'unknown');
          }
        }
      }
    }

    return respond({ success: true, claimed: userIds.length, sent, failed, removed });
  } catch (error) {
    console.error('send-daily-campus-push failed:', error instanceof Error ? error.message : 'unknown error');
    return respond({ error: 'Could not send daily campus notifications.' }, 500);
  }
});
