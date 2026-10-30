import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders }); }
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  if (Deno.env.get("TRADR_PAYSTACK_ENABLED") !== "true") return respond({ error: "Shop subscriptions are temporarily unavailable while Paystack checkout is being verified." }, 503);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY"), appUrl = Deno.env.get("TRADR_APP_URL");
  if (!supabaseUrl || !serviceKey || !paystackKey || !appUrl) return respond({ error: "Payment service is not configured yet." }, 503);
  const authorization = req.headers.get("Authorization") ?? "", token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return respond({ error: "Please sign in to continue." }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let subscriptionId = "", paymentId = "";
  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token), user = authData.user;
    if (authError || !user) return respond({ error: "Your session is invalid. Please sign in again." }, 401);
    if (!user.email) return respond({ error: "Your account needs an email address before payment." }, 400);
    const { data: vendor, error: vendorError } = await admin.from("vendors").select("id,profile_id,shop_name,verification_status").eq("profile_id", user.id).maybeSingle();
    if (vendorError) throw vendorError;
    if (!vendor) return respond({ error: "Create your shop before subscribing." }, 403);
    if (vendor.verification_status !== "approved") return respond({ error: "Your shop must be approved before you can subscribe." }, 403);
    const { data: active, error: activeError } = await admin.from("shop_subscriptions").select("id,expires_at").eq("vendor_id", vendor.id).eq("status", "active").gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle();
    if (activeError) throw activeError;
    if (active) return respond({ error: "Your shop already has an active subscription.", expires_at: active.expires_at }, 409);
    const txRef = `tradr_${crypto.randomUUID().replaceAll("-", "")}`;
    const { data: subscription, error: subscriptionError } = await admin.from("shop_subscriptions").insert({ vendor_id: vendor.id, amount_ngn: 500, status: "pending" }).select("id").single();
    if (subscriptionError) throw subscriptionError;
    subscriptionId = subscription.id;
    const { data: payment, error: paymentError } = await admin.from("payments").insert({ listing_subscription_id: null, shop_subscription_id: subscription.id, vendor_id: vendor.id, provider: "paystack", amount_ngn: 500, currency: "NGN", status: "pending", tx_ref: txRef }).select("id").single();
    if (paymentError) throw paymentError;
    paymentId = payment.id;
    const checkoutResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST", headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ reference: txRef, amount: "50000", currency: "NGN", email: user.email, callback_url: `${appUrl.replace(/\/$/, "")}/?payment=shop-return&tx_ref=${encodeURIComponent(txRef)}`, metadata: { tradr_payment_id: payment.id, tradr_shop_subscription_id: subscription.id, vendor_id: vendor.id, shop_name: vendor.shop_name, subscription_type: "shop_monthly" } }),
    });
    const checkout = await checkoutResponse.json().catch(() => ({}));
    if (!checkoutResponse.ok || checkout.status !== true || typeof checkout.data?.authorization_url !== "string" || checkout.data?.reference !== txRef) {
      await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
      await admin.from("shop_subscriptions").update({ status: "failed" }).eq("id", subscription.id);
      return respond({ error: "Paystack could not start checkout. Please try again." }, 502);
    }
    return respond({ checkout_url: checkout.data.authorization_url, tx_ref: txRef });
  } catch (error) {
    if (paymentId) await admin.from("payments").update({ status: "failed" }).eq("id", paymentId);
    if (subscriptionId) await admin.from("shop_subscriptions").update({ status: "failed" }).eq("id", subscriptionId);
    console.error("start-shop-payment failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "Could not start shop subscription checkout. Please try again." }, 500);
  }
});