import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders }); }
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return respond({ error: "Payment status is temporarily unavailable." }, 503);
  const authorization = req.headers.get("Authorization") ?? "", token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return respond({ error: "Sign in to check this payment." }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token), user = authData.user;
    if (authError || !user) return respond({ error: "Your session has expired. Sign in again to check payment." }, 401);
    const body = await req.json().catch(() => ({})), txRef = typeof body.tx_ref === "string" ? body.tx_ref : "";
    if (!/^tradr_[0-9a-f]{32}$/i.test(txRef)) return respond({ error: "This payment reference is invalid." }, 400);
    const { data: vendor, error: vendorError } = await admin.from("vendors").select("id").eq("profile_id", user.id).maybeSingle();
    if (vendorError) throw vendorError;
    if (!vendor) return respond({ error: "We couldn't find a shop linked to your account." }, 404);
    const { data: payment, error: paymentError } = await admin.from("payments")
      .select("id,tx_ref,vendor_id,listing_subscription_id,shop_subscription_id,amount_ngn,currency,status,provider,created_at")
      .eq("tx_ref", txRef).eq("vendor_id", vendor.id).maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment || payment.provider !== "paystack") return respond({ error: "This Paystack payment wasn't found for your shop." }, 404);

    if (payment.shop_subscription_id) {
      const { data: subscription, error } = await admin.from("shop_subscriptions")
        .select("id,status,starts_at,expires_at").eq("id", payment.shop_subscription_id).maybeSingle();
      if (error) throw error;
      return respond({
        status: payment.status, amount_ngn: payment.amount_ngn, currency: payment.currency, tx_ref: payment.tx_ref,
        subscription_type: "shop_monthly", subscription_status: subscription?.status ?? "pending",
        expires_at: subscription?.expires_at ?? null, checked_at: new Date().toISOString(),
      });
    }

    const { data: subscription, error: subscriptionError } = await admin.from("listing_subscriptions")
      .select("id,listing_id,status,starts_at,expires_at").eq("id", payment.listing_subscription_id).maybeSingle();
    if (subscriptionError) throw subscriptionError;
    let listingTitle = "Your listing";
    if (subscription?.listing_id) {
      const { data: listing, error } = await admin.from("listings").select("title").eq("id", subscription.listing_id).maybeSingle();
      if (error) throw error;
      if (listing?.title) listingTitle = listing.title;
    }
    return respond({
      status: payment.status, amount_ngn: payment.amount_ngn, currency: payment.currency, tx_ref: payment.tx_ref,
      subscription_type: "listing", listing_title: listingTitle, subscription_status: subscription?.status ?? "pending",
      expires_at: subscription?.expires_at ?? null, checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("payment-status failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "We couldn't check the payment right now. Please try again." }, 500);
  }
});