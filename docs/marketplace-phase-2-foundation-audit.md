# tradR. Phase 2 Foundation Audit

Date: 25 November 2026
Status: Production migration history was reconciled to 35/35 exact local matches before Phase 2. Four additional local-only migrations (versions 36 through 39) now pass a clean 39-migration local reset, full-schema and checkout/payment RPC tests, local schema lint, generated TypeScript types, and the application production build. Nothing has been pushed to production.

## 1. Business rules confirmed

- Sellers do not pay ₦500 or any other listing/subscription fee. Seller access and listings remain free.
- tradR. earns a 5% commission on the item subtotal of successfully sold products.
- When a tradR agent handles delivery, the buyer delivery fee is a flat ₦1,000 (100,000 kobo). Seller-arranged delivery has no tradR delivery fee.
- The legacy ₦500 subscription/payment model is retired. No successful subscriptions existed; at the user's explicit direction, all six failed/pending attempt rows were deleted. The three legacy tables are now empty and must not be repurposed for buyer-order payments.
- One shop per checkout/order.
- Seller-entered selling price is the source of truth. The generated reference price is presentation-only and must never affect checkout, stock, commission, or accounting.
- Keep existing profiles, shops, listings, reviews, notifications, reports and legacy buyer/seller transactions intact.

## 2. Live database baseline

Project: `mmwgmgzpxzkhbrabloiq` (tradR)
Status: ACTIVE_HEALTHY
PostgreSQL: 17.11

Live application tables and current row counts (read-only metadata check, 25 Nov 2026):
- profiles (9)
- vendors (9)
- listings (60)
- listing_subscriptions (0)
- payments (0)
- reports (0)
- admin_users (1)
- seller_reports (0)
- transactions (2)
- seller_reviews (0)
- notifications (103)
- shop_subscriptions (0)
- push_subscriptions (5)
- push_daily_schedule (5)
- daily_push_messages (7)
- push_cron_secrets (1)
- private.listing_analytics_events (11)

All 16 public application tables have RLS enabled. Three push scheduling/secret tables have no RLS policies and should remain server-only. The private analytics table has RLS disabled and is flagged by the table inventory. A direct privilege check showed anon and authenticated have no USAGE on schema private and no SELECT/INSERT privilege on this table. The table is owned by postgres, which bypasses RLS; the relevant SECURITY DEFINER analytics functions are also owned by postgres, use an empty search_path, and implement the intended public-event and own-shop authorization checks. Enabling RLS without client policies appears compatible with those functions, but this hardening change has not been applied. Obtain the user's decision before applying it.

The existing `transactions` table represents the old buyer/seller handover and review flow. It is not a commercial order table and must not be repurposed.

The existing `payments`, `listing_subscriptions`, and `shop_subscriptions` tables belong to the retired ₦500 seller-subscription model. The live data contained three listing-subscription attempts (one failed, two pending), three matching payment attempts (one failed, two pending), and zero shop subscriptions. At the user's direction, all three failed/pending payment rows and all three failed/pending listing-subscription rows were deleted. Verification confirmed all three legacy tables now contain zero rows. Keep the empty tables temporarily because legacy webhook/status Edge Functions and frontend return handling still reference them; retire those code paths before dropping the tables. New buyer-order payments must use a separate table and payment verification flow.

## 3. Migration history reconciliation

The live Supabase project has **35 migration records**. At reconciliation, the active local directory contained the same 35 exact versions. The four Phase 2 migrations add local-only versions 36 through 39; they are intentionally absent from production until separately tested and approved.

Recovery steps completed:
- `npx supabase migration fetch --remote` recovered the SQL for all 34 migrations that were already recorded in production. This restored the 14 previously missing source files and refreshed local copies from the SQL statements retained in Supabase migration history.
- The local `20261109041736_add_campus_pick_notifications.sql` was not in the production history. Read-only catalog checks confirmed that production already allowed `campus_pick` and `campus` in the notification constraints and already included `public.notifications` in `supabase_realtime`. The record was marked applied using `supabase migration repair`; the SQL was not re-executed.
- Five local-only timestamp/name variants were moved out of the active migration directory into `supabase/recovery/archived-local-only-migrations/`. Their authoritative production counterparts and the reason for archiving each file are documented in that folder's README.

The older `supabase/recovery/live_schema_snapshot.sql` is dated 25 October and is incomplete relative to the 25 November live schema. It remains reference material only and must never be applied directly to production or treated as the current baseline. The declarative live schema capture remains in `supabase/schemas/` as a reference copy; it is not itself a migration.

## 4. Security and performance observations

Security advisor findings:
- RLS enabled without policies: `public.daily_push_messages`, `public.push_cron_secrets`, `public.push_daily_schedule`.
- SECURITY DEFINER functions `get_public_shop_completed_sales`, `record_listing_event`, and `get_my_shop_analytics` were reviewed. Their current anon/authenticated grants appear intentional for public completed-sales counts, public listing-event recording, and authenticated own-shop analytics respectively. All use an empty `search_path`; the analytics RPC checks `auth.uid()` and scopes to the caller's own shop. Do not revoke these grants blindly. `record_listing_event` accepts a client-supplied visitor key, so analytics manipulation remains a possible abuse vector to monitor.
- Leaked password protection is disabled.
- `pg_net` is installed in the public schema.

Performance advisor findings:
- `payments.shop_subscription_id` foreign key has no covering index.
- Twelve indexes are currently reported unused. Do not delete them automatically; current traffic is small and these indexes may be needed for search, reporting and future marketplace workflows.

Health advisor returned no findings.

## 5. Local repository state

- Current branch: `master`, three local commits ahead of `origin/main`; no push performed. The recovered migration sources and archived variants are currently local working-tree changes and have not yet been committed.
- Recovery/planning work is committed locally in `f8f8ec1 Add marketplace recovery and Phase 2 planning`.
- The authenticated declarative live schema export is captured under `supabase/schemas/` and committed as a reference-only baseline.
- `docs/drafts/marketplace-foundation.sql` remains the reviewable source draft; the disposable fixture and behavior tests are in `docs/drafts/`. The versioned Phase 2 migrations are `supabase/migrations/20261125215715_marketplace_checkout_order_foundation.sql`, `supabase/migrations/20261125221000_secure_order_checkout_and_payment.sql`, `supabase/migrations/20261125233000_seller_order_management.sql`, and `supabase/migrations/20261125235000_inventory_and_buyer_order_tracking.sql`.
- Supabase CLI 3.4.0 is available through `npx`; login and project link work. No production schema DDL was executed; one already-applied campus-pick migration record was reconciled in migration history only.

## 6. New additive foundation planned after reconciliation

New entities, separate from the legacy schema:
- carts and cart_items, one active cart per buyer with a fixed shop_id;
- orders, order_items and append-only order_events;
- order_payments, separate from legacy subscription payments;
- seller_ledger_entries and marketplace_ledger_entries, plus seller_payouts;
- deliveries, delivery_agents and delivery_verifications.

Inventory tracking is implemented additively. Existing listings retain NULL stock (untracked) until their sellers set a quantity; new listings require an explicit available quantity. Checkout atomically reserves tracked stock and definitive payment failures release it exactly once.

Use integer kobo for all monetary values, never floating-point values. Store immutable purchase snapshots. Payment and fulfilment states remain separate. Financial status, stock reservation, agent assignment, delivery verification and ledger writes must be server-controlled. RLS must enforce buyer, seller, assigned-agent and admin boundaries.

## 7. Versioned foundation prepared and locally validated

A revised additive SQL foundation is saved at `docs/drafts/marketplace-foundation.sql`. It defines 12 new tables: carts, cart_items, orders, order_items, order_events, order_payments, seller_ledger_entries, marketplace_ledger_entries, seller_payouts, delivery_agents, deliveries, and delivery_verifications.

The versioned foundation enforces one active cart per buyer, approved-shop/live-listing checks, one shop per cart/order, buyer-scoped checkout idempotency, integer-kobo totals, line-item arithmetic, purchase snapshots, append-only event/ledger structures, and participant/admin RLS. Trusted server RPCs re-read current prices, calculate the 5% commission and ₦1,000 tradR-agent fee, create orders, and settle successful payments. Processor-fee allocation and payout timing remain open. Order/payment/ledger/dispatch writes are reserved for trusted server functions. Delivery verification hashes have no client-facing policy.

The authenticated declarative schema capture is in `supabase/schemas/`. The live database passed remote schema lint during the recovery work. A fresh local Supabase reset applied all 39 active local migrations, including all four versioned Phase 2 migrations. Behaviour tests passed for mixed-shop rejection, unapproved-shop rejection, one-active-cart enforcement, buyer-scoped checkout idempotency, buyer/seller/admin order visibility, hiding unpaid orders and their related details from sellers, seller ledger visibility, append-only ledger protection, trusted checkout snapshots, commission/delivery arithmetic, payment settlement and exactly-once ledger entries. The seller RLS policies expose orders, items, events and delivery details only after payment succeeds. All four Phase 2 migrations remain local-only.

## 8. Immediate gate before DDL

1. Preserve the exact live migration ledger and all original local migration sources. Done; see `docs/recovery/` and `supabase/recovery/archived-local-only-migrations/`.
2. Capture the authenticated live declarative schema. Done in `supabase/schemas/`; this is reference material and did not alter production schema or migration history.
3. Reconcile migration history. Done: `supabase migration list --remote` now reports 35 exact local/remote version matches before the new Phase 2 migration was created. The campus-pick record was repaired only after its existing production effects were verified.
4. Run a clean local Supabase reset using all active migrations. Done; all 39 local migrations applied successfully.
5. Apply the Phase 2 draft in that disposable local environment and rerun behavior/security tests against the complete existing schema. Done; see Section 9.
6. Create versioned Phase 2 migrations and test them on a clean local reset. Done locally with all 39 migrations. Production deployment remains blocked until all four migrations are reviewed and tested in an isolated development project.
7. Generate TypeScript types and integrate the Edge Functions and buyer cart/checkout UI locally. Done. Deploy and test these changes in a separate Supabase development project before production. Not yet done.

**Current decision:** production history remains at the reconciled 35-migration baseline. The four new Phase 2 migrations exist locally only; a clean reset of all 39 migrations, all local behavior test suites, local schema lint, TypeScript type generation and the production build have passed. Buyer cart/checkout and local Paystack Edge Functions are implemented but not deployed. Production schema remains unchanged. Buyer order history and receipt confirmation are now implemented locally. Next is delivery-agent assignment, dispatch and verification, followed by isolated development-project and Paystack test-mode verification.

---


## 9. Full-schema validation completed (25 November 2026)

- `npx supabase db reset` completed successfully against all 39 active local migration files. The local migration ledger contains exactly 39 records. The configured seed path `supabase/seed.sql` is absent; the CLI emitted a non-fatal “no files matched” notice and continued.
- The four versioned Phase 2 migrations created the 12 new marketplace tables and trusted checkout/payment RPCs. All 12 tables have RLS enabled.
- Ran `docs/drafts/phase2-full-schema-tests.sql` using synthetic Auth users and synthetic shop/listing data. Passed: approved-shop cart creation, live listing addition, mixed-shop cart rejection, unapproved-shop rejection, one active cart per buyer, buyer-scoped checkout idempotency, buyer/seller/admin order visibility, hiding unpaid orders and related details from sellers, seller ledger visibility, and append-only ledger protection. The test temporarily bypasses two existing seller-protection triggers only while creating synthetic approved-shop/published-listing fixtures; those triggers are restored immediately.
- `npx supabase db lint --local --schema public,private --fail-on error`: no schema errors.
- `npm run build`: passed after adding the buyer cart/checkout UI (TypeScript project build and Vite production bundle).
- Generated `src/types/database.generated.ts` from the 39-migration local schema.
- `docs/drafts/phase2-checkout-rpc-tests.sql` passed against the versioned migrations: trusted live-price snapshot, 5% commission, ₦1,000 agent delivery, one-shop order creation, idempotent checkout retry, successful payment settlement, exactly-once seller/platform ledger entries, and buyer/seller read access.
- Confirmed 39 local migrations, 12/12 Phase 2 tables with RLS enabled, and zero legacy subscription-payment rows in the clean local database.
- No production database schema changes were made. All four Phase 2 migrations are local-only and have not been pushed or deployed.

### Scope still not implemented

The trusted checkout/order-creation RPC, payment-settlement RPCs, local Edge Functions (`create-order-checkout`, `order-paystack-webhook`, `order-payment-status`) and buyer cart/checkout UI now exist. The Edge Functions and UI have not been deployed or tested against live Paystack credentials/webhooks. Seller payout execution, delivery-agent assignment, dispatch tracking and delivery verification are still outstanding. Buyer order history and tracking are now implemented locally. The versioned migrations enforce the confirmed 5% commission and ₦1,000 tradR-agent delivery fee at the database constraint level; trusted checkout and settlement RPCs are also included and locally tested. The legacy `transactions` handover/review flow and legacy seller-subscription payment tables remain separate.


## 10. Confirmed pricing policy and versioned migration

- Marketplace commission is exactly 5% of the item subtotal, rounded to the nearest kobo. The seller net is item subtotal less marketplace commission; the tradR delivery charge is not seller revenue.
- A `tradr` delivery method carries a flat buyer fee of ₦1,000 (100,000 kobo). A `seller` delivery method carries no tradR delivery fee.
- Database constraints enforce commission, delivery fee, buyer total, seller net and delivery-record fee consistency.
- Added the checkout foundation and secure checkout/payment migrations as versioned additive Phase 2 migrations. Neither has been pushed to production.
- Expanded disposable tests to reject incorrect commission and agent-delivery fees. The full-schema test suite passed after updating expected buyer/admin visibility counts for the additional agent-delivery test order.
- Local schema lint found no errors; `npm run build` passed.


## 11. Trusted checkout and payment settlement foundation

- Added `create_order_checkout`, restricted to `service_role`. It validates the buyer/cart/shop, locks and re-reads live listings and prices, snapshots order items, calculates the 5% commission and delivery fee, creates the order/payment/delivery records, and converts the cart in one database transaction. Repeated buyer/idempotency-key requests return the original order and payment reference.
- Added `confirm_order_payment` and `fail_order_payment`, also restricted to `service_role`. Successful settlement updates payment/order status and writes seller proceeds, marketplace commission and agent-delivery revenue ledger entries idempotently.
- Added local Edge Functions: `create-order-checkout` (authenticated buyer + Paystack initialization), `order-paystack-webhook` (HMAC signature plus server-side Paystack verification), and `order-payment-status` (buyer-scoped status with provider re-verification). The webhook is configured for public provider callbacks; buyer functions still require an authenticated session.
- Stored Paystack authorization URLs against the payment record so a repeated checkout request can resume the same payment instead of creating a duplicate order.
- Local SQL test artifacts: `docs/drafts/phase2-full-schema-tests.sql`, `docs/drafts/phase2-checkout-rpc-tests.sql`, and `docs/drafts/phase2-inventory-buyer-tests.sql`. The inventory reservation/release tests passed; buyer receipt completion was also exercised against the local schema.
- Production was not pushed or altered. A remote migration-list request timed out during this work, so remote state was not re-queried after adding the four local-only migrations.

### Remaining before customer launch

- Buyer cart and checkout UI plus payment-return handling are implemented locally in `src/CartCheckout.tsx`. Buyer order history/tracking and seller order actions are now implemented locally.
- Test the Edge Functions with Paystack test credentials and configure the Paystack webhook URL before any deployment.
- Decide how Paystack processor fees are allocated; currently they are not deducted from seller proceeds.
- Implement delivery-agent approval/assignment, dispatch tracking and delivery verification.
- Test the complete flow in a separate Supabase development project before production migration/deployment.


## 12. Seller paid-order inbox and fulfilment controls

- Added `supabase/migrations/20261125233000_seller_order_management.sql` with `seller_update_order_status`, an authenticated, security-definer RPC. It verifies the signed-in user owns the order's shop, requires a successful payment, enforces allowed state transitions, and appends an immutable order event for each seller action.
- Seller progression is `pending_seller_confirmation` → `accepted` → `preparing` → `ready_for_handover`. For seller-arranged delivery only, the seller may then mark the order `delivered`. For tradR-agent delivery, the seller cannot mark the order dispatched or delivered; it waits for the later agent-assignment/dispatch workflow.
- Added `src/SellerOrders.tsx` to the approved seller's My Shop dashboard. It displays paid orders, item snapshots, buyer contact and delivery details, buyer notes, 5% commission and seller net proceeds, status filters, refresh, and the permitted status actions. It explicitly distinguishes ledger-recorded proceeds from an actual bank payout.
- Expanded `docs/drafts/phase2-checkout-rpc-tests.sql` to verify seller status progression, immutable event recording, agent-delivery guardrails, and rejection of buyer attempts to act as the seller. The combined checkout/seller order tests passed.
- Clean local reset applied all 39 migrations. Local schema lint and the frontend production build passed. No production migration or deployment was performed.

### Next implementation step

Build delivery-agent assignment, dispatch tracking and delivery verification so tradR-agent orders can progress beyond ready-for-handover.


## 13. Buyer order history and product inventory

- Added `supabase/migrations/20261125235000_inventory_and_buyer_order_tracking.sql` (local migration 39). The `listings.stock_quantity` column is nullable for backward compatibility: NULL means an older listing is not yet stock-tracked. New listings save an explicit seller-entered quantity, defaulting to 1. Sellers may set 0 to show sold out.
- The listing form and edit flow now include **Available quantity**. Seller dashboard listings show current available stock. Product cards, shop pages and product details show stock status. Buyers cannot add a sold-out item or increase cart quantity beyond the currently visible stock.
- A security-definer trigger on `order_items` locks and decrements tracked stock as an order is created. It snapshots whether stock was reserved. The trusted `fail_order_payment` RPC releases those units once, and the Paystack status/webhook paths now treat definitive `failed` and `abandoned` outcomes as failures. A stock shortage aborts checkout atomically.
- Extended `search_marketplace_listings` to return stock quantity so search results and detail pages use the same availability value. Generated TypeScript types include the new listing, order and order-item fields.
- Added `src/BuyerOrders.tsx` with a desktop orders shortcut and mobile Orders navigation. Buyers can view order/payment status, items, delivery details, totals and an event timeline. A buyer may confirm receipt only after the order is marked delivered; the `buyer_confirm_order_received` RPC verifies ownership and payment, records an immutable event and completes the order idempotently.
- Local validation: clean reset of all 39 migrations, existing full-schema and checkout/seller tests, tracked-stock decrement check, failed-payment stock restoration and duplicate-release protection, buyer receipt confirmation, generated types, `git diff --check`, schema lint and production build. Paystack sandbox verification and the isolated development project are still pending. No production schema or Edge Function deployment was performed.

### Inventory compatibility note

The 60 existing production listings are not silently assigned a stock count. They remain untracked (NULL) until each seller edits the listing and enters a quantity. This avoids accidentally making existing sellers' products appear to have only one unit.

## 14. Delivery operations stage (local-only, 2026-11-26)

Added migration 20261126010000_delivery_agent_operations.sql and the first end-to-end delivery workflow:

- Delivery agents can apply with a name and phone number. Applications remain pending until an admin approves them.
- Admins can approve/suspend agents and assign an approved agent to a paid tradR-delivery order after the seller marks it ready for handover.
- Seller-ready actions move the delivery record into the assignment queue.
- Assigned agents can view only their own task payload and confirm pickup. Pickup moves the order to dispatched.
- Buyers can generate an eight-character, one-time handover code after assignment. Only its bcrypt hash is stored; the buyer sees the plaintext code once in their order view.
- The assigned agent verifies the code after pickup. Successful verification marks the delivery and order delivered; buyer receipt confirmation then completes the order.
- Failed code attempts are counted and capped. Codes expire after 24 hours and a new code invalidates the previous unused code.
- Admin moderation now includes delivery-agent review and order assignment. The user account settings expose the delivery workspace on mobile as well as desktop.
- The existing in-app inbox now supports delivery-status notifications: admins are alerted when a shop marks an order ready; agents and buyers are notified on assignment; buyers are notified on pickup; and buyers/sellers are notified after verified handover.

Local verification:
- Clean local reset applied all 40 migrations.
- Existing schema, checkout/seller, and inventory/buyer tests passed.
- New delivery operations test passed end-to-end: agent application, admin approval, assignment, agent pickup, buyer code generation, invalid-code rejection, valid-code verification, buyer receipt confirmation, and inbox notification delivery to the relevant accounts.
- supabase db lint --local --schema public,private --fail-on error passed with no schema errors.
- Final production build passed, including the mobile settings entry.
- Final delivery-migration schema lint passed after adding the delivery notification type.
- No production migration push, Edge Function deploy, commit, or GitHub push was performed.

Still required before launch:
- Test the workflow with real separate buyer, seller, admin, and delivery-agent accounts in an isolated Supabase development project.
- Decide agent onboarding checks, identity verification, delivery payout/compensation, failed-delivery escalation, and support procedures.
- Configure the operational notification to alert admins when a seller marks a tradR delivery ready and notify the assigned agent.
- Complete Paystack test-mode checkout/webhook verification and production release review.


## 15. Push onboarding and first-acceptance dispatch (local-only, 2026-11-26)

- Signed-in users with a supported browser and default notification permission now receive a focused onboarding prompt. One tap invokes the browser native permission dialog; a granted permission automatically creates or refreshes the Web Push subscription for the signed-in account.
- Removed the separate in-app push opt-in control from Activity/Settings. Existing subscriptions are re-registered automatically after login when browser permission is already granted.
- Browser-denied permission cannot be overridden by a website. If a user blocks the request, push cannot work until they change the browser site permission. This is a browser security rule, not an app setting.
- When a seller marks a paid tradR-agent order ready, the delivery enters the open pool and every approved agent receives an in-app notification. The seller UI invokes the notify-delivery-agents Edge Function, which sends a Web Push alert to every registered device belonging to an approved agent.
- Approved agents see a redacted job preview. Buyer phone and exact drop-off details are only returned after the agent accepts.
- agent_accept_delivery locks the delivery row and atomically claims it for the first approved agent. Concurrent later accepts fail with an already-claimed response. Other agents are notified that the job has been taken and their open queue refreshes in real time.
- Admins approve/suspend agents but no longer manually assign individual deliveries.
- Push click opens the Delivery work portal directly.

Local verification completed:
- Clean local database reset applied all 41 migrations.
- Full-schema, checkout/seller, inventory/buyer, and updated delivery first-acceptance SQL tests passed. The delivery test verified that two approved agents see the same redacted open job, the first acceptance wins, the second acceptance is rejected, and buyer/seller/other-agent notifications are saved.
- Database schema lint passed with no errors.
- Production frontend build passed and git diff --check passed.
- Edge Function TypeScript syntax transpilation passed. Deno is not installed locally, so a full Deno type-check was unavailable.

Still required before release:
- Test actual browser permission/subscription and real Web Push delivery on Android Chrome and installed iOS PWA in an isolated development project. Web Push cannot be verified by a database test alone.
- Deploy the new notify-delivery-agents Edge Function and migration only after separate development-project verification. Production remains untouched.
