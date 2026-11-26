import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders }); }
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!supabaseUrl || !serviceKey || !paystackKey) return respond({ error: "Order status is temporarily unavailable." }, 503);
  const authorization = req.headers.get("Authorization") ?? "", token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return respond({ error: "Sign in to check this order." }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token), user = authData.user;
    if (authError || !user) return respond({ error: "Your session has expired. Sign in again." }, 401);
    const body = await req.json().catch(() => ({}));
    const reference = typeof body.provider_reference === "string" ? body.provider_reference : "";
    if (!/^tradr_order_[0-9a-f]{32}$/i.test(reference)) return respond({ error: "Invalid order payment reference." }, 400);

    const { data: payment, error: paymentError } = await admin.from("order_payments")
      .select("id,order_id,provider_reference,amount_kobo,currency,status,created_at")
      .eq("provider_reference", reference).eq("provider", "paystack").maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return respond({ error: "This order payment was not found." }, 404);
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,public_order_number,buyer_id,payment_status,order_status,buyer_total_kobo,delivery_fee_kobo,items_subtotal_kobo,created_at")
      .eq("id", payment.order_id).eq("buyer_id", user.id).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return respond({ error: "This order does not belong to your account." }, 404);

    if (payment.status === "pending" || payment.status === "processing") {
      const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${paystackKey}`, Accept: "application/json" },
      });
      const verification = await verifyResponse.json().catch(() => ({})), transaction = verification?.data;
      if (verifyResponse.ok && verification?.status === true && transaction?.reference === reference &&
          Number(transaction?.amount) === Number(payment.amount_kobo) && transaction?.currency === payment.currency) {
        if (transaction.status === "success") {
          const { error } = await admin.rpc("confirm_order_payment", {
            p_provider_reference: reference,
            p_provider_transaction_id: String(transaction.id),
            p_channel: typeof transaction.channel === "string" ? transaction.channel : null,
            p_webhook_event_id: `paystack_${transaction.id}`,
            p_processor_fee_kobo: Number.isSafeInteger(transaction.fees) && transaction.fees >= 0 ? transaction.fees : null,
          });
          if (error) throw error;
        } else if (transaction.status === "failed" || transaction.status === "abandoned") {
          const { error } = await admin.rpc("fail_order_payment", {
            p_provider_reference: reference,
            p_failure_code: typeof transaction.gateway_response === "string" ? transaction.gateway_response : transaction.status === "abandoned" ? "payment_abandoned" : "payment_failed",
          });
          if (error) throw error;
        }
      }
    }

    const [{ data: freshPayment, error: freshPaymentError }, { data: freshOrder, error: freshOrderError }] = await Promise.all([
      admin.from("order_payments").select("status,provider_reference,amount_kobo,currency").eq("id", payment.id).single(),
      admin.from("orders").select("public_order_number,payment_status,order_status,buyer_total_kobo,delivery_fee_kobo,items_subtotal_kobo,created_at").eq("id", order.id).single(),
    ]);
    if (freshPaymentError) throw freshPaymentError;
    if (freshOrderError) throw freshOrderError;
    return respond({ payment: freshPayment, order: freshOrder, checked_at: new Date().toISOString() });
  } catch (error) {
    console.error("order-payment-status failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "We couldn't check this order right now. Please try again." }, 500);
  }
});
