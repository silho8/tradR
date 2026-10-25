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
- Listing draft form with up to four image uploads and preview/removal controls
- Seller shop picture/logo uploads, shown beside seller names and on listing details
- Authenticated seller reporting with up to five private evidence screenshots, reason/details, and admin-only review access
- PWA manifest and offline app-shell caching
- Sample listings are shown when the public marketplace is empty or Supabase is not configured

## Notes

Listings remain drafts until moderation and a verified ₦500 / 30-day subscription activate them. Payment verification and vendor onboarding are separate backend workflows and are not simulated by the frontend.


## Payments (Phase 4)

Flutterwave Standard checkout is initiated by the `start-listing-payment` Supabase Edge Function. The `flutterwave-webhook` function checks the webhook secret hash and verifies each transaction directly with Flutterwave before a server-only database function activates the 30-day listing subscription. The authenticated `payment-status` function checks the current user's own payment record so the return screen can show verified success, pending confirmation, cancellation, or an error without exposing payment records to other users. The client cannot choose the charge amount or mark a payment successful.

Before testing, configure `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, and `TRADR_APP_URL` as Supabase Edge Function secrets and set the webhook URL in Flutterwave. Follow [the test-mode setup guide](docs/flutterwave-test-mode.md). Never commit or share provider secrets.
