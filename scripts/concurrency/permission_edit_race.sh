#!/usr/bin/env bash
# Two owners edit the same member's permissions at the same moment. The member row is locked FOR UPDATE by
# zb_set_store_member_access, so the edits serialise. Expected: both calls succeed (no error), and the final
# permission set equals exactly one of the two submitted sets. A mixed set is a failure.
# Run as a PostgreSQL superuser: sudo -u postgres bash scripts/concurrency/permission_edit_race.sh
set -u
DB="${CONC_DB:-zentro_conc_access}"
TEMPLATE="${CONC_TEMPLATE:-zentro_v6}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STORE=00000000-0000-0000-0000-00000000e001
OWNER_A=00000000-0000-0000-0000-00000000f001
OWNER_B=00000000-0000-0000-0000-00000000f002
MEMBER=00000000-0000-0000-0000-00000000f003

psql -q -d postgres -c "drop database if exists $DB" >/dev/null
createdb -T "$TEMPLATE" "$DB" || { echo "could not create $DB from $TEMPLATE"; exit 2; }

psql -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null <<SQL
insert into auth.users (id, email) values
  ('$OWNER_A', 'access-owner-a@example.test'),
  ('$OWNER_B', 'access-owner-b@example.test'),
  ('$MEMBER',  'access-member@example.test');
insert into profiles (id, full_name) values
  ('$OWNER_A', 'Owner A'), ('$OWNER_B', 'Owner B'), ('$MEMBER', 'Member')
  on conflict (id) do nothing;
insert into stores (id, slug, name, status) values ('$STORE', 'access-race', 'Access race', 'active');
insert into subscription_plans (code, name, billing_interval, price_paise, max_products, max_users, features)
  values ('RACE_ACCESS_PLAN', 'Access race plan', 'monthly', 1000, 100, 10, '{}');
insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  select '$STORE', id, 'active', current_date - 1, current_date + 30 from subscription_plans where code = 'RACE_ACCESS_PLAN';
insert into store_owners (store_id, profile_id, role, is_active) values
  ('$STORE', '$OWNER_A', 'owner', true),
  ('$STORE', '$OWNER_B', 'owner', true),
  ('$STORE', '$MEMBER', 'staff', true);
delete from store_member_permissions where store_id = '$STORE' and profile_id = '$MEMBER';
SQL

# Each session runs as the owner it names: role authenticated with that user's JWT subject.
session() {  # $1 file, $2 owner id, $3 delay, $4 permission array, $5 hold seconds
cat > "$1" <<SQL
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$2","role":"authenticated"}', false);
select set_config('request.jwt.claim.sub', '$2', false);
select pg_sleep($3);
begin;
select public.zb_set_store_member_access('$STORE', '$MEMBER', 'staff', array[$4]::text[]);
select pg_sleep($5);
commit;
SQL
}
session "$TMP/a.sql" "$OWNER_A" 0 "'pos_billing','order_management'" 1.5
session "$TMP/b.sql" "$OWNER_B" 0.4 "'refund_management','reports_exports'" 0
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$TMP/a.sql" >"$TMP/a.out" 2>&1 & pa=$!
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$TMP/b.sql" >"$TMP/b.out" 2>&1 & pb=$!
wait $pa; ra=$?
wait $pb; rb=$?

final=$(psql -tA -d "$DB" -c "select coalesce(string_agg(permission_key, ',' order by permission_key), '') from store_member_permissions where store_id = '$STORE' and profile_id = '$MEMBER'")
echo "owner A exit=$ra owner B exit=$rb final_permissions=[$final]"
[ -s "$TMP/a.out" ] && grep -h ERROR "$TMP/a.out" "$TMP/b.out" | sed 's/^/  /'
if [ "$ra" -eq 0 ] && [ "$rb" -eq 0 ] && { [ "$final" = "order_management,pos_billing" ] || [ "$final" = "refund_management,reports_exports" ]; }; then
  echo "PASS: concurrent permission edits serialise to one complete set"; exit 0
fi
echo "FAIL: expected both edits to succeed and the final set to equal one submitted set"; exit 1
