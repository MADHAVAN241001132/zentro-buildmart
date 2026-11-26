> **Superseded.** This map was written at the start of the project, before most screens existed. Its proposed routes (for example `/welcome`, `/categories`, `/owner/dashboard`) are not the application's routes. For the actual routes and the fidelity status of all 52 screens, see `docs/UI_FIDELITY_REPORT.md`.

# ZENTRO BuildMart — Stitch Screen Inventory and Route Map

Source: `39863af7-stitch_zentro_buildmart_digital_showroom.zip` (41 screens, each with `screen.png` + `code.html`, plus `zentro_buildmart/DESIGN.md`).

## 1. Screens found in the Stitch export

| # | Stitch folder | Audience | Proposed route |
|---|---|---|---|
| 01 | page_01_qr_welcome_page | Guest | `/store/[storeSlug]/welcome` (QR landing) |
| 02 | page_02_digital_showroom_homepage | Guest | `/store/[storeSlug]` |
| 03 | page_03_product_categories | Guest | `/store/[storeSlug]/categories` |
| 04 | page_04_product_listing | Guest | `/store/[storeSlug]/category/[categorySlug]` |
| 05 | page_05_product_details | Guest | `/store/[storeSlug]/product/[productSlug]` |
| 06 | page_06_product_comparison | Guest | `/store/[storeSlug]/compare` |
| 07 | page_07_smart_tile_calculator | Guest | `/store/[storeSlug]/tools/tile-calculator` |
| 08 | page_08_room_visualizer | Guest | `/store/[storeSlug]/tools/room-visualizer` |
| 09 | page_09_house_project_planner | Guest | `/store/[storeSlug]/projects` |
| 10 | page_10_wishlist | Guest | `/store/[storeSlug]/wishlist` |
| 11 | page_11_shopping_cart | Guest | `/store/[storeSlug]/cart` |
| 12 | page_12_quotation_request | Guest | `/store/[storeSlug]/quotations/new` |
| 13 | page_13_checkout | Guest | `/store/[storeSlug]/checkout` |
| 14 | page_14_online_payment | Guest | `/store/[storeSlug]/pay/[orderNo]` |
| 15 | page_15_cash_payment_waiting_screen | Guest | `/store/[storeSlug]/orders/[orderNo]/cash-pending` |
| 16 | page_16_order_confirmation | Guest | `/store/[storeSlug]/orders/[orderNo]` |
| 17 | page_17_digital_invoice | Guest / Owner | `/store/[storeSlug]/orders/[orderNo]/invoice` |
| 18 | page_18_order_tracking | Guest | `/store/[storeSlug]/track/[orderNo]` |
| 19 | page_19_owner_login | Owner | `/owner/login` |
| 20 | page_20_owner_dashboard | Owner | `/owner/dashboard` |
| 21 | page_21_product_management | Owner | `/owner/products` |
| 22 | page_22_add_edit_product | Owner | `/owner/products/[id]` |
| 23 | page_23_category_management | Owner | `/owner/categories` |
| 24 | page_24_inventory_management | Owner | `/owner/inventory` |
| 25 | page_25_tile_batch_management | Owner | `/owner/inventory/batches` |
| 26 | page_26_order_management | Owner | `/owner/orders` |
| 27 | page_27_cash_payment_management | Owner | `/owner/cash` |
| 28 | page_28_online_transactions | Owner | `/owner/transactions` |
| 29 | page_29_pos_billing | Owner | `/owner/pos` |
| 30 | page_30_quotation_management | Owner | `/owner/quotations` |
| 31 | page_31_supplier_directory_management | Owner | `/owner/suppliers` |
| 32 | page_32_inward_grn_inspection | Owner | `/owner/purchases/grn` |
| 33 | page_33_create_supplier_purchase_order | Owner | `/owner/purchases/new` |
| 34 | page_34_supplier_performance_quality_scorecard | Owner | `/owner/suppliers/[id]/scorecard` |
| 35 | page_35_logistics_freight_tracking_hub | Owner | `/owner/logistics` |
| 36 | page_36_claims_debit_notes_vendor_reconciliation | Owner | `/owner/suppliers/claims` |
| 37 | page_37_architect_partner_commission_ledger | Owner | `/owner/partners/commissions` |
| 38 | page_38_customer_loyalty_architect_rewards_privilege_club_portal | Owner | `/owner/loyalty` |
| 39 | page_39_financial_analytics_showroom_p_l_dashboard | Owner | `/owner/analytics/pnl` |
| 40 | page_40_showroom_staff_attendance_kpi_sales_incentive_tracker | Owner | `/owner/staff` |
| 41 | page_41_warehouse_dispatch_management_hub | Owner | `/owner/dispatch` |

## 2. Required by the spec but with no Stitch screen

These must be built in the same design system (Section 5 of the prompt requires it):

- **Super Admin portal (entire):** `/admin/login`, `/admin/dashboard`, stores CRUD, 8-step onboarding wizard, owners, subscriptions, platform QR, platform analytics, feature flags, support tickets, audit logs, platform settings.
- **Owner:** forgot/reset password, customers, credit ledger, deliveries, offers and coupons, QR management, cash reconciliation and expenses, reports hub (daily/weekly/monthly/annual, GST, dead stock, and so on), store settings, notifications, customer detail, supplier and purchase-order list views.
- **Guest:** account-less order list, quotation accept/reject view, empty, error and offline fallback pages, "Pay using UPI app" sheet, 404.
- **Shared:** unauthorized (403) page, PWA offline page, notifications centre.

## 3. Design-source conflicts to resolve

1. **Background colour.** The spec's named palette uses Cream `#FFF4E6` as the page canvas. The Stitch export renders with the Material token set (`surface` `#fff8f7`, a near-white pink) on 41 of 42 pages, and only one page uses `#FFF4E6`. Proposed default: follow the spec's named palette for brand colours and keep the Stitch Material tokens for component states. Confirm with the owner before pixel review.
2. **Typography.** `DESIGN.md` specifies Playfair Display (headings) and Inter (UI). The export also loads Material Symbols Outlined for icons. Proposed default: Playfair + Inter + Material Symbols (matching the export).
3. **Locale.** The spec requires Tamil and English. The Stitch screens show English only. Proposed default: English UI with Tamil translations added in a later pass.
4. **Demo data.** Stitch sample data is Tamil Nadu-specific (Chennai, Ambattur, Kajaria Ceramics, "Karthik Subramanian", "Studio Chidambaram"). Use it as seed data so the screens match.

## 4. Build status

- Done: ZIP extraction and inventory, route map, design tokens (`src/styles/tokens.css`).
- Not done: Next.js project, database schema, auth, payments, admin portal, and all screen implementations. These need several passes; see the summary for the proposed order.
