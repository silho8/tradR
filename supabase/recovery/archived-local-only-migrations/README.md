# Archived local-only migration variants

These five files were present in the local migration directory but had no matching version in the live Supabase migration ledger. They have been moved out of `supabase/migrations` so the CLI will not attempt to replay them.

The production migration history contains authoritative counterparts:

| Archived local version | Production version retained in `supabase/migrations` | Reconciliation |
|---|---|---|
| `20261030083116_increase_vendor_listing_limit_to_ten.sql` | `20261030083102_increase_vendor_listing_limit_to_ten.sql` | Same change; timestamp differed |
| `20261030112000_web_push_subscriptions.sql` | `20261030101119_web_push_subscriptions.sql` | Same table, grants and RLS policies; timestamp/format differed |
| `20261030150000_enable_listing_realtime.sql` | `20261030140317_enable_listing_realtime.sql` | Same publication membership change |
| `20261102190000_daily_random_push_schedule.sql` | `20261102194935_daily_random_push_schedule.sql` + `20261102200241_reschedule_push_on_device_account_change.sql` | Local file combined the initial schedule migration and later trigger update |
| `20261108040000_remove_vendor_listing_cap.sql` | `20261108031512_remove_vendor_listing_cap.sql` | Same trigger/function removal; timestamp differed |

The archived originals are retained for audit/recovery only. Do not move them back into the active migrations directory or replay them against production.

The source files for all production-recorded migrations were recovered using `supabase migration fetch --remote`. The recovered files were normalized to a single trailing SQL statement delimiter; this does not alter their SQL operations.
