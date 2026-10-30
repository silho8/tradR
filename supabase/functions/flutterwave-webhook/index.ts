// Retired: tradR has moved listing subscriptions to Paystack.
// Configure Paystack to call /functions/v1/paystack-webhook instead.
Deno.serve((_req: Request) => new Response(JSON.stringify({ error: "Flutterwave payments are no longer supported." }), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
