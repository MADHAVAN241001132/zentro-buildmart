# Local Setup Guide (Windows and VS Code)

This guide is for a Windows user who has not configured Supabase or deployed a full-stack application before. Follow the steps in order. Do not skip a step, and do not paste real secret values into any file that you might share.

**What you will run:** a Next.js application (the web pages and server code) that stores data in Supabase (PostgreSQL, sign-in and file storage). The database schema is applied with the repository's `scripts/db.sh` tool, which is a Bash script.

**Important Windows requirement:** `scripts/db.sh` is a Bash script. Run it from **Git Bash** (installed with Git for Windows) or from WSL. Windows PowerShell cannot run it directly.

---

## Step 1: Install the required software

Install each tool, then check its version in a new PowerShell window.

| Software | Required version | Where to get it | Check command |
|---|---|---|---|
| Node.js | 20.18.0 or newer (22 LTS recommended) | https://nodejs.org (LTS installer) | `node -v` |
| npm | Installed with Node.js | Automatic | `npm -v` |
| Git for Windows | Any recent version | https://git-scm.com (accept defaults; this also installs Git Bash) | `git --version` |
| Visual Studio Code | Any recent version | https://code.visualstudio.com | `code --version` |
| PostgreSQL client (`psql`) | 16 | EnterpriseDB Windows installer (https://www.enterprisedb.com). During setup, keep "Command Line Tools" ticked. | `psql --version` |
| Supabase CLI | Optional | Not needed by this repository's migration path (see Step 6) | — |
| Docker Desktop | Not needed | Only for running Supabase entirely on your PC; this guide uses a hosted Supabase project | — |

**Node.js check.** `node -v` must print `v20.18.0` or higher. If it prints `'node' is not recognized`, close and reopen PowerShell. If it still fails, reinstall Node.js and tick "Add to PATH".

**psql check.** If `psql --version` is not recognised, add the PostgreSQL `bin` folder (usually `C:\Program Files\PostgreSQL\16\bin`) to your PATH, then reopen PowerShell.

---

## Step 2: Extract the project

1. Download `ZENTRO-BuildMart-Final-FullStack-Vercel-INCOMPLETE.zip`.
2. Create a folder such as `C:\Projects`.
3. Right-click the ZIP file, choose **Extract All…**, and extract it into `C:\Projects`.
4. Open `C:\Projects\zentro-buildmart`. **This is the project root.** It is the folder that directly contains `package.json`, `README.md`, `START_HERE.md`, `app`, `lib` and `supabase`. If you see one more folder named `zentro-buildmart` inside it, go one level deeper; the root is the inner folder.
5. Open the project in VS Code: start VS Code, choose **File → Open Folder…**, and select the project root.
6. Open the integrated terminal: **Terminal → New Terminal** (or press `` Ctrl+` ``). Check that the prompt shows the project root path.

---

## Step 3: Install dependencies

The repository does **not** include a lock file (`package-lock.json`) in this package. Therefore use `npm install`, not `npm ci`.

```powershell
npm install
```

- This takes several minutes and creates `node_modules` and `package-lock.json`.
- After it finishes, keep the new `package-lock.json`. Commit it to GitHub (see the GitHub guide) so that Vercel installs the same versions you tested.

**Common installation errors**

| Message | Cause | Fix |
|---|---|---|
| `npm : File ... npm.ps1 cannot be loaded because running scripts is disabled` | PowerShell execution policy | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, answer `Y`, then open a new terminal and retry. This setting only affects your Windows user account. |
| `engine "node" is incompatible` | Node.js too old | Install Node.js 20.18.0 or newer (Step 1) and reopen VS Code. |
| `EACCES` or permission errors in the project folder | Project inside a protected folder | Move the project to `C:\Projects`, outside `Program Files` or the Desktop sync folder. |
| `ERESOLVE unable to resolve dependency tree` | Stale npm cache or a manual edit to `package.json` | Run `npm install --legacy-peer-deps` and report the message if it persists. |
| Network or registry errors (`ETIMEDOUT`, `ENOTFOUND`) | Corporate firewall or proxy | Connect to another network or configure npm's proxy; do not disable TLS verification. |

---

## Step 4: Create a Supabase project

Supabase provides the PostgreSQL database, sign-in (Auth) and file storage.

1. Sign in at https://supabase.com/dashboard with your account.
2. Click **New project**. Choose your organisation, enter a project name (for example `zentro-buildmart-dev`), and set a strong **database password**. Save this password in a password manager. Do not share it.
3. Select the **region** closest to your customers (for India, choose a Mumbai/Asia-Pacific region if offered). Click **Create new project** and wait for it to provision.
4. Open **Project Settings → API**. Note these three values (you will copy them in Step 5):
   - **Project URL** (`https://<project-ref>.supabase.co`) → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (this key is safe in browser code)
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (**server only; never put it in a browser file, a screenshot or a chat message**)
5. Open **Project Settings → Database** and copy the **connection string** (URI form) for the migration step. Use the **Session pooler** string if your network does not support IPv6. Replace `[YOUR-PASSWORD]` with your database password. Keep this string private; it is `DATABASE_URL`.
6. **Authentication settings.** Open **Authentication → Providers** and confirm **Email** is enabled. Open **Authentication → Sign In / Providers → Email** (or the equivalent in the current dashboard) and **disable public sign-ups**: owner and staff accounts are created by the platform administrator, and guests do not need accounts.
7. **Site URL.** Open **Authentication → URL Configuration** and set **Site URL** to `http://localhost:3000` for local work. You will change it at deployment (see the Vercel guide).
8. **Storage.** You do not create buckets by hand. Migration `0022_storage.sql` creates `catalogue-images` (public), `store-branding` (public) and `private-photos` (private) with their size and file-type limits. You will confirm them in Step 6.

---

## Step 5: Configure environment variables

1. In the VS Code terminal, copy the template to a local file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

2. Open `.env.local` in VS Code and fill in the values:

   | Variable | Value source | Public or secret |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Step 4, Project URL | Public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Step 4, anon public key | Public |
   | `SUPABASE_SERVICE_ROLE_KEY` | Step 4, service_role key | **Secret** |
   | `NEXT_PUBLIC_APP_URL` | Keep `http://localhost:3000` locally | Public |
   | `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay Dashboard, Test Mode key id (Step 8) | Public (key id only) |
   | `RAZORPAY_KEY_ID` | Same value as the line above | Server |
   | `RAZORPAY_KEY_SECRET` | Razorpay Dashboard, Test Mode key secret | **Secret** |
   | `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook secret (Step 8) | **Secret** |
   | `CRON_SECRET` | Any long random text you create (at least 32 characters) | **Secret** |
   | `ZENTRO_PAYMENT_MODE` | Keep `razorpay` | Server |

   To create a `CRON_SECRET` in PowerShell: `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")`.

3. Save the file. `.env.local` is ignored by Git (see the GitHub guide). Never rename it to `.env.example` or commit it.

**Public versus secret.** Variables beginning with `NEXT_PUBLIC_` are copied into browser code and must contain no secret. `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `CRON_SECRET` must never appear in browser code, screenshots or public messages.

**Validation.** Start the application (Step 9). A missing required value produces an error that names the variable, for example `Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY`.

---

## Step 6: Apply the database migrations

The repository applies migrations with `psql` against your database connection string. It does **not** use the Supabase CLI for this purpose. Migrations are applied once each, in filename order, and recorded in the table `public.zentro_schema_migrations`.

Run these commands in **Git Bash** from the project root (open Git Bash from VS Code's terminal dropdown: click the `⌄` beside the `+` and choose **Git Bash**):

```bash
export DATABASE_URL='postgresql://postgres.<project-ref>:<YOUR-PASSWORD>@<pooler-host>:5432/postgres'
bash scripts/db.sh migrate
```

Use the exact connection string you copied in Step 4 (with your password substituted). Quote it with single quotes as shown.

**Expected result:** a list of migrations, each marked `apply` the first time. The migration files run from `0001_core_schema.sql` through `0061_pos_gst_pricing.sql`.

**Verify the migration status:**

```bash
psql "$DATABASE_URL" -c "select count(*) as applied, max(version) as latest from public.zentro_schema_migrations;"
```

Expected: `applied` = `61` and `latest` = `0061_pos_gst_pricing.sql`.

**Storage check.** In the Supabase dashboard open **Storage**. You should see the buckets `catalogue-images`, `store-branding` and `private-photos`. Do not change their settings by hand.

**Do not run** `scripts/db.sh seed-dev` on a hosted project unless you intend to create demo accounts (see the Supabase guide). Demo accounts use a known password.

---

## Step 7: Create the first Platform Admin

The full, secure procedure is in `docs/SUPABASE_SETUP.md` (section "First Platform Admin"). In summary:

1. In the Supabase dashboard, open **Authentication → Users → Add user → Create new user**, enter your administrator email and a strong password, and tick **Auto Confirm User**.
2. Copy the new user's **UID**.
3. Open **SQL Editor**, paste the single `insert` statement from the Supabase guide, replace the UID, and run it once.
4. Start the application (Step 9), open `http://localhost:3000/admin/login`, and sign in. If the dashboard opens, the administrator role works.

Then create a store and a Store Owner from the administrator screens (`/admin/stores/new`, `/admin/owners`; procedure in `docs/PROVISIONING.md`).

---

## Step 8: Configure Razorpay Test Mode

Full instructions are in `docs/RAZORPAY_SETUP.md`. Summary for local work:

1. Create a Razorpay account and switch on **Test Mode**.
2. Create a **Test** API key under **Account & Settings → API Keys**. Copy the key id and key secret into `.env.local`.
3. Razorpay cannot send webhooks to `localhost`. For local payment-callback tests, either skip webhook tests locally or expose the application through a tunnel service and set `NEXT_PUBLIC_APP_URL` to that tunnel's HTTPS address. The webhook endpoint is `/api/webhooks/razorpay`.

Cash payments do not need Razorpay and can be tested immediately.

---

## Step 9: Start the application

In the VS Code terminal (PowerShell, in the project root):

```powershell
npm run dev
```

Leave this terminal running. Open a browser at **http://localhost:3000**.

### Application routes

| Portal | Route | Who uses it |
|---|---|---|
| Platform Admin sign-in | `/admin/login` | Platform administrators |
| Platform Admin dashboard | `/admin` | Platform administrators |
| Store Owner sign-in | `/owner/login` | Store owners, managers and staff |
| Store Owner dashboard | `/owner` | Store owners, managers and staff |
| Guest storefront | `/store/[storeSlug]` (for example `/store/ambattur-showroom`) | Customers |
| Store QR entry | `/q/[token]` | Customers scanning a store QR code |

Staff sign in through `/owner/login` with the account their owner created. Access depends on the staff permissions assigned.

---

## Step 10: Test the complete application

Work through these steps in order. Each step is an action you perform yourself; the application does not run them automatically.

1. Sign in as Platform Admin at `/admin/login`.
2. Create a store (`/admin/stores/new`).
3. Create a Store Owner (`/admin/owners`) and link the owner to the store.
4. Assign a subscription (`/admin/subscriptions`).
5. Configure store information and GST details in `/owner/settings`.
6. Add product categories (`/owner/categories`).
7. Add products and upload images (`/owner/products/new`).
8. Add inventory (`/owner/inventory`).
9. Generate the store QR (`/owner/qr`) and download it.
10. Open the guest storefront with the store's link or QR.
11. Add products to the cart (`/store/[storeSlug]/cart`).
12. Place a cash order at `/store/[storeSlug]/checkout`.
13. Sign in as the Store Owner and confirm the cash payment (`/owner/cash`).
14. Check that inventory moved (`/owner/inventory`).
15. Download the invoice from the order page.
16. Test an online payment in Razorpay Test Mode (see `docs/RAZORPAY_SETUP.md`).
17. Review reports (`/owner/reports`).

**Other walkthroughs.** POS: `/owner/pos/new`, add an item, save, then place as cash. Quotations: `/owner/quotations/new` and the guest request at `/store/[storeSlug]/quotes/request`. Refunds: `/owner/orders/[orderId]/refund`.

**Features that are incomplete or need external verification** are listed in `docs/FINAL_PROJECT_STATUS.md`.

---

## Stopping and restarting

- Stop the server: press `Ctrl+C` in the terminal running `npm run dev`.
- Restart: run `npm run dev` again. Your `.env.local` values are read at start-up. Restart after any change to `.env.local`.
