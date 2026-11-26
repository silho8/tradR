import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return respond({ error: "Admin service is not configured." }, 503);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return respond({ error: "Sign in to continue." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return respond({ error: "Your session is invalid. Sign in again." }, 401);
    if (user.app_metadata?.role !== "admin") return respond({ error: "Admin access is required." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "load";

    if (action === "load") {
      const [vendors, reports, activeListings, dailyPushMessages, supportCases, payoutAccounts] = await Promise.all([
        admin.from("vendors").select("id,shop_name,bio,verification_status,created_at,profile_id").eq("verification_status", "pending").order("created_at", { ascending: true }).limit(50),
        admin.from("seller_reports").select("id,reason,details,status,created_at,vendor_id,listing_id,order_id,evidence_paths,vendors(shop_name),listings(title)").in("status", ["pending", "reviewing"]).neq("reason", "order_support").order("created_at", { ascending: true }).limit(50),
        admin.from("listings").select("id,title,description,category,price_ngn,image_urls,status,moderation_status,created_at,visible_until,vendor_id,vendors(shop_name,verification_status)").eq("status", "published").eq("moderation_status", "approved").gt("visible_until", new Date().toISOString()).order("created_at", { ascending: false }).limit(500),
        admin.from("daily_push_messages").select("weekday,title,body,enabled").order("weekday", { ascending: true }),
        admin.from("seller_reports").select("id,reason,details,status,created_at,reporter_id,vendor_id,order_id,vendors(shop_name)").eq("reason", "order_support").order("created_at", { ascending: false }).limit(100),
        admin.from("vendor_payout_accounts").select("vendor_id,bank_name,account_name,account_last4,status,verified_at").not("vendor_id", "is", null),
      ]);
      const failure = vendors.error ?? reports.error ?? activeListings.error ?? dailyPushMessages.error ?? supportCases.error ?? payoutAccounts.error;
      if (failure) throw failure;
      const reportsWithEvidence = await Promise.all((reports.data ?? []).map(async report => {
        const evidenceUrls = await Promise.all((report.evidence_paths ?? []).map(async (path: string) => {
          const { data, error } = await admin.storage.from("report-evidence").createSignedUrl(path, 600);
          return error ? null : data.signedUrl;
        }));
        return { ...report, evidence_urls: evidenceUrls.filter(Boolean) };
      }));
      return respond({ vendors: vendors.data ?? [], reports: reportsWithEvidence, support_cases: supportCases.data ?? [], payout_accounts: payoutAccounts.data ?? [], active_listings: activeListings.data ?? [], daily_push_messages: dailyPushMessages.data ?? [] });
    }

    if (action === "update_daily_push_message") {
      const weekday = Number(body.weekday);
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const message = typeof body.body === "string" ? body.body.trim() : "";
      const enabled = body.enabled;
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return respond({ error: "Choose a valid day of the week." }, 400);
      if (!title || title.length > 120 || !message || message.length > 240 || typeof enabled !== "boolean") return respond({ error: "Add a title and message within the character limits, then choose whether it is enabled." }, 400);
      const { data, error } = await admin.from("daily_push_messages").update({ title, body: message, enabled, updated_at: new Date().toISOString() }).eq("weekday", weekday).select("weekday").maybeSingle();
      if (error) throw error;
      if (!data) return respond({ error: "That daily message was not found. Refresh the admin desk." }, 404);
      return respond({ success: true });
    }

    if (action === "read_support_chat") {
      const reportId = typeof body.report_id === "string" ? body.report_id : "";
      if (!/^[0-9a-f-]{36}$/i.test(reportId)) return respond({ error: "A valid support case is required." }, 400);
      const { data: supportCase, error: caseError } = await admin.from("seller_reports")
        .select("id,order_id,reason,status").eq("id", reportId).eq("reason", "order_support").maybeSingle();
      if (caseError) throw caseError;
      if (!supportCase?.order_id) return respond({ error: "This support case is no longer open." }, 404);
      const [{ data: order, error: orderError }, { data: messages, error: messagesError }, { data: events, error: eventsError }] = await Promise.all([
        admin.from("orders").select("id,public_order_number,buyer_id,buyer_contact_snapshot,vendor:vendors(shop_name,profile_id)").eq("id", supportCase.order_id).single(),
        admin.from("order_chat_messages").select("id,order_id,sender_id,body,created_at").eq("order_id", supportCase.order_id).order("created_at", { ascending: true }).limit(500),
        admin.from("order_events").select("id,event_type,public_message,created_at,actor_type").eq("order_id", supportCase.order_id).order("created_at", { ascending: true }).limit(200),
      ]);
      if (orderError) throw orderError;
      if (messagesError) throw messagesError;
      if (eventsError) throw eventsError;
      const { error: auditError } = await admin.from("support_chat_access_audit").insert({
        admin_id: user.id, report_id: reportId, order_id: supportCase.order_id, message_count: messages?.length ?? 0,
      });
      if (auditError) throw auditError;
      return respond({ support_case: supportCase, order, messages: messages ?? [], events: events ?? [] });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return respond({ error: "A valid record ID is required." }, 400);

    if (action === "review_vendor") {
      const status = body.status;
      if (status !== "approved" && status !== "rejected") return respond({ error: "Choose approved or rejected." }, 400);
      const { data: vendor, error } = await admin.from("vendors").update({ verification_status: status }).eq("id", id).eq("verification_status", "pending").select("id,profile_id,shop_name").maybeSingle();
      if (error) throw error;
      if (!vendor) return respond({ error: "This shop is no longer pending review. Refresh the queue." }, 409);

      if (status === "approved") {
        const title = "Your shop is approved! 🎉";
        const message = `${vendor.shop_name} has been approved on tradR. You can now publish listings from My shop.`;
        const { data: account } = await admin.auth.admin.getUserById(vendor.profile_id);

        const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
        const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
        if (publicKey && privateKey) {
          try {
            webpush.setVapidDetails("mailto:support@tradrr.store", publicKey, privateKey);
            const { data: subscriptions, error: subscriptionError } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", vendor.profile_id);
            if (subscriptionError) throw subscriptionError;
            await Promise.all((subscriptions ?? []).map(async subscription => {
              try {
                await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title, body: message, url: "/?shop=1", tag: `shop-approved-${vendor.id}` }));
              } catch (pushError) {
                const code = (pushError as { statusCode?: number }).statusCode;
                if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
                console.error("Shop approval push failed:", code ?? "unknown");
              }
            }));
          } catch (pushError) { console.error("Shop approval push batch failed:", pushError instanceof Error ? pushError.message : "unknown"); }
        }

        const resendKey = Deno.env.get("RESEND_API_KEY");
        const recipient = account.user?.email;
        if (resendKey && recipient) {
          try {
            const emailResponse = await fetch("https://api.resend.com/emails", {
              method: "POST", headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: "tradR. <support@tradrr.store>", to: [recipient],
                subject: `Your shop, ${vendor.shop_name}, is approved!`,
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#102a43"><div style="background:#102a43;color:#c6e28b;padding:22px;font-size:24px;font-weight:bold">tradR.</div><div style="padding:28px 22px"><h1 style="font-size:26px">Your shop is approved 🎉</h1><p>Good news! <strong>${vendor.shop_name.replace(/[&<>"']/g, (c: string) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] ?? c))}</strong> has been approved on tradR.</p><p>You can now open My shop and publish your listings to the Lead City University community.</p><p><a href="https://tradrr.store" style="display:inline-block;background:#c6e28b;color:#102a43;padding:13px 18px;text-decoration:none;font-weight:bold">Open tradR.</a></p><p style="color:#687782;font-size:13px">Need help? Reply to this email or reach us through tradR.</p></div></div>`
              })
            });
            if (!emailResponse.ok) console.error("Shop approval email failed:", emailResponse.status, await emailResponse.text());
          } catch (emailError) { console.error("Shop approval email error:", emailError instanceof Error ? emailError.message : "unknown"); }
        } else console.warn("Shop approval email skipped: RESEND_API_KEY or account email is missing.");
      }
      return respond({ success: true });
    }

    if (action === "remove_listing") {
      const { data, error } = await admin.from("listings").update({ status: "archived" }).eq("id", id).eq("status", "published").eq("moderation_status", "approved").select("id").maybeSingle();
      if (error) throw error;
      if (!data) return respond({ error: "This listing is no longer active. Refresh the admin desk." }, 409);
      return respond({ success: true, removed: true });
    }

    if (action === "review_report") {
      const status = body.status;
      if (status !== "reviewing" && status !== "resolved" && status !== "dismissed") return respond({ error: "Choose a valid report status." }, 400);
      const { data: existingReport, error: existingError } = await admin.from("seller_reports")
        .select("id,reason,order_id").eq("id", id).in("status", ["pending", "reviewing"]).maybeSingle();
      if (existingError) throw existingError;
      if (!existingReport) return respond({ error: "This report is no longer active. Refresh the queue." }, 409);
      if (existingReport.reason === "order_support" && existingReport.order_id && (status === "resolved" || status === "dismissed")) {
        const { error: restoreError } = await admin.from("orders").update({ payment_status: "succeeded", updated_at: new Date().toISOString() })
          .eq("id", existingReport.order_id).eq("payment_status", "disputed");
        if (restoreError) throw restoreError;
      }
      const { data, error } = await admin.from("seller_reports").update({ status, updated_at: new Date().toISOString() })
        .eq("id", id).in("status", ["pending", "reviewing"]).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return respond({ error: "This report is no longer active. Refresh the queue." }, 409);
      return respond({ success: true });
    }

    return respond({ error: "Unknown admin action." }, 400);
  } catch (error) {
    console.error("admin-moderation failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "The admin action could not be completed. Please refresh and try again." }, 500);
  }
});
