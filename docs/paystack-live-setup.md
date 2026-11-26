# Paystack buyer-order payments for tradR.

## Current payment rules

- Seller access and product listings are free. Do not charge sellers the retired ₦500 listing or shop subscription fee.
- Buyers pay through Paystack when placing an order.
- The marketplace commission is 5% of the item subtotal.
- tradR-agent delivery adds a flat ₦1,000 fee paid by the buyer. Seller-arranged delivery has no tradR delivery fee.
- Paystack's verified processor fee is recorded from the transaction verification response in the marketplace ledger.

## Production rollout status (2026-11-26)

- All eight additive checkout, order, inventory, delivery, financial-control and new-shop migrations are applied to the production Supabase project.
- The four buyer-order/delivery Edge Functions are deployed: `create-order-checkout`, `order-payment-status`, `order-paystack-webhook`, and `notify-delivery-agents`.
- `order-paystack-webhook` has gateway JWT verification disabled because it validates Paystack's HMAC signature itself. The other three functions require JWT verification and also validate the user or shop owner in their handler.
- The private `delivery-agent-verification` storage bucket and its owner/admin access policies are deployed.
- The production frontend deployment is the remaining release stage. Do not assume the new buyer checkout UI is live until the Vercel production deployment is confirmed.
- No live customer charge has been initiated as part of deployment validation.

The buyer-order webhook URL is:

`https://mmwgmgzpxzkhbrabloiq.supabase.co/functions/v1/order-paystack-webhook`

The buyer checkout callback is:

`https://tradrr.store/?order_payment=1`

Do not configure the new buyer-order flow to use the legacy `paystack-webhook` endpoint. That endpoint belongs to the retired seller-subscription/payment flow and remains deployed for compatibility while legacy code paths are being retired.

## Required server-side secrets

Set these as Supabase Edge Function secrets only. Never commit them or put secret keys in Vite variables:

- `PAYSTACK_SECRET_KEY`: the approved Paystack Live secret key for production. Use a test key only in an isolated test project.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: required by delivery-agent web push.
- Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions.

The frontend must never receive the Paystack secret key. It receives only the authorization URL returned by the checkout function.

## Safe acceptance checks

1. Verify the checkout and order-status endpoints reject requests without a valid user JWT.
2. Verify the Paystack webhook rejects missing/invalid signatures and accepts only a correctly signed event after independent Paystack transaction verification.
3. Verify repeated checkout requests with the same idempotency key reuse the same order and payment reference.
4. Verify failed/abandoned payments release reserved stock exactly once.
5. Verify successful payments create seller and marketplace ledger entries exactly once, including the actual Paystack processor fee when supplied.
6. Verify the first approved delivery agent to accept a ready job claims it, and stale job notifications cannot reopen an assigned delivery.
7. Verify delivery identity uploads remain private and only owners/admins can access them.
8. Verify incidents block payouts, refunds require a completed Paystack refund first, and seller/agent payouts require admin recording.
9. Do not create a real customer charge as a configuration test. Use Paystack Test Mode in a separate test environment for full payment-cycle acceptance.

## Production safety

- Existing sellers, shops, listings, IDs, approval states, legacy transactions, push subscriptions, and listing-image objects were preserved.
- A full PostgreSQL custom-format dump and a separate 95-object listing-image archive were captured on 2026-11-26. The database dump was restored into a disposable local database and application row counts were checked.
- Keep the private database connection string in the gitignored `.env.backup.local`; never commit it or paste it into chat.
- Do not run `supabase db reset` or use destructive database rebuilds against production.
