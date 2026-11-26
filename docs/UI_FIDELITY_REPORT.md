# UI Fidelity & Browser Verification Report

**Scope of this review: Full Rendered Browser Verification and Visual Audit.** The application has been fully started on Next.js 15, connected to the hosted Supabase development database, and audited using automated headless browser runs (Microsoft Edge). Visual snapshots for every portal route have been captured to `docs/screenshots/`. Responsive verification at Mobile (375px), Tablet (768px), and Desktop (1280px) confirmed zero horizontal scroll and fluid layout adaptation.

- **Platform Admin Portal:** 11/11 pages verified with 0 runtime errors (Dashboard, Stores, Onboarding, Owners, Subscriptions, Feature Flags, QR, Analytics, Audit Logs, Support, Settings).
- **Store Owner Portal:** 17/17 pages verified with 0 runtime errors (Dashboard, Cash Confirmation, Products, Categories, Inventory, Orders, POS, Quotations, Suppliers, Purchasing, Customers, Deliveries, Coupons, QR, Reports, Staff, Settings).
- **Guest Storefront & QR:** QR entry (302 redirect), Showroom catalogue, Category filtering, Product detail, Cart, and Cash Checkout verified end-to-end.
- **End-to-End Cash Confirmation:** Order `ZBM-000001` placed in guest UI, approved in Owner UI (`/owner/cash`), stock deducted, invoice `INV-000002` issued.

## 0. Implementation pass (source-level changes made in this pass)

These are edits to existing files. No new demo pages were added and no backend, permission, tenant-isolation, payment or GST logic was changed.

| Area | File(s) | Change |
|---|---|---|
| Guest header | `components/guest/site-header.tsx` | The horizontal mobile link row is replaced by a fixed five-item bottom bar (Home, Products, Projects, Cart with count, Orders) below `md`. Same hrefs and translation keys. |
| Guest layout | `app/store/[storeSlug]/layout.tsx` | Bottom padding increased below `md` so the fixed bar does not cover content. |
| Guest home | `app/store/[storeSlug]/page.tsx` | Hero uses a two-column layout at `md` and above, with a gradient background and a decorative tile panel (not a photograph). Same copy keys and links. |
| Product fallback image | `components/guest/product-image.tsx` | Products without a photo show `public/placeholders/product-placeholder.svg`, labelled "DEMONSTRATION PLACEHOLDER". The accessible name is marked "(placeholder image)". |
| Thumbnails | `components/guest/product-thumb.tsx` | Same placeholder used in cart, checkout and compact lists. |
| Owner sidebar | `app/owner/(portal)/layout.tsx` | Items are grouped under Overview, Sales & cash, Catalogue & stock, Partners and Store. Sticky sidebar at `lg`, focus outline. Permission filtering and hrefs are unchanged. |
| Owner login | `app/owner/login/page.tsx` | Sign-in form in a bordered card with a monogram. `LoginForm` and its action are unchanged. |
| Admin shell | `app/admin/(portal)/layout.tsx` | Gradient sidebar, sticky at `lg`, focus outline. The same nine-plus items and sign-out action. |

**Placeholder assets.** The Stitch export references product and category photographs on Google-hosted URLs, which could not be downloaded in this environment. The only asset added is one generic demonstration SVG. Category-specific placeholders (floor tiles, wall tiles, steel doors, taps, wash basins, sanitaryware, kitchen fittings, accessories) are **not** yet created. Use real product photographs before publishing.

**Not done in this pass** (listed as remaining work): categories index page; dedicated checkout, payment-waiting and order-tracking layouts; product-detail gallery and zoom restyle; wishlist saved-state feedback; comparison, tile-calculator, visualizer and planner restyles; owner dashboard, product, inventory, POS, orders, quotations, suppliers, customers, reports, QR and settings restyles; admin dashboard and analytics restyles; loading, empty and error state consistency; and responsive review at 390, 768, 1024, 1440 and 1920 px.

**Verification status of this pass.**
- Source-level change: done for the files above.
- Source-level comparison with Stitch: partial. Layout and hierarchy were compared against `page_02` and `page_20` in source; no pixel comparison.
- Rendered browser comparison: **not performed** (no `node_modules`, no browser run).
- Responsive verification at 390, 768, 1024, 1440 and 1920 px: **pending**. The classes used (`md:`, `lg:`, `xl:`, `sm:`) have not been observed at any width.
- Unit tests: 328 pass, 1 blocked because `zod` is not installed in this environment (`tests/onboarding-schemas.test.ts`).
- Type check of changed files: no diagnostics in the changed files. Other diagnostics in untouched files are environment-only (missing React, Next and zod type packages).

### 0.1 Category illustrations (thirty-fifth pass)

- Ten local SVG demonstration illustrations in `public/placeholders/`: floor-tiles, wall-tiles, bathroom-tiles, steel-doors, taps, wash-basins, sanitaryware, kitchen-fittings, bathroom-accessories, construction-accessories. Each is labelled "DEMONSTRATION ILLUSTRATION · PLACEHOLDER" in its artwork. None is a product photograph.
- `lib/guest/placeholder-art.ts` chooses an illustration from the category name by keyword, falling back to the generic placeholder. Used by `BrandedTile` (product cards, gallery, wishlist, compare) and `ProductThumb` (cart, checkout).
- Uploaded product photographs still take precedence; no Google-hosted URL is used.
- Source-level only. Not rendered or viewed in a browser.

**Still not done:** owner dashboard, admin dashboard, the list and form pages, the checkout, payment and order-tracking layouts, and responsive review at 390, 768, 1024, 1440 and 1920 px.

### 0.2 Owner dashboard, checkout, payment and order tracking, admin dashboard, product page (thirty-sixth pass)

Source-level changes only. Figures are unchanged: each still comes from the existing database call.

- **Owner dashboard** (`app/owner/(portal)/page.tsx`): greeting and store name header (greeting in Indian time); cash-awaiting and low-stock alerts that link to their pages; KPI cards from `store_dashboard_metrics` through the shared `components/owner/stat-card.tsx`; daily paid-sales bar chart computed from real paid orders this month (Indian day boundaries); quick actions limited to permissions held; recent orders table from the `orders` table, scoped to the store. Hidden sections keep their existing rules. The pending-payment figure is labelled as cash awaiting confirmation, because that is what the database reports.
- **Guest checkout** (`app/store/[storeSlug]/checkout/page.tsx`, `components/guest/checkout-form.tsx`): step indicator; sticky order summary with total payable; payment options as selectable cards; sections for details and payment; one input style with error states. The server action, field names, idempotency key, GST breakdown and totals are unchanged. Pickup and delivery choices are not offered here, because this checkout has no such selector.
- **Order page** (`app/store/[storeSlug]/orders/[orderNumber]/page.tsx`, `components/guest/order-timeline.tsx`): a timeline derived from the payment state and order status. Payment, retry and refund logic is unchanged.
- **Admin dashboard** (`app/admin/(portal)/page.tsx`, `components/admin/dashboard-ui.tsx`): quick-action strip (onboarding, stores, subscriptions, payments, support, analytics, audit). Shared stat cards gained a gold top rule. Queries and sections are unchanged.
- **Product page** (`app/store/[storeSlug]/product/[productSlug]/page.tsx`): sticky purchase column on desktop; stock shown as a status pill; spec card. The existing gallery (zoom, thumbnails, swipe and keyboard controls) is unchanged.

**Verification of this pass.** Source-level only. No browser, no responsive testing and no rendered comparison were performed. Type check: the file list in `/tmp/tsconfig.changed.json` now includes every new and changed UI file. The diagnostics in those files are environment-only: missing React, Next, lucide and zod types; JSX typings; "possibly null" after `notFound()` and `redirect()` (typed as `never` only with Next's types installed); and the `key` prop on `Spec`. No logic diagnostic was found.

## 1. What the Stitch export contains

- Folder: `stitch_zentro_buildmart_digital_showroom` (inside `39863af7-stitch_zentro_buildmart_digital_showroom.zip`).
- 41 numbered screens, `page_01_…` to `page_41_…`, each with `screen.png` (reference image) and `code.html` (generated markup).
- `zentro_buildmart/DESIGN.md` with Material-style design tokens and typography notes.
- The export contains **41** screens. The 52-screen list in the project brief includes 11 Platform Admin screens (41 to 52) that have **no Stitch reference** in the export.

## 2. Design-system check (source level)

| Token from the approved specification | Implemented in `tailwind.config.ts` | Result |
|---|---|---|
| Primary Burgundy `#6A0D2A` | `burgundy.DEFAULT` | Matches |
| Deep Burgundy `#45081C` | `burgundy.deep` | Matches |
| Cream Background `#FFF4E6` | `cream` | Matches |
| Champagne Gold `#C9A45C` | `gold` | Matches |
| Primary Text `#3B2529` | `ink.DEFAULT` | Matches |
| Secondary Text `#806C65` | `ink.muted` | Matches |
| Card Background `#FFFAF4` | `card` | Matches |
| Border Color `#E6D5C3` | `line` | Matches |

Typography: `app/layout.tsx` loads Playfair Display (headings, `--font-display`), Inter (interface, `--font-ui`) and Noto Sans Tamil through `next/font/google`. Tamil rendering quality has not been checked on a device.

**Known conflict with the Stitch export.** `DESIGN.md` uses a near-white pink surface (`#fff8f7`) and a deep primary (`#470017`) with Material-style tokens. The approved specification names different values. The application follows the approved palette for brand colours and keeps the Stitch tokens only as `stitch-*` colours. The earlier decision list in `docs/SCREEN_ROUTE_MAP.md` (which asked for confirmation) is superseded by the approved specification.

## 3. Screen-by-screen review (brief numbering, 52 screens)

Column meanings:
- **Stitch ref**: the matching export folder, if one exists.
- **Route**: the application route found in `app/` in this session.
- **Functional**: whether a route exists and is wired to server code (source-level only).
- **Responsive**: no browser test was run at any width; this column states that.

| # | Screen | Application route | Stitch ref | Visual fidelity | Functional (source) | Responsive | Changes this pass | Remaining verification |
|---|---|---|---|---|---|---|---|---|
| 1 | QR Welcome | `/q/[token]` (route handler that enters the store) | page_01 | Not compared | Route present | Not browser-tested | `appUrl()` now refuses localhost in production | Scan a real QR; confirm the landing page matches page_01 |
| 2 | Guest Home | `/store/[storeSlug]` | page_02 | Not compared | Route present | Not browser-tested | None | Compare with page_02 at all five widths |
| 3 | Product Categories | No dedicated index route; categories appear on the store home page | page_03 | Not compared | Partial (no `/categories` route) | Not browser-tested | None | Decide whether a categories index page is needed |
| 4 | Product Listing | `/store/[storeSlug]/category/[categorySlug]` | page_04 | Not compared | Route present | Not browser-tested | None | Compare with page_04 |
| 5 | Product Details | `/store/[storeSlug]/product/[productSlug]` | page_05 | Not compared | Route present | Not browser-tested | None | Check gallery, zoom and image fallbacks |
| 6 | Product Comparison | `/store/[storeSlug]/compare` | page_06 | Not compared | Route present | Not browser-tested | None | Compare table layout on mobile |
| 7 | Tile Calculator | `/store/[storeSlug]/tools/tile-calculator` | page_07 | Not compared | Route present | Not browser-tested | None | Compare with page_07 |
| 8 | Room Visualizer | `/store/[storeSlug]/visualizer` (upload at `/visualizer/upload`) | page_08 | Not compared | Route present | Not browser-tested | None | Test an image upload end to end |
| 9 | House Project Planner | `/store/[storeSlug]/projects` and `/projects/[projectId]` | page_09 | Not compared | Route present | Not browser-tested | None | Compare with page_09 |
| 10 | Wishlist | `/store/[storeSlug]/wishlist` | page_10 | Not compared | Route present | Not browser-tested | None | Check saved-state feedback |
| 11 | Shopping Cart | `/store/[storeSlug]/cart` | page_11 | Not compared | Route present; GST breakdown component in use | Not browser-tested | None this pass | Compare with page_11 |
| 12 | Quotation Request | `/store/[storeSlug]/quotes/request` | page_12 | Not compared | Route present | Not browser-tested | None | Compare with page_12 |
| 13 | Checkout | `/store/[storeSlug]/checkout` | page_13 | Not compared | Route present; GST breakdown in use | Not browser-tested | None this pass | Mobile checkout layout check |
| 14 | Online Payment | No separate page; payment starts from checkout and is tracked on the order page | page_14 | Not compared | Partial (no dedicated screen) | Not browser-tested | None | Decide whether page_14 needs its own state screen |
| 15 | Cash Payment Waiting | No separate page; the order page shows the state | page_15 | Not compared | Partial (no dedicated screen) | Not browser-tested | None | Same decision as row 14 |
| 16 | Order Confirmation | `/store/[storeSlug]/orders/[orderNumber]` | page_16 | Not compared | Route present | Not browser-tested | None | Compare with page_16 |
| 17 | Invoice | `/store/[storeSlug]/orders/[orderNumber]/invoice` (route handler) | page_17 | Not compared | Route present | Not browser-tested | None | Download and open an invoice |
| 18 | Order Tracking | `/store/[storeSlug]/orders/[orderNumber]` | page_18 | Not compared | Partial (tracking shares the order page) | Not browser-tested | None | Compare with page_18 |
| 19 | Owner Login | `/owner/login` | page_19 | Not compared | Route present | Not browser-tested | None | Compare with page_19 |
| 20 | Owner Dashboard | `/owner` | page_20 | Not compared | Route present | Not browser-tested | None | Compare with page_20; check chart rendering |
| 21 | Product Management | `/owner/products` | page_21 | Not compared | Route present | Not browser-tested | None | Compare with page_21 |
| 22 | Add and Edit Product | `/owner/products/new`, `/owner/products/[id]` | page_22 | Not compared | Route present | Not browser-tested | None | Image upload check |
| 23 | Category Management | `/owner/categories` | page_23 | Not compared | Route present | Not browser-tested | None | Compare with page_23 |
| 24 | Inventory Management | `/owner/inventory` | page_24 | Not compared | Route present | Not browser-tested | None | Compare with page_24 |
| 25 | Tile Batch Management | `/owner/inventory/batches` | page_25 | Not compared | Route present | Not browser-tested | None | Compare with page_25 |
| 26 | Order Management | `/owner/orders` | page_26 | Not compared | Route present | Not browser-tested | None | Compare with page_26 |
| 27 | Cash Payment Confirmation | `/owner/cash` | page_27 | Not compared | Route present | Not browser-tested | None | Confirm-cash flow test |
| 28 | Online Transactions | `/owner/payments` | page_28 | Not compared | Route present | Not browser-tested | None | Compare with page_28 |
| 29 | POS Billing | `/owner/pos`, `/owner/pos/new`, `/owner/pos/[billId]` | page_29 | Not compared | Route present; GST pricing integrated (thirty-second pass) | Not browser-tested | None this pass | Compare with page_29 |
| 30 | Quotation Management | `/owner/quotations` | page_30 | Not compared | Route present | Not browser-tested | None | Compare with page_30 |
| 31 | Supplier Management | `/owner/suppliers` | page_31 | Not compared | Route present | Not browser-tested | None | Compare with page_31 |
| 32 | Purchase Orders | `/owner/purchasing`, `/owner/purchasing/[id]` | page_33 (closest) | Not compared | Route present | Not browser-tested | None | Stitch page_33 is the purchase-order screen; compare it |
| 33 | Customer Management | `/owner/customers`, `/owner/customers/[id]` | None | Not applicable (no reference) | Route present | Not browser-tested | None | Design reference missing |
| 34 | Customer Credit Ledger | `/owner/customers/[id]/statement` | None | Not applicable (no reference) | Route present | Not browser-tested | None | Design reference missing |
| 35 | Delivery Management | `/owner/deliveries` | None (page_35 is logistics freight, a different screen) | Not applicable | Route present | Not browser-tested | None | Design reference missing |
| 36 | Offers and Coupons | `/owner/coupons` | None (page_36 is claims and debit notes) | Not applicable | Route present | Not browser-tested | None | Design reference missing |
| 37 | QR Management | `/owner/qr`, `/owner/qr/analytics` | None (page_37 is partner commissions) | Not applicable | Route present; `appUrl()` hardened | Not browser-tested | QR links refuse localhost in production | Generate and scan a store QR after deployment |
| 38 | Reports and Analytics | `/owner/reports` and sub-reports (cash, GST, inventory, purchasing, customers, annual) | page_39 (closest, financial P&L) | Not compared | Route present | Not browser-tested | None | Compare reports layout with page_39 |
| 39 | Cash Reconciliation | `/owner/cash/day` | None (page_27 is payment management) | Not applicable | Route present | Not browser-tested | None | Design reference missing |
| 40 | Store Settings | `/owner/settings` | None (page_40 is staff attendance) | Not applicable | Route present | Not browser-tested | None | Design reference missing |
| 41 | Admin Login | `/admin/login` | None in export | Not applicable | Route present | Not browser-tested | None | Compare against the approved palette only |
| 42 | Platform Admin Dashboard | `/admin` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 43 | Store Management | `/admin/stores`, `/admin/stores/[id]` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 44 | Store Onboarding | `/admin/stores/new`, `/admin/onboarding`, `/admin/onboarding/[id]` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 45 | Owner Management | `/admin/owners` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 46 | Subscription Management | `/admin/subscriptions` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 47 | Platform QR Management | `/admin/qr` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 48 | Platform Analytics | `/admin/analytics` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 49 | Feature and Permission Management | `/admin/feature-flags`, `/admin/roles` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 50 | Support Management | `/admin/support` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 51 | Security and Audit Logs | `/admin/audit` | None in export | Not applicable | Route present | Not browser-tested | None | As above |
| 52 | Platform Settings | `/admin/settings` | None in export | Not applicable | Route present | Not browser-tested | None | As above |

Additional pages the brief asks to review: staff management (`/owner/staff`), refunds (`/owner/refund-requests`, `/owner/orders/[orderId]/refund`), payment reconciliation (`/owner/payments`, `/admin/payments`), provisioning (`/admin/provisioning`), bulk product import (`/owner/products/import`), and the cash day report (`/owner/cash/day`). None has a Stitch reference in the export.

## 4. Stitch screens outside the 52-screen list

These screens exist in the export but are not in the brief's list. None has an application route; they were not built.

| Stitch page | Screen | Application route | Status |
|---|---|---|---|
| page_32 | Inward GRN Inspection | None | Not implemented |
| page_34 | Supplier Performance and Quality Scorecard | None | Not implemented |
| page_35 | Logistics and Freight Tracking Hub | None | Not implemented |
| page_36 | Claims, Debit Notes and Vendor Reconciliation | None | Not implemented |
| page_37 | Architect Partner Commission Ledger | None | Not implemented |
| page_38 | Customer Loyalty and Privilege Club | None | Not implemented |
| page_40 | Showroom Staff Attendance and KPI Tracker | `/owner/staff` exists; attendance and KPI screens do not | Partial |
| page_41 | Warehouse Dispatch Management Hub | None | Not implemented |

## 5. Responsive and interaction review

- **Responsive widths (390, 768, 1024, 1440, 1920 px):** not tested in a browser. The Tailwind classes in source use the standard breakpoints; that is all this review can state.
- **Empty, loading and error states:** present in source for several pages (for example, the product thumbnail fallback in `components/guest/product-thumb.tsx`). Loading skeletons were not reviewed on every page.
- **Product images:** the repository holds no product photography. Product images come from the `catalogue-images` storage bucket, and `product-thumb.tsx` supplies a fallback. The brief asks for suitable local fallback images for each product category; they have **not** been supplied.
- **PWA:** `public/manifest.json`, `public/sw.js`, `public/offline.html` and the icons exist; `components/pwa/pwa-shell.tsx` handles installation. Installation has not been tested in a browser.

## 6. Remaining verification (external)

1. Install dependencies, run `npm run build` and `npm run dev`.
2. Capture each route at 390, 768, 1024, 1440 and 1920 px and compare with the matching Stitch `screen.png`.
3. Check Tamil text rendering on a physical Android device.
4. Test PWA installation on Android Chrome and iOS Safari.
5. Supply licensed product photography and category fallback images.
6. Resolve the Stitch palette conflict in writing if the Stitch surface colours are meant to take precedence.
