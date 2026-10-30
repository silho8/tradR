# tradR.

A mobile-first campus marketplace for Lead City University, Ibadan. Built with React, TypeScript, Vite, Tailwind CSS, Supabase, TanStack Query, Zod and vite-plugin-pwa.

## Requirements

- Node.js 22 or newer
- npm

## Run locally

1. Install dependencies: `npm install`
2. Set the Supabase values in `.env.local` using `.env.example` as a template.
3. Start the development server: `npm run dev`
4. Verify a production build: `npm run build`

The local environment file is git-ignored. The frontend only uses the Supabase publishable key. Never add a service-role or secret key to client-side code.

## Current scope

- Responsive marketplace browse and search
- Category filtering and price sorting
- Listing detail modal and WhatsApp contact link
- Email/password signup and login via Supabase Auth, with account-created and email-confirmation screens
- Shop-submission and listing-draft confirmation screens
- Payment return screens for verified success, pending confirmation, checkout cancellation, and errors
- Listing draft form with up to four image uploads and preview/removal controls; database-enforced limit of five listing records per seller
- Seller shop picture/logo uploads, shown beside seller names and on listing details
- Authenticated seller reporting with up to five private evidence screenshots, reason/details, and admin-only review access
- Persistent in-app activity notifications for shop/listing decisions, subscription state, verified handovers, and safety-report outcomes, with private read/unread state
- PWA manifest and offline app-shell caching
- Sample listings are shown when the public marketplace is empty or Supabase is not configured

## Notes

Listings remain drafts until moderation and a verified ₦500 / 30-day subscription activate them. Payment verification and vendor onboarding are separate backend workflows and are not simulated by the frontend.


## Payments (Paystack)

Production listing checkout uses Paystack Standard. The authenticated `start-listing-payment` Edge Function creates a ₦500 / 30-day subscription checkout only for the signed-in owner of an approved shop and approved listing. It fails closed unless `PAYSTACK_SECRET_KEY` begins with `sk_live_`. The `paystack-webhook` endpoint validates Paystack's HMAC-SHA512 signature and independently verifies the transaction amount, currency, reference, and success status before activating the subscription. The authenticated `payment-status` function only returns the signed-in user's own payment status.

- **Callback base URL:** `https://tradrr.store` (the transaction reference is appended automatically).
- **Webhook URL:** `https://mmwgmgzpxzkhbrabloiq.supabase.co/functions/v1/paystack-webhook`.
- **Frontend production flag:** `VITE_TRADR_PAYMENTS_ENABLED=true` (Vercel build-time variable).
- **Backend guard:** checkout and webhook require a live-mode secret key. Never expose or commit provider secrets.

See [Paystack live setup](docs/paystack-live-setup.md). The old Flutterwave webhook is retired and returns HTTP 410.

## Admin moderation

Signed-in users with the trusted admin app-metadata claim see an Admin entry point, and all data and actions are protected by the `admin-moderation` Edge Function. It validates the user's trusted `app_metadata.role === "admin"` claim server-side before reading review queues or changing shop, listing, or seller-report status. Do not grant admin privileges through editable user metadata. Grant the role only to trusted maintainers from the Supabase Auth user administration interface, then refresh the user's session so the claim is present.

The moderation desk supports shop approval/rejection, listing approval/rejection, and buyer-safety report triage. Report evidence is private; the admin function issues short-lived signed preview URLs. Rejection reasons are not yet persisted for sellers, and an audit log of moderator actions is a follow-up before a wider public launch. The admin screen and function need a real authenticated admin-account smoke test before production launch.

## Database recovery

See [`docs/database-recovery.md`](docs/database-recovery.md). Two original migration SQL files are missing from the local repository, although their versions are recorded in the live project. Do not reset the live database or treat the generated TypeScript snapshot as a replacement for migrations. Restore the original SQL or create and validate a clearly labelled reconstructed baseline in an isolated database before considering migration recovery complete.
