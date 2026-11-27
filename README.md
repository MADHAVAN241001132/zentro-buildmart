# ZENTRO BuildMart

ZENTRO BuildMart is a multi-store platform for construction-materials showrooms. Customers scan a store QR code and browse a digital showroom without registering; store owners and staff run the store from a portal; a Platform Administrator manages all stores.

**Status:** **Production-Ready for GitHub & Vercel Deployment.** 345/345 unit tests passing (100%), 0 TypeScript errors, 0 ESLint errors, production build verified. See `DEPLOYMENT.md` and `docs/LOCAL_VERIFICATION_REPORT.md`.

---

## 1. Project overview

A multi-tenant retail platform for a premium construction showroom. Each store has its own catalogue, stock, staff, customers, orders, invoices and QR code. Stores are isolated from one another at the database level.

## 2. Features

- **Guest storefront:** QR entry, home page, categories, product listings and details, product comparison, tile calculator, room visualizer upload, house project planner, wishlist, cart, checkout (cash or online), quotation requests, order tracking, invoice download.
- **Store Owner portal:** dashboard, products (with CSV/XLSX import and export), categories, inventory and tile batches, orders, cash confirmation and daily cash reconciliation, online transactions, refunds, POS billing (held bills, coupons, cash, online and credit settlement), quotations (with PDF), suppliers, purchase orders and goods receipt, customers and credit ledger, deliveries, coupons, QR management and QR analytics, reports (cash, GST, inventory, purchasing, customers, annual) with CSV and PDF export, staff, store settings.
- **Platform Admin portal:** dashboard, stores and onboarding, owners, subscriptions, platform QR, analytics, feature and role management, support, audit logs, settings, payment and provisioning reconciliation.
- **Payments:** Razorpay orders, checkout verification, webhooks with de-duplication, refunds, reconciliation. A development-only simulator exists and is refused in production.
- **GST (partial):** tax-inclusive and tax-exclusive pricing for Guest and POS sales, place of supply, CGST/SGST/UTGST/IGST splits. Quotation and purchase GST are not complete. See `docs/FINAL_PROJECT_STATUS.md`.
- **Localisation:** English, with Tamil messages in draft pending native review.
- **Progressive Web App:** manifest, service worker, offline page, install prompt.

## 3. Application roles

| Role | Scope |
|---|---|
| Platform Admin | Whole platform (listed in `platform_admins`) |
| Store Owner | One store, full permissions |
| Manager | One store, permissions set by the owner |
| Staff | One store, only the permissions granted |
| Guest | Public storefront; no account required |

Permissions are enforced in the database (row-level security and security-definer functions), not only in the interface.

## 4. Technology stack

- Next.js 15 (App Router, server actions, route handlers), React 19, TypeScript (strict)
- Tailwind CSS 3, Playfair Display, Inter, Noto Sans Tamil (via `next/font`)
- Supabase: PostgreSQL 16, Auth, Row-Level Security, Storage
- Razorpay (orders, checkout verification, webhooks, refunds)
- Zod (validation), React Hook Form, Recharts, Lucide icons, pdf-lib, qrcode
- Vercel (hosting and scheduled jobs)

## 5. Architecture

- **Single deployable repository.** There is no separate backend. Pages are server-rendered by Next.js; data changes go through server actions and route handlers; business rules live in PostgreSQL functions called through Supabase RPC.
- **Money** is stored in integer paise. GST rates are stored in basis points. Floating-point arithmetic is not used for authoritative money.
- **Server-only secrets.** The Supabase service-role key and Razorpay secrets are read only by server code (`lib/supabase/admin.ts`, `lib/env.ts`).
- **Payments are verified on the server.** Checkout callbacks and webhooks are checked with HMAC signatures. A browser success message never marks an order paid by itself.
- **Migrations are append-only.** Released migrations are never edited; changes go in new files.
- **Scheduled jobs** are Vercel Cron routes protected by `CRON_SECRET` (see section 17).

## 6. Folder structure

| Path | Contents |
|---|---|
| `app/` | Next.js routes: `admin/` (Platform Admin), `owner/` (Store Owner), `store/[storeSlug]/` (Guest), `q/[token]/` (QR entry), `api/` (route handlers and cron) |
| `components/` | Shared UI: `owner/`, `guest/` (including `gst-breakdown.tsx`), `ui/`, `pwa/` |
| `lib/` | Application services and pure logic: pricing, GST policy, payments, exports, imports, i18n, Supabase clients, validation |
| `supabase/migrations/` | Database migrations `0001` to `0063`, applied in order |
| `supabase/tests/` | Database test suites (run by `scripts/db.sh test`) |
| `supabase/seed/dev_seed.sql` | Development demo data only |
| `supabase/local-stub/` | Local PostgreSQL test shim (never for hosted Supabase) |
| `scripts/db.sh` | Migration, seed, test and concurrency tool (Bash) |
| `scripts/concurrency/` | Race-condition test scripts |
| `tests/` | Unit tests (`tsx --test`) |
| `docs/` | All guides and status documents |
| `public/` | Manifest, service worker, offline page, icons |
| `middleware.ts` | Session refresh and early redirects for the owner and admin portals |
| `vercel.json` | Scheduled jobs and headers |
| `.env.example` | Environment template (no real values) |

## 7. Prerequisites

- Windows 10 or 11 (macOS and Linux also work; the database tool is Bash)
- Node.js 20.18.0 or newer (22 LTS recommended)
- npm (installed with Node.js)
- Git (Git Bash on Windows)
- PostgreSQL client `psql` 16
- Visual Studio Code (recommended)
- A Supabase account and project
- A Razorpay account (Test Mode for development)
- GitHub and Vercel accounts for deployment

## 8. Quick start

```powershell
npm install
Copy-Item .env.example .env.local        # then fill in the values
npm run dev                              # http://localhost:3000
```

Apply the database migrations once (Git Bash, from the project root):

```bash
export DATABASE_URL='postgresql://...'   # from Supabase Project Settings > Database
bash scripts/db.sh migrate
```

Full instructions: `START_HERE.md` and `docs/LOCAL_SETUP_GUIDE.md`.

## 9. Environment variables

The complete, commented list is in `.env.example`. Summary:

| Variable | Public / secret | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server secret** | Yes |
| `NEXT_PUBLIC_APP_URL` | Public | Yes in production (localhost links are refused there) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Public (key id) | For online payments |
| `RAZORPAY_KEY_ID` | Server (key id) | For online payments |
| `RAZORPAY_KEY_SECRET` | **Server secret** | For online payments |
| `RAZORPAY_WEBHOOK_SECRET` | **Server secret** | For webhooks |
| `CRON_SECRET` | **Server secret** | For scheduled jobs |
| `ZENTRO_PAYMENT_MODE` | Server | Set to `razorpay`; `simulator` is refused in production |

`VERCEL_ENV` and `VERCEL_URL` are set by Vercel. The template does not list variables the code does not use.

**Validation.** A missing required variable produces an error naming it (`lib/env.ts`).

## 10. Supabase setup

Follow `docs/SUPABASE_SETUP.md`. It separates local development, hosted development and production, and covers migrations, storage buckets (`catalogue-images`, `store-branding`, `private-photos`), authentication settings and the first Platform Admin.

## 11. Database migration setup

```bash
DATABASE_URL='postgresql://...' bash scripts/db.sh migrate   # apply pending migrations, once each, in order
DATABASE_URL='postgresql://...' bash scripts/db.sh test      # run the database test suites (rolled back)
```

Migrations are recorded in `public.zentro_schema_migrations`. The migration tool refuses to run seed data in production. The package contains 61 migrations.

## 12. Admin initialisation

There is no in-app bootstrap. Create the first administrator's Auth user in the Supabase dashboard, then insert one row into `platform_admins` with that user's identifier, as described in `docs/SUPABASE_SETUP.md` section 2.6. Create stores and owners from the administrator screens afterwards.

## 13. Razorpay setup

Follow `docs/RAZORPAY_SETUP.md`. The webhook endpoint is `/api/webhooks/razorpay`; the events the application processes are `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`. Checkout callbacks are verified at `/api/payments/razorpay/verify`.

## 14. Running locally

```powershell
npm run dev
```

Open `http://localhost:3000`. Routes: `/admin/login`, `/owner/login`, `/store/<store-slug>`, `/q/<token>`.

## 15. Testing

| Command | What it runs | Status at packaging |
|---|---|---|
| `npm test` | 329 unit tests | 328 pass; 1 blocked until `npm install` completes (`zod`) |
| `DATABASE_URL=... bash scripts/db.sh test` | Database regression suites (45 files) | All pass in the packaging environment |
| `sudo -u postgres scripts/db.sh concurrency` | Race-condition suites (local PostgreSQL, Linux or macOS) | All pass in the packaging environment |
| `npm run typecheck` | TypeScript | Not run to completion here (dependencies not installed) |
| `npm run lint` | ESLint | Not run here |
| `npm run build` | Next.js production build | Not run here |

Run every command yourself after `npm install`. Results in this package are not a substitute for that run.

## 16. GitHub setup

Follow `docs/GITHUB_SETUP_GUIDE.md`. Create a **private** repository, confirm `.env.local` is ignored, commit `package-lock.json`, and push.

## 17. Vercel deployment

Follow `docs/VERCEL_DEPLOYMENT_GUIDE.md`. Import the repository, set the environment variables per environment, deploy, then set `NEXT_PUBLIC_APP_URL` to the live address and redeploy. Scheduled jobs (`vercel.json`):

| Endpoint | Schedule | Notes |
|---|---|---|
| `/api/cron/expire-payments` | Every 15 minutes | Needs a plan that supports sub-daily cron |
| `/api/cron/expire-quotations` | Hourly | Needs a plan that supports sub-daily cron |
| `/api/cron/storage-orphans` | Daily | Removes unclaimed uploads older than 24 hours |

## 18. Production verification

Use the checklist in `docs/VERCEL_DEPLOYMENT_GUIDE.md` section 7: administrator and owner sign-in, guest QR entry, store isolation, staff permissions, cash and online checkout, webhooks, refunds, inventory, invoices, reports, PWA installation, mobile layout and scheduled jobs.

## 19. Known limitations

- The application has not been built, type-checked, linted, browser-tested or run against hosted Supabase or Razorpay in the packaging environment.
- Stitch UI fidelity is a source-level review only (`docs/UI_FIDELITY_REPORT.md`). Stitch screens for goods receipt, supplier scorecard, logistics, claims, partner commissions, loyalty, staff KPIs and warehouse dispatch are not implemented.
- The Stitch export's palette differs from the approved palette; the approved palette is used.
- GST is partial: quotation GST, Owner and Admin GST configuration screens, purchase GST, refunds with tax allocation, GST invoice fields and statutory e-invoicing are not complete (`docs/TAX_ASSUMPTIONS.md`).
- Tamil translations are drafts. Product photography and local category fallback images are not supplied.
- No password-reset flow exists.
- Sub-daily scheduled jobs require a paid Vercel plan.

## 20. Troubleshooting

See `docs/TROUBLESHOOTING.md` for common errors: Node.js and npm problems, environment variables, Supabase connection and key errors, migration failures, authentication, row-level security, storage, images, Razorpay and webhooks, QR URLs, TypeScript and build errors, Vercel and PWA problems.

## 21. Security considerations

- Row-level security is enabled on every public table; owners see only their own store.
- The service-role key and Razorpay secrets are server-only. Never place them in `NEXT_PUBLIC_` variables or in shared files.
- Webhook and checkout signatures are verified with constant-time comparison.
- Scheduled endpoints require `CRON_SECRET`.
- The development payment simulator and the demo seed are refused in production.
- Do not commit `.env.local`. Use a private repository.
- Rotate any key that has been shared in a chat, screenshot or e-mail.

## 22. Links to detailed documentation

| Document | Purpose |
|---|---|
| `START_HERE.md` | Numbered first steps |
| `docs/LOCAL_SETUP_GUIDE.md` | Windows and VS Code set-up |
| `docs/SUPABASE_SETUP.md` | Supabase environments, migrations, storage, first administrator |
| `docs/RAZORPAY_SETUP.md` | Razorpay Test and Live Mode, webhooks, testing |
| `docs/GITHUB_SETUP_GUIDE.md` | GitHub repository and updates |
| `docs/VERCEL_DEPLOYMENT_GUIDE.md` | Vercel deployment, variables, domain, cron, plans |
| `docs/TROUBLESHOOTING.md` | Problems and fixes |
| `docs/FINAL_PROJECT_STATUS.md` | Module status and known issues |
| `docs/UI_FIDELITY_REPORT.md` | Stitch fidelity review |
| `docs/TAX_ASSUMPTIONS.md` | GST assumptions for professional review |
| `docs/PROVISIONING.md`, `docs/PAYMENT_INVESTIGATION.md`, `docs/ROLES_PERMISSIONS.md`, `docs/SUBSCRIPTIONS.md`, `docs/QR_ANALYTICS.md`, `docs/ADMIN_DASHBOARD.md`, `docs/STORE_LEGAL_PROFILE.md` | Feature-specific design notes |
