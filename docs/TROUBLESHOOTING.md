# Troubleshooting

Each entry gives the symptom, the usual cause and the fix. Commands are for Windows PowerShell unless marked **Git Bash**. Never disable row-level security, authentication, webhook signature checks or the service-role separation to make an error go away; each of these protects money and customer data.

## Quick diagnostics

```powershell
node -v                 # must be v20.18.0 or newer
npm -v
git --version
psql --version          # PostgreSQL client, needed for migrations
npm run typecheck       # TypeScript check
npm test                # unit tests
```

---

## 1. Node.js not recognised

**Symptom:** `'node' is not recognized as an internal or external command`.
**Cause:** Node.js is not installed, or PowerShell was opened before installation.
**Fix:** Install the LTS version from nodejs.org with "Add to PATH" ticked. Close **all** terminal and VS Code windows, then reopen. Run `node -v`.

## 2. npm installation failures

**Symptom:** `npm.ps1 cannot be loaded because running scripts is disabled`.
**Fix:** `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (affects only your Windows user), then reopen the terminal.

**Symptom:** `engine "node" is incompatible`.
**Fix:** install Node.js 20.18.0 or newer.

**Symptom:** `EACCES` or `EPERM` errors.
**Fix:** move the project out of `Program Files`, the Desktop sync folder or any read-only location to `C:\Projects`. Do not run the terminal as administrator to get around permissions.

**Symptom:** `ERESOLVE`.
**Fix:** `npm install --legacy-peer-deps`, then report the complete message.

## 3. Missing dependencies

**Symptom:** `Cannot find module 'next'`, `'zod'`, `'@supabase/ssr'` or similar.
**Cause:** `npm install` did not finish, or `node_modules` is incomplete.
**Fix:** run `npm install` again in the project root (the folder containing `package.json`). Make sure you are not inside a sub-folder.

**Symptom:** the unit test for `onboarding-schemas` fails with `Cannot find module 'zod'`.
**Cause:** dependencies are not installed. This is the only unit test that depends on an installed package.
**Fix:** complete `npm install`, then `npm test`.

## 4. Invalid environment variables

**Symptom:** `Missing required environment variable: <NAME>`.
**Fix:** open `.env.local` (not `.env.example`), add the named variable with its value, save, and restart `npm run dev`. Restart after every change.

**Symptom:** the app starts but payments or sign-in fail silently.
**Fix:** check `NEXT_PUBLIC_SUPABASE_URL` begins with `https://` and has no trailing space; check `NEXT_PUBLIC_RAZORPAY_KEY_ID` and `RAZORPAY_KEY_ID` are the same value.

**Symptom:** a QR code or a payment link points to `localhost` in production.
**Cause:** `NEXT_PUBLIC_APP_URL` is missing or wrong in Vercel Production. The application refuses to generate localhost links in production and reports a missing variable instead.
**Fix:** set `NEXT_PUBLIC_APP_URL` in Vercel Production to the public address, redeploy, and reprint QR codes.

**Symptom:** a change to a `NEXT_PUBLIC_` variable has no effect on Vercel.
**Fix:** public variables are compiled at build time; redeploy after changing them.

## 5. Supabase connection errors

**Symptom:** `Could not connect`, `fetch failed` or `ENOTFOUND <project>.supabase.co`.
**Fix:** check the Project URL in Supabase → Project Settings → API. Check your internet connection and any firewall or VPN that blocks `supabase.co`.

**Symptom:** `psql: could not connect to server` during migrations.
**Fix:** use the **Session pooler** connection string from Project Settings → Database. Check that the password in `DATABASE_URL` has been replaced and any special characters are URL-encoded (for example `@` becomes `%40`).

## 6. Invalid API keys

**Symptom:** `Invalid API key` or every database call returns `401`.
**Cause:** the anon key and service-role key were swapped, or a key from another project was pasted.
**Fix:** copy both keys again from the same project's API settings. The anon key is public; the service-role key is secret and must not appear in browser code.

## 7. Database migration failures

**Symptom:** `scripts/db.sh migrate` stops with `ERROR:` and a file name.
**Cause:** the migration depends on an earlier one that was not applied, or the target database already has an object with the same name.
**Fix:**
1. Read the first `ERROR` line; it names the object and the migration file.
2. Check what has been applied:

   ```bash
   psql "$DATABASE_URL" -c "select version from public.zentro_schema_migrations order by version;"
   ```

3. Do **not** edit a migration that has already been applied, and do not delete rows from `zentro_schema_migrations` to force a rerun. Report the error with the file name and the full message.

**Symptom:** `psql` is not recognised in Git Bash or PowerShell.
**Fix:** add the PostgreSQL `bin` folder (for example `C:\Program Files\PostgreSQL\16\bin`) to your PATH.

**Symptom:** `bash: scripts/db.sh: No such file or directory` or `Permission denied`.
**Fix:** run from the project root in Git Bash: `cd /c/Projects/zentro-buildmart`, then `bash scripts/db.sh migrate`.

## 8. Authentication failures

**Symptom:** sign-in says the email or password is wrong, but the password is correct.
**Cause:** the Auth user was created but not confirmed, or the account belongs to another Supabase project than the one in `.env.local`.
**Fix:** in the Supabase dashboard, open the user and confirm it. Check that `NEXT_PUBLIC_SUPABASE_URL` matches the project where the user was created.

**Symptom:** a Platform Admin is sent back to the sign-in page.
**Cause:** the `platform_admins` row is missing for that user.
**Fix:** follow `docs/SUPABASE_SETUP.md` section 2.6 once for the correct user UID.

**Symptom:** an owner cannot open a store page.
**Cause:** the owner is not linked to that store, or the subscription is not active.
**Fix:** check the owner's store link and subscription in the Platform Admin screens.

## 9. Row Level Security errors

**Symptom:** `new row violates row-level security policy` or `permission denied for table`.
**Cause:** the request is running as a role without the permission (for example, an anonymous browser request trying to write), or the user is not a member of the store.
**Fix:** confirm the user is signed in with the right account and has the permission in `/owner/staff`. Do not add a broad policy or disable RLS; the error is the protection working.

## 10. Storage upload errors

**Symptom:** `Bucket not found`.
**Fix:** migration `0022_storage.sql` creates the buckets. Run the verification in `docs/SUPABASE_SETUP.md` and check the Storage section of the dashboard.

**Symptom:** `The object exceeds the maximum allowed size` or `mime type not allowed`.
**Fix:** the limit is 5 MB for catalogue and branding images and 8 MB for private photos, in JPEG, PNG or WebP. Resize or convert the file.

## 11. Missing product images

**Symptom:** product cards show a placeholder, or images are blank.
**Cause:** no images have been uploaded (the repository contains no product photography), or the object was removed by the orphan cleanup because it was never linked to a product within 24 hours.
**Fix:** upload the images from `/owner/products/[id]` and link them to the product in the same session. Check the `catalogue-images` bucket is public. Supply licensed product photos; the brief requires suitable images and local fallbacks for each category, which are not yet bundled.

## 12. Razorpay payment failures

**Symptom:** the Razorpay window does not open.
**Cause:** `NEXT_PUBLIC_RAZORPAY_KEY_ID` is empty, or it belongs to the other mode (test key with Live Mode or the reverse).
**Fix:** check the key id prefix (`rzp_test_` for Test Mode, `rzp_live_` for Live Mode) and that the key is set in the environment you are testing.

**Symptom:** a payment succeeds in Razorpay but the order stays pending.
**Cause:** the webhook has not reached the application, or its secret does not match.
**Fix:** in Razorpay → Webhooks, open the delivery log. A `400` with `invalid signature` means `RAZORPAY_WEBHOOK_SECRET` differs from the secret in Razorpay. A `500` means the event failed inside the application; resend it after the fix. Use `/owner/payments` to see the attempt.

**Symptom:** payment methods (for example UPI QR) do not appear.
**Cause:** the method is not activated on your Razorpay account.
**Fix:** check Razorpay's dashboard activation status. The application cannot make a method available on its own.

## 13. Webhook signature failures

**Symptom:** Razorpay shows `400` responses for webhook deliveries.
**Fix:** `RAZORPAY_WEBHOOK_SECRET` must equal the secret entered for that exact webhook (Test and Live webhooks have different secrets). Redeploy after changing the variable on Vercel.

## 14. Invalid QR URLs

**Symptom:** a scanned QR opens the wrong address or a localhost address.
**Cause:** the QR was generated while `NEXT_PUBLIC_APP_URL` pointed elsewhere.
**Fix:** set the correct `NEXT_PUBLIC_APP_URL`, redeploy, and download and reprint the QR from `/owner/qr`.

## 15. TypeScript errors

**Symptom:** `npm run typecheck` lists errors.
**Fix:** read the first error: the file and line are shown. Errors such as `Cannot find module 'react'` or `Cannot find name 'process'` mean the dependencies or type packages are missing; run `npm install` first. Errors inside `app/` or `lib/` need the file opened and fixed; report them with the complete message if you cannot resolve them.

## 16. Next.js build errors

**Symptom:** `npm run build` fails.
**Fix:** run `npm run typecheck` and `npm run lint` first (lint requires ESLint configuration from the repository). Common causes are a missing environment variable needed at build time (any `NEXT_PUBLIC_` variable and `NEXT_PUBLIC_APP_URL` in production), a client component importing a server-only module (the error names both files), or an invalid `vercel.json`.

## 17. Vercel deployment failures

**Symptom:** the Vercel build stops with `Missing required environment variable`.
**Fix:** add the named variable in Vercel's environment for the same target (Production, Preview) and redeploy.

**Symptom:** the deployment succeeds but a cron job is rejected or never runs.
**Cause:** the plan does not support that schedule (see the Vercel guide, section 8), or `CRON_SECRET` is not set.
**Fix:** set `CRON_SECRET`, choose a plan that supports the schedule, and test the endpoint manually as described in the Vercel guide.

**Symptom:** the build uses a different Node version.
**Fix:** set Node.js 20.x or 22.x in Project Settings → Build and Deployment, then redeploy.

## 18. PWA installation problems

**Symptom:** no install prompt appears.
**Cause:** installation requires HTTPS (Vercel provides it; `localhost` is treated as secure), a valid manifest, a registered service worker and an icon set. The browser may also have dismissed the prompt before.
**Fix:** open the site over HTTPS, reload once, and use the browser's own install option (Chrome: the install icon in the address bar or the menu). On iPhone, use Safari's **Share → Add to Home Screen**. Clear the site data if an old service worker is stuck, then reload.

**Symptom:** the app shows an old version after a deployment.
**Fix:** `sw.js` is served with `no-cache` (see `vercel.json`). Close and reopen the app; if it persists, clear the site data.

---

## Reporting a problem

Include: the exact error text, the step that failed, the command you ran, `node -v` and `npm -v` output, and whether the problem occurs locally, in Preview or in Production. Never include keys, passwords or the contents of `.env.local`.
