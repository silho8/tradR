# tradR. Phase 2 staging and production-data preservation

## Budget and deployment constraints

- Work on the existing `main` branch only. Do not create Git branches.
- Do not create a paid Supabase branch or another paid environment.
- Do not deploy Phase 2 migrations to production until local/runtime validation and a verified backup are available.
- Production remains live and untouched during this validation pass.

## Production baseline inspected on 2026-11-26

Read-only queries against the active Supabase project returned:

| Resource | Baseline |
|---|---:|
| `profiles` | 9 |
| `vendors` (seller shops) | 9 |
| `listings` | 60 |
| `payments` | 0 |
| `transactions` | 2 |
| Storage bucket `listing-images` | present, public |
| Storage bucket `report-evidence` | present, private |

The current schema uses `vendors` as shops. There is no `public.shops` table in the inspected production schema. Listings reference shops through `listings.vendor_id -> vendors.id`.

## Preservation contract

The Phase 2 migration must retain existing records in place:

- Keep profile, vendor/shop and listing primary keys unchanged.
- Keep authentication identities and login credentials unchanged.
- Keep shop names, bios, WhatsApp numbers, logos and verification status.
- Keep listing titles, descriptions, categories, prices, image URL arrays, publication status, moderation status, visibility dates and review metadata.
- Keep storage objects in both existing buckets. Preserving a URL without its underlying object is not sufficient.
- Do not force sellers to recreate shops or relist products.
- Existing listings receive `stock_quantity = NULL`, meaning stock is untracked until a seller chooses to set a quantity. Do not silently assign zero stock to existing products.

## Migration review

The six Phase 2 migrations are local-only and are not in the live project's migration history. They add checkout, order, payment, ledger, delivery, inventory and buyer-tracking functionality around the existing `profiles`, `vendors` and `listings` tables.

The inventory migration adds a nullable `listings.stock_quantity` column. It also replaces the marketplace search function to return the new stock field. This is a schema change, not a request to recreate or rewrite existing listings.

## Validation performed

- Production schema and migration history inspected read-only.
- Production record counts and storage buckets recorded above.
- New migration files reviewed for destructive table/data operations. No `DROP TABLE`, `TRUNCATE`, or `DELETE FROM` against production seller/shop/listing data was found.
- Frontend production build completed successfully with `npm run build`.
- Existing disposable Phase 2 SQL test suites were reviewed. They explicitly use synthetic fixture IDs and state that they must only run against a disposable local Supabase database, never production.

## Zero-budget local test environment (2026-11-26)

A rootless Podman 5.8.4 runtime is available on Fedora, so Docker group access is not required. The existing local Supabase PostgreSQL 17.11 container is healthy and belongs to the local `tradR` project. It is separate from the hosted Supabase project.

The local source database has all 41 migration records applied and contains 5 profiles, 3 vendors, 3 listings, 5 auth users and 0 storage objects. These are local test records, not the production baseline above.

An isolated database named `tradr_phase2_test` has been created inside the local PostgreSQL container by exporting and restoring the local database. Its baseline matches the local source: 41 migrations, 5 profiles, 3 vendors, 3 listings, 5 auth users and 0 storage objects. The original local `postgres` database was left unchanged. This isolated database is the target for Phase 2 SQL tests.

Important safety note: `.env.local` currently points to the hosted Supabase project. Do not use it as the target for tests or migrations. Use explicit local `podman exec ... psql -d tradr_phase2_test` commands. The current local container set includes PostgreSQL, Auth and Storage; it does not include the full local API gateway or Edge Functions runtime.

## Remaining validation gate

The local database is now available for database-backed Phase 2 tests. Still required:

1. Run the Phase 2 full-schema, checkout, inventory and delivery SQL tests against `tradr_phase2_test` only.
2. Where possible, validate migration replay from a clean local baseline; the existing local source already has all 41 migrations applied.
3. Exercise Edge Function and browser push flows separately because the current local container set does not include the Edge Functions runtime/API gateway.
4. Run the read-only preservation checks in `production-data-preservation-check.sql` before and after the eventual production migration.
5. Compare seller/shop/listing IDs, counts, approval states, image URL arrays and storage object inventories.
6. Only schedule production migration after a verified production backup/export and successful tests.

No production migration or deployment was performed during this pass.

## Additional production integrity checks

Further read-only checks on 2026-11-26 returned:

- Orphan vendor/shop records without a matching profile: 0.
- Orphan listings without a matching vendor/shop: 0.
- Published and approved listings: 54.
- Archived and approved listings: 6.
- Objects in `listing-images`: 95.
- Objects in `report-evidence`: 0.

These values are the comparison baseline. The six archived listings are part of the existing marketplace history and must remain archived rather than being republished by migration.


## Phase 2 database test results (2026-11-26)

The 41 SQL migration filenames exactly match the 41 applied migration versions in the local source database. The four disposable test suites were run with `ON_ERROR_STOP=1` against `tradr_phase2_test` only:

- `phase2-full-schema-tests.sql`: PASS (`phase2_disposable_tests_passed`).
- `phase2-checkout-rpc-tests.sql`: PASS (`phase2_checkout_rpc_tests_passed` and `phase2_checkout_and_seller_order_tests_passed`).
- `phase2-inventory-buyer-tests.sql`: PASS (`phase2_inventory_release_tests_passed`).
- `phase2-delivery-operations-tests.sql`: PASS (`phase2_delivery_first_acceptance_tests_passed`).

The tests verified the database checkout rules and idempotency, payment confirmation and ledger writes, seller order progression, inventory restoration after failed payment, in-app notification fan-out to both approved agents, and first-agent-wins acceptance with the second agent rejected. The final disposable test database contains 6 synthetic orders and 2 synthetic delivery-agent records.

After testing, the original local source database still has exactly 5 profiles, 3 vendors, 3 listings and 41 migration records. The production database has not been touched. These tests exercise database/in-app notification behaviour; actual browser push delivery through the Edge Function and browser permission prompts still require separate runtime/browser validation.
