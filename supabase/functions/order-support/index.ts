import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders }); }
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return respond({ error: "Support is temporarily unavailable." }, 503);
  const authorization = req.headers.get("Authorization") ?? "", token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return respond({ error: "Sign in to contact tradR support." }, 401);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token), user = authData.user;
    if (authError || !user) return respond({ error: "Your session is invalid. Sign in again." }, 401);
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    const details = typeof body.details === "string" ? body.details.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || details.length < 20 || details.length > 3000) {
      return respond({ error: "Tell us what happened in at least 20 characters." }, 400);
    }
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,public_order_number,buyer_id,vendor_id,payment_status,vendor:vendors(id,profile_id,shop_name)")
      .eq("id", orderId).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return respond({ error: "That order could not be found." }, 404);
    const vendor = Array.isArray(order.vendor) ? order.vendor[0] : order.vendor;
    if (order.buyer_id !== user.id && vendor?.profile_id !== user.id) return respond({ error: "Only the buyer or seller on this order can contact support." }, 403);
    const { data: existing, error: existingError } = await admin.from("seller_reports")
      .select("id,status,created_at").eq("order_id", orderId).eq("reason", "order_support").in("status", ["pending", "reviewing"]).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return respond({ success: true, case_id: existing.id, already_open: true });
    if (order.payment_status !== "succeeded") return respond({ error: "This order is already under review or is not eligible for a new support case." }, 409);

    const { data: report, error: reportError } = await admin.from("seller_reports").insert({
      reporter_id: user.id, vendor_id: order.vendor_id, listing_id: null, order_id: orderId,
      reason: "order_support", details, evidence_paths: [], status: "pending",
    }).select("id").single();
    if (reportError) {
      if (reportError.code === "23505") {
        const { data: raced } = await admin.from("seller_reports").select("id").eq("order_id", orderId)
          .eq("reason", "order_support").in("status", ["pending", "reviewing"]).maybeSingle();
        if (raced) return respond({ success: true, case_id: raced.id, already_open: true });
      }
      throw reportError;
    }
    const { error: freezeError } = await admin.from("orders").update({ payment_status: "disputed", updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("payment_status", "succeeded");
    if (freezeError) {
      await admin.from("seller_reports").delete().eq("id", report.id);
      throw freezeError;
    }
    const recipientIds = [...new Set([order.buyer_id, vendor?.profile_id].filter((id): id is string => typeof id === "string"))];
    await admin.from("notifications").insert(recipientIds.map(userId => ({
      user_id: userId, kind: "report_status", title: "Order sent to tradR Support",
      message: `A support case has been opened for order ${order.public_order_number}. Authorized support staff may review this order conversation while investigating.`,
      entity_type: "report", entity_id: report.id,
    })));
    return respond({ success: true, case_id: report.id, already_open: false });
  } catch (error) {
    console.error("order-support failed:", error instanceof Error ? error.message : "unknown");
    return respond({ error: error instanceof Error ? error.message.slice(0, 220) : "Could not open a support case." }, 400);
  }
});
