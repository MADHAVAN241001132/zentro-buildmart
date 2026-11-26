# Roles and permissions

## Roles

- **Platform Admin**: `platform_admins`. Manages all stores; not limited by a store's subscription for administration.
- **Store Owner**: an active `store_owners` row with role `owner`. Holds every permission implicitly.
- **Manager** and **Staff**: `store_owners` rows with role `manager` or `staff`. Hold the permissions in `store_member_permissions`.
- **Guest**: no login is required. Guest sessions are separate from store membership (see `docs/QR_ANALYTICS.md`).

## Permission keys

Eighteen keys, defined in `store_permission_keys` (migration 0036) and mirrored in `lib/authz/permissions.ts`. A unit test checks that the two lists match:
product management; category and brand management; inventory management; tile batch management; POS billing; order management; cash confirmation; refund management; supplier management; purchasing; customer management; credit management; quotations; reports and exports; QR management; QR analytics; store settings; staff management.

## Defaults

- Owner: all keys.
- Manager: catalogue, stock, sales, finance, purchasing, customers, quotations, reports, QR management and QR analytics. Not staff management or store settings.
- Staff: POS billing, order management, customer management, inventory and tile batches.

Defaults are proposals. The Staff page pre-fills them for new accounts, and an owner or a manager with staff management can change them.

## Enforcement

The database is the authority. Each rule below holds for direct RPC calls, not only for the Staff page.

- `zb_set_store_member_access` (migration 0036, replaced in 0038) assigns a role and permissions. Callers must be platform admin, an active owner, or an active manager with staff management. Staff cannot change access.
- A manager cannot give, or remove, any permission it does not hold (0038). Managers cannot change owners, promote anyone to owner, or change their own access.
- `zb_set_store_member_active` activates or deactivates a member under the same rules. Nobody deactivates their own access.
- Members who are inactive hold no permissions (`app.has_store_permission` requires an active membership).
- Cross-store access is refused: the caller must be an active member of the store being changed.
- Unknown permission keys and roles are refused.
- The last active owner cannot be deactivated, demoted or deleted. A trigger on `store_owners` enforces this for direct writes too.
- Direct writes to `store_member_permissions` are revoked from `authenticated`, so grants can only change through the RPCs.
- The subscription user limit is checked when a membership becomes active, by the existing quota trigger.
- Every change writes an `audit_logs` row (`staff.access_changed`, `staff.activated`, `staff.deactivated`, `owner.created`). The actor is recorded as `shop_owner` or `super_admin`.
- Member names come through `zb_store_members`, which checks membership first, because profiles are readable only by their owner.
- QR analytics (`app.qr_analytics_allowed`) requires store membership as owner or manager, the `qr_analytics` permission and the `qr_scan_analytics` subscription feature. Platform admins are not limited by the subscription.

## Staff administration screen

`/owner/staff` lists members with role, status and permissions. It allows role and permission changes (with confirmation), activation and deactivation, and creation of a manager or staff account. Creating an owner needs an owner. Permissions a viewer does not hold are shown but cannot be changed.

## Accounts

New accounts are created through the shared owner-account service. The password is passed to Supabase Auth and is not stored in the database, the URL, the audit log or the page. If linking fails, the profile is removed, which removes the membership and grants by cascade.

## Enforcement map

Database (migration 0039). Each sensitive RPC calls `app.assert_store_permission(store, key)` or `app.assert_store_manager_permission(...)`. Platform admins and trusted server calls (`app.is_server()`, the service role) pass the gate. Otherwise an active membership with the key is required, and a refusal raises SQLSTATE `42501`. The 27 rewritten functions include `close_cash_day` (cash_confirmation), `pos_save_bill` (pos_billing), refund decisions and gateway refund functions (refund_management), order status changes (order_management), and quotation conversion (quotations). Server-only financial functions (`create_refund`, `settle_online_payment`, `settle_refund`, `mark_refund_succeeded`, `begin_gateway_refund`, `create_payment_attempt`) are not executable by `authenticated` at all; the trusted server path is the only way in (webhooks, settlements, authorised refunds, reservation expiry, cron, system invoices).

Migration 0040 seeds default grants for each new manager or staff membership and backfills existing ones that have none. Owners hold every key implicitly.

Application layer. Owner pages, server actions and route handlers call `requireOwnerPermission` or `ownerPermissionForRoute` with the key that matches the area. Denied page requests redirect to `/owner/access-denied?permission=...`. Denied route handlers return JSON `forbidden`, or `unauthorised` when there is no session. The owner navigation is filtered by the effective permission set, so links are hidden, but the checks above still protect direct URLs. Hard-coded staff role checks were removed; role names no longer decide access.

Decisions taken in this pass (flagged for review):
- Staff defaults include `order_management`, so staff can change order status.
- Coupons, including coupon application in POS, map to `store_settings`.
- Quotation pricing follows the `quotations` permission.
- Owner-status-bar counts and `store_dashboard_metrics` are not yet permission-gated.

Behavioural tests: `supabase/tests/module_authorization_tests.sql` (M1 to M9) runs as the `authenticated` role with JWT claims. The superuser path bypasses checks through `app.is_server()`, so the tests must not run as superuser alone.

## Authorisation coverage matrix

"Server action" means the owner page's server action or page gate. "API" means the route handler. "Database" means the RPC gate, row policy or storage policy. Tests: P = permission_tests, M = module_authorization_tests, R/C/D/X/SP = policy, coupon, dashboard, exposure and storage tests (`supabase/tests`).

| Business module | Required permission | Server action / page | API | Database | Test coverage | Remaining runtime verification |
|---|---|---|---|---|---|---|
| Products and imports | product_management | products pages and actions, import, media actions | catalogue export, import template, import errors | catalogue row policy (write); catalogue storage policy | SP2 (catalogue upload); not directly for product rows | Import of a large batch in a browser |
| Categories and brands | category_brand_management | categories actions | none | category row policy; catalogue storage | none directly | Browser check |
| Inventory | inventory_management | inventory actions (adjust, damage, reorder) | none | adjust_stock, mark_damaged, batch functions gated (0039) | none directly | Stock adjustment in a browser |
| Tile batches | tile_batch_management | batch pages and actions | none | batch functions gated (0039) | none directly | Browser check |
| Point of sale | pos_billing | POS actions (save, scan, place, cancel, coupon) | none | pos_save_bill, pos_quote_bill, pos_sync_bill, pos_cancel_bill, pos_set_coupon gated | M2, M3, C1, C2 | Held-bill flow in a browser |
| Orders | order_management | orders actions, deliveries | invoice route | transition_order_status, cancel_order gated; order and delivery read policies | D2 (visibility) | Status change in a browser |
| Cash confirmation and day close | cash_confirmation | cash actions and day close | none | confirm_cash_payment, close_cash_day, record_cash_movement gated; payments and cash read policies | M1, M6, R2, R3 | Day close in a browser |
| Refunds | refund_management | refund pages and decisions | none | refund decision and settlement functions gated; server-only financial functions not client-executable; refund read policies | M8, SP3, SP4 | Refund flow in a browser |
| Suppliers | supplier_management | supplier actions | none | supplier and supplier-invoice row policies; supplier_balance and payment functions gated | none directly | Browser check |
| Purchasing | purchasing | purchasing actions | none | create_purchase_order, set_purchase_order_status, receive_goods gated; purchase row policies | none directly | Browser check |
| Customers | customer_management | customer actions | none | customer row policy; customer_balance gated | none directly | Browser check |
| Credit | credit_management | credit action | none | record_credit_entry gated; credit_ledger read policy | none directly | Browser check |
| Quotations | quotations | quotation pages, actions, PDF route | quotation PDF | quotation row policy; quotation read policy; conversion is server-only | none directly for pricing | Pricing and PDF in a browser |
| Reports and exports | reports_exports | report pages, export route | reports export | report functions service-only; dashboard sections filtered | D1, D2, D3 | Export download in a browser |
| QR management | qr_management | QR actions | none | qr_codes row policy | none directly | Browser check |
| QR analytics | qr_analytics | analytics pages | analytics export | app.qr_analytics_allowed; qr_scan_logs read policy | Q10 and earlier QR tests | Analytics in a browser |
| Store settings and coupons | store_settings | settings actions, coupon administration | none | coupons and discounts row policies; feature_flags row policy | R1, R4 | Coupon administration in a browser |
| Staff | staff_management | staff pages and actions | none | zb_set_store_member_access, zb_set_store_member_active gated; grants writable only through RPCs | P1 to P14, M7 | Staff page in a browser |
| Storage (catalogue, branding, private photographs) | product or category management; store_settings; refund or customer management | upload actions | signed photo links | storage policies per bucket and kind | SP1 to SP4 | Upload in a browser |
| Subscription gates | membership or platform admin | entitlement checks (service role) | status route | zb_subscription_state, zb_feature_allowed, zb_commerce_allowed guarded | X1 to X4 | Plan change in a browser |

## Concurrency

- Last-owner protection locks the store row before counting remaining owners (migration 0041). `scripts/db.sh concurrency` runs a two-session race that deactivates both owners at once: one commits and one owner remains.
- Subscription user limits use a per-store advisory lock in the quota trigger. The same runner activates two members at once on a two-user plan: one commits and two users remain.
- The races use real committed data in a scratch database cloned from the migrated template. They need a superuser and are not part of the rolled-back suite.
- Not tested: concurrent permission edits on the same member, and revocation racing a sensitive operation. Both need a further two-session case.

## Decisions to confirm

- Staff defaults include order_management (order status changes).
- Coupon use in POS requires pos_billing. Coupon administration requires store_settings.
- Expenses are gated by cash_confirmation (a financial record). Change this if expenses belong to reports_exports.
- Room photographs are readable by customer_management; refund photographs by refund_management.

## Not yet complete

- **Report data functions** are service-only and gated at the page and route. Their data is not checked inside each function.
- **Durable account provisioning** (Priority 2) is not started. Owner accounts are still created across Supabase Auth and the database in separate steps, so an interrupted creation can leave an unlinked Auth account. Nothing deletes an Auth account automatically.
- **Browser verification.** No owner page, the Staff page, the dashboard or the access-denied page has been rendered in a browser.
- **Full Next.js build and strict type check** need the project's dependencies (React, Next, Node types, server-only, zod), which are not installed here.


## Permission follow-ups (closed in this checkpoint)

- **Report data functions.** Still gated at the page and route level. Alternate callers are covered by the RPC
  exposure audit (X1–X4): no security-definer function is executable by `authenticated` without an authorisation check.
  Report-only tables remain an open item for browser verification.
- **Concurrent permission edits.** `scripts/concurrency/permission_edit_race.sh`. Two owners set the same member's
  permissions at once. The member row is locked, so the final set equals exactly one submitted set.
- **Revocation racing a sensitive operation.** `scripts/concurrency/revocation_race.sh`. Authority is checked per
  statement. A write that passed before the revocation committed stands; later writes in the same transaction and in
  new transactions affect zero rows.
- **In-flight boundary.** An operation is authorised statement by statement. A revocation does not undo a statement
  that already completed, and blocks every statement that starts after it commits.
- **Both existing harnesses** (`last_owner_race.sh`, `quota_race.sh`) still pass. Run all four with
  `sudo -u postgres env DATABASE_URL=... scripts/db.sh concurrency`.

## Final integration checklist (open items)

- [ ] Browser-based RLS verification: sign in as each role (owner, manager, staff without permissions, staff with
      order_management) on a hosted or local Supabase project and confirm that direct table reads and writes match the
      coverage matrix above. Not performed in this environment.
- [ ] Hosted Supabase Auth: confirm `createUser` outcomes (new, already registered, timeout) against the real service.
- [ ] Provisioning reconciliation page, in a browser, with each decision.
- [ ] Full `next build` and strict typecheck with the project's dependencies installed (React, Next, Node and zod types).
- [ ] Confirm the decision flags: staff default `order_management`; expenses under `cash_confirmation`; managers may not create managers.

## Report service guard (checkpoint 485)

- Every exported function in `lib/services/reports.ts` and `buildDataset` in `lib/services/report-datasets.ts` calls
  `requireReportStore(storeId)` first. The guard reads the caller's own permissions (`zb_my_store_permissions`) and
  requires `reports_exports`. A caller that omits its page or route gate is refused by the service.
- Enforced by `tests/report-access.test.ts` (structural). The database function that the guard relies on is covered
  by the existing permission tests.
