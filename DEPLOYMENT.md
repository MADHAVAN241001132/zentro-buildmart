# ZENTRO BuildMart — Production Deployment Checklist

This checklist prepares **ZENTRO BuildMart** for GitHub and Vercel production deployment. For detailed step-by-step instructions, also see [`docs/VERCEL_DEPLOYMENT_GUIDE.md`](docs/VERCEL_DEPLOYMENT_GUIDE.md) and [`docs/GITHUB_SETUP_GUIDE.md`](docs/GITHUB_SETUP_GUIDE.md).

## 1. Pre-Deployment Verification

Run locally before pushing:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 2. Required Vercel Environment Variables

Configure these in **Vercel → Project Settings → Environment Variables** (never commit `.env.local`):

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Hosted Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | **Server-only** (never `NEXT_PUBLIC_`) |
| `NEXT_PUBLIC_APP_URL` | Production | Exact `https://` domain, no trailing slash (required in production) |
| `CRON_SECRET` | Production | Random 32+ char secret for Vercel Cron (`/api/cron/*`) |
| `ZENTRO_PAYMENT_MODE` | Production | Must be `razorpay` (`simulator` is refused in production) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Production | Razorpay Key ID (when online payments enabled) |
| `RAZORPAY_KEY_ID` | Production | Same Razorpay Key ID (server-side) |
| `RAZORPAY_KEY_SECRET` | Production | Razorpay Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Production | Razorpay Webhook Secret |
| `AI_IMAGE_PROVIDER` | Production | `disabled` (default without cloud AI), `huggingface`, or `openai` (never `comfyui`) |

## 3. Vercel Project Settings

- **Framework Preset:** Next.js (`vercel.json` is included)
- **Root Directory:** `zentro-buildmart` (if repository root is the parent folder) or `./` (if `zentro-buildmart` is the repo root)
- **Node.js Version:** `20.x` or `22.x` (`engines.node >= 20.18.0`)
- **Region:** `bom1` (Mumbai, configured in `vercel.json`)
- **Cron Jobs:** Configured in `vercel.json` (`/api/cron/expire-payments`, `/api/cron/storage-orphans`, `/api/cron/expire-quotations`) with daily schedules (`0 0 * * *`, `30 20 * * *`, `0 2 * * *`) for Vercel Hobby plan compatibility. On Vercel Pro (or via an external scheduler calling with `Authorization: Bearer $CRON_SECRET`), `expire-payments` and `expire-quotations` can be increased to `*/15 * * * *` and `0 * * * *`.

## 4. Supabase Production Checklist

- Ensure all migrations `0001` through `0063` are applied to the production database.
- Add the production Vercel URL (`https://your-domain.vercel.app/**`) to **Supabase → Authentication → URL Configuration → Redirect URLs**.
- Verify `store-assets` and room visualizer storage buckets exist with appropriate RLS policies.
