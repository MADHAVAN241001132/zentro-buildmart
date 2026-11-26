# Vercel Deployment Guide

This guide deploys the single Next.js repository to Vercel. The application uses Next.js server routes and server actions; no separate backend is required.

**Before you start:** the project must be on GitHub (see the GitHub guide), and the production Supabase project and Razorpay Live credentials must be ready (see the Supabase and Razorpay guides). Read the **plan requirements** in section 8 before you choose a Vercel plan for a client.

---

## Step 1: Prepare the repository

Confirm locally before importing:

1. `npm install` completes without errors, and `package-lock.json` is committed.
2. `npm run build` completes. **In this package the build has not yet been run in a verified environment**: the dependencies could not be installed where this package was prepared. If the build fails, use `docs/TROUBLESHOOTING.md`, then report the exact error text.
3. `npm test` runs the unit suite (the `zod`-dependent test needs `npm install` to have completed).
4. `.env.local` is **not** committed (`git check-ignore -v .env.local` prints a rule).

---

## Step 2: Connect GitHub to Vercel

1. Create or sign in to a Vercel account at https://vercel.com (sign in with GitHub).
2. Click **Add New… → Project**.
3. Find `zentro-buildmart` in the list and click **Import**. If it does not appear, click **Adjust GitHub App Permissions** and grant access to that repository.
4. **Framework Preset:** Next.js (Vercel detects it from `package.json`; confirm it).
5. **Root Directory:** leave as `./` (the repository root).
6. **Install Command:** leave as the default (`npm install`). The package has no lock file until you commit one; with a committed `package-lock.json`, Vercel uses it automatically.
7. **Build Command:** leave as the default (`next build`, from `npm run build`).
8. **Output Directory:** leave blank (Next.js default).
9. **Node.js version:** in **Project Settings → Build and Deployment**, select **20.x** or **22.x** (the package requires Node 20.18.0 or newer; see `engines` in `package.json`).

Do not click **Deploy** yet. First add the environment variables (Step 3).

---

## Step 3: Add environment variables

Add each variable in **Project Settings → Environment Variables**. Choose the environments listed in the table. The values for **Production** must come from the production Supabase project and Razorpay Live mode; **Preview** may use the development project and Razorpay Test Mode.

| Variable | Where to obtain the value | Public or secret | Required | Development | Preview | Production |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Public | Yes | Yes | Yes | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public | Public | Yes | Yes | Yes | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role | **Secret** | Yes | Yes | Yes | Yes |
| `NEXT_PUBLIC_APP_URL` | Your deployed address, for example `https://buildmart.example.com` (no trailing slash) | Public | **Yes in Production** | Optional (`http://localhost:3000`) | Optional (the app uses the preview URL if unset) | **Yes** |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay → API Keys (Test key in Preview; Live key in Production) | Public (key id) | Yes, for online payments | Yes | Yes | Yes |
| `RAZORPAY_KEY_ID` | Same value as `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Server | Yes, for online payments | Yes | Yes | Yes |
| `RAZORPAY_KEY_SECRET` | Razorpay → API Keys → Key Secret | **Secret** | Yes, for online payments | Yes | Yes | Yes |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay → Webhooks → the secret you set | **Secret** | Yes, for webhooks | Yes | Yes | Yes |
| `CRON_SECRET` | A long random string you create (at least 32 characters) | **Secret** | Yes, for scheduled jobs | Yes | Yes | Yes |
| `ZENTRO_PAYMENT_MODE` | Set to `razorpay` | Server | Yes | `razorpay` | `razorpay` | `razorpay` |

**Never set** `ZENTRO_PAYMENT_MODE=simulator` in Production or Preview.

`VERCEL_ENV` and `VERCEL_URL` are set by Vercel automatically; do not add them.

The optional variables in `.env.example` that are not listed here are **not used by the application** and should not be added.

**Important: public variables are compiled at build time.** A change to any `NEXT_PUBLIC_` variable takes effect only after a **redeploy**.

---

## Step 4: Deploy

1. Click **Deploy**.
2. Watch the build logs. Vercel shows **Building**, then **Ready** (or **Error**).
3. **Identifying build errors.** Click the failed deployment → **Build Logs**. The first red line is usually the cause. Common causes are a missing environment variable (the message names it), a TypeScript error (the file and line are shown) or a Node version mismatch. See `docs/TROUBLESHOOTING.md`.
4. **Redeploying after a fix.** Push the fix to GitHub (automatic redeploy), or open the failed deployment and choose **Redeploy**. Choose **Redeploy with existing build cache** only if you did not change dependencies.

---

## Step 5: Configure the production URL

After the first successful deployment, note the production domain (for example `https://zentro-buildmart.vercel.app`).

Update each place that holds the address:

| Where | What to set | When a redeploy is needed |
|---|---|---|
| Vercel → Environment Variables | `NEXT_PUBLIC_APP_URL` = the production address | **Yes** (public variable, build-time) |
| Supabase → Authentication → URL Configuration | **Site URL** = the production address; add the redirect URLs | No |
| Razorpay → Webhooks (Live mode) | Webhook URL = `https://<domain>/api/webhooks/razorpay` | No |
| Store QR codes | QR images encode the address they were generated with; regenerate and reprint them | No redeploy, but **regenerate** |

Redeploy after changing `NEXT_PUBLIC_APP_URL`. Without a redeploy the old value stays in the build.

**Store QR codes.** Owners download their store QR from `/owner/qr` after the production address is set. A QR printed with an older address still points to that address; reprint after any domain change.

---

## Step 6: Configure a custom domain

1. Vercel → your project → **Settings → Domains → Add**. Enter your domain (for example `buildmart.example.com`).
2. Vercel shows the DNS record to create (usually a CNAME for `www` or a record for the apex domain). Create it at your domain registrar exactly as shown.
3. Wait for verification. Vercel issues an HTTPS certificate automatically once DNS resolves; confirm the padlock in the browser.
4. Update `NEXT_PUBLIC_APP_URL` to the custom domain and redeploy (Step 5).
5. Update the Supabase Site URL and redirect URLs.
6. Update the Razorpay Live webhook URL.
7. Regenerate and reprint store QR codes.

---

## Step 7: Production verification checklist

Work through this checklist after each deployment. Record the date and tester beside each item.

- [ ] Admin authentication: `/admin/login` signs in the Platform Admin; a non-admin is refused.
- [ ] Owner authentication: `/owner/login` signs in the owner; a wrong password is refused.
- [ ] Guest QR entry: scanning the store QR opens the correct store.
- [ ] Database connectivity: `/admin` loads figures without error.
- [ ] Product images: product pages show images (none are bundled; upload them first).
- [ ] Store isolation: an owner of store A cannot open store B's orders or products.
- [ ] Staff permissions: a staff account without a permission cannot open the page that needs it.
- [ ] Cash checkout: a guest cash order appears, is confirmed by the owner, and moves stock.
- [ ] Online checkout: a Razorpay Live payment of a small amount completes and is reconciled.
- [ ] Webhooks: the Razorpay webhook delivery shows `200` in the Razorpay dashboard.
- [ ] Refunds: a refund is requested, processed and shown as processed.
- [ ] Inventory updates: stock changes after a sale and after a cancellation.
- [ ] Invoice downloads: an invoice opens from the order page.
- [ ] Reports: `/owner/reports` loads and exports open.
- [ ] PWA installation: the install prompt appears on Android Chrome; the app opens offline to `offline.html`.
- [ ] Mobile responsiveness: the guest storefront and checkout work at 390 px width.
- [ ] Scheduled jobs: see section 9.

---

## 8. Plan requirements and limits (read before you choose a plan)

- **Commercial use.** Vercel's free **Hobby** plan is intended for personal, non-commercial use. A deployment for a paying client is commercial use. Check Vercel's current terms and choose a plan that permits commercial use before you hand over the site.
- **Scheduled jobs.** The `vercel.json` file defines three cron jobs (section 9). Two of them run more often than once a day. Vercel's **Hobby** plan supports cron jobs only once per day. Sub-daily schedules require a paid plan. Check the current Vercel documentation for the exact limits of the plan you select. If you deploy on Hobby, either change the two sub-daily schedules to daily in `vercel.json` (which reduces how quickly expired payments are released) or upgrade the plan.
- **Function duration and region.** The project is configured for the `bom1` region in `vercel.json`. Check function duration limits for the plan you select if an invoice or report generation times out.
- **Supabase and Razorpay plans** have their own limits and fees; check them separately.

---

## 9. Scheduled jobs

Defined in `vercel.json`. Each endpoint requires `Authorization: Bearer <CRON_SECRET>`; Vercel Cron sends this header when `CRON_SECRET` is set. A request without the correct secret is refused.

| Endpoint | Purpose | Schedule in `vercel.json` | Required secret | Plan note |
|---|---|---|---|---|
| `/api/cron/expire-payments` | Cancels unpaid online orders whose reservation has expired and releases their stock | `*/15 * * * *` (every 15 minutes) | `CRON_SECRET` | Sub-daily; needs a plan that supports it |
| `/api/cron/expire-quotations` | Expires quotations past their validity | `0 * * * *` (hourly) | `CRON_SECRET` | Sub-daily; needs a plan that supports it |
| `/api/cron/storage-orphans` | Removes unclaimed image uploads older than 24 hours (up to 200 per run) | `30 20 * * *` (daily, 20:30 UTC) | `CRON_SECRET` | Daily; supported on Hobby |

**Manual execution** (for testing or when a scheduled run is missed):

```powershell
$secret = "<your CRON_SECRET>"
Invoke-WebRequest -Uri "https://<your-domain>/api/cron/expire-payments" -Headers @{ Authorization = "Bearer $secret" } -Method GET
```

Use the same pattern for the other two endpoints. A `200` response indicates success. A `401` response means the secret does not match. Do not put the secret in a shared document.

**Stock reservation.** Expired reservations are also released when the expiry job runs; if you run only the daily job on Hobby, unpaid online reservations may stay reserved longer than intended. Plan accordingly.

**Payment reconciliation** runs through the webhook and the owner's and administrator's reconciliation screens (`/owner/payments`, `/admin/payments`); it is not a separate scheduled endpoint.
