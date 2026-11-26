# tradR. Live Supabase Migration History Archive

Captured: 2026-11-25
Project ref: mmwgmgzpxzkhbrabloiq
Source: Supabase live migration-history listing
Purpose: Preserve the production migration ledger after recovering and reconciling the local migration sources.

This is an archive/reference document only. It does not modify Supabase.

## Recorded migrations (35)

| Version | Name |
|---|---|
| 20261025083952 | tradR_marketplace_schema_and_rls |
| 20261025084004 | tradR_security_and_index_hardening |
| 20261025090616 | flutterwave_listing_subscription_activation |
| 20261025090624 | secure_payment_activation_rpc |
| 20261025111658 | seller_branding_and_buyer_reports |
| 20261025113027 | vendor_listing_limit |
| 20261025121845 | seller_reports_listing_index |
| 20261025122107 | seller_reports_policy_performance |
| 20261025123626 | archive_deleted_listings_free_slot |
| 20261026234704 | verified_transaction_tables |
| 20261026234734 | seller_reviews_public_read |
| 20261027002716 | secure_verified_seller_reviews |
| 20261027004210 | switch_listing_payments_to_paystack |
| 20261027012425 | in_app_notifications |
| 20261027061428 | protect_seller_listing_edits |
| 20261027061633 | protect_seller_listing_creation |
| 20261027062028 | secure_marketplace_handover |
| 20261029134929 | shop_wide_trial_and_subscription |
| 20261029135922 | vendor_approval_trial_publish |
| 20261030083102 | increase_vendor_listing_limit_to_ten |
| 20261030101119 | web_push_subscriptions |
| 20261030140317 | enable_listing_realtime |
| 20261030141651 | publish_listings_for_approved_shops |
| 20261102194935 | daily_random_push_schedule |
| 20261102195841 | daily_random_push_schedule |
| 20261102200241 | reschedule_push_on_device_account_change |
| 20261108030818 | make_seller_access_free |
| 20261108031512 | remove_vendor_listing_cap |
| 20261109041736 | add_campus_pick_notifications |
| 20261110213425 | seller_listing_analytics |
| 20261110220646 | seller_listing_analytics |
| 20261110220713 | remove_duplicate_public_listing_analytics |
| 20261110230258 | harden_trust_reputation_notifications_and_review_privacy |
| 20261110230632 | public_shop_trust_stats |
| 20261110231106 | marketplace_search_engine |

## Reconciliation completed

- `supabase migration fetch --remote` recovered the SQL sources stored in the production migration history. The 34 previously recorded migrations are now represented by their exact production versions locally.
- The local-only `20261109041736_add_campus_pick_notifications.sql` was checked against production. The live notification constraints allow `campus_pick` and `campus`, and `public.notifications` is in `supabase_realtime`. The migration was therefore recorded as applied with `supabase migration repair`; its SQL was not replayed.
- Five local-only timestamp/name variants were moved to `supabase/recovery/archived-local-only-migrations/`. Their production counterparts are documented in that folder's README.
- A fresh `supabase migration list --remote` check shows all 35 local versions matching all 35 production records.

## Recovery rules

- Treat the live database schema and this live migration ledger as the current production truth.
- Do not reset production or delete migration-history rows to make local files appear aligned.
- Do not mark guessed or unverified migrations as applied. The campus-pick record was repaired only after its exact schema effects were verified in the live catalog.
- Keep archived local-only variants outside `supabase/migrations`; they are recovery references, not active migrations.
- Before applying Phase 2 DDL, clean-reset and validate the complete 35-migration history locally, then test the Phase 2 migration against that baseline.
- Supabase CLI v3 changes defaults: database commands target local by default; hosted operations require explicit remote targeting. Always inspect `supabase <command> --help` and verify the target before running commands.
