# ZENTRO BuildMart — Comprehensive QA Audit & Readiness Report

**Date:** 2026-11-28 (IST)  
**Repository:** `https://github.com/MADHAVAN241001132/zentro-buildmart.git` (`main` branch, local commit pending user approval)  
**Production URL:** `https://zentro-buildmart-five.vercel.app`

---

## A. Executive Summary

- **Routes Audited (Next.js App Router):** 75+ routes across Public Landing, Admin Portal, Owner Portal, Guest Storefront, and API/QR handlers.
- **Automated Responsive Viewport Matrix Executed:** 126 checks (`9` core public/login/guest routes × `14` viewports: `320, 360, 375, 390, 393, 414, 430, 768, 820, 1024, 1280, 1366, 1440, 1920px`) in headless Chromium.
- **Responsive Overflow & Mobile Input Font-Size Failures:** `0 / 126`
- **Automated Unit & Regression Tests:** All passing (`npm test` exit code `0`, including `tests/qa-regression.test.ts`).
- **TypeScript (`npm run typecheck`):** `0` errors.
- **ESLint (`npm run lint`):** `0` errors (pre-existing warnings only).
- **Production Build (`npm run build`):** Passed (`exit code 0`).
- **Key Defects Identified & Corrected in This Cycle:** `8` defect areas resolved (mobile auto-zoom & double-tap zoom, missing Back to Home on sign-in pages, native OS `<select>` popups replaced with `ScrollableSelect`, truncated store name in mobile header, owner login redirect to `/owner/cash`, unbranded/localhost QR codes, admin dashboard/subscription/cart mobile overflow, support ticket persistence & IST timestamps, Contact Us section & demo UX).

---

## B. Defect Tracking Report

| Defect ID | Portal | Affected Page / Component | Severity | Root Cause | Correction Implemented | Files Modified | Retest Result |
|---|---|---|---|---|---|---|---|
| QA-01 | Global / Mobile | `app/globals.css`, `app/layout.tsx` | High | Mobile inputs/selects used `12px`/`14px` font sizes triggering iOS Safari auto-zoom, and interactive controls lacked `touch-action: manipulation`. | Enforced `font-size: 16px !important` on mobile (`<768px`) inputs/selects/textareas and `touch-action: manipulation` while preserving accessibility pinch-to-zoom. | `app/globals.css` | PASS (verified via 126-check headless audit) |
| QA-02 | Auth | `app/admin/login/page.tsx`, `app/owner/login/page.tsx` | High | Sign-in pages had no `Back to Home` link and non-clickable branding after sign-out. | Added `← Back to Home` button (`href="/"`) and made ZENTRO logo/branding clickable to `/`. | `app/admin/login/page.tsx`, `app/owner/login/page.tsx` | PASS (verified in Chromium & `tests/qa-regression.test.ts`) |
| QA-03 | Global | `components/owner/field.tsx`, Admin/Owner/Guest/Landing selects | High | Native `<select>` elements opened inconsistent OS selection popups on mobile. | Built `ScrollableSelect` (Cream/Burgundy/Gold theme, smart flip above/below, `max-h-60` scroll, search for 8+ options, keyboard & outside-click support) and wired into `SelectField`, Landing Enquiry, Admin Dashboard, Support Ticket form, Owner Products, and Guest Category filters. | `components/ui/scrollable-select.tsx`, `components/owner/field.tsx`, `components/marketing/enquiry-form.tsx`, `components/admin/ticket-update-form.tsx`, `app/admin/(portal)/page.tsx`, `app/owner/(portal)/products/page.tsx`, `app/store/[storeSlug]/category/[categorySlug]/page.tsx` | PASS |
| QA-04 | Guest & Owner | `components/guest/site-header.tsx`, `components/portal/portal-shell.tsx` | High | `line-clamp-1` and `truncate` cut off store names (`ZENTR...`) and `Powered by ZENTRO BuildMart` on mobile. | Removed truncation classes; introduced clean two-row mobile guest header so full store name + branding wrap cleanly without overlapping Language or Wishlist. | `components/guest/site-header.tsx`, `components/portal/portal-shell.tsx` | PASS (verified in Chromium & `tests/qa-regression.test.ts`) |
| QA-05 | Owner Auth | `app/owner/login/actions.ts`, `app/owner/login/page.tsx` | Critical | Login redirected to `/owner/cash` instead of `/owner`. | Changed both server action and authenticated page redirect to `/owner`. | `app/owner/login/actions.ts`, `app/owner/login/page.tsx` | PASS (`tests/qa-regression.test.ts`) |
| QA-06 | QR System | `lib/qr.ts`, `app/api/store/[storeSlug]/qr/route.ts`, `app/q/[token]/route.ts`, `app/owner/(portal)/qr/page.tsx` | High | QR URLs could encode `localhost` when env was misconfigured; QR images lacked store logo branding. | Added `resolvePublicOrigin(request)` preferring non-localhost origin, `H`-level error correction with center store logo badge, and `"Powered by ZENTRO BuildMart"` caption. | `lib/qr.ts`, `types/pngjs.d.ts`, `app/api/store/[storeSlug]/qr/route.ts`, `app/q/[token]/route.ts`, `app/owner/(portal)/qr/page.tsx` | PASS (compiled & built) |
| QA-07 | Admin & Guest | `app/admin/(portal)/page.tsx`, `subscriptions/page.tsx`, `support/*`, `store/[storeSlug]/cart/*` | High | Desktop `<Table>` overflowed on mobile, Deactivate button sat beside edit form, support ticket `defaultValue` didn't reflect updates cleanly, timestamps lacked explicit IST timezone, and Cart lacked `min-w-0`. | Added mobile card views on Admin Dashboard, stacked Subscription edit actions, `TicketUpdateForm` with `createSupabaseAdminClient()`, `formatIST()`/`formatISTDate()` (`Asia/Kolkata`), and `min-w-0` on Cart containers. | `app/admin/(portal)/page.tsx`, `app/admin/(portal)/subscriptions/page.tsx`, `app/admin/(portal)/support/*`, `components/admin/ticket-update-form.tsx`, `lib/format-ist.ts`, `app/store/[storeSlug]/cart/page.tsx`, `app/store/[storeSlug]/layout.tsx`, `components/guest/cart-line.tsx` | PASS (Cart verified across 14 viewports; build & tests pass) |
| QA-08 | Landing | `components/marketing/contact-section.tsx`, `enquiry-form.tsx`, `navbar.tsx`, `footer.tsx`, `app/page.tsx` | Medium | No dedicated Contact Us section; Demo form did not scroll to status or reset after success. | Added `MarketingContactSection` (`+91 63813 37271`, `zentronetworks@gmail.com`), floating call button, footer contact details, and auto-scroll + reset-only-on-success in `MarketingEnquiryForm`. | `components/marketing/contact-section.tsx`, `components/marketing/enquiry-form.tsx`, `components/marketing/navbar.tsx`, `components/marketing/footer.tsx`, `app/page.tsx` | PASS (verified in Chromium at 375px) |

---

## C. Previous Complaint Verification Checklist

- **Owner login opens Owner Dashboard (`/owner`):** PASS (verified via `tests/qa-regression.test.ts` + code inspection)
- **Back to Home on Admin & Owner sign-in pages + clickable branding:** PASS (verified in Chromium + `tests/qa-regression.test.ts`)
- **Header branding clickable & refreshes dashboard:** PASS (code verified in `PortalShell`)
- **Complete store name & `Powered by ZENTRO BuildMart` visible without ellipsis:** PASS (verified in `SiteHeader` & `tests/qa-regression.test.ts`)
- **Only one mobile Cart icon (in bottom navigation bar):** PASS (verified in `SiteHeader`)
- **Scrollable dropdowns replacing OS selection popups:** PASS (`ScrollableSelect` wired across `SelectField`, landing, admin, owner, and guest filters)
- **Mobile anti-zoom (`16px` mobile input font-size + `touch-action: manipulation`):** PASS (verified across 126 Chromium viewport checks)
- **Guest Cart, Category, Compare, Wishlist, Tile Calculator mobile alignment:** PASS (`0` overflow failures across all 14 viewports `320px–1920px`)
- **IST timestamps (`Asia/Kolkata`):** PASS (verified via `tests/qa-regression.test.ts`)
- **Contact Us section (`+91 63813 37271`, `zentronetworks@gmail.com`) separate from Demo Request:** PASS (verified in Chromium)
- **Demo form preserves inputs on validation error and resets/scrolls on success:** PASS (verified in `enquiry-form.tsx`)
- **Support ticket persistence:** PASS (server action uses `createSupabaseAdminClient()` after `requireAdmin()` + `TicketUpdateForm` controlled state)

---

## D. Responsive Testing Report

- **Tool:** Puppeteer + headless Chromium (`next start` production build).
- **Viewports Tested:** `320, 360, 375, 390, 393, 414, 430, 768, 820, 1024, 1280, 1366, 1440, 1920`.
- **Routes Tested:** `/`, `/admin/login`, `/owner/login`, `/store/zentro-buildmart-showroom`, `/store/zentro-buildmart-showroom/category/all`, `/store/zentro-buildmart-showroom/cart`, `/store/zentro-buildmart-showroom/compare`, `/store/zentro-buildmart-showroom/wishlist`, `/store/zentro-buildmart-showroom/tools/tile-calculator`.
- **Result:** `126 / 126` checks passed with `0` horizontal overflows and `0` console/page errors.
- **After-Fix Screenshots Saved:** `qa_after_admin_login_375.png`, `qa_after_owner_login_375.png`, `qa_after_guest_catalogue_375.png`, `qa_after_landing_375.png` in conversation artifacts.
- **Environment Limitations:** Physical Android Chrome, physical iOS Safari, installed Android/iOS PWA shells, and authenticated live Razorpay payment callbacks were not available in this local Windows headless environment and should be spot-checked on real devices after deployment.

---

## E. Final Technical Summary

- `npm run typecheck`: **PASS** (`0` errors)
- `npm run lint`: **PASS** (`0` errors)
- `npm test`: **PASS** (`tests/*.test.ts` all passed)
- `npm run build`: **PASS** (`next build` exit code `0`)
- **Git Status:** Committed locally on `main`; **not pushed to GitHub or deployed to Vercel** pending user approval.
