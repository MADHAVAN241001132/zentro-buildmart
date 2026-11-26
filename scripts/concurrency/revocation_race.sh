#!/usr/bin/env bash
# Permission revocation racing a sensitive operation.
# Authority is evaluated per statement. A statement that passed its check before the revocation committed
# stands; statements that start after the revocation committed are refused, both later in the same transaction
# and in new transactions. Expected: the first write affects 1 row, and after the revocation commits the same
# write affects 0 rows (RLS refuses it) in the same transaction and in a new one.
# Run as a PostgreSQL superuser: sudo -u postgres bash scripts/concurrency/revocation_race.sh
set -u
DB="${CONC_DB:-zentro_conc_revoke}"
TEMPLATE="${CONC_TEMPLATE:-zentro_v6}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STORE=00000000-0000-0000-0000-00000000e101
OWNER=00000000-0000-0000-0000-00000000f101
MEMBER=00000000-0000-0000-0000-00000000f102
CATEGORY=00000000-0000-0000-0000-00000000f103

psql -q -d postgres -c "drop database if exists $DB" >/dev/null
createdb -T "$TEMPLATE" "$DB" || { echo "could not create $DB from $TEMPLATE"; exit 2; }

psql -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null <<SQL
insert into auth.users (id, email) values
  ('$OWNER', 'revoke-owner@example.test'), ('$MEMBER', 'revoke-member@example.test');
insert into profiles (id, full_name) values ('$OWNER', 'Owner'), ('$MEMBER', 'Member') on conflict (id) do nothing;
insert into stores (id, slug, name, status) values ('$STORE', 'revoke-race', 'Revoke race', 'active');
insert into subscription_plans (code, name, billing_interval, price_paise, max_products, max_users, features)
  values ('RACE_ACCESS_PLAN', 'Access race plan', 'monthly', 1000, 100, 10, '{}');
insert into subscriptions (store_id, plan_id, status, period_start, period_end)
  select '$STORE', id, 'active', current_date - 1, current_date + 30 from subscription_plans where code = 'RACE_ACCESS_PLAN';
insert into store_owners (store_id, profile_id, role, is_active) values
  ('$STORE', '$OWNER', 'owner', true), ('$STORE', '$MEMBER', 'staff', true);
delete from store_member_permissions where store_id = '$STORE' and profile_id = '$MEMBER';
insert into store_member_permissions (store_id, profile_id, permission_key, granted_by)
  values ('$STORE', '$MEMBER', 'category_brand_management', '$OWNER');
insert into categories (id, store_id, name, slug) values ('$CATEGORY', '$STORE', 'Before', 'before-race');
SQL

# Member session: the write is one sensitive operation, attempted before and after the revocation commits.
cat > "$TMP/member.sql" <<SQL
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$MEMBER","role":"authenticated"}', false);
select set_config('request.jwt.claim.sub', '$MEMBER', false);
\echo BEFORE_TX_1
begin;
with u as (update categories set name = 'Inside 1' where id = '$CATEGORY' returning id) select 'first_write_rows=' || count(*) from u;
select pg_sleep(2);
with u as (update categories set name = 'Inside 2' where id = '$CATEGORY' returning id) select 'same_tx_rows=' || count(*) from u;
commit;
with u as (update categories set name = 'Inside 3' where id = '$CATEGORY' returning id) select 'new_tx_rows=' || count(*) from u;
SQL

cat > "$TMP/owner.sql" <<SQL
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$OWNER","role":"authenticated"}', false);
select set_config('request.jwt.claim.sub', '$OWNER', false);
select pg_sleep(0.8);
select public.zb_set_store_member_access('$STORE', '$MEMBER', 'staff', array[]::text[]);
SQL

psql -d "$DB" -v ON_ERROR_STOP=1 -t -A -f "$TMP/member.sql" >"$TMP/member.out" 2>&1 & pm=$!
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$TMP/owner.sql" >"$TMP/owner.out" 2>&1 & po=$!
wait $pm; rm_=$?
wait $po; ro=$?

first=$(grep -o 'first_write_rows=[0-9]*' "$TMP/member.out" | cut -d= -f2)
same=$(grep -o 'same_tx_rows=[0-9]*' "$TMP/member.out" | cut -d= -f2)
newtx=$(grep -o 'new_tx_rows=[0-9]*' "$TMP/member.out" | cut -d= -f2)
echo "member exit=$rm_ owner revoke exit=$ro first=$first same_tx=$same newtx=$newtx"
if [ "$rm_" -eq 0 ] && [ "$ro" -eq 0 ] && [ "$first" = "1" ] && [ "$same" = "0" ] && [ "$newtx" = "0" ]; then
  echo "PASS: revoked permission blocks later statements in the same and new transactions; in-flight statement stands"; exit 0
fi
echo "FAIL: revocation boundary not as specified"; [ -s "$TMP/member.out" ] && grep -h ERROR "$TMP/member.out" | sed 's/^/  /'; exit 1
