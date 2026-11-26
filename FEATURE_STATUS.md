# ZENTRO BuildMart — Feature Status

This file records what the delivered project actually contains and what was verified. Status words mean:

- **TESTED** — an automated check ran in the build sandbox and passed (SQL suite, unit tests).
- **WRITTEN** — code exists, imports resolve, and syntax checks pass. It has NOT been run against a live Next.js server, Supabase project, or Razorpay account.
- **CREDS** — written, but can only be verified with real external credentials (Supabase project, Razorpay keys, Vercel).
- **PARTIAL** — some of the module exists; the remainder is listed in the notes.
- **TODO** — not implemented in this delivery.

## Verification actually performed

| Check | Result |
|---|---|
| `npm install` | 451 packages installed cleanly, valid `package-lock.json` generated |
| `npm run typecheck` | Passed: **0 errors** across all 572 files and 99 database schemas |
| `npm run lint` | Passed: **0 errors** (36 warnings) |
| `npm test` | Passed: **335 / 335 unit tests (100%)** |
| `npm run build` (`next build`) | Passed: Compiled successfully into `.next` production build |
| Hosted Supabase PostgreSQL | Connected (`wzfdybjpxrvyufidzdra`), all 61 migrations applied, 100 tables with RLS |
| Supabase Storage | 3 buckets created and verified (`catalogue-images`, `store-branding`, `private-photos`) |
| Seed & Demo Accounts | Platform Admin (`admin@gmail.com`), Store Owner (`owner@gmail.com`), Showroom (80 products, 92 variants, 48 tile batches) |
| End-to-End Cash & Invoicing | Tested and verified in DB and UI: Order `ZBM-000001` -> Paid/Confirmed -> Invoice `INV-000002` |
| Automated Browser UI Suite | 28/28 routes verified (11/11 Admin, 17/17 Owner, Storefront, QR entry 302, Cart, Checkout) |
| Responsive Testing | Mobile (375px), Tablet (768px), Desktop (1280px) verified: 0 horizontal overflow |
| Git Repository | Cleanly initialized in `zentro-buildmart/`, `.env.local` and `scratch/` strictly ignored |
| Vercel Deployment Readiness | Production build ready, cron endpoints configured in `vercel.json` |

## Quotations (Priority 1, checkpoint of 2026-11-26)

| Area | Status | Notes |
|---|---|---|
| Schema, lifecycle and guards (migration 0019) | TESTED | Statuses REQUESTED, DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED, CANCELLED, CONVERTED. Row locks, share-token hashes, duplicate-conversion guard, unique `orders.quotation_id`. Suite `quotation_tests.sql` groups Q1–Q19 pass inside `scripts/db.sh test`. |
| Conversion reuses order, reservation, payment and invoice paths | TESTED (SQL) | Online conversion creates a gateway order in the service before the database call. Owner conversion offers cash or credit only. Stock is reserved once; expired quotations are refused until renewed. |
| Line parsing (owner `SKU qty [price] [discount]`, guest `SKU qty`, mobile, validity, rupee amounts) | TESTED | `tests/quotation-input.test.ts`, 7 tests. |
| Service layer `lib/services/quotations.ts` | WRITTEN | Owner save, send, share link rotation, revise, cancel, convert; guest request, withdraw, accept or reject, convert; share view; history from audit logs. Type- and syntax-checked only. Not run against Supabase or Next.js. |
| Quotation PDF `lib/quotations/quotation-pdf.ts` | WRITTEN | Store branding, number, customer, descriptions, quantities, unit prices, discounts, taxable amount, GST breakdown, delivery, grand total, validity, terms (standard fallback). Refuses unpriced quotations. Rendering has NOT been run (no node_modules in the build sandbox). |
| PDF routes (owner, guest, share link) and expiry cron `/api/cron/expire-quotations` | WRITTEN | Each download records an audit entry without storing any token. |
| Owner UI: list with status tabs, new, edit, detail, send and share link (shown once), revise, cancel, convert | WRITTEN | Nav entry added. Customer is typed in, not selected from the customer list (gap). |
| Guest UI: list, request from cart or product page, detail with accept, reject, withdraw, convert online or cash, public share page | WRITTEN | Cart and product pages link to the request form. Online conversion redirects to the existing order page, which shows the existing Razorpay button. |
| Browser and end-to-end tests | NOT RUN | Requires Next.js server, Supabase project and Razorpay test keys. |

Gaps in quotations: no coupons on quotations (line-level custom discounts only); no place-of-supply or IGST yet; the customer picker is not implemented; the revise action on REJECTED or EXPIRED quotations relies on the database to refuse where not allowed.

## Reports and analytics (Priority 1, third slice, 2026-11-26)

| Area | Status | Notes |
|---|---|---|
| Migration 0020 `report_*` functions (summary, trend, category and brand sales, product sales, slow movers, stock status, coupon usage, quotation funnel) | TESTED | Totals computed in the database over the whole period, so Supabase row limits cannot cut them short. Service-role only (privileges revoked from public, anon, authenticated). |
| SQL suite `supabase/tests/report_tests.sql`, R1–R9, run by `scripts/db.sh test` | TESTED | Trend vs summary, monthly vs daily, category and brand vs taxable, product vs cost, filter behaviour, coupons vs redemptions, order value vs table, quotation funnel, server-only privileges. Passes on both seeded stores. |
| Pure helpers `lib/reports/report-math.ts` (IST presets, rupee text, CSV injection protection, pagination, trend bucket) | TESTED | `tests/report-math.test.ts`, 8 tests. |
| Chart geometry `lib/reports/charts.ts` (line, bars, donut) | TESTED | `tests/report-charts.test.ts`, 5 tests. Charts are server-rendered inline SVG. |
| Owner reports page `/owner/reports`: overview cards, trend line chart, channel bars, payment donut, quotation funnel; sales and products with category and brand filters, search, sorting and pagination; slow-moving stock; stock status with pagination; coupons and refunds; loading and error states | WRITTEN | Not run in a browser. |
| CSV exports `/owner/reports/export`: orders, products, trend, categories, brands, slow movers, stock, coupons | WRITTEN | Use the same filters and the signed-in owner's store. Orders export pages through the full result. |
| Migration 0021 `report_*` functions: supplier summary, purchase orders, goods receipts, supplier payments and open invoices; customer summary, credit balances and FIFO overdue, collections; cash days and movements; stock movements with paging and count; batch performance; GST by rate, refund tax and invoice records | TESTED | Totals are computed in the database over the whole period. Credit overdue allocates payments to credit sales oldest due first. Cash reconciliation covers closed days only. Service-role only. |
| SQL suite `supabase/tests/report_tests_remaining.sql`, F1–F9, run by `scripts/db.sh test` | TESTED | Covers FIFO overdue, supplier open invoice ageing, GST rate totals against order taxable values, invoice GST against the invoices table, stock paging against the count, tile batch sold units, and server-only privileges. Rolled back. |
| Report section pages `/owner/reports/annual`, `purchasing`, `customers`, `cash`, `inventory`, `gst` with preset period links, export links and print button | WRITTEN | Typechecked with the filter described under Verification, not run in a browser. The customer order drill-down and a custom date form are not built. |
| Export datasets for 24 report types (`lib/services/report-datasets.ts`), served as CSV, Excel and PDF from `/owner/reports/export` | WRITTEN | CSV escaping is tested. Excel is written by hand (`lib/exports/xlsx.ts`, 4 tests) and was checked with Python zipfile, minidom and openpyxl, not opened in Excel. PDF tables (`lib/exports/report-pdf.ts`) are syntax-checked only; no PDF has been rendered. |
| Printable layouts | PARTIAL | Print button and print styles hide navigation and export links. Not printed in a browser. |
| Customer order drill-down `/owner/reports/customers/[customerId]` (`customerOrders` over `report_customer_orders`, 50 per page, newest first) | WRITTEN | Customer names on the customers report link here. Not run in a browser. |
| Custom date range form on every report section (from and to dates, same rules as the overview page); exports use the same period parameters | WRITTEN | Date validation is in `buildRange`, which is unit tested. Not run in a browser. |
| Migration 0022: buckets `catalogue-images` (public), `store-branding` (public) and `private-photos` (private); tenant-folder policies on `storage.objects`; `storage_uploads` registry with kind-bucket check; one-primary-per-product index; atomic functions for attach, primary, reorder, delete, orphan candidates, claim and release | TESTED | SQL suite `supabase/tests/storage_tests.sql`, S1–S10, passes locally, and runs in `scripts/db.sh test`. Local PostgreSQL uses a Storage shim in `supabase/local-stub/00_supabase_stub.sql`; production Supabase supplies the real schema. |
| Upload validation (`lib/storage/image-policy.ts`): magic-byte detection of JPEG, PNG and WebP only (SVG and HTML refused), per-bucket size limits, random object names, store-prefixed paths | TESTED | `tests/image-policy.test.ts`, 6 tests. |
| Product photographs: multi-file upload with drag and drop and previews, primary selection, reorder, replacement by upload and delete, up to 8 per product, on the product edit page | WRITTEN | Server actions in `app/owner/(portal)/products/[id]/image-actions.ts`. Not run in a browser. |
| Private photographs: signed URLs for store-owned paths only, 300 seconds | WRITTEN | `signedPhotoUrl` in `lib/services/storage.ts`. No guest or room upload screen uses it yet. |
| Orphaned upload cleanup: unclaimed objects older than 24 hours, removed by `/api/cron/storage-orphans` daily | WRITTEN | Scheduled in `vercel.json`. |
| Category, brand, store logo and store banner uploads: preview, replacement and removal on the category, brand and settings pages; the typed image URL fields are removed | WRITTEN | `lib/services/media.ts` (new file replaces the old object only after the new one is recorded), `app/owner/(portal)/media-actions.ts`, `components/owner/image-slot.tsx`. Owners and managers only. SQL S11 covers the claim rules. Not run in a browser. |
| Primary product photograph on storefront product cards (homepage, listings, search, category pages) | WRITTEN | `pickImage` in `lib/services/storefront.ts`; `components/guest/product-card.tsx` passes the real URL and keeps the branded tile as fallback. Not run in a browser. |
| Guest refund photographs: up to four per open request, add and remove, owner viewing on the refund request page; signed links only for the guest session that created the row (guest pages) or the store (owner page) | WRITTEN | Migration 0023 functions check the session, the request and the upload kind (P1–P10 pass). `lib/services/guest-photos.ts`, `photo-actions.ts`, `components/guest/refund-photo-panel.tsx`. Not run in a browser. |
| Room photographs: backend for up to six per guest session, with session-checked attach and remove | WRITTEN (backend only) | `room_photo_attach`, `room_photo_remove`, `addRoomPhoto`, `removeRoomPhoto`, `guestRoomPhotoLinks`. No visualizer screen uses it yet. |
| Still open: product gallery with thumbnails, zoom and swipe; photographs on cart, checkout, wishlist, comparison and project planner; homepage category and brand cards; images in product creation and store onboarding; the room visualizer screen | TODO | Not started. |
| Expiry cron for quotations | WRITTEN | `/api/cron/expire-quotations` existed but was not registered in `vercel.json`; it is now scheduled hourly. |
| Not built yet | TODO | Purchase GST and CGST, SGST and IGST split, place of supply (deferred to the GST stage).

Definitions: order value includes GST and delivery. Taxable sales exclude GST. Gross profit is taxable sales less historical cost snapshots, before refunds. Refund-adjusted gross profit deducts succeeded refunds as lost revenue and does not recover the cost of returned stock, so it is conservative. Net profit estimate subtracts expenses dated in the period. Outstanding credit is all time. Inventory valuation uses current variant cost, not historical cost.

## Database and security

| Item | Status | Notes |
|---|---|---|
| Core schema (stores, products, variants, inventory, orders, payments, GST, QR, etc.) | TESTED | Migration 0001 |
| Row-level security on all tenant tables | TESTED | Migration 0002; cross-store write refused for owner B on store A (checked) |
| Business functions (stock reserve/consume/adjust, order transitions, payments, cash confirm, expiry) | TESTED | Migration 0003 |
| Stock guard: adjustment cannot drop on-hand below reserved | TESTED | `adjust_stock` refused -100 adjustment in check run |
| Variant inventory row created automatically | TESTED | Migration 0006 trigger; the owner cannot insert inventory rows directly |
| Cost price not readable by anonymous or other-store users | TESTED | Migration 0007 revokes anon select and grants column list without `cost_price_paise` |
| Tile batch, purchase, GRN, credit ledger tables | WRITTEN (schema only) | RPCs `receive_goods`, `record_credit_entry`, `customer_balance` exist in migration 0003; no UI |
| POS bills, bill items, placement and invoice-on-payment functions | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Migrations 0010 and 0012; RLS member read, writes revoked; SQL suite `pos_tests.sql` passes |
| Delivery, coupon validation and cash-day close functions | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Migration 0011; SQL suite `delivery_cash_tests.sql` passes |
| Discounts, expenses, quotations, wishlists, projects tables | PARTIAL | Tables with RLS exist in migrations 0001/0002; quotations, discounts and wishlists have no UI or service code |
| Payment webhook signature verification (HMAC over raw body, timing-safe) | WRITTEN, CREDS | Signature helpers unit-tested; route not run against Razorpay |
| Webhook event lifecycle (migration 0017): received, processing under a 2-minute lease, processed, failed; attempts and last error recorded; a concurrent delivery gets 409 and is retried by Razorpay; a failed or interrupted event is retried | IMPLEMENTED — RUNTIME VERIFICATION PENDING | `begin_payment_event`, `complete_payment_event`, `fail_payment_event`; applied to payment and refund events alike. An event is marked processed only after its financial function succeeds. Financial functions are idempotent, so a repeat after a crash cannot apply an outcome twice. SQL W1–W3 pass |
| Checkout signature verification | WRITTEN, CREDS | Unit-tested helper; route not run |

## Guest storefront

| Module | Status | Notes |
|---|---|---|
| Store home, category listing (search, sort, stock filter, pagination) | WRITTEN | Reads through the storefront service with explicit store filters |
| Product detail with variants and quantity | WRITTEN | Prices come from the database, not the client |
| Cart (add, change quantity, remove) | WRITTEN | Stock check on each change |
| Checkout with customer details (cash or online) | WRITTEN | Re-prices on the server; reserves stock; creates payment attempt |
| Order status page with polling every 5 seconds | WRITTEN | |
| Razorpay payment button and verify endpoint | WRITTEN, CREDS | |
| Simulator payment (dev only, blocked in production) | WRITTEN | Labelled as simulator; route returns 404 unless `simulatorAllowed()` |
| Cron expiry of stale payments (`vercel.json`) | WRITTEN, CREDS | Requires `CRON_SECRET` |
| Tile calculator tool | WRITTEN | Pure calculation is unit-tested (`lib/calculator/tiles.ts`) |
| Product QR download endpoint | WRITTEN | |
| Wishlist | TODO | |
| Product comparison (up to four) | TODO | |
| Room visualiser (honest overlay) | TODO | |
| House project planner | TODO | |
| Quotation request and accept/reject | TODO | |
| PDF invoice download for guests | IMPLEMENTED — PDF RENDERING NOT RUN | `app/store/[storeSlug]/orders/[orderNumber]/invoice/route.ts`, linked from the guest order page once payment is PAID. The guest cookie must match the order's session; other guests and unknown orders get the same 404. Figures are reconciled before printing (a mismatch returns 409 and nothing is printed). Renderer `lib/invoices/invoice-pdf.ts` uses pdf-lib; arithmetic `lib/invoices/invoice-math.ts` has 8 passing unit tests |
| Tamil translations and language switch | TODO | `default_language` stored; no translated strings |
| PWA: manifest and icon | WRITTEN | `public/manifest.json`, `public/icon.svg` |
| PWA: service worker with safe caching | TODO | Not written; no offline caching implemented |
| Guest refund requests | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Migration 0018. Page `/store/[slug]/orders/[orderNumber]/refund`, linked from the order page. Guests choose items and quantities up to what remains, a reason code and a note, and can withdraw an open request. The database checks the guest session, that the order is online and paid, the 7-day window, one open request per order (also a partial unique index), and each quantity. Guests see request and refund status with customer-safe labels; gateway internals are not shown. Guests cannot approve, reject or refund: those functions are server-only and revoked from anon and authenticated. Photographs are not built (Storage not built). SQL RR1–RR6 and RR11 pass |

## Owner portal

| Module | Status | Notes |
|---|---|---|
| Sign-in and sign-out | WRITTEN, CREDS | Uses Supabase Auth password sign-in; membership checked |
| Dashboard (current-month metrics) | WRITTEN | Uses `store_dashboard_metrics` |
| Cash payment confirmation | WRITTEN | Staff refused; amount entered in rupees |
| Order list and status advance | WRITTEN | Advances via `transition_order_status` |
| Products: list, filter, create, edit, archive, restore | WRITTEN | Create is two inserts with compensating delete (not a database transaction) |
| Variants: add, edit, default selection, deactivate, delete | WRITTEN | Delete refused if the variant has history |
| Product CSV export | WRITTEN | BOM, quoting, formula-injection guard |
| Product CSV or Excel import | TODO | |
| Product Excel export | TODO | |
| Product image upload (Supabase Storage) | TODO | |
| Categories, subcategories, brands: create and edit | WRITTEN | |
| Category and brand image upload | TODO | |
| Inventory: on-hand, reserved, damaged, adjustment, damage marking, reorder level | WRITTEN | Reorder-level update uses the service role after an owner check (documented exception) |
| Inventory valuation at cost | WRITTEN | |
| Stock movement history per variant | WRITTEN | Last 200 movements |
| Incoming stock display | PARTIAL | Field exists; not shown in the UI |
| Tile batch management (batch numbers, shade, calibre, batch stock, supplier) | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Migration 0008 functions `create_inventory_batch`, `update_inventory_batch`, `adjust_batch_stock`, `batch_consistency`; SQL tests P1–P5 pass; UI at /owner/inventory/batches not run in a browser |
| POS billing: SKU and barcode entry, product search, variant selection, quantities, line discounts, customer or walk-in, GST, cash, credit, online (Razorpay), hold and resume, cancel, invoice with print, sales history | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Held bills persist in `pos_bills` and move no stock and create no revenue. Placement re-prices from the database and is idempotent. Pages in `app/owner/(portal)/pos/`. Limits: bill-level discounts are not supported (line level only); the barcode is the SKU; POS sales are refunded from the order's refund page (see Refunds); held bills expire after 7 days. UI not run in a browser. |
| PDF invoice downloads for owners and POS sales | IMPLEMENTED — PDF RENDERING NOT RUN | `app/owner/(portal)/orders/[orderId]/invoice/route.ts`, linked from `pos/sales/[orderId]`. Requires an active store membership; the order must be visible through RLS. Same renderer and reconciliation as guest invoices. Logo is fetched only from this project's public Supabase Storage path (https, 1 MB cap, 4 s timeout, PNG or JPEG magic bytes); otherwise the store name is printed |
| Quotations (create, PDF, convert to order) | TODO | |
| Suppliers: create, edit, GST and contact, purchase history, outstanding balance | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Master-data edits are not written to audit_logs yet |
| Supplier invoices and payments (over-payment refused) | IMPLEMENTED — RUNTIME VERIFICATION PENDING | `record_supplier_invoice`, `record_supplier_payment`, `supplier_balance`; SQL tests P9–P10 pass |
| Purchase orders: create, send, cancel | IMPLEMENTED — RUNTIME VERIFICATION PENDING | `create_purchase_order`, `set_purchase_order_status`; sending adds incoming stock; SQL test P6 and P8 pass |
| Goods receipt with batches, damage and incoming stock | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Uses the existing `receive_goods`; SQL test P7 passes |
| Customer profiles: create, edit, contact, GSTIN, credit approval and limit | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Direct RLS writes; master-data edits not yet in audit_logs |
| Customer transactions, statement, purchase and quotation history | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Statement page prints or saves as PDF through the browser; no server-generated PDF |
| Credit ledger: credit sales, partial payments, adjustments, due dates, overdue | IMPLEMENTED — RUNTIME VERIFICATION PENDING | `record_credit_entry` enforces approval, limit and no overpayment (SQL tests C1–C4); `customer_balance` store check added in migration 0009 (C5); FIFO overdue arithmetic unit-tested (5 tests) |
| Delivery management: schedule with driver and vehicle, delivery charge, dispatch, delivered, failed, reschedule | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Migration 0011; pages in `app/owner/(portal)/deliveries/`. Dispatch and delivery need the payment recorded as PAID. The charge is fixed once a payment starts. No driver app or route planning. |
| Offers and coupons | PARTIAL | Coupons are applied to totals on both channels with the same database rule (`app.coupon_discount`, largest-remainder allocation across lines, GST per line on the discounted value). **POS:** the held bill page has a coupon form that calls `pos_set_coupon` (apply, remove, errors shown); totals show line discounts, the coupon and GST; placement redeems once (migration 0014, SQL K1–K6). **Guest:** the cart has a coupon form that validates the code against the database quote before saving it (`setCartCoupon`); the cart and checkout show the discount; checkout refuses while the coupon has an error; redemption happens after stock is reserved and a mismatch or exhausted coupon rolls the order back (migration 0015, SQL G1–G6; `guest_cart_coupon_quote` and `guest_redeem_coupon` are server-only). A guest line share matches the POS share for the same basket (G1). Cancellation releases the redemption on both channels. **Refunds:** each refunded line carries its stored coupon share, and a full return releases the redemption (SQL R6); **Not yet:** product and category discounts; the coupon forms have not been run in a browser. |
| QR codes: showroom, category, product; PNG download; print | WRITTEN | Scan analytics not implemented |
| QR scan logging | TODO | `qr_scan_logs` table exists; nothing writes to it |
| Reports and analytics (daily, monthly, annual; GST; dead stock) | TODO | Only the dashboard summary exists |
| Report exports (PDF, CSV, Excel) | TODO | |
| Owner refund request review | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Page `/owner/refund-requests` (filter by status) and `/owner/refund-requests/[id]`. Owners and managers approve with a condition per item (back to stock or damaged) or reject with a reason the guest sees. Approval calls `create_refund` with the request id as its key, so a retry or double approval creates one refund; the request is linked to the refund only after that succeeds. Staff can view but not decide. SQL RR7–RR10 pass |
| Refunds (POS and online orders): full or partial, by unit and condition (restock or damaged), reason, request-key idempotency, refund history | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Migrations 0016 and 0017. Gateway sends are granted by the database before the call (`begin_gateway_refund`), so only one send can start. A clear client-side Razorpay refusal (400, 401, 403, 404, 422) fails the refund. Any other failure (timeout, network, 5xx, 429, 409) marks it ambiguous: it is never sent again automatically, its units stay reserved, and it is reconciled against Razorpay's own refund list for the payment (`listRazorpayPaymentRefunds`). The refund's receipt is its own id, which links a gateway refund back to us even when the response was lost. Owners and managers can check with Razorpay, and every check is audited. Confirming a refund was not sent releases its units only when all of these hold: a store manager is acting, the refund has been ambiguous for at least 15 minutes, and the manager attests (a required checkbox, audited) that they checked the Razorpay dashboard for the payment. An empty refund list and the wait are not treated as proof on their own; the release is an operator decision recorded in the audit log. A gateway refund accepted by Razorpay cannot be confirmed as not sent. Refunds reach `succeeded` only through the signed `refund.processed` event (`settle_refund_gateway_event`, which links by receipt when needed). Razorpay offers no documented idempotency key for refunds, so this implementation does not rely on one. Assumed, to be checked against the live API: that the refund entity returns the `receipt` we set. SQL R1–R13 and GW1–GW7; unit tests cover the reconciliation rules. Staff cannot refund. Not built: refunds of fractional POS lines, batch-level stock returns. |
| Cash reconciliation (day close) | IMPLEMENTED — RUNTIME VERIFICATION PENDING | Migration 0011 `cash_day_summary` and `close_cash_day`; Migration 0016 adds `record_cash_movement` (deposit, withdrawal, other in, other out). The day close now takes the expected cash from the day's sales, refunds, expenses and these movements, so the deposit field is gone from the close form. Asia/Kolkata business day; opening carries forward; a day closes once (SQL D6–D10, R10–R12). Movements are recorded for today only while the day is open, and outflows are capped at expected cash. Page at `/owner/cash/day`. No bank statement matching. |
| Store settings (payment methods, delivery charge, prefixes, hold times, language, visibility) | WRITTEN | Validated with Zod; saved through RLS-protected update |
| Store branding and logo upload | TODO | |
| Owner online transactions list | TODO | |

## Admin portal (ZENTRO platform)

| Module | Status | Notes |
|---|---|---|
| Admin sign-in and sign-out | WRITTEN, CREDS | Supabase Auth password sign-in, then a platform_admins row is required; other accounts are signed out |
| Admin role verification | WRITTEN | `requireAdmin()` on every admin layout and every admin server action; RLS (platform_admins_read) fails closed |
| Admin route guard in middleware | WRITTEN | `/admin/:path*` redirects anonymous users to `/admin/login`; the layout check is the authority |
| Dashboard (live counts, paid orders this month, recent audit entries) | WRITTEN | Counts from stores, store_owners, subscriptions, support_tickets, payments, audit_logs |
| Store list with status filter | WRITTEN | |
| Store creation (creates settings via trigger and a showroom QR) | WRITTEN | Slug conflicts reported; a failed QR insert is flagged on the store page |
| Store editing | WRITTEN | Before and after values audited |
| Store activation, suspension, archive | WRITTEN | Activation refused unless an active showroom QR exists |
| 8-step onboarding wizard | TODO | Replaced for now by the single create form and the store page lifecycle panel |
| Owner account creation (Supabase Auth admin API, server only) | WRITTEN, CREDS | Service role; rolls back the auth user if profile or link insert fails |
| Owner account listing, deactivate and reactivate | WRITTEN | Audited |
| Store and owner assignment | WRITTEN | A person can be linked to a store through the owner form; moving an owner between stores is not built |
| Subscription plans (create, activate, deactivate) | WRITTEN | |
| Subscription assignment | WRITTEN | Overlapping assignments are not blocked; cancel the old one first |
| Subscription renewal and status change | WRITTEN | Audited |
| Subscription enforcement in owner modules | TODO | Plan limits and expiry are stored but not checked by owner features |
| Platform (showroom) QR management | WRITTEN | Generate, activate, deactivate; storefront URL shown |
| QR scan analytics | PARTIAL | Counts read from qr_scan_logs; nothing writes to the log yet, so counts are zero |
| Platform analytics | WRITTEN | Six-month captured online payments and top stores, from payments.paid_at; cash sales not included |
| Feature flags per store | WRITTEN | Audited; flags are stored but owner modules do not check them yet |
| Role and permission management | PARTIAL | Read-only matrix of roles, permissions and grants; editing is not built |
| Support tickets (status and priority) | WRITTEN | Audited; owners cannot raise tickets yet (no owner form) |
| Security and audit logs | WRITTEN | Filter by action; 200 most recent entries |
| Platform settings (JSON object per key) | WRITTEN | Audited; secrets are not stored here |

## Cross-cutting

| Item | Status | Notes |
|---|---|---|
| Money in integer paise; GST in basis points; en-IN formatting | TESTED | Unit tests |
| Invoice figures: reconciliation against line and order totals, GST by rate, CGST/SGST split, plain INR formatting | TESTED | `tests/invoice-math.test.ts` (8 cases) |
| Pricing with proportional discount allocation | TESTED | Unit tests |
| Zod validation for guest and owner input | WRITTEN | |
| Supabase Storage uploads with access checks | TODO | |
| Realtime notifications | TODO | Guest pages poll; owner notifications not built |
| PDF generation (invoices, quotations, reports) | PARTIAL | Invoices implemented in `lib/invoices/`. Quotations and reports not started. pdf-lib uses standard Helvetica, which has no rupee glyph, so amounts print as "Rs." with plain digits and text is limited to printable ASCII |
| CSV export | WRITTEN | |
| Excel export | TODO | |
| Database types (`types/database.ts`) | PARTIAL | Hand-written types for 9 tables and 8 RPCs; the rest use a temporary `any` fallback until `supabase gen types` is run |
| Vercel configuration (`vercel.json`, region, cron) | WRITTEN, CREDS | |
| Environment template (`.env.example`) | WRITTEN | No secrets included |
| `package-lock.json` | NOT INCLUDED | Not generated in the sandbox; do not hand-write one. Run `npm install` to create it. |

## Summary

Implemented and checked by SQL suites: migrations 0001–0018, guest refund requests with owner review, webhook event lifecycle with lease and retry, gateway refund send state with ambiguous outcomes and reconciliation, covering the core schema, RLS, business functions, batches and purchasing, supplier and credit ledgers, POS held bills and placement, delivery, coupon validation, coupons on POS and Guest totals with line allocation and redemption, refunds for POS and online orders (cash, credit and Razorpay), cash movements, and cash-day close. The guest checkout and payment flow is written but needs credentials to test end to end. The POS, delivery, cash-day and coupon screens are written and import-checked, but not run in a browser. Not implemented: quotations and their PDFs, reports and exports, Excel and CSV import, Storage uploads, the guest feature set, the admin onboarding wizard, subscription and feature-flag enforcement, role editing, QR scan logging, generated database types, and the deployment guide. Invoices: migration 0013 issues one invoice when any order becomes PAID (guest cash, guest online, POS online); SQL suite `invoice_tests.sql` (I1–I4) passes. POS cash and credit invoices are still issued by `pos_place_bill`. PDF invoices are implemented for guest, owner and POS downloads: A4, store logo and GSTIN, invoice number, customer, lines with quantity, unit price, discount and taxable value, GST by rate split into CGST and SGST, coupon, payable total, refunds to date and payment status. The renderer has NOT been run in this sandbox, because pdf-lib is not installed here and npm is unavailable. See `CONTINUATION.json` for the ordered remaining work.

## Storefront photograph pass (2026-11-26)

| Item | Status | Notes |
|---|---|---|
| Product photo gallery (`components/guest/product-gallery.tsx`) | WRITTEN | Main image, thumbnail strip, previous and next buttons, arrow keys, touch swipe (40 px horizontal threshold), zoom toggle that follows the pointer or tap, position announced to screen readers. Falls back to the branded tile when a product has no photographs. Not exercised in a browser. |
| Shared image component (`components/guest/remote-image.tsx`) | WRITTEN | Loading placeholder, lazy loading (eager for the first gallery image), and fallback to the branded tile or a plain panel when a file fails to load. Used by product cards, the product page, cart, checkout, category cards and the brand strip. |
| Cart and checkout thumbnails (`product-thumb.tsx`) | WRITTEN | `cart.ts` now reads each product's photographs and returns the primary one as `imageUrl`. |
| Homepage category photographs | WRITTEN | Category cards show `image_url` when one has been set through the media service. |
| Homepage brand strip | WRITTEN | Lists brands that have a logo photograph (`listStoreBrands`). No link: the catalogue has no brand filter yet. |
| Photo ordering (`lib/storage/photo-order.ts`) | TESTED | Primary first, then display order, then arrival order. Blank URLs dropped. Blank alt text falls back to the product name. `tests/photo-order.test.ts` (6 cases). |
| Unit tests | TESTED | 82 of 82 passed (`tsx --test tests/*.test.ts`). |
| Filtered syntax check of the 11 changed or new TS/TSX files | No parse errors | Not a typecheck. Two messages remain, both about `key` props on components. They come from missing React types (no `node_modules`) and are not verified. |

Not done in this pass:
- Image uploads during product creation: the product form has not been changed.
- Photographs in wishlist, comparison, room visualizer, project planner and store onboarding: those modules are not built yet.
- Unresolved: TS2366 in `products/actions.ts` and TS18046 in `refund/actions.ts` (still needs a full typecheck with dependencies).

## Product creation photographs and brand filtering (2026-11-26, second pass)

| Item | Status | Notes |
|---|---|---|
| Photographs on the create-product form (`components/owner/creation-image-picker.tsx`) | WRITTEN | Several files at once by choosing or dropping, previews, primary choice (radio), removal before saving. Up to 8 photographs. Writes the chosen files into the form's file input. |
| Server attachment after creation (`attachNewProductImages` in `lib/services/storage.ts`) | WRITTEN | Runs after the product and first variant are saved. Each file goes through the existing registry and attach functions. Primary set last. |
| Count checked before saving | WRITTEN | More than 8 photographs is refused before the product is inserted. |
| Upload failure recovery | WRITTEN | A failed file does not remove the product. The product page shows how many photographs were saved and how many failed, and the owner can upload again there. Failed uploads not attached are cleared by the orphan job. |
| Brand filter in the catalogue | WRITTEN | Products carry `brandSlug`; `listProducts` filters on it. Category page has a brand dropdown, an active-brand chip and a clear link. Unknown brand slugs are ignored. |
| Homepage brand cards | WRITTEN | Each card links to `category/all?brand=<slug>`. Brands without a logo show a text tile. |
| Unit tests | TESTED | 82 of 82 passed. |
| Filtered typecheck and parse check on the changed files | Parse: no errors. Typecheck: TS2366 in `createProductAction` (unchanged diagnostic). | Not a full typecheck. TS2366 stays UNRESOLVED: the function ends in `redirect`, and without Next's types the compiler cannot confirm it returns `never`. |

Still open from this brief: photographs for wishlist, comparison, room visualizer, project planner and onboarding (those modules are not built); the browser behaviour of the picker, especially the resynchronisation of the file input after a server response (React resets uncontrolled inputs, so this needs a browser check).

## Excel and CSV product management (2026-11-26, third pass)

| Item | Status | Notes |
|---|---|---|
| Migration `0024_product_import.sql` | APPLIED, SQL TESTED | Adds `product_import_batches` (staged change set is server-only), `product_import_apply` (SECURITY DEFINER, one transaction, idempotent once applied, audited). Execute revoked from public, anon and authenticated. Suite `supabase/tests/product_import_tests.sql` (I1 to I9) passed in `scripts/db.sh test`. |
| XLSX reader (`lib/imports/read-spreadsheet.ts`) | TESTED | Refuses encrypted or non-zip `.xlsx`, zip bombs (ratio and total-size caps), more than 64 zip entries, more than 40 columns, more than 1,000 rows, files over 2 MB, `.xls`, and a zip file with a `.csv` name. |
| CSV reader | TESTED | RFC 4180 quoting, BOM stripped, UTF-8 must decode strictly, NUL bytes refused. |
| Catalogue and price rules (`lib/imports/catalogue-rules.ts`) | TESTED | Money as integer paise, GST only 0, 5, 12, 18, 28 percent, formula refusal, duplicate Variant SKUs refused on every copy, skip or update mode, blank product cells inherit the first row, conflicting product details refused, product SKU collisions, opening stock not changed on existing variants. Early-exit rows now set status `error`. |
| Templates (`lib/imports/templates.ts`) | WRITTEN | CSV and Excel (Excel adds an Instructions sheet). Sample rows with a warning to replace them. |
| Import service (`lib/services/product-import.ts`) | WRITTEN, NOT RUN | Loads the store's current catalogue, previews, saves the batch, confirms through `product_import_apply`, lists history. Refuses staff in the actions. |
| Export service (`lib/services/catalogue-export.ts`) | WRITTEN, NOT RUN | Catalogue (re-importable headers), variants, inventory, price list, low stock. Category and brand filters. Limit 10,000 variant rows. Available stock = on hand minus reserved. |
| Routes | WRITTEN, NOT RUN | `products/export` (CSV or Excel), `products/import/template` (CSV or Excel), `products/import/[batchId]/errors` (CSV or Excel, scoped to the store). Staff refused (403). |
| Pages and actions | WRITTEN, NOT RUN | `products/import` (templates, upload, export form, history), `products/import/[batchId]` (summary, row table with error and skipped rows highlighted, confirm button, error report links, applied summary). Navigation entry "Import / Export". |
| Error report (`lib/imports/error-report.ts`) | WRITTEN | Every row not ready, with the file's row number and the reasons. |
| Unit tests | TESTED | 100 of 100 passed (`tsx --test tests/*.test.ts`); 18 are new in this pass. |
| Shared constants | CHANGED | `UNITS`, `GST_RATES_BPS` and `slugify` moved to `lib/validation/catalogue-constants.ts` (no dependencies). `lib/validation/owner.ts` re-exports them, so existing imports are unchanged. |

Not verified in this pass:
- No page, route or action has been run in a browser or against a live Supabase project. Only the pure rules, the reader and the SQL suite have run.
- Filtered typecheck of the new files: one message remains, `Cannot find name 'Buffer'` in `read-spreadsheet.ts`. It is the same missing Node declarations condition as the filtered TS2591, reported under a different code because a local variable named `buffer` is in scope. A full typecheck with dependencies is still needed.
- `Next` and `zod` are not installed here, so `redirect` and the Zod schemas resolve to `any` in this check.
- Exported text cells are not neutralised in Excel; they are stored as text, not formulas. CSV exports use the formula-neutralising writer.

Design decisions for the owner:
- The brief's single "SKU" is split into "Product SKU" (product identity, for bulk product creation) and "Variant SKU" (variant identity, for bulk variant and price work). Both are required.
- Opening stock is not applied to existing variants; stock changes go through the stock adjustment screens.
- A blank product cell on a later row of the same product inherits the first row. A filled cell must match exactly.

## Guest wishlist and product comparison (2026-11-26, fourth pass)

| Item | Status | Notes |
|---|---|---|
| Migration `0025_guest_lists.sql` | APPLIED, SQL TESTED | `guest_wishlist_items` and `guest_compare_items`, one row per session and product. RLS on with no client grants. Trigger `app.guest_list_scope` refuses a product from another store, a session under another store, and a fifth comparison item. Suite `supabase/tests/guest_list_tests.sql` (G1 to G4) passes; the full `scripts/db.sh test` run exits 0. |
| Persistent guest-session lists | WRITTEN | Keyed to the existing HTTP-only guest cookie and `guest_sessions` row, so they survive refreshes for 30 days, the same lifetime as the cart. Isolated by store and session. |
| Wishlist page `/store/[slug]/wishlist` | WRITTEN, NOT BROWSER-TESTED | Photographs, prices, stock, empty, error and loading states. Remove, move one to cart, move selected to cart. Count shown in the header. |
| Move to cart | WRITTEN, REUSES CART | `addProductsToCart` plans with `planCartMoves` and adds each default variant, one unit, through the existing `addToCart` (price, stock and quantity checks). Products not added are reported with a reason and stay on the list. |
| Comparison page `/store/[slug]/compare` | WRITTEN, NOT BROWSER-TESTED | Up to four products. Brand, selling price, MRP, GST, material, finish, colour, dimensions, measurement unit, application, warranty, units in stock, and every specification key. Differing rows are highlighted and labelled for screen readers. Sticky attribute column; horizontal scroll on phones. Add selected to cart and remove. |
| Save and compare buttons | WRITTEN | Product cards and product detail pages (`ListToggle`, a client component with inline status). Buttons add only; removal is on the list pages. |
| Header counts and links | WRITTEN | `SiteHeader` takes optional `wishlistCount` and `compareCount`; the store layout supplies them. Existing callers are unchanged. |
| Product material | CHANGED | `material` added to the product select and to `ProductDetail` in `lib/services/storefront.ts`. The detail mapping moved into `toDetail`, used unchanged by `getProductDetail`. New `getProductDetailsByIds` loads products in the requested order. |
| Pure rules `lib/lists/compare-rules.ts` | TESTED | Comparison rows and difference detection, cart plan, UUID cleaning with a 50-item bulk limit, and a return-path check that keeps redirects inside the store. `tests/guest-lists.test.ts`, 7 cases. |
| Unit tests | TESTED | 107 of 107 passed (`tsx --test tests/*.test.ts`). |
| Filtered typecheck of changed files | One message: `key` on `<Spec>` on the product page, pre-existing, from missing React types in this sandbox. Not a full typecheck. |

Decisions and limits:
- Comparison and the wishlist use each product's default variant. Products with several sizes show the default size only; choosing another size still happens on the product page.
- The cart move adds one unit. Quantities are changed in the cart.
- Button feedback for the save buttons is per product. The product card does not know whether a product is already saved, so the button always reads "Save to wishlist"; saving an existing item is harmless.
- Tamil text is not yet translated for these pages.

Not started in this pass (still open, in the brief's order):
- Room visualizer, house project planner, Tamil and English switching, PWA, Supabase Realtime, Admin wizard and enforcement, checkout and GST, Unicode PDF, Stitch fidelity review, deployment documentation, and the full typecheck.

## Room visualizer (2026-11-26, fifth pass)

| Item | Status | Notes |
|---|---|---|
| Room photo storage | REUSED, UNCHANGED | Migration 0023 (`guest_room_photos`, `room_photo_attach`, `room_photo_remove`): session and store checked in the database, six photographs per guest, private bucket, signed URLs with a five-minute lifetime. |
| Labelled photo list | WRITTEN | `guestRoomPhotos` in `lib/services/guest-photos.ts` returns labels with signed URLs. The original `guestRoomPhotoLinks` is unchanged. |
| Upload with progress and errors | WRITTEN, NOT BROWSER-TESTED | `components/guest/room-photo-uploader.tsx` uses XMLHttpRequest for a progress bar. Photos over 4 MB are scaled down in the browser (long edge 2,400 px, JPEG), because the hosting request limit is about 4.5 MB. Server checks type and size. |
| Upload route | WRITTEN | `app/store/[slug]/visualizer/upload/route.ts`. Refuses cross-origin posts, creates the guest session, and can replace a photograph: the new one is stored first, then the old one is removed. |
| Replace and delete | WRITTEN | Replace from the uploader's selector. Delete form calls the database function, which checks session ownership. |
| Interactive preview | WRITTEN, NOT BROWSER-TESTED | Drag to move, corner handle to resize, rotation and opacity sliders, width and height sliders, keyboard arrows on the selected overlay, repeated tile pattern with tiles-across control, match tile proportions from the variant size label, reset, remove. Touch uses pointer events with `touch-action: none` on the overlay only, so the page still scrolls. |
| Before and after | WRITTEN | "Compare with original" slider reveals the original photograph on the left of a divider. |
| Product switching | WRITTEN | Several products can be placed; the selected one is edited. Category filter. Products without a photograph show a brand-coloured tile. |
| Shopping integration | WRITTEN | Variant choice, quantity, unit price, availability, GST estimate. Add to cart sends lines to `addVisualizedToCartAction`, which calls the existing `addToCart` for each line, so the cart's price, stock and public-product checks apply. |
| Cart line parsing | TESTED | `lib/visualizer/lines.ts`: rejects malformed JSON, non-UUIDs, non-integer or out-of-range quantities, more than 12 lines. Combines repeated variants up to 999. `tests/visualizer-lines.test.ts`, 5 cases. |
| Retry safety | WRITTEN | Each page render gets a submission id. A successful add records it in a store-scoped cookie (last 10). Resubmitting the same form adds nothing. A submission where every line is refused is not recorded, so it can be corrected. |
| Geometry | TESTED | `lib/visualizer/geometry.ts`: clamping inside the photograph, size limits, rotation normalisation, aspect ratio, tile background size, split. `tests/visualizer-geometry.test.ts`, 8 cases. |
| Tile calculator link | WRITTEN | Opens the existing calculator with the selected variant's price. The calculator is not pre-filled with the tile size, because variants do not carry box coverage. |
| Navigation | WRITTEN | "Visualizer" in the desktop and mobile header. |
| Unit tests | TESTED | 119 of 119 passed. |
| Filtered typecheck of changed files | Clean | Not a full typecheck. |

Clearly described limits (also shown on the page):
- Placement is by eye. The app does not know the room's size, so tile scale is set by the guest, not measured.
- No AI or photorealistic rendering is performed. The overlay blends with the photograph using a multiply blend mode.
- Adding to a construction project is NOT implemented. It depends on the project planner, which is not built yet. The page says so.
- Signed photograph links last five minutes; a page left open longer needs a reload.
- Photograph labels are entered at upload. Renaming is not implemented.

Not done in this pass: the house project planner, Tamil and English support, PWA, Realtime, Admin, checkout and GST, PDF, Stitch review, deployment documentation, and the full typecheck.

## House Project Planner (2026-11-26, sixth pass)

- Migrations 0026 (projects, rooms, room-wise items, database-backed request keys, scope trigger) and 0027 (visualizer_project request kind). Applied; migrate is idempotent.
- Guest pages: /store/[slug]/projects (list and create) and /store/[slug]/projects/[projectId] (estimate, details, rooms, products, quantities, suggested boxes, size or finish changes, cart and quotation actions).
- Room types: living room, bedroom, kitchen, bathroom, dining room, balcony, parking area, outdoor area, custom. Dimensions in ft, m, cm or mm.
- Budget: integer paise, GST added on top, room totals, within, near (85%) or exceeded status. Estimates use current catalogue prices and are not confirmed order prices.
- Box suggestions come from the room area with 10% wastage, only when the room has length and width and the product records coverage. The guest can always override them.
- Visualizer: "Add to Construction Project" keeps placed products, sizes and quantities; the visualizer cart now uses database-backed keys instead of a cookie.
- Quotation requests from a project or room go through the existing quotation RPC; the store prices them.
- Tests: SQL H1-H6 (rolled back); unit tests tests/house-project-budget.test.ts (7). Not yet run in a browser.

## Planner gaps, localisation and PWA foundation (2026-11-26, seventh pass)

Planner gaps (Priority 0)
- Projects link added to the desktop and mobile header.
- Product picker at /store/[slug]/projects/[id]/products: server-side search, category and brand filters, sorting, and 12 items per page. Adding a product goes through a server action that validates the variant and that it is purchasable.
- The old in-page variant dropdowns were removed; room and project add actions link to the picker.
- Visualizer "Add to Construction Project" parses its target through a tested helper (tests/planner-targets.test.ts).
- Migration 0028 adds leased, attempt-fenced request keys (attempt and lease_expires_at), guest_request_steps (one row per cart line) and a keyed quotation RPC, planner_quotation_request, that takes a transaction advisory lock. A stale claim is reclaimed only by compare-and-swap on the attempt number. Lines that started before an interruption are reported as uncertain and are not retried.
- Tests: SQL H1-H6 (house projects) and IK1-IK6 (idempotency, rolled back) registered in scripts/db.sh test. Unit tests: house-project-budget (7), planner-targets (4).
- Not verified: a live Supabase run of the RPC from the application client; concurrent requests from two browsers.

Localisation (Priority 1, partial)
- Root layout provides LocaleProvider and sets html lang (en-IN or ta-IN). Noto Sans Tamil is loaded through next/font with the Tamil subset.
- Language switch: /api/locale sets zb_lang and redirects to a validated same-site path.
- Dictionaries: lib/i18n/messages/en.ts is the source; ta.ts is Partial and falls back to English. Keys are typed with MessageKey.
- Translated so far: site header, planner pages, status labels and PWA messages. Remaining guest pages are still English (listed in CONTINUATION.json).
- Owner-entered names, brands and descriptions are never translated.

PWA (Priority 2, foundation)
- public/manifest.json: standalone, scope and start_url "/", lang en-IN, theme #6A0D2A. Icons: 192 and 512 PNG (any), 512 maskable PNG, apple-touch-icon 180 PNG, and the SVG icon.
- public/sw.js (cache zentro-pwa-v1): precaches /offline.html, the manifest and icons. Caches only /_next/static/ responses and precached paths, and only when the request has no query string. Navigations are network-first and are never written to a cache; if offline, the offline page is served. Old zentro-pwa caches are deleted on activation. The worker does not take over until the guest asks for an update (SKIP_WAITING).
- public/offline.html: bilingual static page. It lists the actions that need a connection and does not show any account data.
- components/pwa/pwa-shell.tsx, mounted in the root layout: registers the worker in production only; shows the update banner, the online/offline and reconnect notices, and the install prompt. The native prompt is used where the browser offers beforeinstallprompt. iOS Safari (not other iOS browsers) gets Add to Home Screen instructions. The prompt is hidden when the app is already standalone and after dismissal (localStorage flag zb_install_dismissed).
- lib/pwa/support.ts holds the pure device helpers; tests/pwa.test.ts (12 tests) checks the manifest, icon files, precache entries, caching rules and the device helpers.
- Not verified: install on Android Chrome, desktop Chrome or iOS Safari; offline behaviour in a browser; Lighthouse audit.
- Security: no customer, payment, order, quotation, owner, admin, store or signed-URL response is cached. No financial action is queued offline.

Verification in this pass
- Unit tests: 151 pass (tsx --test tests/*.test.ts).
- SQL: house-project and idempotency suites were run with scripts/db.sh test before the PWA step; no migration was changed in this pass.
- Not performed: a full TypeScript typecheck with dependencies installed, next build, and browser testing.

Manifest reconciliation
- The baseline before the visualizer round is 343 entries (prev-SOURCE_MANIFEST.before-sixth.txt). The visualizer round added 10 and the planner round 10, giving 363. The earlier "353" figure has no verified checkpoint and is not used. The earlier INCOMPLETE ZIP was overwritten before it was preserved; the 16:14 checkpoint is the earliest preserved copy from this round.

## Guest translation pass 2 (2026-11-26, eighth pass)

- Translated: storefront homepage (app/store/[slug]/page.tsx) and cart (app/store/[slug]/cart/page.tsx). Keys home.* and cart.* added to en.ts and ta.ts.
- Pages converted to createTranslator(currentLocale()) on the server. Amounts still use formatINR, which already prints Western digits with Indian grouping in both languages; the currency symbol is locale-neutral.
- Tests: tests/guest-translation-coverage.test.ts (5) checks that each key used by a translated page exists in both dictionaries, that Tamil placeholders match English, and that Tamil text is in Tamil script. Full unit suite: 156 pass.
- Still English (not started in this pass): QR welcome, category and catalogue pages, search and filters, product details, wishlist, comparison, tile calculator, room visualizer body, planner components, checkout and payment instructions, order confirmation and tracking, quotation request, status and share pages, refund pages, form validation and error messages, empty, loading and success notices, and the cart line and coupon components.
- Localisation is therefore NOT complete. The Tamil wording is a draft and needs native-speaker review before commercial launch.

## Guest translation batch 3 (2026-11-26, ninth pass)

- Translated: catalogue and category page (search, brand and sort filters, pagination, empty state), cart line (quantity and remove labels, price line), coupon form, add-to-cart button, wishlist and compare toggle labels, and the product card (stock badge, view details). Shared keys added under common.*, catalogue.*, line.*, coupon.*, list.*.
- ProductCard is now async and reads the locale on the server. Checked: no client component imports it.
- Tamil placeholders were checked by test; one Tamil string with swapped placeholders was found by review and corrected.
- Tests: tests/guest-translation-coverage.test.ts now covers 8 files. Unit suite: 156 pass.
- Still English: product details, wishlist and compare pages, tile calculator, room visualizer, planner components, checkout and payment instructions, order pages, quotations, refunds, service-returned messages (FormMessage text from actions), validation and error messages, loading and success notices.

## Live status updates (2026-11-26, tenth pass)

Decision: Supabase Realtime is not used for Guest or Owner status. Guests are identified by an HTTP-only session cookie, not by Supabase Auth, so a Guest Realtime subscription would need anonymous read access to private tables, which the brief forbids. Status is delivered by authorised server polling instead. Realtime can be added later for Owner users (who have Supabase Auth) behind row-level policies; this has not been built or tested.

- Guest endpoint GET /api/store/[storeSlug]/status: the signed-in guest's own orders (payment and order status, paid time), quotations (number and status) and refund requests (request status and linked refund status). Each query filters by store and guest session. With no session the response is empty. Responses are private and no-store.
- Owner endpoint GET /api/owner/status: exact counts for the owner's store only: incoming orders (PLACED), cash pending (CASH_PENDING), online pending (PENDING or PROCESSING), new quotations (REQUESTED), refund requests (submitted). The store comes from the active owner membership, never from the request.
- Client: components/realtime/use-status-poll.ts polls with a 10-second interval when visible and 60 seconds when hidden. Failures back off to two minutes. Polling pauses while the tab is hidden and resumes on focus or the online event. Duplicates are ignored by fingerprint. The request is aborted on unmount.
- Order page: OrderStatusPoller now polls the status endpoint and refreshes the server-rendered page only when the snapshot changes. It shows a live, reconnecting or offline indicator. The old five-second full-page refresh is removed.
- Owner pages: OwnerStatusBar in the portal layout shows the five counts and the connection state.
- Payment confirmations still come only from verified webhook or payment records. The client never receives payment state directly and never treats a notification as payment proof.
- Tests: tests/realtime-policy.test.ts (5) covers the timing, backoff, connection state and change detection. tests/realtime-security.test.ts (7) checks that no client opens a subscription or references a service key, that snapshots select no customer or payment-identifier fields, that every guest query is session-scoped, and that owner counts are store-scoped. Unit suite: 168 pass.
- Not verified: live polling in a browser, offline and reconnect behaviour, and any hosted Supabase test. No database migration was added in this pass.

## Admin store onboarding (2026-11-26, eleventh pass)

- Migration 0029 (applied, idempotent): store_onboardings holds one draft per new store. The store link and owner link cannot change once set (trigger, errcode 42501). A completed onboarding must have a store, an owner and a completion time (check). step_data refuses any text containing "password". RLS allows platform admins only.
- Wizard at /admin/onboarding (list, start, resume) and /admin/onboarding/[id]?step=n. Eight steps: store information, owner account, business and tax, branding, subscription, feature flags, store QR, review and activation. Completed steps can be revisited; later steps stay locked until reached.
- Every save writes a draft first. Step 1 creates the store as a draft once; a losing concurrent create removes its own store and reports a reload. Step 2 creates the owner once through the shared service lib/services/owner-accounts.ts, which the Owners page now also uses (its behaviour and messages are unchanged). A retry reuses the linked owner. The password is read in the action, passed to account creation and discarded.
- Step 3 stores the GSTIN and state on the store; billing address and the price-includes-GST flag are kept in the draft only. Step 4 uses the existing media pipeline (setMediaImage) for logo and banner; both are optional. Step 5 creates one subscription and reuses it on retry. Step 6 upserts feature flags. Step 7 creates the showroom QR once.
- Activation (step 8) is the only path that moves a store from draft to active. It rechecks the owner link, the active subscription that covers today (Asia/Kolkata date), the showroom QR and the other steps. Repeating it changes nothing.
- Rules: lib/onboarding/rules.ts (no dependencies; tests/onboarding-rules.test.ts, 4 tests). Field schemas: lib/onboarding/schemas.ts (zod; tests/onboarding-schemas.test.ts, 7 tests, which need the project's zod dependency).
- SQL tests: supabase/tests/onboarding_tests.sql (O1 to O5), registered in scripts/db.sh test. Passed on the local PostgreSQL 16 database.
- Structural tests: tests/onboarding-security.test.ts (7 tests).
- Not built in this pass: subscription expiry enforcement and product or user limits at runtime, subscription renewal, QR analytics, role editing, onboarding audit records beyond the store and owner entries (store.onboarded and owner.created are written), and the Admin dashboard figures. User limits are not part of the plan model.
- Not verified: the wizard in a browser, file uploads through the wizard, and the zod schemas, because zod is not installed in this sandbox.

## Runtime subscription enforcement (2026-11-26, twelfth pass)

| Item | Status | Notes |
| ---- | ------ | ----- |
| Migration `0030_subscription_enforcement.sql` | APPLIED, SQL TESTED | Explicit plan limits (`max_users`, `users_unlimited`, `products_unlimited`; a null limit without its flag is refused). Store state (legacy, active, upcoming, expired), feature check, product and user quota triggers under per-store advisory locks, `public.renew_subscription` (platform admin only, keeps history), RPC wrappers `zb_subscription_state` and `zb_feature_allowed`. |
| SQL suite `supabase/tests/subscription_enforcement_tests.sql` (SE1–SE8) | PASSED | State classification, expired and upcoming refusal, legacy unaffected, product quota with archive release, store isolation, user quota, plan and flag feature restriction, renewal authorisation and history, renewal queued after the current period. |
| Pure policy `lib/entitlements/rules.ts` | TESTED | State, coverage, expiry countdown, upcoming-expiry window, quota and feature decisions, IST date. `tests/entitlement-rules.test.ts`, 13 cases. |
| Central service `lib/services/entitlements.ts` | WRITTEN | `assertFeature`, `assertSubscriptionActive`, `getSubscriptionState`, `listSubscriptionHistory`, `entitlementErrorFrom`. Fails closed when the check cannot run. |
| Wired into | WRITTEN | Quotation save and send (`quotations`), House Project Planner creation (`house_project_planner`), product creation and owner linking (limit messages from the database). |
| Renewal action | CHANGED | Calls `renew_subscription` and records the previous subscription id in the audit entry. The old action overwrote the current period and lost history. |
| Feature keys | CHANGED | `house_project_planner` and `bulk_imports` added to `FEATURE_KEYS` and the onboarding labels. |
| Documentation | WRITTEN | `docs/SUBSCRIPTIONS.md`: states, limits, enforcement points, expiry policy, renewal, limitations. |
| Dev seed | CHANGED | Plans carry explicit user and product limit flags. |

Correction: the twelfth-pass summary said that no POS or Room Visualizer server code exists. That was wrong. My search used the spelling "visualiser" and the POS table name `pos_sales`; the code uses "visualizer" and `pos_bills`. Both modules exist (see the next section).

Not done in this pass: upcoming-expiry indicator on the admin screen, remaining quota display, legacy-store migration allowance, role editing (D), QR analytics (C), dashboard aggregates (E), business fields in onboarding (A), and checkout, GST and PDF work (priorities 2–5).

## Subscription gates on existing modules (2026-11-26, thirteenth pass)

Priority 0 finding: POS, Room Visualizer, House Project Planner, bulk import, purchasing, suppliers, tile batches and quotations all exist. Files: `app/owner/(portal)/pos/`, `lib/services/pos.ts`, `app/store/[storeSlug]/visualizer/`, `lib/visualizer/`, `lib/services/house-projects.ts`, `app/owner/(portal)/products/import/`, migrations 0010, 0012, 0014, 0016, 0019, 0023, 0026–0028. Earlier checkpoint manifests still list them.

| Item | Status | Notes |
| ---- | ------ | ----- |
| POS save, scan, coupon and place | WRITTEN | `pos_billing`. Cancel stays available. |
| Visualizer add to cart and add to project | WRITTEN | `room_visualiser`. Photo removal stays available. |
| Bulk import preview and confirm | WRITTEN | `bulk_imports`. |
| Purchase orders (create, receive) and supplier creation | WRITTEN | `purchase_orders`. |
| Tile batch creation | WRITTEN | `tile_batches`. Stock corrections are not gated. |
| House Project Planner, quotations | WRITTEN (earlier) | `house_project_planner`, `quotations`. |
| Plan limits in the admin form | WRITTEN | Product and user limits, explicit unlimited flags, default user limit 5. Plan list shows both limits. |
| Structural gate tests | TESTED | `tests/entitlement-wiring.test.ts`, 14 cases. |

Verification: unit suite 206 passing; the zod-blocked onboarding schema file is reported separately. `scripts/db.sh test` exits 0. Filtered parse check of the changed files: no syntax errors (TS1xxx). Remaining messages are missing-module noise.

## Legacy-store policy and remaining subscription work (2026-11-26, fourteenth pass)

| Item | Status | Notes |
| ---- | ------ | ----- |
| Migration `0031_legacy_store_policy.sql` | APPLIED, SQL TESTED | Table `subscription_migration_allowances` (platform admin only). States: active, upcoming, expired, allowance, setup, unsubscribed. `store_commerce_allowed`. Activation trigger on `stores`. Allowance grant and revoke functions (max 90 days). One-time 30-day allowance for active stores without subscriptions at deployment. |
| SQL suite SE1–SE13 | PASSED | Adds unsubscribed refusal, allowance window and lapse, setup and activation refusal, catalogue-over-plan refusal, administrator-only grants and the 90-day bound. `scripts/db.sh test` exits 0. |
| Pure policy `lib/entitlements/rules.ts` | TESTED | New states, `COMMERCE_STATES`, `ACTIVE_STORE_CONTEXT`. `tests/entitlement-rules.test.ts`, 15 cases. |
| Commerce gate | WRITTEN | `checkCommerce` and `assertSubscriptionActive` (active or allowance only). Applied to guest orders (`placeOrder`), POS placement and owner quotation save. Cancellation, refunds, payments and reads of existing records are not gated. |
| Admin allowances | WRITTEN | Grant and revoke actions (audited), form and list on the subscriptions page. |
| Admin state indicators | WRITTEN | Each assignment shows its state, days left and an expiring-soon warning (14 days). |
| Plan editing | NOT DONE | Plans can be created with limits and unlimited flags. Editing existing plans is still missing. |
| Current usage and remaining quota | NOT DONE | Needs per-store counts on the subscriptions page. |
| Inventory, product edits | DECIDED | Core operations. Governed by subscription state and quotas only. No feature key. |
| Reports and exports | NOT GATED | No feature key exists. Adding one needs a migration of existing flags. |
| Structural tests | TESTED | `tests/entitlement-wiring.test.ts`, 18 cases. |

Verification: unit suite 212 passing, zod-blocked onboarding schema file reported separately. `scripts/db.sh test` exits 0. Filtered parse check: no TS1xxx errors.

Not done in this pass: plan editing UI, usage and remaining-quota display, reports feature key, onboarding business information (priority 2), QR analytics (3), roles (4), dashboard aggregates (5), checkout beyond the commerce gate (6), GST (7), technical items (8), localisation and Stitch (9), deployment docs (10).

Verification: `scripts/db.sh test` exits 0 with SE1–SE8 passing. Unit tests: 192 pass; `tests/onboarding-schemas.test.ts` (7) remains blocked by the missing zod dependency and is not counted.

## Fifteenth pass: plan editing, usage and reports gating

- Plan editing: `updatePlanAction` validates with `planSchema`, saves name, description, price, limits, unlimited flags, feature switches and active state, and writes an audit row with before and after values. Create also stores description and feature switches.
- Usage and remaining quota: the Assignments table reads `zb_subscription_usage()` and shows products and users in use, with near-limit and limit-reached warnings.
- Reports: the reports layout and the export route refuse when the `reports` feature is disabled. Invoices and refunds stay accessible.
- Duplicate TS allowance audit calls removed; the database writes the audit row.
- Verification: unit tests 34/34 pass; syntax parse check shows no TS1 errors; database suite (SE1–SE13, SP1–SP6 and earlier suites) exits 0. Browser and hosted tests not run.

## Sixteenth pass: onboarding business information (Priority 1)

- Migration 0033: store legal and tax profile (legal name, category, description, billing address, GST registration, price-includes-GST); seller snapshots on invoices and quotations, captured at creation and frozen; owner edits to the legal profile refused by trigger; atomic `onboarding_create_store` RPC; backfill of existing documents from current store details, once.
- Migration 0034: RPC applies the default brand colour when none is supplied.
- Onboarding: store creation goes through the atomic RPC (the compensating delete is removed); owner-link recovery removes an account only when it is not linked; step 3 persists the full legal and tax profile including GST registration; category and description persist; drafts resume with their values.
- Admin store screen edits the legal profile; owner Settings shows it read-only; storefront shows legal name and business description.
- Invoice and quotation PDFs use the snapshot; the store's current details are used only when no snapshot exists.
- Tax calculations are unchanged. GST registration and price-includes-GST are stored for the GST release and need professional confirmation.
- Verification: database suite exits 0 (new tests B1–B7 in supabase/tests/onboarding_business_tests.sql, all earlier suites pass); unit suite 217 of 218 pass, the one failure being the zod-dependent schema file (dependency-blocked, as before); pure GST rules 4 of 4 pass; the onboarding structural test was updated to the atomic design. Browser and hosted verification not run; full TypeScript check not run.
- Known pre-existing diagnostic: TS18046 at lib/quotations/pdf-response.ts (quotationErrorResponse catch block), unchanged by this pass; visible only without installed types.

## Seventeenth pass: QR analytics and tax assumptions

- Migration 0035 (applied): store-specific QR entry tokens; tracked entry events with dedupe (30 minutes, configurable); order attribution (24 hours, configurable, one attribution per order, cancelled orders excluded); owner and platform summary, daily and store-comparison functions with authorisation checks (SQL test suite Q1 to Q12).
- Tracked entry route `/q/{token}` records the entry through a security-definer function, then redirects to the storefront. Inactive, hidden or unknown targets are not recorded.
- Generated QR images encode the tracked link. Previously printed plain storefront codes keep working and are not counted.
- Owner analytics (`/owner/qr/analytics`): totals, unique-session estimate, repeat entries, today, last 7 days, month to date, attributed and paid orders, paid value, net after refunds, conversion estimate, daily trend and table, CSV and Excel export. Gated by `qr_scan_analytics`.
- Admin QR page: period and store filters, platform totals, daily trend, store comparison merged into the existing showroom QR table, CSV and Excel export. Existing generate and activate controls are kept. The scan-log stub is removed.
- Owner QR page links to analytics; the stub text is removed.
- Privacy: guest-session identifiers are used only inside the database. Exports and pages carry aggregates only. Export datasets are unit-tested for session-like values.
- Wording: metrics are described as tracked link openings, not verified physical scans. Conversion is an estimate and shows "Not enough data" when there is no basis.
- Documentation: `docs/QR_ANALYTICS.md` (tracking, dedupe, attribution, metrics, privacy, limitations) and `docs/TAX_ASSUMPTIONS.md` (the seven confirmed tax assumptions; tax-inclusive calculation remains inactive).
- Limitation found and recorded: the database function checks store membership only; the entitlement is checked in the owner layout and export route.
- Verification: database suite `scripts/db.sh test` exits 0 (onboarding B1 to B7 and QR Q1 to Q12 included). Unit suite (tsx node:test over tests/*.test.ts): 227 entries reported, 226 pass; the one failure is `tests/onboarding-schemas.test.ts`, which cannot load `zod` (not installed) and is dependency-blocked, not a regression. QR unit tests (`tests/qr-entry.test.ts`, `tests/qr-analytics.test.ts`): 9 of 9 pass. Parse check on the new QR files reports no syntax errors (TS1xxx).
- Not verified: no browser run of the redirect route or the new pages; export files not opened in Excel; no full TypeScript check (node_modules absent); no hosted Supabase or Razorpay verification.
- Not started: Priority 2 roles and permissions, Priority 3 Admin dashboard, Priority 4 transaction-safe checkout, Priority 5 GST, Priority 6 technical items, Priority 7 localisation, Priority 8 Stitch fidelity, Priority 9 deployment preparation.

## Eighteenth pass: roles and permissions (partial)

- Migration 0036: permission catalogue (18 keys); per-member grants table, readable by members and writable only through RPCs; default permission sets; `app.has_store_permission` (active membership required); `zb_my_store_permissions`; `zb_set_store_member_access` and `zb_set_store_member_active`; last-owner trigger on `store_owners` (covers direct writes); QR analytics permission and subscription entitlement enforced in the database (`app.qr_analytics_allowed`).
- Migration 0037: `zb_store_members` (member listing for the staff page, membership-checked).
- Migration 0038: managers may add or remove only permissions they hold; replaces the access RPC.
- Staff page `/owner/staff`: member list, role and permission editing with confirmation, activation and deactivation, account creation for manager, staff or owner (owners only create owners). Gated by the staff management permission. Added to owner navigation.
- Services: `lib/authz/permissions.ts` (pure), `lib/services/staff.ts`; `createOwnerAccount` accepts permissions and an actor type; audit entries record shop_owner actions.
- Tests: SQL `supabase/tests/permission_tests.sql` P1 to P14 (owner, manager and staff rules, cross-store, inactive memberships, self-change, last owner, manager limits, direct-write privileges, unknown keys, user quota, audit, member listing, removal outside authority). All pass. Unit `tests/permissions.test.ts` (7 pass), including a check that the catalogue matches migration 0036.
- Verification: database suite `scripts/db.sh test` exits 0. Unit suite 234 entries, 233 pass, 1 dependency-blocked (`tests/onboarding-schemas.test.ts`, zod not installed). Parse check with an alias-mapped typecheck: no errors in the new code other than sandbox artifacts (modules not installed here: `server-only`, `next`, `zod`; Node types absent).
- Not done (Priority 1 remains open): backend permission checks in the database or server actions for the other modules (products, POS, orders, refunds, cash, purchasing, suppliers, customers, credit, quotations, reports and exports); durable owner-account provisioning and reconciliation (request IDs, provisioning state, safe retries, reconciliation screen); concurrency tests; browser verification of the Staff page.
- Known limitation: the Staff page is not rendered in a browser. The owner account service still creates Auth, profile and membership in separate steps.

## Nineteenth pass: permission enforcement (Priority 1, partial)

- Migration 0039: sensitive RPCs gated by store permission; server-only financial functions not callable by client sessions.
- Migration 0040: default grants seeded for new manager/staff memberships; backfill for existing ones.
- Owner portal: page, action and route gates per module; navigation filtered by effective permissions; access-denied page added.
- Authorisation tests M1-M9 pass (run as authenticated role). Database suite exits 0.
- Unit suite: 233 of 234 pass; the remaining test is dependency-blocked (zod not installed).
- Duplicate i18n keys removed (en.ts, ta.ts).
- Not done: service-role path review, status-bar and report data gating, concurrency tests, browser verification, Priorities 2 to 9.

## Twentieth pass: Priority 1 closed

- Migration 0041: last-owner guard serialised by the store row (race verified); pos_set_coupon under pos_billing; dashboard metrics filtered by permission; direct table writes and sensitive reads permission-based.
- Migration 0042: storage policies follow permissions; storage helper executable by authenticated (previously blocked every write).
- Migration 0043: subscription gate functions guarded and not executable by anon.
- Application: POS coupon action, owner status counts and bar, dashboard tiles, all filtered by permission.
- Verified: database suite exit 0; two-session races pass; RPC exposure audit clean; unit suite 233 of 234 (one dependency-blocked).
- Not started: Priorities 2 to 9.

## Twenty-first pass: permission follow-ups closed; account provisioning (Priority 1 extension)

- Migrations 0044 to 0046 (applied): durable provisioning requests and events; state transitions; `zb_prov_*` wrappers granted to service_role only; manager limits (staff only, held permissions only).
- Services: `lib/provisioning/states.ts` and `orchestrator.ts` (pure, injected store and Auth adapter); `lib/services/provisioning.ts` (server-only RPC store and Auth adapter; no deletion path).
- `createOwnerAccount` now delegates to provisioning; Auth account deletion on failure removed. Onboarding owner step links through the database and no longer deletes accounts. Staff form accepts a request key.
- Reconciliation UI `/admin/provisioning`: search, status filter, details, history, resume (password not stored), confirm uncertain Auth outcome, link existing (platform admin, email match), cancel.
- Permission follow-ups: concurrent permission-edit harness and revocation harness (both pass); `scripts/db.sh concurrency` runs all four harnesses.
- Tests: `tests/provisioning.test.ts` (13, simulated Auth and store); `supabase/tests/provisioning_tests.sql` (PV1-PV16) registered in `scripts/db.sh test`.
- Docs: `docs/PROVISIONING.md` (new); `docs/ROLES_PERMISSIONS.md` (follow-up results, final integration checklist).
- Verified here: database suite exit 0; four concurrency harnesses pass; unit suite 246 pass, 1 dependency-blocked (zod); typecheck of new files shows environment-only errors.
- Not verified: hosted Supabase Auth; browser RLS; browser use of reconciliation UI; full Next.js build.
- Not started: Priority 2 (Admin dashboard completion) through Priority 9 (deployment preparation).

## Twenty-second pass: provisioning gaps closed; platform dashboard (Priority 1 of the current brief)

Provisioning gaps:
- Migration 0047 (applied): a reused request key with different details is refused (`key_reused`); every resume re-checks the stored actor's authority (`forbidden`); linking an existing account needs a verified email, the request email retyped, no active membership elsewhere, and a note.
- Staff form sends a stable request key. Errors after an attempt carry the key back so a retry replays the same request; a `key_reused` refusal starts a new key.
- Reconciliation UI: retyped-email field and specific refusal messages.
- Report services: every exported report function, and `buildDataset`, checks the caller's session for `reports_exports` before using the service-role client (`lib/services/report-access.ts`).
- Local auth stub gains `email_confirmed_at` (hosted Supabase has it).

Platform dashboard:
- Migration 0048 (applied): `zb_admin_dashboard(from, to, store)` returns store, subscription, merchant, activity and trend figures in one platform-admin-only call; volatile because it materialises one temp table.
- Service `lib/services/admin-dashboard.ts`; page `app/admin/(portal)/page.tsx` with date-range and store filters, loading state, error states, and empty states; section D reuses the existing QR analytics loader.
- Revenue rules: gross order value excludes cancelled orders; collected is payments paid in the period; refund-adjusted = collected minus refunds processed in the period; subscription plan value is never called collected.
- Tests: `supabase/tests/admin_dashboard_tests.sql` (D1–D6), `supabase/tests/provisioning_hardening_tests.sql` (H1–H5), unit tests for provisioning (16), report guard (3), dashboard helpers (6).

Verified here: database suite exit 0 (migrations 0001–0048, all suites); four concurrency harnesses pass; unit suite 258 pass with one dependency-blocked file (zod); typecheck of new and changed files shows only environment errors (Node, React, Next, server-only declarations).
Not verified: hosted Supabase Auth; browser RLS; the dashboard and reconciliation pages in a browser; full Next.js build; Razorpay.
Not started: Priority 2 (transaction-safe Guest checkout), Priority 3 (GST), Priority 4 (technical items), Priority 5 (localisation), Priority 6 (Stitch fidelity), Priority 7 (deployment preparation).

## Twenty-third pass: transaction-safe Guest checkout (Priority 1, first slice)

- Migration 0049 (applied): `guest_checkout_requests` (idempotency claims scoped to store and Guest session; a row is committed only with its order); `guest_checkout_place(store, session, request_key, plan)` places a Guest order in one transaction (cart lock, plan-versus-cart match, live price, GST rate and arithmetic checks, coupon redemption, stock reservation, cash attempt, cart conversion); `guest_checkout_attach_payment` attaches an online provider order after commit, idempotently. Both server-only.
- Service `lib/services/checkout.ts` now makes one RPC call; the Razorpay order is created after the commit and attached afterwards. The previous compensating deletes are removed.
- Checkout form and action carry a per-attempt request key; a refusal caused by changed details issues a new key.
- Tests: `supabase/tests/guest_checkout_tests.sql` (G1–G7), registered in `scripts/db.sh test`.
- Verified here: `scripts/db.sh test` exit 0 (migrations 0001–0049); unit suite 258 pass, one dependency-blocked file (zod); typecheck of checkout files shows no errors beyond the environment set.
- Not verified: Razorpay test mode; browser checkout; concurrency of the new placement under two sessions (harness not yet written).
- Found and not yet fixed: `expire_stale_payments` releases stock for expired orders but does not reverse coupon redemptions, and an online order whose provider order was created but not attached has no record that a later payment could be matched to.

## Twenty-fourth pass: checkout slice 2 (payment initialisation, expiry, late payments)

- Migration 0050 (applied): `payment_initialisations` (one per order; status calling, created, attached, refused, uncertain, amount_mismatch, expired; provider order id; lease; safe error; reconciliation status) and `payment_initialisation_attempts` (history). `guest_payment_init_claim` records intent before any provider call; `guest_payment_init_finish` records created, refused or uncertain; `guest_payment_init_attach` attaches a created order; a lapsed lease becomes uncertain and is never repeated automatically.
- `guest_payment_init_reconcile`: platform administrator only, requires a note; adopts a provider order id or confirms no order exists.
- `late_payments`: verified money that could not be applied automatically (after cancellation, after reservation expiry, amount mismatch, provider order not attached, unmatched provider order). Owners see their store's rows; platform administrators see unmatched rows. `late_payment_decide`: owner or administrator decision, once, with a note. No money moves in that function.
- `settle_online_payment` now records each verified payment it cannot apply, once (unique by provider and payment id), instead of returning 'unknown_payment' and dropping it.
- `expire_stale_payments` now releases coupon redemptions on expired orders (once), marks initialisations expired without losing provider order ids, and keeps the existing stock release.
- Checkout service: provider initialisation through the claim, finish and attach steps; the Razorpay call happens only on a fresh claim; a 4xx refusal (excluding 408 and 429) is recorded as refused, anything else as uncertain.
- Browser payment verification (`app/api/payments/razorpay/verify`): fetches the payment from Razorpay and requires a captured payment for the same order, amount and INR before settling.
- Tests: `supabase/tests/payment_recovery_tests.sql` (R1–R10), registered in `scripts/db.sh test`.
- Verified here: `scripts/db.sh test` exit 0 (migrations 0001–0050, all suites); unit suite 258 pass, one dependency-blocked file; checkout and provider files typecheck except for environment errors (server-only declaration, Buffer type).
- Not verified: Razorpay test mode (no provider call made); the verify route against a live provider response; the uncertain-outcome path against a real timeout.
- Still open in Priority 1: concurrency harnesses for the eight listed scenarios (none written yet for the new functions); cash confirmation integration and invoice exactly-once tests; House Project Planner and Room Visualizer reconciliation; Guest and Owner screens for payment states and late-payment review; a late-payment refund request path (decisions are recorded but refunds are not yet created); a Guest retry action for refused or uncertain initialisations (the database supports a user retry; the UI does not call it).

## Twenty-fifth pass: checkout slice 3 (late-payment refunds, outcome classification, races)

- Migration 0051 (applied): refund type `late_payment` (refunds constraint replaced); `late_payments.refund_id`; `late_payment_refund_request` (owner only, one refund per late payment, refuses unattributed, unmatched, non-late or mismatched payments); `app.finalize_refund` gains a late-payment branch that changes no payment, order, stock or coupon state; `settle_online_payment` links a late verified payment to its expired attempt; `zb_admin_dashboard` no longer subtracts late-payment refunds from revenue.
- Migration 0052 (applied): checkout fingerprint excludes the payment window, which the database now sets from the store's `payment_expiry_minutes`. A retry of the same request previously produced a different fingerprint and was refused as key reuse; this was found by the new race harness.
- `lib/payments/outcome.ts` (pure): only 400, 401 and 403 with a provider error body are refusals; every other failure, including all other 4xx, is uncertain and is reconciled, never retried. `RazorpayApiError` carries whether the provider body was present. Unit tests: `tests/payment-outcome.test.ts`.
- `lib/services/late-payments.ts`: decision (no money) and refund request through the existing `sendToGateway` claim, with a request key derived from the late payment.
- Races: `scripts/concurrency/checkout_race.sh` (A same-key duplicate, B final unit of stock, C settlement against expiry, D concurrent provider claims, E concurrent attachment), registered in `scripts/db.sh concurrency`. All pass with the four existing harnesses.
- SQL tests: `supabase/tests/late_refund_tests.sql` (L1–L7), registered in `scripts/db.sh test`.
- Verified here: `scripts/db.sh test` exit 0 (migrations 0001–0052); `scripts/db.sh concurrency` all five harnesses pass; unit suite 263 pass, one dependency-blocked file.
- Limits: race C exercised only the late branch (the reservation had already expired), not settlement winning the race; the paid branch is covered by sequential tests only. The race harness does not yet cover cash confirmation, invoice generation or coupon limits.
- Not done: the Guest and Owner payment screens and the Platform Admin reconciliation screen; the owner-facing call to `requestLatePaymentRefund`; reports 0020, 0021 and 0035 still sum all succeeded refunds without excluding late-payment refunds (the dashboard was corrected, the reports were not); cash confirmation and invoice tests; House cart reconciliation; GST and everything after.

## Twenty-sixth pass: report separation, payment reconciliation screens, Guest payment states

- Migration 0053 (applied): `report_summary`, `report_trend`, `report_refund_tax` and `zb_qr_summary` exclude `refund_type = 'late_payment'` refunds. New `report_late_payment_reconciliation` reports late receipts, open late payments, late refunds succeeded and pending. Migrations 0020, 0021 and 0035 are not modified.
- `supabase/tests/late_report_tests.sql` (LR1–LR4): exact deltas for ordinary and late refunds across summary, trend, refund tax and QR; reconciliation totals exact. Registered in `scripts/db.sh test`.
- Owner Payments screen (`/owner/payments`, permission `refund_management`): summary cards from the reconciliation function; tabs for online payments, pending cash, failed or uncertain starts, late payments and late-payment refunds; order-number search, status and date filters, pagination, empty and error states. Late-payment decisions (refund, fulfil where permitted, dismiss) and the late-payment refund start call the existing services. Every query is scoped to the owner's verified store.
- Platform Admin Payments screen (`/admin/payments`): unmatched verified payments (display only, no money action, since store attribution is required), uncertain or mismatched starts with attempt history, unattached provider orders, late-payment cases (display only; owners decide). Reconciling a start needs a dashboard-check confirmation, an evidence note, and for adoption a provider order id; `guest_payment_init_reconcile` then `guest_payment_init_attach`; an audit row is written. No action marks a payment paid.
- Guest order page: one state from `lib/payments/guest-payment-state.ts` (cash awaiting, paid, starting, ready, pending, failed, refused, uncertain, under review, reservation expired, cancelled, late receipt, refund requested, processing, completed, review). Pay controls only for an attached provider order inside the reservation. Retry (`retryOnlinePayment`) only after a definite refusal, through the existing claim with `p_user_retry`. Polling stops only in terminal states.
- Unit tests: `tests/payment-reconciliation-filters.test.ts` (6), `tests/guest-payment-state.test.ts` (8). Unit suite: 279 tests, 278 pass, 1 dependency-blocked (`tests/onboarding-schemas.test.ts`, zod not installed).
- Verified here: `scripts/db.sh test` exit 0 (migrations 0001–0053, all suites); `scripts/db.sh concurrency` all harnesses pass including the five checkout races. Changed-file type checks show only environment errors (missing React, Next and server-only declarations).
- Not verified: rendering of any new screen in a browser; hosted Supabase; Razorpay test mode; PDF or CSV export of corrected figures; real provider outcomes for retry.
- Not done from the brief: Guest Tamil and English copy for the states (the localisation pass); concurrency races for coupon limit, settlement versus cancellation, settlement winning against expiry, concurrent cash confirmation and concurrent invoice generation; cash confirmation and invoice exactly-once tests; checkout pricing recomputation review; House Planner and Visualizer cart reconciliation with `guest_request_keys`; GST; technical items; Stitch fidelity; deployment preparation.

## Twenty-seventh pass: checkout concurrency, cash and invoice verification, pricing recomputation, provider-order check

- Migration 0054 (applied): `app.line_tax` (GST-compatible line tax in paise, `round(taxable × rate_bps / 10000)`). `guest_checkout_place` recomputes every line price, discount allocation, taxable value, tax and total on the server from live prices and `app.cart_coupon_allocation`, and refuses any plan field that differs (`plan_mismatch`). `ensure_invoice` locks the order row before issuing, so concurrent issuers cannot skip or duplicate a number.
- Migration 0055 (applied): `confirm_cash_payment` refuses a cancelled order (P0001).
- `supabase/tests/cash_invoice_tests.sql` (CI1–CI8): authorised confirmation, unauthorised and cross-store refusal (42501), guest refusal, duplicate refusal with no second stock movement, wrong amount refused, repeat invoice issuance returns the same invoice and consumes no number, cancelled order refused.
- `supabase/tests/checkout_pricing_tests.sql` (P1–P6): understated tax, tampered coupon allocation, stale price, correct coupon plan accepted once, replay after the cart is cleared returns the committed order, changed plan under the same key refused.
- `scripts/concurrency/checkout_race.sh`: six new overlapping-session scenarios, all passing with A–E: F settlement wins against expiry (paid once, stock consumed once); G expiry wins against settlement (one late payment, stock released); H settlement racing cancellation (one consistent outcome, no duplicate refund); I coupon at its usage limit (one order carries the last use); J concurrent cash confirmation (one payment, one confirmation, one invoice); K concurrent invoice generation (one invoice, counter advanced by exactly one).
- Both new SQL test files registered in `scripts/db.sh test`.
- Admin adopt path (`lib/services/payment-reconciliation.ts`): before any database change, the provider order is read by its exact id (`GET /orders/{id}`, `fetchRazorpayOrder` in `lib/payments/razorpay.ts`) and compared with the stored attempt by `lib/payments/provider-order-evidence.ts`: id, amount in paise, currency INR, receipt equal to the order number, and status created, attempted or paid. A failed lookup or any mismatch changes nothing. The dashboard checkbox and evidence note are no longer sufficient. Unit tests: `tests/provider-order-evidence.test.ts` (6).
- Verified here: `scripts/db.sh test` exit 0 (migrations 0001–0055, all suites including the two new ones); `scripts/db.sh concurrency` all harnesses pass (A–K); unit suite 285 tests, 284 pass, 1 dependency-blocked (`tests/onboarding-schemas.test.ts`, `zod` not installed, network off).
- Type checks (`/tmp/tsconfig.payments.json`): remaining diagnostics are environment-only (no React, Next, Node or server-only type declarations; JSX `key` errors follow from the missing React JSX types). One real implicit-any in `lib/services/checkout.ts` was annotated.
- Settlement after subscription expiry: `settle_online_payment` does not consult the subscription. An order created while the subscription was active still settles, so money received is recorded and not discarded. Verified by reading the function; not yet covered by a dedicated test.
- Permissions: owner payment and late-payment screens require `refund_management`; cash confirmation stays with `cash_confirmation` on the existing owner cash page. No permission was broadened.
- Not done from Priority 1: House Planner and Room Visualizer reconciliation is partial. Each planner line is recorded before it is added (`claimStep`/`finishStep`), failed and uncertain lines are reported, and started lines are never repeated; the request as a whole is not one transaction. Also not done: a written unmatched-payment attribution procedure, a settlement-after-expiry test, a Guest order status test on the TypeScript side, and the Tamil and English copy. Priority 1 is therefore not source-complete.
- Not verified: browser rendering of the new screens; hosted Supabase; Razorpay test mode (the order endpoint shape and status values are taken from Razorpay's documented Orders API and must be confirmed in test mode); Node type check with installed dependencies.

## Twenty-eighth pass: Priority 1 closed (source-complete); GST not yet started

**A. Cart steps (migration 0056).** `guest_cart_add_line` is now the only cart mutation path (`addToCart` uses it, so concurrent adds of one variant serialise under row locks). `guest_cart_add_step` performs the cart change and the request-step completion in one transaction: a failure after the cart change rolls back both (test C6). Legacy `started` steps are reported as uncertain and never replayed. `guest_request_progress_set` persists created project and room ids, so a retried Visualizer project request no longer creates a second project. `lib/planner/cart-step-outcome.ts` classifies database answers (takeover, refusal, unknown outcome).
- Tests: `supabase/tests/cart_step_tests.sql` (C1–C10, rolled back), concurrency scenarios L (overlapping adds to one line: quantity exact) and M (one step submitted twice: added once), `tests/cart-step-outcome.test.ts` (5).

**B. Unmatched payments (migration 0057).** `attributeUnmatchedPayment` fetches the exact provider payment and order, verifies status, currency, amount, the linked provider order, the receipt and the local order, then calls `unmatched_payment_attribute`. Ownership comes from the local order row, never from the administrator. Still-payable orders are settled through `settle_online_payment`; others go to the owner's late-payment queue. `confirm_no_order` was removed: refusing an attempt reopened checkout while a first provider payment might exist. Procedures and manual-investigation cases: `docs/PAYMENT_INVESTIGATION.md`.
- Tests: `supabase/tests/unmatched_attribution_tests.sql` (UA1–UA7).

**C. Subscription expiry.** `supabase/tests/subscription_expiry_settlement_tests.sql` (SX1–SX6): after expiry, new commerce is refused (the `orders` commerce guard), an existing online order settles once with one stock movement and one invoice, a duplicate settlement is a no-op, and cash for an order taken before expiry is confirmed after expiry, once.

**D. Guest payment status.** Row-to-facts conversion moved into `lib/payments/guest-payment-state.ts` (`paymentFactsFromRows`) and used by `getGuestOrder`, so tests exercise the real conversion. `tests/guest-order-view-states.test.ts` covers the twelve required states and checks Pay and Retry are offered only where the underlying state allows. Payment-state copy moved from a local map into `payState.*` keys in `lib/i18n/messages/en.ts` and `ta.ts`; the page reads it through the existing translator. `tests/payment-copy.test.ts` checks every state has both languages and matching placeholders. Session isolation: `getGuestOrder` and the status snapshot filter on store and guest session; verified by code reading, not by a runtime cross-session test.

**E. Regression (run here).**
- `scripts/db.sh test`: exit 0, no errors, migrations 0001–0057, all suites including the four new files.
- `scripts/db.sh concurrency`: exit 0; checkout races A–M all pass (13 scenarios).
- Unit suite: 306 tests, 305 pass, 1 dependency-blocked (`tests/onboarding-schemas.test.ts`: `zod` not installed; network off).
- Type checks: new and changed files are in the TypeScript program (`--listFiles`). Remaining diagnostics are environment-only: missing React, Next, Node and Supabase client types (`possibly null` after `notFound()`/`redirect()`, implicit any on untyped Supabase rows, JSX `children`/`key`). One real implicit-any in `checkout.ts` was annotated. These environment diagnostics are the subject of Priority 3's "accurate Supabase database types" item and have not been suppressed.

**Priority 1 status: source-complete.** External items pending, not verified here: Razorpay test mode (order and payment endpoint shapes and status values, see `docs/PAYMENT_INVESTIGATION.md`), hosted Supabase, browser rendering of the new screens, a runtime cross-session isolation test over HTTP, and native-speaker review of the Tamil payment-state copy (drafted here).

**Not started: Priority 2 (GST).** No GST migration or interface work was begun in this pass; it is the next objective.

## Twenty-ninth pass: Priority 2 started (GST first slice); Priorities 2 (remainder) to 6 open

**Done in this pass (source and tests run here).**
- Migration `0058_gst_module.sql` (new; 0001–0057 unchanged): `gst_state_codes` (37 codes, union territory flag and regime); `app.gstin_problem` (format, state code and check digit; format validation only, not registration verification); `app.store_gst_mode` (`taxed`, `not_collected` for composition or unregistered, `invalid_profile` for a regular store without a valid GSTIN); `app.gst_components` (CGST and SGST or UTGST for intrastate supply, IGST for interstate; components always add up to `app.line_tax`); `stores.state_code`; order and line component snapshots; `guest_checkout_place` redefined with the tax policy and place of supply.
- Behaviour change: Guest checkout no longer charges GST for composition or unregistered stores. A regular store with an invalid GSTIN cannot take orders (refused with a message, not silently untaxed). Taxed and composition checkouts require a place of supply.
- Development seed: store GSTINs corrected to values with valid check digits (the earlier values failed the check digit).
- `lib/gst/policy.ts` (new, pure): the same state list, GSTIN check, store mode and component split in TypeScript. `lib/pricing.ts` gains `taxCollected`. `lib/services/cart.ts` reads the store's tax mode for the cart totals. `lib/services/checkout.ts` sends `supply_state_code` and maps the new refusals. `lib/validation.ts`, the checkout action and `components/guest/checkout-form.tsx` add a required customer-state selector.
- `docs/TAX_ASSUMPTIONS.md`: GST slice described; assumptions listed for review by a qualified Indian tax professional.
- Tests: `supabase/tests/gst_module_tests.sql` (G-1 to G-9, rolled back; registered in `scripts/db.sh test`); `tests/gst-policy.test.ts` (10). Existing test plans now carry `supply_state_code` (`supabase/tests/*` plan builders and `scripts/concurrency/checkout_race.sh`).

**Verified here.**
- `scripts/db.sh test`: exit 0, no ERROR lines, GST groups G-1 to G-9 all reported ok.
- `scripts/db.sh concurrency`: exit 0; checkout races A–M all pass after the plan change.
- Unit suite: 316 tests, 315 pass, 1 dependency-blocked (`tests/onboarding-schemas.test.ts`, `zod` not installed, network off).
- Type check (`/tmp/tsconfig.payments.json`): diagnostics in changed files are environment-only (`server-only`, Node types, missing `zod` types and the implicit-any that follows from them).

**Not done in Priority 2 (open).**
- Owner settings screen for GSTIN, registration class and state code; the Guest-facing GST breakdown display.
- Tax-inclusive pricing (`prices_include_gst` still has no effect).
- Coupon interaction tests for the component split (the line-level discount and tax check is unchanged and tested by existing suites).
- POS and quotation tax and quotation conversion; purchase GST records and input tax credit distinction; refund tax allocation and credit notes; invoice GST fields and numbering review; GST reports and CSV, Excel and PDF exports.
- Statutory e-invoicing, e-way bill and GST return filing: not implemented and not claimed.

**Not started: Priorities 3, 4, 5, 6.** External verification (Razorpay test mode, hosted Supabase, browser rendering, native Tamil review) remains pending as recorded in the twenty-eighth pass.

## Thirtieth pass: GST pricing mode (first step of section A); rest of Priority 2 and Priorities 3–6 open

**Done.**
- Migration `0059_gst_pricing_mode.sql` (new): `app.line_amounts` gives taxable value, tax and payable total for one line from its discounted gross amount. Exclusive: GST added on top. Inclusive: taxable value extracted from the price, nothing added. Not collecting (composition, unregistered): the configured price is payable, with no GST extracted or added. Guard `orders_pricing_mode_guard`: an inclusive-pricing store that collects GST cannot place orders; the refusal is explicit (`pricing_mode_unsupported`).
- `lib/gst/policy.ts`: `lineAmounts` mirrors `app.line_amounts`. `lib/services/checkout.ts` maps the new refusal to a clear message.
- Tests: `supabase/tests/gst_pricing_mode_tests.sql` (P-1, P-2; registered in `scripts/db.sh test`); `tests/gst-pricing-mode.test.ts` (7), with the same exact values as the SQL test.

**Verified.** `scripts/db.sh test` exit 0 (GST G-1–G-9, P-1–P-2 all ok). `scripts/db.sh concurrency` exit 0. Unit suite 323 tests, 322 pass, 1 dependency-blocked (`zod`).

**Known gaps, stated plainly.**
- Inclusive pricing is not calculated end to end. Checkout refuses inclusive taxed stores, but the cart preview still shows exclusive figures for them. This mismatch is open and must be fixed before inclusive stores are offered.
- Coupon allocation, POS, quotations, purchases, refunds, invoice fields, Owner and Admin GST configuration screens, Guest GST breakdowns and reports are not started. The original brief's sections A (remainder), B through L, and Priorities 3 through 6 are open.

## Thirty-first pass: Guest inclusive pricing end to end; GST breakdown on Guest cart and checkout

**Done.**
- Migration `0060_inclusive_guest_pricing.sql` (new): the pricing policy is now implemented in `guest_checkout_place`. Discount is calculated on the gross customer-paid amount first (coupon allocation unchanged), then tax is extracted (inclusive) or added (exclusive) on what remains. The ledger stays tax-exclusive so the existing invariant `total = subtotal - discount + tax` holds for every mode. New order columns `gross_subtotal_paise` and `gross_discount_paise` keep the coupon basis. `guest_redeem_coupon` checks the gross basis. `app.gst_split` splits any line's tax into CGST, SGST, UTGST or IGST. The channel guard `orders_pricing_mode_guard` is narrowed: it refuses inclusive, GST-collecting orders unless the channel is online with a guest session. POS stays refused.
- `lib/pricing.ts` (`priceCart`): calculates the same ledger and line values. Options: `taxCollected`, `inclusive`. Non-collecting stores keep the configured price payable.
- `lib/services/cart.ts`: the cart preview reads the store's tax mode and pricing mode, so it matches checkout. `CartView.pricingMode` added.
- `components/guest/gst-breakdown.tsx` (new): reusable breakdown. Shows only applicable rows; no GST row for stores that cannot collect it; labels come from the caller (i18n).
- Cart and checkout pages use the breakdown. Keys `gst.breakdown.*` added to `en.ts` and `ta.ts` (Tamil drafts flagged for native review).
- Tests: `supabase/tests/gst_pricing_mode_tests.sql` (P-1 to P-5: spec examples, inclusive checkout, inclusive with 10% coupon, tampered inclusive plan, POS refusal); `tests/pricing-inclusive.test.ts` (6 exact-value cases, including ₹1,180 inclusive = ₹1,000 + ₹180 and exclusive ₹1,180 + ₹212.40 = ₹1,392.40). Existing pricing tests unchanged and passing.

**Verified.** `scripts/db.sh test` exit 0 with no ERROR lines. Unit suite 329 tests: 328 pass, 1 dependency-blocked (`tests/onboarding-schemas.test.ts`, `zod` not installed).

**Not done (next steps, in order).**
1. Remove the remaining POS refusal by integrating POS billing with `app.line_amounts`, `app.gst_split` and the ledger convention in migration 0060. Until then, POS for inclusive stores is refused by design.
2. Quotations (Guest and Owner): same policy; persist tax snapshots; explicit acceptance when conversion would change amounts.
3. Owner and Admin GST configuration screens (classification, GSTIN, state, pricing mode, warnings, audit).
4. Place-of-supply rules for pickup, local delivery, interstate delivery and registered-business purchases; the checkout currently uses one customer-state field.
5. Guest breakdown rows for CGST, SGST, UTGST and IGST at checkout (the component supports them; the page does not yet supply them).
6. Exact-value tests for the Guest and POS consistency comparison, and for quotation conversion.

## Thirty-second pass: POS GST integration (Priority 2, slice 3)

**Built.** POS bills now use the same pricing policy as Guest checkout.
- `supabase/migrations/0061_pos_gst_pricing.sql` (new; 0001–0060 untouched). `pos_bills` gains `fulfilment_mode` (`in_store` default, or `delivery`), `delivery_state_code` (required for delivery) and `buyer_gstin`. `orders` gains `customer_gstin`.
- `pos_set_tax_details(bill, fulfilment, delivery_state, buyer_gstin)`: owner or manager only, held bills only. It validates the GSTIN format through `app.gstin_problem` and the delivery state, then reprices the bill and returns the quote.
- `app.price_pos_bill` (redefined): the store's tax mode from `app.store_gst_mode` (an invalid profile is refused with `gst_profile_incomplete`); place of supply is the store's state for in-store sales and the recorded state for deliveries; composition stores are refused for interstate supply; per line, `app.line_amounts` and `app.gst_split` (CGST+SGST, UTGST, or IGST). Coupon basis unchanged: it applies to the gross after line discounts. Ledger totals stay tax-exclusive (`total = subtotal − discount + tax`). The quote carries the gross columns, the coupon allocation, pricing mode, supply and store states, and component totals.
- `pos_place_bill` (redefined from 0010): stores the tax snapshot, place of supply, components (order and line), gross columns and buyer GSTIN. Invoice totals come from the same ledger figures. The POS path sets a transaction-local marker (`app.pos_gst_path`) and clears it straight after the order insert, so the guard admits only this path.
- `app.guard_pricing_mode` (redefined): inclusive taxed orders are refused when they carry a `quotation_id` (quotation conversion is not integrated yet); the online guest path is kept; POS is admitted only through `pos_place_bill`; every other direct inclusive insert is refused. This replaces the blanket POS refusal.
- POS bill screen (`app/owner/(portal)/pos/[billId]/`): new `tax-details-form.tsx` (in-store or delivery, delivery state, buyer GSTIN) and `setTaxDetailsAction`. The totals panel now uses the shared `GstBreakdown` component (English labels), showing only the applicable rows.

**Tests (all passing).**
- `supabase/tests/gst_pos_tests.sql` (registered in `scripts/db.sh test`): POS-A inclusive ₹1,180 → taxable ₹1,000, GST ₹180 (CGST 90, SGST 90), payable ₹1,180, with the invoice total; POS-B exclusive ₹1,180 → GST ₹212.40, payable ₹1,392.40; POS-C inclusive ₹1,180 with 10% coupon → taxable ₹900, GST ₹162, payable ₹1,062, coupon redemption on the gross basis (₹118.00); POS-D non-collecting store → GST ₹0, payable ₹1,180; POS-E interstate delivery to Karnataka → IGST ₹180; POS-F union territory intrastate → CGST ₹90 + UTGST ₹90; POS-G composition store refuses interstate delivery (at save time and in the pricer); POS-H invalid profile refused, bill left held; POS-I missing delivery state and malformed GSTIN refused; POS-J direct inclusive inserts refused, including quotation-bearing orders; POS-K held bill repriced to the current setting.
- Guest and POS consistency: POS-A to POS-D use the same exact amounts as the Guest cases in `gst_pricing_mode_tests.sql` (P-1, P-2, P-3) and `tests/pricing-inclusive.test.ts`. This is an equality of expected values, not a live run of both paths against one cart.
- `gst_pricing_mode_tests.sql` P-5 now asserts that direct POS-channel inclusive inserts outside `pos_place_bill` are refused (the integrated path is tested by the POS suite).
- Existing POS, checkout, invoice, refund, quotation and concurrency suites all pass unchanged.

**Verified.** `scripts/db.sh test` exit 0 (no ERROR lines; all groups including G-1..G-9, P-1..P-5, POS-A..POS-K). `scripts/db.sh concurrency` exit 0. Unit suite 329 tests: 328 pass, 1 dependency-blocked (`tests/onboarding-schemas.test.ts`, `zod` not installed in this environment).

**Type check (changed POS and GST files, `/tmp/tsconfig.changed.json`).** 292 diagnostics, none caused by this change's logic. 254 are `JSX.IntrinsicElements` (React types not installed). The rest are missing modules (`react`, `next/*`, `zod`, `@supabase/*`), `process` and `Buffer` (Node types), `server-only`, and implicit-any that follows from missing types. Four diagnostics need explaining rather than dismissing: `actions.ts` lines 124, 216, 277 ("lacks ending return") and 158 ("used before being assigned") occur because `redirect` from `next/navigation` cannot be resolved here, so the compiler cannot see that it never returns; `gst-breakdown.tsx` line 71 (`key` on `Row`) is the same missing-React-types issue; `lib/services/owner.ts` line 51 predates this pass. A syntax error I introduced in the bill page was found by this check and fixed.

**Not done / open.**
1. Quotation GST integration (Guest and Owner) has not started. Until it does, inclusive quotation conversions are refused by the guard, which is the safeguard the brief asks to keep.
2. Held-bill repricing is verified in the database. The bill screen shows the recalculated totals but has no explicit "prices changed since this bill was held" notice yet.
3. POS invoices carry the ledger totals only; CGST, SGST, UTGST and IGST are stored on the order and its items but not printed on the invoice.
4. POS has no delivery charge; `delivery_paise` is zero for POS bills.
5. Guest place of supply is still the customer's selected state even for pickup orders. POS uses the store's state for in-store sales. This inconsistency is open and must be fixed in the Guest place-of-supply workstream.
6. Owner and Admin GST configuration screens, Guest CGST/SGST/UTGST/IGST rows at checkout, purchases, refunds and credit notes, GST invoice fields, reports and exports, and Priorities 3–6 remain.

## Thirty-third pass: deployment preparation and documentation (source level)

**Changed.**
- `lib/env.ts` `appUrl()`: production no longer falls back to `http://localhost:3000`. `NEXT_PUBLIC_APP_URL` is required in production (it throws a named error otherwise). Preview deployments may use `VERCEL_URL`. Local development keeps the localhost default. This protects QR codes and payment links.
- `.env.example`: removed the optional e-mail and WhatsApp variables, which no code reads. Comments state that `NEXT_PUBLIC_APP_URL` is required in production and that the simulator must not be used in Vercel Production.
- `docs/SCREEN_ROUTE_MAP.md`: marked superseded (its proposed routes do not match the application).
- `README.md` rewritten for the current state; `START_HERE.md` added.
- New guides: `docs/UI_FIDELITY_REPORT.md`, `docs/LOCAL_SETUP_GUIDE.md`, `docs/SUPABASE_SETUP.md`, `docs/RAZORPAY_SETUP.md`, `docs/GITHUB_SETUP_GUIDE.md`, `docs/VERCEL_DEPLOYMENT_GUIDE.md`, `docs/TROUBLESHOOTING.md`, `docs/FINAL_PROJECT_STATUS.md`.

**Checked against source.** Cron routes require `CRON_SECRET`; the Razorpay webhook verifies `x-razorpay-signature`; the simulator is refused when `NODE_ENV` or `VERCEL_ENV` is production; the payment-expiry job releases reservations of expired online orders; the orphan job removes unclaimed uploads older than 24 hours; migrations are applied by `psql` through `scripts/db.sh`, not the Supabase CLI; there is no sign-up call and no password-reset route; the first Platform Admin is a `platform_admins` row, set by SQL.

**Stitch review.** Source-level only. The export holds 41 screens; the 52-screen brief list has 11 admin screens with no reference. Stitch's palette differs from the approved palette, which the application follows. No screen was rendered or compared pixel by pixel.

**Not verified in this pass.** `npm install`, type check to completion, lint, production build, browser rendering, responsive widths, PWA install, hosted Supabase, Razorpay, Vercel deployment.

**Tests.** Unit: 328 pass, 1 blocked (`zod`). Database and concurrency suites were run in the thirty-second pass and not affected by this pass's changes (`lib/env.ts` is not used by SQL).

## Thirty-fourth pass: Stitch UI implementation (source level, first slice)

**Changed (existing files only; no new routes, no backend, permission or GST changes).**
- Guest header: mobile link row replaced by a fixed five-item bottom bar (Home, Products, Projects, Cart with count, Orders). `app/store/[storeSlug]/layout.tsx` gains bottom padding below `md`.
- Guest home: two-column hero at `md` and above; same copy keys and links.
- Product and cart thumbnails: products without a photo show `public/placeholders/product-placeholder.svg`, labelled as a demonstration placeholder. One new file.
- Owner portal: sidebar grouped into Overview, Sales & cash, Catalogue & stock, Partners and Store; sticky at `lg`. Permission filter, hrefs and sign-out unchanged. Owner login restyled into a card.
- Admin portal: sidebar restyled (gradient, sticky, focus outline). Items and sign-out unchanged.

**Not done.** Category-specific placeholder images (floor tiles, wall tiles, doors, taps and so on); categories index page; checkout, payment-waiting and order-tracking layouts; product-detail gallery; wishlist feedback; comparison, calculator, visualizer and planner restyles; the owner dashboard, product, inventory, POS, orders, quotations, suppliers, customers, reports, QR and settings restyles; admin dashboard, analytics and remaining admin screens; standard loading, empty and error states; responsive review at 390, 768, 1024, 1440 and 1920 px.

**Verification.** Source-level change only. No rendered or browser comparison was made, and no responsive test was run. Unit suite: 328 pass, 1 blocked (`zod` not installed here). Type check of the changed files shows no diagnostics in the changed files; other diagnostics are environment-only. Database and concurrency suites were not re-run, because this pass changed no SQL. Details: `docs/UI_FIDELITY_REPORT.md` section 0.

## Thirty-fifth pass: category illustrations (source level)

- Ten distinct local SVG demonstration illustrations under `public/placeholders/`, each labelled as a placeholder.
- `lib/guest/placeholder-art.ts` selects one by category name; used by `BrandedTile` and `ProductThumb`.
- Uploaded photographs still take precedence. No Google-hosted URL is used.

**Not done in this pass:** owner dashboard redesign, admin dashboard redesign, owner and admin list and form restyles, checkout, payment-status and order-tracking layouts, product-detail gallery restyle, search and filter redesign, and responsive review at all five widths. Nothing has been viewed in a browser.

## Thirty-sixth pass: owner dashboard, checkout, order tracking, admin dashboard, product page (source level)

**Changed.** Owner dashboard redesigned with real metrics, alerts, a month-to-date daily paid-sales chart, recent orders and permission-gated quick actions. Guest checkout restructured (steps, sticky summary, payment option cards) with server logic unchanged. Order page gained a status timeline. Admin dashboard gained a quick-action strip and refined shared stat cards. Product page gained a sticky purchase column and stock pill.

**Not done.** Pickup and delivery selection at checkout (not supported by the current checkout). Per-order detail page for owners (no route exists). Responsive, browser and Stitch visual verification at all five widths. Restyling of owner list pages beyond the dashboard, the Admin analytics and remaining admin pages, and the category index.

**Verification.** Unit suite: 328 pass, 1 blocked (`zod` not installed). Type check: changed-file list extended to all new and changed UI files; diagnostics are environment-only (see `docs/UI_FIDELITY_REPORT.md` section 0.2).

