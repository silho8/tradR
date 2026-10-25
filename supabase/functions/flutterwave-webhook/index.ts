import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Content-Type": "application/json" };

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const flutterwaveKey = Deno.env.get("FLW_SECRET_KEY");
  const secretHash = Deno.env.get("FLW_SECRET_HASH");
  if (!supabaseUrl || !serviceKey || !flutterwaveKey || !secretHash) {
    return respond({ error: "Webhook is not configured." }, 503);
  }

  const signature = req.headers.get("verif-hash") ?? "";
  if (!signature || !safeEqual(signature, secretHash)) return respond({ error: "Invalid webhook signature." }, 401);

  try {
    const payload = await req.json();
    const event = payload?.event;
    const data = payload?.data;
    if (event !== "charge.completed" || !data || data.status !== "successful") {
      return respond({ received: true });
    }

    const transactionId = String(data.id ?? "");
    const txRef = typeof data.tx_ref === "string" ? data.tx_ref : "";
    if (!/^\d+$/.test(transactionId) || !/^tradr_[0-9a-f]{32}$/i.test(txRef)) {
      return respond({ error: "Invalid transaction reference." }, 400);
    }

    // Never activate access based only on the client redirect or webhook payload.
    const verificationResponse = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
      { headers: { Authorization: `Bearer ${flutterwaveKey}`, Accept: "application/json" } },
    );
    const verification = await verificationResponse.json().catch(() => ({}));
    const transaction = verification?.data;
    if (
      !verificationResponse.ok ||
      verification?.status !== "success" ||
      transaction?.status !== "successful" ||
      transaction?.tx_ref !== txRef ||
      transaction?.currency !== "NGN" ||
      Number(transaction?.amount) !== 500
    ) {
      return respond({ error: "Transaction verification failed." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("id, amount_ngn, currency, status")
      .eq("tx_ref", txRef)
      .maybeSingle();

    if (paymentError) throw paymentError;
    if (!payment || payment.amount_ngn !== 500 || payment.currency !== "NGN") {
      return respond({ error: "No matching payment record." }, 404);
    }
    if (payment.status === "succeeded") return respond({ received: true, duplicate: true });

    const { data: activated, error: activationError } = await admin.rpc(
      "activate_listing_subscription_internal",
      { p_tx_ref: txRef, p_provider_transaction_id: transactionId },
    );
    if (activationError) throw activationError;
    if (activated !== true) return respond({ error: "Payment could not be activated." }, 409);

    return respond({ received: true });
  } catch (error) {
    console.error("flutterwave-webhook failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "Webhook processing failed." }, 500);
  }
});
