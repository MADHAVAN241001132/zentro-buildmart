#!/usr/bin/env bash
# ZENTRO BuildMart database tool.
#
#   DATABASE_URL=postgres://... scripts/db.sh migrate         # apply pending migrations (production-safe)
#   DATABASE_URL=postgres://... scripts/db.sh seed-dev        # demo data; refuses unless ZENTRO_ALLOW_DEV_SEED=1
#   DATABASE_URL=postgres://... scripts/db.sh test            # integrity and security tests (rolled back)
#   sudo -u postgres scripts/db.sh concurrency               # two-session last-owner race (scratch database)
#   DATABASE_URL=postgres://... scripts/db.sh local-stub      # local PostgreSQL only: create the Supabase stub
#
# Migrations are applied once each, in filename order, and recorded in zentro_schema_migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?Set DATABASE_URL to the target database connection string}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)

cmd="${1:-}"

guard_not_production() {
  if [[ "${ZENTRO_ENV:-}" == "production" || "${NODE_ENV:-}" == "production" ]]; then
    echo "Refusing to run '$cmd' in a production environment." >&2
    exit 1
  fi
}

ensure_ledger() {
  # The ledger is internal: RLS on, and no client role may read or write it.
  "${PSQL[@]}" -c "create table if not exists public.zentro_schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now());
    alter table public.zentro_schema_migrations enable row level security;
    revoke all on public.zentro_schema_migrations from anon, authenticated;" >/dev/null
}

case "$cmd" in
  migrate)
    ensure_ledger
    for f in "$ROOT"/supabase/migrations/*.sql; do
      version="$(basename "$f")"
      applied="$("${PSQL[@]}" -tA -c "select 1 from public.zentro_schema_migrations where version = '$version'")"
      if [[ -n "$applied" ]]; then
        echo "skip  $version (already applied)"
        continue
      fi
      echo "apply $version"
      # One transaction per file so a failed migration leaves nothing half-applied.
      "${PSQL[@]}" --single-transaction -f "$f"
      "${PSQL[@]}" -c "insert into public.zentro_schema_migrations (version) values ('$version')" >/dev/null
    done
    ;;

  seed-dev)
    guard_not_production
    if [[ "${ZENTRO_ALLOW_DEV_SEED:-}" != "1" ]]; then
      echo "Dev seed creates demo accounts with a known password. Set ZENTRO_ALLOW_DEV_SEED=1 to run it on this database." >&2
      exit 1
    fi
    "${PSQL[@]}" -f "$ROOT/supabase/seed/dev_seed.sql"
    echo "Dev seed applied. Demo password for all accounts: ZentroDev!2026"
    ;;

  concurrency)
    # Two-session race. Needs a superuser: run as postgres. Creates and drops a scratch database.
    bash "$ROOT/scripts/concurrency/last_owner_race.sh" && bash "$ROOT/scripts/concurrency/quota_race.sh" && bash "$ROOT/scripts/concurrency/permission_edit_race.sh" && bash "$ROOT/scripts/concurrency/revocation_race.sh" && bash "$ROOT/scripts/concurrency/checkout_race.sh"
    ;;
  test)
    "${PSQL[@]}" -f "$ROOT/supabase/tests/database_tests.sql" -f "$ROOT/supabase/tests/purchasing_tests.sql" -f "$ROOT/supabase/tests/credit_tests.sql" -f "$ROOT/supabase/tests/pos_tests.sql" -f "$ROOT/supabase/tests/delivery_cash_tests.sql" -f "$ROOT/supabase/tests/invoice_tests.sql" -f "$ROOT/supabase/tests/coupon_pos_tests.sql" -f "$ROOT/supabase/tests/guest_coupon_tests.sql" -f "$ROOT/supabase/tests/refund_tests.sql" -f "$ROOT/supabase/tests/gateway_reliability_tests.sql" -f "$ROOT/supabase/tests/guest_refund_request_tests.sql" -f "$ROOT/supabase/tests/quotation_tests.sql" -f "$ROOT/supabase/tests/report_tests.sql" -f "$ROOT/supabase/tests/report_tests_remaining.sql" -f "$ROOT/supabase/tests/storage_tests.sql" -f "$ROOT/supabase/tests/private_photo_tests.sql" -f "$ROOT/supabase/tests/product_import_tests.sql" -f "$ROOT/supabase/tests/guest_list_tests.sql" -f "$ROOT/supabase/tests/house_project_tests.sql" -f "$ROOT/supabase/tests/idempotency_tests.sql" -f "$ROOT/supabase/tests/onboarding_tests.sql" -f "$ROOT/supabase/tests/subscription_enforcement_tests.sql" -f "$ROOT/supabase/tests/subscription_policy_tests.sql" -f "$ROOT/supabase/tests/onboarding_business_tests.sql" -f "$ROOT/supabase/tests/qr_analytics_tests.sql" -f "$ROOT/supabase/tests/permission_tests.sql" -f "$ROOT/supabase/tests/module_authorization_tests.sql" -f "$ROOT/supabase/tests/policy_and_dashboard_tests.sql" -f "$ROOT/supabase/tests/storage_permission_tests.sql" -f "$ROOT/supabase/tests/rpc_exposure_tests.sql" -f "$ROOT/supabase/tests/provisioning_tests.sql" -f "$ROOT/supabase/tests/provisioning_hardening_tests.sql" -f "$ROOT/supabase/tests/admin_dashboard_tests.sql" -f "$ROOT/supabase/tests/guest_checkout_tests.sql" -f "$ROOT/supabase/tests/payment_recovery_tests.sql" -f "$ROOT/supabase/tests/late_refund_tests.sql" -f "$ROOT/supabase/tests/late_report_tests.sql" -f "$ROOT/supabase/tests/cash_invoice_tests.sql" -f "$ROOT/supabase/tests/checkout_pricing_tests.sql" -f "$ROOT/supabase/tests/cart_step_tests.sql" -f "$ROOT/supabase/tests/unmatched_attribution_tests.sql" -f "$ROOT/supabase/tests/subscription_expiry_settlement_tests.sql" -f "$ROOT/supabase/tests/gst_module_tests.sql" -f "$ROOT/supabase/tests/gst_pricing_mode_tests.sql" -f "$ROOT/supabase/tests/gst_pos_tests.sql"
    ;;

  local-stub)
    guard_not_production
    echo "Creates a minimal auth schema for LOCAL PostgreSQL testing only. Do not run on Supabase."
    "${PSQL[@]}" -f "$ROOT/supabase/local-stub/00_supabase_stub.sql"
    ;;

  *)
    echo "Usage: DATABASE_URL=... $0 {migrate|seed-dev|test|local-stub}" >&2
    exit 2
    ;;
esac
