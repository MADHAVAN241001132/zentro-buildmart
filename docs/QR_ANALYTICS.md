# QR analytics

## What is recorded

Each showroom, category and product QR code encodes a tracked entry link: `{APP_URL}/q/{token}`, where the token is 32 lowercase hexadecimal characters stored on the QR code row (`qr_codes.entry_token`). Opening the link:

1. Looks up the token through `public.zb_qr_entry_target`. Unknown, inactive, hidden or deleted targets return nothing, and the visitor is sent to the storefront without a record.
2. Calls `public.zb_record_qr_entry`, which writes one row to `qr_entry_events` for the store, the QR code, the guest session and the time.
3. Redirects to the storefront page for that target.

The recording function is `SECURITY DEFINER`. Visitors never write to the events table directly.

## What "entry" means

A tracked entry is a tracked link opening. It is not proof that a physical QR code was scanned. Anyone who has the link, including someone who shares it, produces the same record. Reports label these figures as tracked link openings everywhere they appear, including exports.

## Deduplication

A second opening by the same guest session of the same QR code within `qr_analytics_settings.dedupe_minutes` (default 30) returns `duplicate` and is not stored. Refreshing the page therefore does not inflate counts.

## Attribution

When an order is inserted, the trigger `orders_qr_attribution` (`app.attribute_qr_order`) looks for the most recent entry from the same guest session in the same store within `qr_analytics_settings.attribution_hours` (default 24) before the order time. If one exists, a row is written to `qr_order_attributions`, keyed by order, so each order is attributed at most once.

Orders without a guest session are never attributed.

## Metrics

| Metric | Definition |
| --- | --- |
| Recorded entries | Stored entry events in the period (after deduplication). |
| Unique guest sessions | Distinct guest sessions with at least one entry. An estimate of visitors, not a count of people. |
| Repeat entries | Entries beyond the first per session in the period. |
| Entries today, last 7 days, month to date | Entry counts for those Asia/Kolkata calendar windows. |
| Attributed orders | Orders attributed to an entry, excluding cancelled orders. |
| Paid attributed orders | Attributed orders whose payment status is PAID, PARTIALLY_REFUNDED or REFUNDED. |
| Paid attributed value | Total of those orders, in paise. |
| Refunds recorded | Refunded amount recorded against those orders. |
| Net after refunds | Paid attributed value less refunds, never below zero. |
| Conversion estimate | Converted sessions divided by unique sessions, in basis points. Shows "Not enough data" when there are no sessions. |

Conversion is an estimate. It relates sessions to later paid orders within the attribution window and does not prove that a visit caused the purchase.

## Access

- Owners and managers see their own store only. `app.qr_analytics_allowed` (migration 0036) requires store membership as owner or manager, the `qr_analytics` permission, and the `qr_scan_analytics` subscription feature. Staff cannot read analytics.
- Platform admins see all stores, or one store through the store filter, and are not limited by a store's subscription.
- Database functions raise `42501` for unauthorised callers. The service layer maps that to HTTP 403.
- Exports use the same functions and the same authorisation. They include aggregates only.
- Earlier versions checked membership only; the entitlement and permission checks were added in migration 0036.

## Privacy

- No device fingerprints, IP-derived location, precise location or personal details are stored in the analytics tables.
- Guest-session identifiers are used only to link entries to orders inside the database. They are never shown in pages, exports or downloadable reports, and the tests check the export datasets for them.
- Analytics output is aggregated by day, store or period.

## Printed codes

Codes printed before tracking existed encode the plain storefront URL. They keep working and are not counted. Owners who reprint from the QR page get tracked codes.

## Legacy table

`qr_scan_logs` from an earlier design is not written or read by the analytics code. It remains in the schema for now and should be dropped in a later migration once confirmed unused.

## Limitations

- Entry figures depend on the guest cookie. Visitors who block cookies are not counted, and the same person on two devices counts twice.
- Attribution uses the most recent entry in the window, so an earlier entry from the same session does not receive credit.
- The attribution window and dedupe interval are global settings, not per store.
- No browser or hosted Supabase test has been run for the redirect route. Verification so far is the database test suite (Q1 to Q12) and unit tests for the pure helpers.
