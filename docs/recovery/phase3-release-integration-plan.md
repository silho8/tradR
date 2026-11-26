# tradR. Phase 3: Release integration and launch readiness

Date: 26 November 2026
Status: Local API/Edge Function integration verified. Production release remains gated on device tests, business decisions and a verified backup/export. No production changes or paid infrastructure.

## Phase 2 exit status

- All 41 local migration files match the local migration history.
- The six new checkout, order, inventory, delivery and first-acceptance migrations have passed the four disposable database test suites.
- Existing production data baseline is recorded in `production-data-preservation-check.sql` and `phase2-data-preservation-and-zero-budget-validation.md`.
- Local frontend production build passes.
- Local first-agent-wins delivery logic and in-app notification fan-out passed database tests.

## Push validation findings

- The production project has five saved push subscriptions across five accounts.
- The production project already has the legacy push subscription table and the existing daily/listing approval push functions.
- The local seller onboarding flow requests browser permission from a user gesture, stores the PushSubscription in `push_subscriptions`, and keeps the seller reminder visible until permission is granted.
- The service worker displays push payloads and routes notification clicks into the app.
- The approved delivery-agent role is now included in the compulsory push onboarding flow; the prompt copy is role-specific.
- Seller orders now include a manual **Resend agent alert** action for the ready-for-handover state, so transient push failures can be retried.
- Static assertions for seller/agent prompting, browser permission request, subscription persistence, service-worker display/click handling, approved-agent fan-out and seller retry all passed.

### Runtime blocker

The production project does not yet contain `orders`, `deliveries`, `delivery_agents`, `order_events`, or `order_payments`. It also does not have the `notify-delivery-agents` Edge Function. Therefore a real delivery push cannot be exercised in production until the additive database migrations and matching function are released together.

The local Podman environment still does not run the full Supabase gateway. For this pass, PostgREST plus a local test-only Auth stub and Edge Runtime were assembled temporarily against the disposable test database. This verifies the handler-to-database paths, but it is not a substitute for full production JWT/RLS/Auth integration. Real browser permission and remote push delivery still need device-level validation on Android Chrome and the installed iOS PWA. No test push was sent to production subscribers.

## Phase 3 work order

1. **Edge Runtime and local API integration: COMPLETE LOCALLY.** All four buyer-order/delivery Edge Functions boot in the cached local Edge Runtime. Checkout, order status, webhook settlement/idempotency and delivery-alert authorization were exercised through a local PostgREST/API proxy and mock Paystack endpoint against the disposable test database. No paid project or Supabase branch was created.
2. **Browser/device push checks:** test seller and approved-agent onboarding, default permission, granted permission, denied permission, subscription persistence, repeat login, notification display and notification-click routing. Test Android Chrome and installed iOS PWA before launch.
3. **Paystack test-mode verification:** use only test credentials in a disposable environment. Cover checkout idempotency, success, failed/abandoned payment, webhook HMAC, provider amount/reference verification, duplicate webhook delivery and exactly-once ledger/stock changes.
4. **Operational decisions:** confirm processor-fee allocation, agent onboarding/identity checks, agent compensation/payout method, failed-delivery escalation and support ownership before enabling customer transactions.
5. **Production preservation gate:** create and verify a production backup/export; compare profile, vendor, listing, transaction, approval, image URL and storage object inventories before and after the additive migrations.
6. **Controlled release:** apply the six migrations in order, deploy dependent Edge Functions, configure production secrets/webhooks, then deploy the frontend. Do not expose buyer checkout or agent delivery until the backend dependencies are live and smoke-tested.

## Non-negotiable constraints

- Zero additional spend. No paid Supabase branch/project.
- Existing `main` branch only. No branch creation and no force-push.
- Preserve all existing profiles, shops, listings, IDs, images, approval states, archived states and legacy transactions wherever technically possible.
- Existing sellers must not be charged. Seller access and listings remain free; no ₦500 subscription model returns.
- Do not use production credentials for test transactions or create a real customer charge as a health check.
- Do not deploy migrations or Edge Functions to production until the backup/export and integration tests are complete.

## Current local changes

- Approved delivery agents are now included in compulsory browser push onboarding.
- Push onboarding copy distinguishes sellers from delivery agents.
- Seller orders have a retry action for failed delivery push alerts.
- `docs/paystack-live-setup.md` now describes buyer-order payments and marks the old seller-subscription webhook as legacy.

These changes remain local and uncommitted. Production database, Edge Functions and frontend have not been changed in this pass.


## Local Edge Runtime smoke-test results (26 November 2026)

- Reused the already-cached `public.ecr.aws/supabase/edge-runtime:v1.79.5` image with rootless Podman. No full Supabase stack, paid service, production secret or production subscriber was used.
- Started each new function independently with dummy local-only environment values and sent a request through the real Edge Runtime:
  - `create-order-checkout`: reached handler and rejected missing buyer authentication with HTTP 401.
  - `notify-delivery-agents`: loaded the `npm:web-push@3.6.7` dependency, reached handler and rejected missing seller authentication with HTTP 401.
  - `order-payment-status`: reached handler and rejected missing buyer authentication with HTTP 401.
  - `order-paystack-webhook`: reached handler and rejected an unsigned webhook with HTTP 401.
- Checkout CORS preflight returned HTTP 200 with the expected allowed origin, headers and methods. Unsupported GET returned HTTP 405.
- All four function entrypoints booted and returned their expected first-layer security responses. This is a runtime/boot/security smoke test only; it does not prove database REST integration, authenticated business flows, Paystack test-mode settlement, or delivery to a real browser subscription.
- Found that the repository had `supabase/config.jsonc`, while the Supabase CLI reads `supabase/config.toml`. Added a minimal CLI-native `config.toml` so the public Paystack webhook is configured with `verify_jwt = false` and the delivery-alert function remains JWT-protected. Kept the existing JSONC file untouched.
- All temporary Edge Runtime containers were removed after each test. Production remains untouched.

### Remaining integration gates

1. Exercise authenticated buyer/seller requests against a disposable local Supabase API/Auth runtime. The current local containers expose PostgreSQL, Auth and Storage only, so PostgREST/API integration remains untested.
2. Use Paystack test credentials only, once a disposable local API environment is available. Do not use live keys or charge a real card.
3. Perform controlled Android Chrome and installed iOS PWA push tests with a dedicated test account and test subscription, not the five existing production subscribers.

- Additional Paystack webhook checks were run inside the Edge Runtime using a local dummy signing key: an invalid signature returned HTTP 401; a correctly signed unrelated event returned HTTP 200 with `ignored: true`; and a correctly signed `charge.success` carrying a malformed tradR reference was also safely ignored with HTTP 200. These cases verified HMAC acceptance and early event/reference filtering without calling Paystack or the Supabase API.
- The production frontend build was rerun after the configuration/documentation changes: TypeScript and Vite/PWA build passed. `git diff --check` and TOML parsing/assertions also passed. No temporary Edge Runtime containers remain.
- Attempted to add a lightweight local PostgREST container using the cached matching v14.18 image. The database rejected the local `authenticator` password over the container network; the temporary API container was removed. No database role or application data was changed, and no credential was printed. The next API-integration step is to restore the local-only authenticator connection using the local Supabase service configuration, or use a disposable DB clone, rather than guessing credentials or changing production.
- Added `supabase/.temp/` and `supabase/.branches/` to `.gitignore`; these are machine-specific local CLI state and should not enter the repository.


## Local API integration results (26 November 2026)

- Ran the actual Edge Runtime entrypoints against a temporary PostgREST instance and a local-only Auth stub, backed by the disposable `tradr_phase2_test` database. Temporary API, Edge Runtime and mock-provider containers were removed after testing.
- `create-order-checkout` authenticated the test buyer, created a tradR-delivery order and initialized a mock checkout. The order total was 300,000 kobo: 200,000 kobo items subtotal plus 100,000 kobo delivery fee. The provider endpoint was rewritten only in a temporary copy of the function; repository source still points to the official Paystack API.
- `order-paystack-webhook` accepted a correctly signed mock `charge.success` event and returned HTTP 200. The disposable database recorded the payment as succeeded, the order as paid, two marketplace ledger entries and exactly one `payment_succeeded` order event.
- Replaying the same webhook returned HTTP 200 with `duplicate: true`; it did not create a second settlement or duplicate ledger entries.
- `order-payment-status` returned HTTP 200 with the correct buyer-owned order, succeeded payment, 300,000 kobo total, 200,000 kobo subtotal and 100,000 kobo delivery fee.
- Repeating the checkout RPC with the same idempotency key returned the same order ID and provider reference with `already_exists: true` and `payment_status: succeeded`.
- `notify-delivery-agents` accepted the shop owner's request and returned two eligible approved agents, zero test subscriptions and zero sends. A non-owner request was rejected with HTTP 403. No real push notification was sent.
- The four earlier disposable SQL suites still provide coverage for failed-payment inventory restoration, checkout constraints, seller status transitions, first-agent-wins acceptance and notification fan-out. Those SQL suites use the isolated database, not production.
- Final `npm run build` passed (TypeScript, Vite and PWA service-worker generation; 216 modules transformed). `git diff --check` and static release assertions passed.

### What this run does not certify

- The local Auth endpoint was a test stub and PostgREST used a privileged local database role. This validates the handler-to-database call paths and SQL behavior, but does not certify the production Supabase JWT, RLS, Auth or gateway configuration end to end.
- The mock provider is not Paystack test mode. No live or test Paystack credentials were used, and no card payment was attempted.
- No Android Chrome or installed iOS PWA device permission/push delivery test has been performed. The local test database had no push subscriptions, so the notification function correctly reported zero sends.
- No production migration, Edge Function deployment, secret change, frontend deployment, real charge or production push was performed.


## Production read-only release check (26 November 2026)

- Supabase project `tradR` is `ACTIVE_HEALTHY` in `eu-west-2` on PostgreSQL 17.11.
- Production still has the original 35 applied migrations. The six new Phase 2 checkout/order/inventory/delivery migrations remain local-only.
- Production inventory remains: 9 profiles, 9 vendors, 60 listings, 2 legacy transactions, 0 payment rows and 5 saved push subscriptions. The production public tables all report RLS enabled.
- Production does not yet expose the new `orders`, `deliveries`, `delivery_agents`, `order_events` or `order_payments` tables. The new `create-order-checkout`, `order-payment-status`, `order-paystack-webhook` and `notify-delivery-agents` functions are not deployed. Existing legacy push and listing/shop-payment functions remain active.
- Supabase security advisors report existing findings: three RLS-enabled service-only tables have no policies; `get_my_shop_analytics` is callable only by authenticated users and checks `auth.uid()`; `get_public_shop_completed_sales` exposes only an aggregate count for approved shops; `record_listing_event` only records approved/published listing events, excludes seller self-actions and deduplicates per visitor/session. These explain the relevant SECURITY DEFINER warnings and were not changed in this phase.
- Other pre-existing advisor items include `pg_net` in the public schema, leaked-password protection disabled, one unindexed foreign key on the legacy `payments` table and unused indexes in the small current dataset. These are recorded for a separate security/performance pass rather than changed during order-system integration.
- This read-only check did not create a production backup. The available connected tools can inspect schema and query rows, but do not provide a verified full database plus Storage-object export. The production preservation gate therefore remains open; do not apply migrations until a complete recoverable backup of database records and the 95 listing-image objects is secured.


## Additional local release checks

- Inspected the disposable database function grants: `create_order_checkout`, `confirm_order_payment` and `fail_order_payment` are executable by `service_role` only; `anon` and `authenticated` cannot call them directly. Seller, buyer and delivery-agent RPCs deny `anon` and grant `authenticated`, with ownership/admin/approved-agent checks inside the functions.
- All ten new marketplace/order/delivery tables inspected in the disposable database have RLS enabled. `delivery_verifications` intentionally has no direct client policy; its records are accessed through the guarded buyer/agent functions.
- Served the production build locally and confirmed `/`, `/manifest.webmanifest`, `/sw.js` and the generated Workbox asset each returned HTTP 200.


## Shop onboarding policy change (26 November 2026)

- New shops are approved automatically at database insert time. The trigger uses the trusted JWT `role` claim, never user-editable metadata; non-service clients cannot later change their own verification status.
- Existing pending/rejected/suspended shops are not bulk-updated. The admin pending-shops queue remains available for older pending accounts.
- Seller-facing shop creation and listing copy now says shops can list immediately. The admin dashboard opens on the live-by-shop moderation view by default, with remove-listing, buyer-report, delivery-agent and notification controls retained.
- Admin removal archives a published listing, immediately taking it off the marketplace while retaining the listing record for moderation history.
- Applied the new migration to the disposable local `tradr_phase2_test` database only. Test inserted a new shop under an authenticated user and confirmed `verification_status=approved`; a client attempt to change it to `suspended` was ignored; the pre-existing pending shop count remained 1. The test transaction was rolled back.
- Production schema and data were not changed. The migration is local-only and still needs backup-gated production deployment.
- Local Supabase CLI is not installed on this Fedora environment (`supabase: command not found`), so the migration file was created using the repository's timestamped migration naming convention and applied to the disposable test DB with its local database owner. Do not treat this as production deployment.


## Business policy decisions confirmed (26 November 2026)

The owner approved the following policies for implementation:

### Marketplace economics
- Seller receives 95% of item subtotal.
- tradR retains 5% marketplace commission.
- tradR delivery costs ₦1,000 and the full fee is allocated to the delivery agent.
- Paystack processing fee is charged against tradR's commission first; any excess is a platform expense, never silently deducted from seller proceeds or agent compensation.
- Record actual Paystack fees from verified provider settlement data in the immutable marketplace ledger; do not estimate a fee at checkout as final settlement.

### Delivery operations
- Delivery agents submit full name, phone, government-issued ID and selfie for admin verification.
- Admin approval is required before an agent can receive or accept jobs.
- Seller proceeds become eligible for manual payout after buyer receipt confirmation or 48 hours after verified delivery, subject to unresolved dispute/refund holds.
- Agent payout is manually processed within 24 hours after verified delivery.
- Agents can report a failed delivery with a reason; admin investigates, contacts the buyer, and arranges return to seller when required.
- Undelivered orders are refunded after investigation; delivery fee is refunded where appropriate.
- Payouts remain manual initially and are recorded in the admin dashboard; no automated transfer integration is required for launch.

### Deployment gate
- Begin staged deployment preparation, but do not apply production migrations or deploy order functions until a verified recoverable production database backup and Storage-object backup exist. Current production contains existing sellers, shops, listings and listing images that must be preserved.
- First deployment must be additive and ordered: schema migrations, secured Edge Functions/secrets, frontend, then controlled Paystack test-mode transaction and device push tests. Verify rollback/restore before exposing checkout to users.

## Phase 3 implementation follow-up (26 November 2026)

### Completed locally

- Added migration `20261126020127_phase3_financial_delivery_controls.sql`. It is additive and idempotent: private delivery-agent identity evidence, owner/admin read policies, delivery incidents, seller/agent payout records, payout eligibility, a delivered-agent-cost trigger, manual refund/payout RPCs, and verified Paystack processor-fee ledger capture.
- Delivery-agent application now requires a government-issued ID and selfie. Files are restricted to a private Storage bucket, limited to 5 MB each, MIME-checked, stored under the authenticated user's folder, and only made available to the applicant and admins through RLS/signed URLs.
- Delivery agents can report a failed delivery with a reason and explanation. The order is moved to disputed and payout holds remain in place until an admin reopens delivery or requires a refund.
- Admin delivery controls now include identity-document review, incident investigation, full-refund recording after manual Paystack processing, and manual seller/agent payout recording with bank references.
- Seller payouts become eligible immediately after buyer receipt confirmation or after 48 hours from verified delivery, provided the order is still paid and not disputed/refund-pending. Agent compensation is ₦1,000 after verified handover and is recorded as a marketplace delivery cost.
- The verified Paystack transaction's actual `fees` value is captured in the immutable marketplace ledger; it is not estimated at checkout. The 95% seller share and ₦1,000 agent allocation remain untouched by processor fees.
- Tightened `notify-delivery-agents`: it now sends push only while a tradR delivery is still ready and unassigned. It no longer sends stale "new job" pushes after another agent has already accepted.
- Added the delivery-agent owner-read policy so the applicant can load their own application state while admins can review all applications.
- Local disposable-database application of the Phase 3 migration passed with `ON_ERROR_STOP`. Local transactional checks passed for processor-fee ledger posting, exactly-once agent payout/cost creation, incident reporting/dispute holds, and identity-document upload validation. The checks were rolled back and did not alter production.
- `npm run build` passed after the UI and Edge Function changes (TypeScript, Vite, and PWA service worker); `git diff --check` passed.
- Downloaded all 95 public `listing-images` Storage objects, verified every file against its SHA-256 manifest, created a 56 MB archive, and restricted backup directory/file permissions. Archive:
  `/home/okikiola/backups/tradR-production-2026-11-26-listing-images.tar.gz`
  SHA-256: `3158d4f60fcfc247c37822bd6e19622bd0e8cb7180d8a7aaea9779a75c793c42`

### Production release gate still open

- Production remains at 35 applied migrations and inventory is unchanged: 9 profiles, 9 vendors/shops, 60 listings, 2 legacy transactions, 5 push subscriptions, and 95 Storage objects.
- No production migration, Edge Function deployment, secret change, push, payment, or frontend deployment has been performed.
- The Storage-object backup is complete. A recoverable database dump is not yet available because the exact production Postgres connection string/password is not present in the local environment. Do not substitute the publishable API key for database credentials.
- The production DB backup must include schema and data, and be verified by listing its contents and restoring it to a disposable local database. The Storage archive above is a separate companion backup, not a database backup.

### Ordered production rollout after database backup verification

Apply the eight pending additive migrations in timestamp order, preserving the existing 35 migration records:

1. `20261125215715_marketplace_checkout_order_foundation.sql`
2. `20261125221000_secure_order_checkout_and_payment.sql`
3. `20261125233000_seller_order_management.sql`
4. `20261125235000_inventory_and_buyer_order_tracking.sql`
5. `20261126010000_delivery_agent_operations.sql`
6. `20261126020000_agent_first_accept_delivery_and_push_onboarding.sql`
7. `20261126020127_phase3_financial_delivery_controls.sql`
8. `20261126021500_auto_approve_new_shops.sql`

Then deploy the four dependent Edge Functions with their correct JWT settings, verify existing Paystack/VAPID secrets are present, perform backend smoke checks, deploy the frontend, and only then run controlled Paystack test-mode and Android/iOS push acceptance tests. Never use live payment credentials for test transactions.
- Additional local tests passed for private identity upload validation and the failed-delivery return safeguard: an incident records whether pickup had occurred, and an admin cannot reopen a collected parcel until confirming it has been returned to the seller.
- The backup-only connection file `.env.backup.local` has been created and verified as git-ignored. It is intentionally blank until the production Session Pooler connection string is supplied locally.

## Production deployment update — 2026-11-26

- Production backup: PostgreSQL custom archive and 95-object `listing-images` archive captured; the database archive restored successfully into a disposable local database and baseline counts matched.
- Production migration history: all eight release migrations applied successfully. Local migration filenames were aligned to the actual production migration versions so Supabase CLI does not try to replay them.
- Existing baseline preserved: 9 profiles, 9 vendors, 60 listings, 2 legacy transactions, 5 push subscriptions, and 83 campus-pick notifications.
- Delivery identity columns, private evidence bucket, incident workflow, refund/payout RPCs, processor-fee ledger, and auto-approval migration are present.
- Four Edge Functions deployed and active: `create-order-checkout`, `order-payment-status`, `order-paystack-webhook`, and `notify-delivery-agents`.
- Vercel project `tradr` is linked to `silho8/tradR`; the checked-in local branch is `main`. The latest prior production deployment was built from `master`, so use a preview deployment from `main` for validation before promoting it to production.
- Frontend build and TypeScript checks passed. The PWA service worker and Workbox assets were generated. `git diff --check` passed.
- No live payment was initiated. Local outbound DNS resolution to the Supabase project was intermittent during endpoint smoke checks; complete endpoint checks from a working network before considering acceptance testing complete.


## Production frontend rollout complete — 2026-11-26

- Vercel production deployment `dpl_Bus6jLfLdpu7KmsdqctScSBL5T8U` is READY from GitHub `main` commit `7c339d614c4a28dcaf4669d0dcdc22328a35c9f8`.
- `https://www.tradrr.store` returns HTTP 200 with the tradR. app; `https://tradrr.store` redirects to `www`. PWA manifest and service worker also return HTTP 200.
- A read-only live browser check confirmed the production header, categories, listing grid, search, sort/filter controls, cart and footer render with real marketplace listings; no fatal UI errors were observed.
- Supabase Edge Function smoke checks: webhook GET returns 405; webhook POST without a signature returns 401 `Invalid webhook signature`; checkout, payment-status and delivery-notification endpoints reject unauthenticated requests with 401. No charge or order was created.
- A Paystack live charge and a complete authenticated buyer/seller/agent transaction were deliberately not simulated. Those require an authorized test-mode transaction and actual authenticated user/agent accounts.
- Main is now the deployed production source for this release. Keep future production changes on `main`; preserve the verified backups and do not run destructive database resets.
