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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const flutterwaveKey = Deno.env.get("FLW_SECRET_KEY");
  const appUrl = Deno.env.get("TRADR_APP_URL");

  if (!supabaseUrl || !serviceKey || !flutterwaveKey || !appUrl) {
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
        provider: "flutterwave",
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

    const checkoutResponse = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flutterwaveKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: 500,
        currency: "NGN",
        redirect_url: `${appUrl.replace(/\/$/, "")}/?payment=return&tx_ref=${encodeURIComponent(txRef)}`,
        customer: {
          email: user.email,
          name: profile?.display_name || user.email.split("@")[0],
        },
        customizations: {
          title: "tradR listing subscription",
          description: `30-day listing visibility: ${listing.title}`,
        },
        meta: { tradr_payment_id: payment.id, tradr_listing_id: listing.id },
      }),
    });

    const checkout = await checkoutResponse.json().catch(() => ({}));
    if (!checkoutResponse.ok || checkout.status !== "success" || typeof checkout.data?.link !== "string") {
      await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
      await admin.from("listing_subscriptions").update({ status: "failed" }).eq("id", subscription.id);
      return respond({ error: "Flutterwave could not start checkout. Please try again." }, 502);
    }

    return respond({ checkout_url: checkout.data.link, tx_ref: txRef });
  } catch (error) {
    // Keep provider credentials and raw API responses out of logs and client errors.
    console.error("start-listing-payment failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "We could not start payment. Please try again shortly." }, 500);
  }
});
