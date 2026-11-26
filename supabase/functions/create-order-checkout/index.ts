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
  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!supabaseUrl || !serviceKey || !paystackKey) {
    return respond({ error: "Secure checkout is not configured." }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return respond({ error: "Sign in before checkout." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return respond({ error: "Your session has expired. Sign in again." }, 401);
    if (!user.email) return respond({ error: "Add a verified email address to your account before checkout." }, 400);

    const body = await req.json().catch(() => ({}));
    const cartId = typeof body.cart_id === "string" ? body.cart_id : "";
    const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : "";
    const deliveryMethod = body.delivery_method === "tradr" ? "tradr" : body.delivery_method === "seller" ? "seller" : "";
    const buyerContact = body.buyer_contact && typeof body.buyer_contact === "object"
      ? { ...body.buyer_contact, email: user.email }
      : null;
    const deliveryAddress = body.delivery_address && typeof body.delivery_address === "object" ? body.delivery_address : null;
    const buyerNote = typeof body.buyer_note === "string" ? body.buyer_note.slice(0, 1000) : null;
    if (!cartId || !deliveryMethod || !buyerContact || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return respond({ error: "Complete your contact and delivery details before checkout." }, 400);
    }

    const proposedReference = `tradr_order_${crypto.randomUUID().replaceAll("-", "")}`;
    const { data: checkout, error: checkoutError } = await admin.rpc("create_order_checkout", {
      p_buyer_id: user.id,
      p_cart_id: cartId,
      p_delivery_method: deliveryMethod,
      p_buyer_contact: buyerContact,
      p_delivery_address: deliveryAddress,
      p_buyer_note: buyerNote,
      p_idempotency_key: idempotencyKey,
      p_provider_reference: proposedReference,
    });
    if (checkoutError) {
      console.error("create_order_checkout RPC:", checkoutError.message);
      const knownMessages = [
        "Only an approved shop can be used for checkout",
        "An item in your cart is no longer available",
        "Your cart is empty",
        "Your active cart could not be found",
        "Buyer name and a valid phone number are required",
        "A delivery address is required for tradR agent delivery",
        "Choose a valid delivery method",
      ];
      const stockMessage = checkoutError.message.match(/Not enough stock for "([^"]+)"\. Only (\d+) available\./);
      const safeMessage = stockMessage
        ? `Only ${stockMessage[2]} unit(s) of ${stockMessage[1]} are currently available. Update your cart and try again.`
        : knownMessages.find(message => checkoutError.message.includes(message))
          ?? "We could not prepare your order. Refresh your cart and try again.";
      return respond({ error: safeMessage }, 400);
    }
    if (!checkout?.order_id || !checkout?.provider_reference || !Number.isInteger(Number(checkout.amount_kobo))) {
      return respond({ error: "The order could not be prepared safely." }, 500);
    }
    if (checkout.payment_status === "succeeded") {
      return respond({ already_paid: true, order_id: checkout.order_id, order_number: checkout.order_number });
    }
    if (checkout.payment_status !== "pending" && checkout.payment_status !== "processing") {
      return respond({ error: "This checkout has already failed. Please contact tradR support before starting another payment." }, 409);
    }

    if (checkout.already_exists && checkout.authorization_url) {
      return respond({
        authorization_url: checkout.authorization_url,
        order_id: checkout.order_id,
        order_number: checkout.order_number,
        amount_kobo: checkout.amount_kobo,
        provider_reference: checkout.provider_reference,
        resumed: true,
      });
    }

    if (checkout.already_exists && !checkout.authorization_url) {
      const previous = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(checkout.provider_reference)}`, {
        headers: { Authorization: `Bearer ${paystackKey}`, Accept: "application/json" },
      });
      const previousResult = await previous.json().catch(() => ({}));
      const previousTransaction = previousResult?.data;
      if (previous.ok && previousResult?.status === true && previousTransaction?.reference === checkout.provider_reference &&
          Number(previousTransaction?.amount) === Number(checkout.amount_kobo) && previousTransaction?.currency === "NGN") {
        if (previousTransaction.status === "failed" || previousTransaction.status === "abandoned") {
          const { error } = await admin.rpc("fail_order_payment", {
            p_provider_reference: checkout.provider_reference,
            p_failure_code: typeof previousTransaction.gateway_response === "string"
              ? previousTransaction.gateway_response
              : previousTransaction.status === "abandoned" ? "payment_abandoned" : "payment_failed",
          });
          if (error) throw error;
          return respond({
            error: "The previous payment did not complete. Reserved stock has been returned to the shop. Add the items to your cart again to start a fresh checkout.",
            order_id: checkout.order_id,
            order_number: checkout.order_number,
            stock_released: true,
          }, 409);
        }
        if (previousTransaction.status === "success") {
          const { error } = await admin.rpc("confirm_order_payment", {
            p_provider_reference: checkout.provider_reference,
            p_provider_transaction_id: String(previousTransaction.id),
            p_channel: typeof previousTransaction.channel === "string" ? previousTransaction.channel : null,
            p_webhook_event_id: `paystack_${previousTransaction.id}`,
            p_processor_fee_kobo: Number.isSafeInteger(previousTransaction.fees) && previousTransaction.fees >= 0 ? previousTransaction.fees : null,
          });
          if (error) throw error;
          return respond({ already_paid: true, order_id: checkout.order_id, order_number: checkout.order_number });
        }
        return respond({
          error: "A payment attempt already exists for this order. Check your order status before trying again.",
          order_id: checkout.order_id,
          order_number: checkout.order_number,
          payment_pending: true,
        }, 409);
      }
    }

    const initialize = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: user.email,
        amount: Number(checkout.amount_kobo),
        currency: "NGN",
        reference: checkout.provider_reference,
        callback_url: "https://tradrr.store/?order_payment=1",
        metadata: {
          order_id: checkout.order_id,
          order_number: checkout.order_number,
          buyer_id: user.id,
          custom_fields: [
            { display_name: "Order number", variable_name: "order_number", value: checkout.order_number },
          ],
        },
      }),
    });
    const initialized = await initialize.json().catch(() => ({}));
    if (!initialize.ok || initialized?.status !== true || !initialized?.data?.authorization_url) {
      // A retry with the same idempotency key keeps the same order/reference; do not
      // mark the order failed merely because the provider endpoint timed out.
      console.error("Paystack initialization failed:", initialized?.message ?? initialize.status);
      return respond({
        error: "We couldn't open Paystack right now. Your order is saved; try checkout again shortly.",
        order_id: checkout.order_id,
        order_number: checkout.order_number,
        retry_same_checkout: true,
      }, 502);
    }

    const { error: savePaymentError } = await admin.from("order_payments")
      .update({ authorization_url: initialized.data.authorization_url, status: "processing" })
      .eq("provider_reference", checkout.provider_reference)
      .in("status", ["pending", "processing"]);
    if (savePaymentError) console.error("Could not save Paystack authorization URL:", savePaymentError.message);

    return respond({
      authorization_url: initialized.data.authorization_url,
      order_id: checkout.order_id,
      order_number: checkout.order_number,
      amount_kobo: checkout.amount_kobo,
      provider_reference: checkout.provider_reference,
    });
  } catch (error) {
    console.error("create-order-checkout failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "Checkout is temporarily unavailable. Please try again." }, 500);
  }
});
