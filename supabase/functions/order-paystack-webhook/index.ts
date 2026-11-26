import { createClient } from "npm:@supabase/supabase-js@2";
const headers = { "Content-Type": "application/json" };
function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers }); }
function toHex(bytes: Uint8Array) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hmacSha512(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))));
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!supabaseUrl || !serviceKey || !paystackKey) return respond({ error: "Webhook is not configured." }, 503);

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") ?? "";
    const expected = await hmacSha512(paystackKey, rawBody);
    if (!signature || !constantTimeEqual(signature.toLowerCase(), expected)) return respond({ error: "Invalid webhook signature." }, 401);

    const payload = JSON.parse(rawBody);
    const event = payload?.event;
    if (event !== "charge.success" && event !== "charge.failed") return respond({ received: true, ignored: true });
    const data = payload?.data;
    const reference = typeof data?.reference === "string" ? data.reference : "";
    if (!/^tradr_order_[0-9a-f]{32}$/i.test(reference)) return respond({ received: true, ignored: true });

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: payment, error: paymentError } = await admin.from("order_payments")
      .select("id,provider_reference,amount_kobo,currency,status")
      .eq("provider_reference", reference).eq("provider", "paystack")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return respond({ error: "No matching order payment." }, 404);
    if (payment.status === "succeeded") return respond({ received: true, duplicate: true });

    // Never trust the webhook payload alone. Verify the reference and amount with Paystack.
    const verificationResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackKey}`, Accept: "application/json" },
    });
    const verification = await verificationResponse.json().catch(() => ({}));
    const transaction = verification?.data;
    if (!verificationResponse.ok || verification?.status !== true ||
        transaction?.reference !== reference || Number(transaction?.amount) !== Number(payment.amount_kobo) ||
        transaction?.currency !== payment.currency) {
      return respond({ error: "Paystack transaction verification failed." }, 400);
    }

    if (transaction.status === "success") {
      const { data: confirmed, error } = await admin.rpc("confirm_order_payment", {
        p_provider_reference: reference,
        p_provider_transaction_id: String(transaction.id),
        p_channel: typeof transaction.channel === "string" ? transaction.channel : null,
        p_webhook_event_id: `paystack_${transaction.id}`,
        p_processor_fee_kobo: Number.isSafeInteger(transaction.fees) && transaction.fees >= 0 ? transaction.fees : null,
      });
      if (error) throw error;
      if (confirmed !== true) return respond({ error: "Payment could not be settled." }, 409);
      return respond({ received: true });
    }

    if (transaction.status === "failed" || transaction.status === "abandoned") {
      const { error } = await admin.rpc("fail_order_payment", {
        p_provider_reference: reference,
        p_failure_code: typeof transaction.gateway_response === "string"
          ? transaction.gateway_response
          : transaction.status === "abandoned" ? "payment_abandoned" : "charge_failed",
      });
      if (error) throw error;
      return respond({ received: true, failed: true, stock_released: true });
    }
    return respond({ received: true, pending: true });
  } catch (error) {
    console.error("order-paystack-webhook failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "Webhook processing failed." }, 500);
  }
});
