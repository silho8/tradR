import { createClient } from "npm:@supabase/supabase-js@2";

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

  // New payments are shop-wide. Existing pending listing payments remain verifiable through the webhook.
  return respond({ error: "Per-listing payments have been retired. Your shop has a free calendar month from signup, then one ₦500 monthly subscription covers the whole shop." }, 410);

  // Payments stay disabled until Paystack test transactions and webhook verification pass.
  if (Deno.env.get("TRADR_PAYSTACK_ENABLED") !== "true") {
    return respond({
      error: "Listing payments are temporarily unavailable while tradR completes Paystack setup and verification. You can prepare your shop and listings; activation will open after testing.",
    }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  const appUrl = Deno.env.get("TRADR_APP_URL");

  if (!supabaseUrl || !serviceKey || !paystackKey || !appUrl) {
    return respond({ error: "Payment service is not configured yet." }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return respond({ error: "Please sign in to continue." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return respond({ error: "Your session is invalid. Please sign in again." }, 401);
    if (!user.email) return respond({ error: "Your account needs a verified email before payment." }, 400);

    const body = await req.json().catch(() => ({}));
    const listingId = typeof body.listing_id === "string" ? body.listing_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(listingId)) return respond({ error: "A valid listing is required." }, 400);

    const { data: vendor, error: vendorError } = await admin
      .from("vendors")
      .select("id, profile_id, shop_name, verification_status")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (vendorError) throw vendorError;
    if (!vendor) return respond({ error: "Create your shop before paying for a listing." }, 403);
    if (vendor.verification_status !== "approved") {
      return respond({ error: "Your shop must be approved before you can activate a listing." }, 403);
    }

    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("id, title, vendor_id, moderation_status")
      .eq("id", listingId)
      .eq("vendor_id", vendor.id)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing) return respond({ error: "That listing was not found in your shop." }, 404);
    if (listing.moderation_status !== "approved") {
      return respond({ error: "Your listing must pass moderation before you can activate it." }, 403);
    }

    const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const txRef = `tradr_${crypto.randomUUID().replaceAll("-", "")}`;

    const { data: subscription, error: subscriptionError } = await admin
      .from("listing_subscriptions")
      .insert({
        listing_id: listing.id,
        vendor_id: vendor.id,
        amount_ngn: 500,
        status: "pending",
      })
      .select("id")
      .single();
    if (subscriptionError) throw subscriptionError;

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .insert({
        listing_subscription_id: subscription.id,
        vendor_id: vendor.id,
        provider: "paystack",
        amount_ngn: 500,
        currency: "NGN",
        status: "pending",
        tx_ref: txRef,
      })
      .select("id")
      .single();

    if (paymentError) {
      await admin.from("listing_subscriptions").update({ status: "failed" }).eq("id", subscription.id);
      throw paymentError;
    }

    const checkoutResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        reference: txRef,
        amount: "50000", // Paystack expects the amount in kobo: ₦500 = 50,000 kobo.
        currency: "NGN",
        email: user.email,
        callback_url: `${appUrl.replace(/\/$/, "")}/?payment=return&tx_ref=${encodeURIComponent(txRef)}`,
        metadata: {
          tradr_payment_id: payment.id,
          tradr_listing_id: listing.id,
          vendor_id: vendor.id,
          listing_title: listing.title,
          custom_fields: [{ display_name: "Listing", variable_name: "listing_title", value: listing.title }],
        },
      }),
    });

    const checkout = await checkoutResponse.json().catch(() => ({}));
    if (!checkoutResponse.ok || checkout.status !== true || typeof checkout.data?.authorization_url !== "string" || checkout.data?.reference !== txRef) {
      await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
      await admin.from("listing_subscriptions").update({ status: "failed" }).eq("id", subscription.id);
      return respond({ error: "Paystack could not start checkout. Please try again." }, 502);
    }

    return respond({ checkout_url: checkout.data.authorization_url, tx_ref: txRef });
  } catch (error) {
    // Keep provider credentials and raw API responses out of logs and client errors.
    console.error("start-listing-payment failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "We could not start payment. Please try again shortly." }, 500);
  }
});
