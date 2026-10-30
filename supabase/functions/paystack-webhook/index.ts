import { createClient } from "npm:@supabase/supabase-js@2";
const headers = { "Content-Type": "application/json" };
function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers }); }
function toHex(bytes: Uint8Array) { return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""); }
function constantTimeEqual(a: string, b: string) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
async function hmacSha512(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))));
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!supabaseUrl || !serviceKey || !paystackKey) return respond({ error: "Webhook is not configured." }, 503);
  try {
    const rawBody = await req.text(), signature = req.headers.get("x-paystack-signature") ?? "", expected = await hmacSha512(paystackKey, rawBody);
    if (!signature || !constantTimeEqual(signature.toLowerCase(), expected)) return respond({ error: "Invalid webhook signature." }, 401);
    const payload = JSON.parse(rawBody);
    if (payload?.event !== "charge.success") return respond({ received: true });
    const eventData = payload?.data, txRef = typeof eventData?.reference === "string" ? eventData.reference : "";
    if (!/^tradr_[0-9a-f]{32}$/i.test(txRef)) return respond({ error: "Invalid transaction reference." }, 400);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: payment, error: paymentError } = await admin.from("payments")
      .select("id,provider,amount_ngn,currency,status,listing_subscription_id,shop_subscription_id")
      .eq("tx_ref", txRef).maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment || payment.provider !== "paystack" || payment.amount_ngn !== 500 || payment.currency !== "NGN" ||
      (!!payment.listing_subscription_id === !!payment.shop_subscription_id)) return respond({ error: "No matching Paystack payment record." }, 404);
    if (payment.status === "succeeded") return respond({ received: true, duplicate: true });
    if (payment.status !== "pending") return respond({ received: true, ignored: true });
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(txRef)}`, {
      headers: { Authorization: `Bearer ${paystackKey}`, Accept: "application/json" },
    });
    const verification = await verifyResponse.json().catch(() => ({})), transaction = verification?.data;
    if (!verifyResponse.ok || verification?.status !== true || transaction?.status !== "success" ||
      transaction?.reference !== txRef || Number(transaction?.amount) !== 50000 || transaction?.currency !== "NGN") {
      return respond({ error: "Paystack transaction verification failed." }, 400);
    }
    const rpc = payment.shop_subscription_id ? "activate_shop_subscription_internal" : "activate_listing_subscription_internal";
    const { data: activated, error: activationError } = await admin.rpc(rpc, {
      p_tx_ref: txRef, p_provider_transaction_id: String(transaction.id),
    });
    if (activationError) throw activationError;
    if (activated !== true) return respond({ error: "Payment could not be activated." }, 409);
    return respond({ received: true });
  } catch (error) {
    console.error("paystack-webhook failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "Webhook processing failed." }, 500);
  }
});