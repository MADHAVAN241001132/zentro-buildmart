# Supabase Setup

This document separates three environments. Do not mix their procedures.

| Environment | Purpose | Database | Demo data | Auth and Storage |
|---|---|---|---|---|
| 1. Local development | Run the app on your PC | A hosted Supabase **development** project (recommended) | Optional, dev only | Hosted Supabase |
| 2. Hosted Supabase development | Shared test project for the team or for Vercel Preview | Hosted Supabase project | Optional, dev only | Hosted Supabase |
| 3. Production | Live client data | Hosted Supabase project used only for live data | **None** | Hosted Supabase |

**Local-only shims.** `supabase/local-stub/00_supabase_stub.sql` creates a minimal `auth` schema inside a **local PostgreSQL** test database so that the repository's SQL tests can run without a hosted project. It is for local testing only. **Never run it on a hosted Supabase project**, and do not follow any instruction to apply it to hosted Supabase.

---

## 1. Local development

Use the hosted development project described in section 2. The application needs hosted Supabase Auth and Storage to run; a bare local PostgreSQL database is enough only for the SQL tests:

```bash
DATABASE_URL=postgresql://localhost/zentro_test bash scripts/db.sh local-stub
DATABASE_URL=postgresql://localhost/zentro_test bash scripts/db.sh migrate
DATABASE_URL=postgresql://localhost/zentro_test bash scripts/db.sh test
```

Run the `local-stub` line only against the local test database. The `concurrency` suite (`bash scripts/db.sh concurrency`) needs a PostgreSQL superuser and creates a scratch database; it is for a local Linux or macOS machine.

---

## 2. Hosted Supabase development

### 2.1 Create the project

1. In the Supabase dashboard choose **New project**, name it (for example `zentro-buildmart-dev`), choose a region and a strong database password.
2. Record the **Project URL**, **anon public key**, **service_role key** (Project Settings → API) and the **database connection string** (Project Settings → Database). Use the **Session pooler** string if your network lacks IPv6.

### 2.2 Apply migrations

Migrations are applied with `psql` against the connection string, in filename order, each exactly once:

```bash
export DATABASE_URL='postgresql://postgres.<project-ref>:<PASSWORD>@<pooler-host>:5432/postgres'
bash scripts/db.sh migrate
```

On Windows run this in Git Bash. The migrations are `supabase/migrations/0001_core_schema.sql` to `0061_pos_gst_pricing.sql`.

Verify:

```bash
psql "$DATABASE_URL" -c "select count(*) as applied, max(version) as latest from public.zentro_schema_migrations;"
```

Expected: `applied` = `61`, `latest` = `0061_pos_gst_pricing.sql`.

Check that every public table has row-level security enabled:

```bash
psql "$DATABASE_URL" -c "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1;"
```

Review each name returned. Any table listed is a defect to report to the developers; do not disable RLS to make an error go away.

### 2.3 Required extensions

The migrations create what they need. Confirm that the database has the standard extensions in **Database → Extensions** if an error mentions `pgcrypto` or `uuid-ossp`; enable them there (they are standard Supabase extensions, not third-party software).

### 2.4 Storage buckets

Created by `supabase/migrations/0022_storage.sql`:

| Bucket | Public | Size limit | Allowed types |
|---|---|---|---|
| `catalogue-images` | Yes | 5 MB | JPEG, PNG, WebP |
| `store-branding` | Yes | 5 MB | JPEG, PNG, WebP |
| `private-photos` | No | 8 MB | JPEG, PNG, WebP |

Storage access policies are defined in the migrations. Do not create or edit buckets manually in the dashboard; if you need a change, add a new migration.

### 2.5 Authentication configuration

1. **Authentication → Providers → Email**: enabled.
2. **Disable public sign-up.** Owner and staff accounts are created by the platform administrator through the service-role provisioning service. Guests do not need accounts. The application does not call a public sign-up function.
3. **Authentication → URL Configuration**:
   - **Site URL**: your application URL (`http://localhost:3000` for local work; the production URL at deployment).
   - **Redirect URLs**: add the same origin. The application currently has no e-mail link callback route, so no further redirect entries are needed; add them if you later enable password reset.
4. The database creates a `profiles` row automatically when an Auth user is created (trigger `on_auth_user_created`, migration `0002_rls.sql`).

### 2.6 First Platform Admin

The application has no in-app bootstrap. A Platform Admin is a row in `public.platform_admins` that points to an existing profile. Do this once, securely:

1. **Authentication → Users → Add user → Create new user.** Enter the administrator's work email and a strong password. Tick **Auto Confirm User**. Click **Create user**.
2. Copy the new user's **UID** from the users list.
3. Open **SQL Editor → New query**, paste the statement below, replace `<AUTH-USER-UID>` with the UID, and run it **once**:

   ```sql
   insert into public.platform_admins (profile_id)
   select id from public.profiles where id = '<AUTH-USER-UID>'::uuid
   on conflict (profile_id) do nothing;
   ```

4. Verify:

   ```sql
   select p.id, p.full_name from public.platform_admins a join public.profiles p on p.id = a.profile_id;
   ```

   Expect exactly the administrator's row.

5. Sign in at `/admin/login`. Do not share the password or the SQL result.

Create additional Platform Admins only through the same procedure, and only when you intend them to have full platform access.

### 2.7 Store and Store Owner accounts

Use the administrator screens, not SQL:

1. `/admin/stores/new` (or `/admin/onboarding`) creates the store.
2. `/admin/owners` creates or links a Store Owner account.
3. `/admin/subscriptions` assigns the subscription.
4. `docs/PROVISIONING.md` explains the provisioning states, failure handling and reconciliation at `/admin/provisioning`.

### 2.8 Demo data (development only)

`scripts/db.sh seed-dev` runs `supabase/seed/dev_seed.sql`. It creates demo stores and accounts with a **known password**, and it refuses to run unless `ZENTRO_ALLOW_DEV_SEED=1` is set. It inserts fixed profile identifiers, so it is written for the local test database. Do **not** run it on production. On a hosted development project, run it only after you have confirmed that the referenced accounts exist, and delete the demo accounts before any real use.

---

## 3. Production Supabase setup

1. Create a **separate** Supabase project for production. Do not reuse the development project.
2. Apply migrations exactly as in section 2.2, using the production connection string. Do **not** run `seed-dev`.
3. Confirm storage buckets (section 2.4) and authentication settings (section 2.5), with Site URL set to the production address.
4. Create the first Platform Admin (section 2.6) with a unique administrator email and a password stored in a password manager.
5. Create stores and owners through the administrator screens. Do not insert customers, orders or demo accounts by SQL.
6. Store the production `SUPABASE_SERVICE_ROLE_KEY` only in Vercel's **Production** environment variables (see the Vercel guide).
7. Enable backups in Supabase (**Project Settings → Database → Backups**). Check the plan you choose for backup retention before relying on it.

---

## 4. Verification commands (any environment)

```bash
# Migrations applied
psql "$DATABASE_URL" -c "select count(*) from public.zentro_schema_migrations;"

# Platform administrators (should list only intended people)
psql "$DATABASE_URL" -c "select profile_id, created_at from public.platform_admins;"

# Demo accounts must NOT exist in production
psql "$DATABASE_URL" -c "select count(*) from public.stores where name ilike '%demo%';"
```

Expected in production: the first and second queries return values you recognise; the third returns `0`.
