# Platform dashboard

The platform dashboard (`/admin`) shows store, subscription, merchant, QR and administrative figures. The figures come
from one database function, `zb_admin_dashboard(p_from, p_to, p_store)` (migration 0048), so the application
loads summaries and not tables.

## Access

- The function refuses any caller who is not a platform administrator (`app.is_platform_admin()`), with SQLSTATE 42501.
- The page calls `requireAdmin()` first. The service uses the signed-in session, not the service-role client.
- Ranges are limited to 366 days (SQLSTATE 22023). An unknown store is refused (P0002).

## Sections

| Section | Source | Notes |
| --- | --- | --- |
| A. Store overview | `stores`, `store_onboardings`, `store_owners` | Platform-wide. The store filter does not apply. |
| B. Subscriptions | `subscriptions`, `subscription_plans`, `subscription_payments`, `subscription_migration_allowances` | Expected plan value is a list price. Recorded payments are subscription receipts. |
| C. Merchant performance | `orders`, `payments`, `refunds` | Store filter applies. Daily trend covers every day in the range. |
| D. QR analytics | existing `zb_qr_summary`, `zb_qr_daily`, `zb_qr_store_comparison` via `loadPlatformQrAnalytics` | Not recomputed. A failure shows in this section only. |
| E. Administrative activity | `audit_logs`, `store_onboardings`, `account_provisioning_requests`, `support_tickets` | Links to the managing pages. |

## Revenue rules

- **Gross order value** is the total of orders that are not cancelled. It is a sales value, not cash.
- **Collected** is the total of payments with a paid status (`PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`) whose `paid_at` falls in the range.
- **Refunds** are refunds with status `succeeded` and `processed_at` in the range. Requested refunds are not counted.
- **Refund-adjusted revenue** = collected − refunds. Each amount is counted once: collection is recorded when paid, and a refund is recorded when processed.
- Unpaid orders, cash still pending and store credit are not counted as collected.
- **Subscription revenue** is shown separately from merchant revenue. Plan prices are never shown as collected.

## Tests

- `supabase/tests/admin_dashboard_tests.sql` (D1–D6, run by `scripts/db.sh test`): order counts, gross value, collected and
  refund-adjusted revenue (with a requested refund excluded), subscription separation and quota flags, by-store rows and
  the daily trend, empty ranges, and refusals for non-administrators, reversed and long ranges, and unknown stores.
- `tests/admin-dashboard.test.ts`: percentage and bar helpers, range length, and structural checks that the page is gated
  and uses only the aggregate.

## Not verified here

- The dashboard has not been rendered in a browser. Layout, responsive behaviour and the loading state need a browser check.
- Figures have not been compared against a hosted Supabase project with real traffic.
- Store credit (customer balances) is not part of the revenue figures by design. It needs a separate report if required.
