# START HERE

Read this file first. Follow the numbers in order. Each step tells you which detailed guide to open if you need more.

**What this project is:** ZENTRO BuildMart, a QR digital showroom and store-management system for construction retail. It has three portals: the Platform Admin, the Store Owner (with staff), and the Guest storefront that customers open by scanning a store QR code.

**What you need before starting:** Windows, an internet connection, a GitHub account, a Vercel account and a Supabase account. Razorpay is needed only for online payments.

---

1. **Install Node.js 20.18 or newer (LTS recommended).** Download from https://nodejs.org. Check with `node -v`. → `docs/LOCAL_SETUP_GUIDE.md` Step 1.

2. **Install Git for Windows.** It also gives you Git Bash, which you need for the database step. Check with `git --version`. → Step 1.

3. **Install Visual Studio Code** from https://code.visualstudio.com.

4. **Install the PostgreSQL client (`psql`) 16** from the EnterpriseDB installer; keep "Command Line Tools" ticked. Check with `psql --version`. → Step 1.

5. **Extract this ZIP** into `C:\Projects`. → Step 2.

6. **Open the project root in VS Code.** The folder must contain `package.json`. Use **File → Open Folder**. Open the terminal with `` Ctrl+` ``. → Step 2.

7. **Install the dependencies.** Run `npm install` in the terminal. Wait for it to finish. Keep the `package-lock.json` it creates. → Step 3.

8. **Create a Supabase project** (a development project is fine for local work). Note the Project URL, anon key and service-role key, and the database connection string. → `docs/SUPABASE_SETUP.md` section 2.1 and `docs/LOCAL_SETUP_GUIDE.md` Step 4.

9. **Copy the environment template.** Run `Copy-Item .env.example .env.local`, then fill in the values in `.env.local`. Never share this file. → Step 5 and the variable table in `docs/VERCEL_DEPLOYMENT_GUIDE.md`.

10. **Apply the database migrations.** In Git Bash from the project root, run `export DATABASE_URL='<your connection string>'` and then `bash scripts/db.sh migrate`. Confirm 61 migrations are applied. → `docs/LOCAL_SETUP_GUIDE.md` Step 6 and `docs/SUPABASE_SETUP.md` section 2.2.

11. **Create the first Platform Admin.** Create the user in Supabase Authentication, then run the one-time SQL statement in `docs/SUPABASE_SETUP.md` section 2.6. → `docs/LOCAL_SETUP_GUIDE.md` Step 7.

12. **Start the application.** Run `npm run dev`, then open **http://localhost:3000**. → Step 9.

13. **Open the portal you need:**
    - Platform Admin: `http://localhost:3000/admin/login`
    - Store Owner and staff: `http://localhost:3000/owner/login`
    - Guest storefront: `http://localhost:3000/store/<store-slug>`
    - Store QR entry: `http://localhost:3000/q/<token>` (the token comes from the store's QR page at `/owner/qr`)

14. **Create a store and a Store Owner** from the Platform Admin screens, then sign in as the owner and add categories, products, images and inventory. → `docs/LOCAL_SETUP_GUIDE.md` Step 10 (the full walkthrough).

15. **Optional: configure Razorpay Test Mode** for online payments. → `docs/RAZORPAY_SETUP.md`.

16. **Put the project on GitHub** as a **private** repository, and confirm `.env.local` is not uploaded. → `docs/GITHUB_SETUP_GUIDE.md`.

17. **Deploy to Vercel.** Import the GitHub repository, add the environment variables for Production, set `NEXT_PUBLIC_APP_URL` to your live address, deploy, then update Supabase and Razorpay with that address. → `docs/VERCEL_DEPLOYMENT_GUIDE.md`.

18. **Check the plan you choose.** Commercial use and the scheduled jobs need a suitable Vercel plan. → `docs/VERCEL_DEPLOYMENT_GUIDE.md` section 8.

19. **Read what is not finished** before you give the system to a client. → `docs/FINAL_PROJECT_STATUS.md` and `docs/UI_FIDELITY_REPORT.md`.

20. **If something fails,** find the symptom in `docs/TROUBLESHOOTING.md`.

---

**Detailed guides**

| Guide | Use it for |
|---|---|
| `README.md` | Overview, architecture, folder structure, all commands |
| `docs/LOCAL_SETUP_GUIDE.md` | Step-by-step set-up on Windows with VS Code |
| `docs/SUPABASE_SETUP.md` | Supabase projects, migrations, storage, first Platform Admin |
| `docs/RAZORPAY_SETUP.md` | Razorpay Test Mode, webhooks, refunds, going live |
| `docs/GITHUB_SETUP_GUIDE.md` | Private repository, commits, pushing updates |
| `docs/VERCEL_DEPLOYMENT_GUIDE.md` | Deployment, environment variables, domain, scheduled jobs |
| `docs/TROUBLESHOOTING.md` | Common errors and their fixes |
| `docs/FINAL_PROJECT_STATUS.md` | What is complete, partial, unverified or missing |
| `docs/UI_FIDELITY_REPORT.md` | Stitch design comparison and route table |
| `docs/TAX_ASSUMPTIONS.md` | GST assumptions that need review by a tax professional |

**Important:** this package has been prepared for deployment but has not been built, run or tested in a browser in the environment where it was prepared. Follow `docs/FINAL_PROJECT_STATUS.md` before you rely on it for real customers.
