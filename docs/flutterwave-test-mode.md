# tradR Flutterwave test-mode setup

The payment flow is deployed to the tradR Supabase project. It will remain unavailable until the Flutterwave test credentials and app URL are added as Supabase Edge Function secrets. Never paste these secrets into chat, frontend code, or Git.

## 1. Add the server-side secrets

In the Supabase Dashboard, open project **tradR** → **Edge Functions** → **Secrets** and add:

- `FLW_SECRET_KEY`: the Flutterwave **test** secret key from your Flutterwave dashboard. It should be the test-mode key, not a live key.
- `FLW_SECRET_HASH`: a long random secret string you choose. Keep it private.
- `TRADR_APP_URL`: `http://localhost:5173` for a local test on the same computer. Replace it with the deployed HTTPS site URL when testing a deployed build.

Supabase supplies its own project URL and service-role environment variables to Edge Functions. Do not add the service-role key to the Vite `.env.local` file.

## 2. Configure the Flutterwave webhook

In the Flutterwave dashboard, while still in **Test Mode**, configure the webhook URL as:

`https://mmwgmgzpxzkhbrabloiq.supabase.co/functions/v1/flutterwave-webhook`

Set the webhook secret hash to the exact same value used for `FLW_SECRET_HASH`. Enable the completed-charge event (`charge.completed`). The webhook handler checks the shared hash and then calls Flutterwave's transaction-verification API before changing any payment or listing status.

## 3. Run a test

1. Start tradR locally with `npm run dev`.
2. Use a test account whose vendor profile is approved and whose listing has passed moderation. New vendor profiles and listings start pending review, so an admin must approve them before the payment action becomes available.
3. Sign in, open **My shop**, and select **Pay ₦500** for an approved listing.
4. Complete checkout using Flutterwave's test payment details from its official test documentation. Do not use a real card or live funds for this test.
5. The redirect is only a status message. The listing should become active only after the signed webhook and server-side transaction verification succeed. Open **My shop** again to check the listing expiry date.

## Security notes

- The browser never supplies the amount or subscription duration. The server fixes the charge at NGN 500 and activates a 30-day subscription.
- The browser redirect does not activate anything.
- Payment rows are server-managed by RLS; the webhook checks reference, status, exact amount, and currency.
- Repeated webhook deliveries are idempotent: an already-successful payment does not extend the subscription again.
- Do not enable live payments until the test flow has been verified end-to-end and the live secret key is intentionally configured.
