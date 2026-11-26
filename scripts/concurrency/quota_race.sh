#!/usr/bin/env bash
# Two-session race: two inactive members are activated at the same moment on a plan that allows two users,
# where one owner is already active. Expected: exactly one activation commits and the store ends with two users.
# Run as a PostgreSQL superuser: sudo -u postgres bash scripts/concurrency/quota_race.sh
set -u
DB="${CONC_DB:-zentro_conc_quota}"
TEMPLATE="${CONC_TEMPLATE:-zentro_v6}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

psql -q -d postgres -c "drop database if exists $DB" >/dev/null
createdb -T "$TEMPLATE" "$DB" || { echo "could not create $DB from $TEMPLATE"; exit 2; }

psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c001', 'quota-owner@example.test'),
  ('00000000-0000-0000-0000-00000000c002', 'quota-m1@example.test'),
  ('00000000-0000-0000-0000-00000000c003', 'quota-m2@example.test');
insert into profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000c001', 'Owner'),
  ('00000000-0000-0000-0000-00000000c002', 'Member 1'),
  ('00000000-0000-0000-0000-00000000c003', 'Member 2')
  on conflict (id) do nothing;
insert into stores (id, slug, name, status) values
  ('00000000-0000-0000-0000-00000000d001', 'quota-race', 'Quota race', 'active');
insert into subscription_plans (code, name, billing_interval, price_paise, max_products, max_users, features)
  values ('RACE_TWO_USERS', 'Two users', 'monthly', 1000, 100, 2, '{}');
insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  select '00000000-0000-0000-0000-00000000d001', id, 'active', current_date - 1, current_date + 30
  from subscription_plans where code = 'RACE_TWO_USERS';
insert into store_owners (store_id, profile_id, role, is_active) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c001', 'owner', true),
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c002', 'staff', false),
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c003', 'staff', false);
SQL

write_session() {  # $1 file, $2 member id, $3 delay
cat > "$1" <<SQL
select pg_sleep($3);
begin;
update store_owners set is_active = true
 where store_id = '00000000-0000-0000-0000-00000000d001' and profile_id = '$2';
select pg_sleep(1.5);
commit;
SQL
}
write_session "$TMP/s2.sql" 00000000-0000-0000-0000-00000000c002 0
write_session "$TMP/s3.sql" 00000000-0000-0000-0000-00000000c003 0.3
# Session 2 holds its transaction open, so session 3 overlaps it.
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$TMP/s2.sql" >"$TMP/s2.out" 2>&1 & p2=$!
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$TMP/s3.sql" >"$TMP/s3.out" 2>&1 & p3=$!
wait $p2; r2=$?
wait $p3; r3=$?

active=$(psql -tA -d "$DB" -c "select count(*) from store_owners where store_id = '00000000-0000-0000-0000-00000000d001' and is_active")
echo "session 2 exit=$r2 session 3 exit=$r3 active_users_after=$active (limit 2)"
[ -s "$TMP/s3.out" ] && grep -h ERROR "$TMP/s3.out" "$TMP/s2.out" | sed 's/^/  /'
if [ "$active" -eq 2 ] && [ $(( (r2==0) + (r3==0) )) -eq 1 ]; then echo "PASS: quota held under concurrent activation"; exit 0; fi
echo "FAIL: expected exactly one activation and two active users"; exit 1
