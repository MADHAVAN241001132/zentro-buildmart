#!/usr/bin/env bash
# Two-session race: two active owners of one store are deactivated at the same time.
# Each session holds its transaction open, so the second session overlaps the first.
# Expected: exactly one deactivation commits; the store keeps one active owner.
# Run as a PostgreSQL superuser, for example: sudo -u postgres bash scripts/concurrency/last_owner_race.sh
set -u
DB="${CONC_DB:-zentro_conc}"
TEMPLATE="${CONC_TEMPLATE:-zentro_v6}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

psql -q -d postgres -c "drop database if exists $DB" >/dev/null
createdb -T "$TEMPLATE" "$DB" || { echo "could not create $DB from $TEMPLATE"; exit 2; }

psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL' >/dev/null
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'race-x@example.test'),
  ('00000000-0000-0000-0000-00000000a002', 'race-y@example.test');
insert into profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000a001', 'Owner X'),
  ('00000000-0000-0000-0000-00000000a002', 'Owner Y')
  on conflict (id) do nothing;
insert into stores (id, slug, name, status) values
  ('00000000-0000-0000-0000-00000000b001', 'race-store', 'Race store', 'active');
insert into subscription_migration_allowances (store_id, expires_on, reason)
  values ('00000000-0000-0000-0000-00000000b001', current_date + 5, 'concurrency test');
insert into store_owners (store_id, profile_id, role, is_active) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a001', 'owner', true),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a002', 'owner', true);
SQL

cat > "$TMP/a.sql" <<'SQL'
begin;
update store_owners set is_active = false
 where store_id = '00000000-0000-0000-0000-00000000b001' and profile_id = '00000000-0000-0000-0000-00000000a001';
select pg_sleep(2);
commit;
SQL
cat > "$TMP/b.sql" <<'SQL'
select pg_sleep(0.5);
begin;
update store_owners set is_active = false
 where store_id = '00000000-0000-0000-0000-00000000b001' and profile_id = '00000000-0000-0000-0000-00000000a002';
commit;
SQL

psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$TMP/a.sql" >"$TMP/a.out" 2>&1 & pa=$!
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$TMP/b.sql" >"$TMP/b.out" 2>&1 & pb=$!
wait $pa; ra=$?
wait $pb; rb=$?

active=$(psql -tA -d "$DB" -c "select count(*) from store_owners where store_id = '00000000-0000-0000-0000-00000000b001' and role = 'owner' and is_active")
echo "session A exit=$ra session B exit=$rb active_owners_after=$active"
[ -s "$TMP/b.out" ] && sed 's/^/  B: /' "$TMP/b.out"
if [ "$active" -ge 1 ] && [ $(( (ra==0) + (rb==0) )) -eq 1 ]; then echo "PASS: exactly one deactivation committed"; exit 0; fi
echo "FAIL: expected exactly one committed deactivation and at least one active owner"; exit 1
