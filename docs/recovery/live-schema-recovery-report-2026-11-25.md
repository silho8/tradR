# tradR. Live Schema Recovery Report

Captured: 25 November 2026
Supabase project: `mmwgmgzpxzkhbrabloiq`
Region: `eu-west-2`
PostgreSQL: `17.11.0.003`
Project status: `ACTIVE_HEALTHY`

## What is safely preserved

- Exact live migration ledger: `live-migration-history-2026-11-25.md` (35 records after reconciliation).
- Local SQL migration sources, Oct 25 generated snapshot, Phase 2 draft and audit/blueprint docs: `local-migration-source-archive-2026-11-25.tar.gz`.
- Archive SHA-256: `dce91a962be024d0bb7f042b56cfe40e8b30f0b9fa6b87e9b6bda45ff86e491c`.

No production schema DDL was changed during this recovery pass. One migration-history metadata record (`20261109041736`) was added after read-only checks confirmed that its campus-pick constraints and Realtime publication change were already present. Its SQL was not executed again.

## Live application table inventory

All public application tables below have RLS enabled.

| Table | Rows |
|---|---:|
| public.profiles | 9 |
| public.vendors | 9 |
| public.listings | 60 |
| public.listing_subscriptions | 0 |
| public.payments | 0 |
| public.reports | 0 |
| public.admin_users | 1 |
| public.seller_reports | 0 |
| public.transactions | 2 |
| public.seller_reviews | 0 |
| public.notifications | 103 |
| public.shop_subscriptions | 0 |
| public.push_subscriptions | 5 |
| public.push_daily_schedule | 5 |
| public.daily_push_messages | 7 |
| public.push_cron_secrets | 1 |
| private.listing_analytics_events | 11 |

The legacy `payments`, `listing_subscriptions` and `shop_subscriptions` tables are empty. They remain temporarily because old frontend return handling and legacy Edge Functions still reference them. They are not to be reused for new buyer-order payments.

The existing `transactions` table remains the old buyer/seller handover and review workflow. It is not a commercial order table.

## Security finding requiring a decision

Supabase's security advisor flags `private.listing_analytics_events` because RLS is disabled. The live privilege check also found:

- `anon` has no USAGE on schema `private`.
- `authenticated` and `service_role` have no USAGE on schema `private`.
- `anon`, `authenticated`, and `service_role` have no direct SELECT or INSERT privilege on `private.listing_analytics_events`.

So direct client access is currently blocked by schema/table privileges, but RLS is still disabled and the advisor finding remains. Do not apply the advisor's simple `ALTER TABLE private.listing_analytics_events ENABLE ROW LEVEL SECURITY;` in isolation: first confirm the intended server-side function/service-role access model and add the correct policies if required. This change has deliberately not been made.

The public tables `daily_push_messages`, `push_daily_schedule` and `push_cron_secrets` have RLS enabled but no client-facing policies; keep them server-only.

The analytics table is owned by `postgres`, which bypasses RLS; `FORCE ROW LEVEL SECURITY` is off. The three related SECURITY DEFINER functions are also owned by `postgres` and use an empty `search_path`. Their current grants appear intentional: public completed-sales count, public listing-event recording, and authenticated own-shop analytics. `record_listing_event` checks listing/shop approval, ignores owner activity and deduplicates for 30 minutes, but its visitor key is client-supplied and analytics integrity could be manipulated.

A reasonable defense-in-depth change is to enable RLS on the private analytics table without adding client-facing policies, leaving access to the trusted SECURITY DEFINER functions/service role. This has NOT been applied. The exact SQL is:

```sql
ALTER TABLE \"private\".\"listing_analytics_events\" ENABLE ROW LEVEL SECURITY;
```

The user must decide whether to apply this hardening change. Do not run it without that decision.

## Local tooling and migration reconciliation status

- Supabase CLI `3.4.0` is available through `npx`; authentication and project linking are working on Fedora.
- The local Supabase project is configured in `supabase/config.jsonc`; the local API exposes only `public` and `graphql_public`.
- `npx supabase migration fetch --remote` recovered the SQL for all 34 migrations previously recorded in production, including the 14 versions that had no local source. The CLI also refreshed local copies from the SQL statements retained in the production migration history.
- The local-only campus-pick migration `20261109041736_add_campus_pick_notifications.sql` was checked against the live catalog. Its `campus_pick`/`campus` constraints and Realtime publication membership were already present, so its history record was safely marked applied without replaying SQL.
- Five timestamp/name variants that had no production history record were moved to `supabase/recovery/archived-local-only-migrations/`; their production counterparts are listed in the archive README.
- A fresh `npx supabase migration list --remote` now shows an exact match: 35 local migration versions and 35 production migration records.
- The Phase 2 SQL and behavior tests previously passed against a minimal disposable PostgreSQL 17 fixture. A full clean reset of the complete Supabase local stack against all 35 migrations has not yet been run.
- The older `supabase/recovery/live_schema_snapshot.sql` is dated 25 October and is incomplete compared with the live 25 November schema. It is reference material only, not a baseline and not a migration.

## Safe next steps

1. Run a clean local Supabase reset using the now-reconciled 35 migration files. This is local-only; do not use `--remote`.
2. If the full local stack reset succeeds, apply the Phase 2 draft in that disposable local environment and rerun the behavior/security tests against the complete existing schema.
3. Create the versioned Phase 2 migration with `supabase migration new` only after the complete-schema test passes. Review the generated migration and run schema advisors/lint.
4. Test the migration in an isolated development environment before scheduling a production release. Do not push Phase 2 DDL directly to production as the next step.
5. Generate TypeScript types from the deployed development schema, then implement checkout/payment/delivery Edge Functions and frontend integration in separate releases.


## Phase 2 local validation update (25 November 2026)

After the 35/35 migration history reconciliation, the complete local Supabase stack was reset successfully using all 35 active migration files. The 12-table Phase 2 draft was applied only to the local database. Full-schema behavior tests passed, local `public,private` schema lint found no errors, and the tradR production build passed. The local database contains 35 migration records; all 12 Phase 2 tables have RLS enabled. No Phase 2 DDL was applied to production. See `docs/marketplace-phase-2-foundation-audit.md` Section 9 for test coverage and remaining implementation scope.


## Phase 2 local verification update (25 November 2026)

After the original 35-migration recovery, four local-only migrations were added: the 12-table marketplace checkout foundation and the trusted checkout/payment settlement functions. A clean local reset applied all 39 active local migrations successfully. The full-schema, checkout/seller and inventory behavior tests passed, schema lint reported no errors, generated local TypeScript types were refreshed, and the application production build passed. The checkout Edge Functions, buyer cart/checkout UI, buyer order history and seller paid-order inbox remain local-only and have not been deployed. The frontend build passed after adding the cart, one-shop checkout, delivery selection, Paystack return-status handling, seller paid-order inbox, buyer order history and stock-aware listing forms. No production schema DDL was applied.


The third local-only Phase 2 migration (`20261125233000_seller_order_management.sql`) adds an ownership-checked seller order-status RPC. A seller may accept, prepare and mark an order ready; only seller-arranged orders may be marked delivered by the seller. The local test suite verifies the buyer cannot impersonate the seller and a seller cannot bypass tradR-agent dispatch.


The fourth local-only Phase 2 migration (`20261125235000_inventory_and_buyer_order_tracking.sql`) adds nullable stock tracking for legacy listings, an order-item reservation trigger, exactly-once stock release on definitive payment failure, and buyer receipt confirmation. New listing forms now require sellers to enter available quantity; existing listings remain untracked until sellers update them. `src/BuyerOrders.tsx` adds buyer order history, delivery status and receipt confirmation. The clean local schema and frontend build passed; no production migration or function deployment was performed.
