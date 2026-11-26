# Subscription enforcement

This document records the rules implemented by migration `0030_subscription_enforcement.sql`,
`lib/entitlements/rules.ts` and `lib/services/entitlements.ts`.

## Store states

Migration 0031 replaces the earlier "legacy" meaning. A store with no subscription rows is no longer
unrestricted.

| State          | Meaning                                                                                      | New commercial operations |
| -------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| `active`       | A subscription row covers today. `grace` rows cover through `grace_ends_on`.                   | Allowed, within limits.   |
| `allowance`    | No subscription rows, but a platform administrator granted a time-limited allowance (max 90 days). | Allowed, quotas not applied during the allowance. |
| `setup`        | Draft store, not yet activated. Catalogue work only.                                          | Not allowed (no sales).   |
| `upcoming`     | Subscription rows exist, but the next period starts later.                                     | Refused.                  |
| `expired`      | Subscription rows exist, none covers today.                                                   | Refused.                  |
| `unsubscribed` | Active store with no subscription and no current allowance.                                    | Refused.                  |

Activation (any route that sets `stores.status` to `active`) requires an `active` subscription that covers
today. This is enforced by the trigger `stores_activation_guard`, so Admin routes cannot bypass the
onboarding wizard. Activation is also refused when the store's product or active-user counts exceed the plan.

### Migration allowance

- Table `subscription_migration_allowances`: one row per store, an end date, and a reason.
- Granted and revoked only by platform administrators, through `grant_migration_allowance` and
  `revoke_migration_allowance`. An allowance ends between tomorrow and 90 days from today.
- It applies only to stores without subscription rows. A subscribed store's own subscription always decides.
- Migration 0031 gave every store that was active at deployment and had no subscription a 30-day allowance,
  so trading continued through deployment. Each one is visible in the Admin subscriptions screen and can be
  revoked there.
- When an allowance lapses, the store moves to `unsubscribed` and new operations are refused. Existing
  records are never blocked.

Dates are Indian calendar dates (`app.ist_today()` and `istDate()`).

## Limits

Plans have explicit limits. A null limit is never read as unlimited.

- `max_products` with `products_unlimited`: the product cap. Enterprise is the only seeded unlimited plan.
- `max_users` with `users_unlimited`: the cap on active `store_owners` links (owners, managers and staff).
- Database constraints require either a number or the unlimited flag. A null limit without the flag is refused.

Migration 0030 backfills existing plans: the enterprise plan is unlimited, and every other plan
gets `max_users = 5` (the seed dictates `max_products` for those plans already).

## Enforcement points

Database (the source of truth, inside the write transaction):

- `products_quota_guard`: inserts and status changes to `active` count against `max_products` for the store.
  Archiving or editing an existing product consumes no quota.
- `store_owners_quota_guard`: activating a link counts against `max_users`.
- Both take `pg_advisory_xact_lock` per store, so concurrent requests cannot exceed the limit.

Application (early, friendly refusals and reads):

- `assertSubscriptionActive(storeId)` and `assertFeature(storeId, key)` in `lib/services/entitlements.ts`.
- `ownerSaveQuotation` and `ownerSendQuotation` call `assertFeature(storeId, 'quotations')`.
- `createProject` (House Project Planner) calls `assertFeature(storeId, 'house_project_planner')`.
- Product creation and owner account creation map database limit errors with `entitlementErrorFrom`.
- Checks fail closed: if the check cannot run, the operation is refused.

## Features

`app.store_feature_allowed` and `public.zb_feature_allowed` combine three inputs:

1. The subscription state. Subscribed stores must be `active`.
2. The store's `feature_flags` row. Subscribed stores need it enabled. Allowance and setup stores are blocked only by an explicit `false`.
3. The plan's `features` JSON. An explicit boolean `false` blocks the feature for any store.

Premium keys: `pos_billing`, `quotations`, `room_visualiser`, `house_project_planner`, `bulk_imports`, `qr_scan_analytics`.

## Expiry policy

Expiry restricts new operations only. It never deletes or alters existing data:

- Existing orders, paid invoices, refunds and financial records are not modified by any of the triggers above.
- Store data is never deleted.
- Product edits (name, price) remain possible; only adding or reactivating products is restricted.

## Renewal

`public.renew_subscription(store, plan, period_end)` is platform-admin only and serialised per store.

- If the current period has not ended, the renewal starts the day after it. Otherwise it starts today.
- The previous row stays as history. Rows that have ended become `expired`.
- The admin subscriptions action calls this function and writes an audit entry with the previous subscription id.

## Gated entry points (checked in the second pass)

- POS: `saveBillAction`, `scanSkuAction`, `setCouponAction`, `placeBillAction` (`pos_billing`).
  Cancelling a held bill is not gated.
- Room Visualizer: `addVisualizedToCartAction`, `addVisualizedToProjectAction` (`room_visualiser`).
  Removing a photograph is not gated.
- Bulk product import: `previewImportAction`, `confirmImportAction` (`bulk_imports`).
- Purchasing: `createPurchaseOrderAction`, `receiveGoodsAction` (`purchase_orders`); supplier
  creation (`createSupplierAction`, `purchase_orders`).
- Tile batches: `createBatchAction` (`tile_batches`). Stock corrections on existing batches are not gated.
- House Project Planner: `createProject` (`house_project_planner`).
- Quotations: save and send (`quotations`).
- Product creation and owner or staff creation: limits enforced by the database triggers. Their
  messages come from `entitlementErrorFrom`.

Structural tests in `tests/entitlement-wiring.test.ts` fail if a gate is removed.

## Known limitations

- Core modules (inventory adjustments, orders, existing product edits) are not premium features.
  They are governed by subscription state only. No feature key exists for them.
- Reports and exports have no feature key yet. Adding one needs a flag and onboarding label.
- Supplier invoices and payments, and the price-list bulk path for existing variants, are not gated.
- The upcoming-expiry indicator exists as `isExpiringSoon`; the admin subscriptions screen shows
  the plan limits but not expiry warnings or remaining quota yet.
- Plan feature JSON is advisory only for keys that are not boolean.

## Plan editing (fifteenth pass)

- Administrators edit a plan's name, description, price, product and user limits, explicit unlimited flags, premium feature switches and active state. The plan code is fixed. Every change is written to the audit log with before and after values.
- Limits and feature switches take effect immediately for every store on the plan, because entitlement checks read the plan at the time of each operation. Lowering a limit never removes existing products or users; it only refuses new ones above the limit.
- The price applies to new assignments and renewals. Payments already recorded are not changed.
- Unlimited is explicit. A blank limit with no unlimited flag is shown as "no limit configured" and refused by the database.
- Feature switches: an unchecked feature is stored as `false` on the plan and blocks that module for subscribed stores. A checked or absent feature is allowed.

## Usage and remaining quota

- The Assignments table shows products and users in use against the plan, with remaining slots and near-limit (80 percent) and limit-reached warnings.
- Counts come from `zb_subscription_usage()`, which counts products with status `active` and store owners with `is_active` true, matching the database triggers. The function is restricted to platform administrators.

## Reports

- The Reports screens are gated by the `reports` feature. When disabled, the layout shows a notice instead of the screens.
- The report export route returns 403 when the feature is disabled.
- Invoices, refunds and other financial records are not gated by the reports feature and stay accessible.

## Commerce triggers (migration 0032)

- Orders and quotations are refused by the database when the store is not in an active or allowance state (`orders_commerce_guard`, `quotations_commerce_guard`). Existing orders stay updatable after a lapse.
- Migration 0032 backfills premium feature flags for every existing store, so no subscribed store loses access when the new keys are added. The room visualiser key is spelled `room_visualiser` throughout.
- Migration allowance grants and revocations write audit rows in the database. The Admin screen does not add a second audit row for the same action.

## Known limitations

- Reports and export gating is verified by structural tests and the route code, not by a browser test.
- POS and visualiser database paths rely partly on application gates; orders and quotations are protected by triggers.
- No hosted Supabase or payment-gateway verification has been performed.
