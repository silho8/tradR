# Supabase schema recovery notes

Date: 2026-10-25
Project: tradR
Supabase project ref: `mmwgmgzpxzkhbrabloiq`

## Safety rule

Do not reset the live project or mark reconstructed migrations as applied until a clean disposable database has successfully applied the complete migration chain. The live project contains user data and a confirmed test-payment record.

## Current migration history

The remote Supabase migration history contains six versions:

- `20261025083952` - `tradR_marketplace_schema_and_rls` (SQL file missing locally)
- `20261025084004` - `tradR_security_and_index_hardening` (SQL file missing locally)
- `20261025090616` - `flutterwave_listing_subscription_activation`
- `20261025090624` - `secure_payment_activation_rpc`
- `20261025111658` - `seller_branding_and_buyer_reports`
- `20261025113027` - `vendor_listing_limit`

The first two versions are not present in the available local Git history. Do not invent SQL and pretend it is the original migration.

## Live schema inventory

The live public schema currently includes:

- `admin_users`
- `profiles`
- `vendors`
- `listings`
- `listing_subscriptions`
- `payments`
- `reports`
- `seller_reports`

All eight tables have row-level security enabled. The live database also contains application triggers for timestamps, listing/system-field protection, vendor verification protection, and seller listing limits. The live payment activation RPC and the related Edge Functions are part of the deployed application and must be preserved.

Storage buckets:

- `listing-images`: public image assets, 5 MiB limit, JPEG/PNG/WEBP/AVIF.
- `report-evidence`: private report evidence, 5 MiB limit, JPEG/PNG/WEBP/AVIF.

The complete current client-facing schema type snapshot is at `src/types/database.generated.ts`. It is a reference for TypeScript only and is not a substitute for SQL migrations, storage policies, grants, triggers, or function definitions.

## Recovery procedure

1. Obtain the exact original migration SQL from a backup or previous working copy if possible.
2. If unavailable, reconstruct a **new, clearly labelled baseline** from the live database catalog. Preserve current constraints, indexes, grants, RLS policies, functions, triggers, and storage policies. Do not claim this is the original SQL.
3. Compare reconstructed definitions with the four later migration files and the generated type snapshot.
4. Validate the full migration chain against a clean, disposable Supabase/Postgres environment with the required Supabase extensions and auth/storage schemas.
5. Confirm a clean build and a clean database setup before committing the baseline.
6. Never reset or reapply the baseline against the existing live project. The existing project already has those migration versions recorded.

## Remaining blocker

The local machine did not have the Supabase CLI or PostgreSQL dump tools available during the audit. An attempt to invoke the CLI through npm did not return a version, so no schema dump was produced. Continue with a supported CLI installation or an isolated catalog-driven reconstruction. Do not add a partial or speculative baseline merely to make migration counts match.
