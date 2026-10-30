# Paystack live setup for tradR

## Production values

- **Application/callback base URL:** `https://tradrr.store`
- **Webhook URL:** `https://mmwgmgzpxzkhbrabloiq.supabase.co/functions/v1/paystack-webhook`
- **Checkout amount:** ₦500 (50,000 kobo), NGN
- **Subscription period:** 30 days
- **Vercel production flag:** `VITE_TRADR_PAYMENTS_ENABLED=true`

## Supabase Edge Function secrets

Set these in the Supabase Dashboard under Edge Function secrets. Never paste them into chat, commit them, or expose them in Vite variables.

- `PAYSTACK_SECRET_KEY`: the live secret key from Paystack, beginning with `sk_live_`
- `TRADR_APP_URL`: `https://tradrr.store`
- Supabase's existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are used server-side by the Edge Functions.

## Paystack dashboard

Register the webhook URL above in **Live Mode**. The callback URL is sent in each transaction initialization request, so it does not need to be registered as a webhook. The app returns to:

`https://tradrr.store/?payment=return&tx_ref=<generated-reference>`

The backend does not trust the redirect. It validates the signed webhook and independently calls Paystack's transaction verification API before activating a listing.

## Safe verification checklist

1. Confirm the key is a live secret in the Paystack dashboard.
2. Confirm the webhook endpoint rejects unsigned requests with HTTP 401.
3. Verify the live key against a no-charge authenticated Paystack endpoint such as the balance endpoint. Do not expose the returned balance or secret key in logs.
4. Confirm `tradrr.store` and `www.tradrr.store` resolve to the production Vercel deployment.
5. Do not run a real charge as a configuration test. Use a deliberate, low-risk live transaction only when ready to accept customer payments and reconcile it.

The frontend flag only controls the UI. The backend's live-key prefix guard is the final safety check. A `sk_live_` prefix alone does not prove that Paystack accepts the key, so complete the no-charge API verification if provider authentication has not yet been confirmed.
