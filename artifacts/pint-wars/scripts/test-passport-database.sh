#!/usr/bin/env bash
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
TEMP="$(mktemp -d /tmp/pint-passport-db.XXXXXX)"
cleanup() {
  pg_ctl -D "$TEMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TEMP"
}
trap cleanup EXIT
initdb -D "$TEMP/data" --auth=trust --no-locale >/dev/null
pg_ctl -D "$TEMP/data" -l "$TEMP/server.log" -o "-h '' -k $TEMP -p 55439" start >/dev/null
PSQL=(psql -X -h "$TEMP" -p 55439 -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$APP/scripts/passport-test-bootstrap.sql" >"$TEMP/bootstrap.log" 2>&1
for migration in "$APP"/supabase/migrations/[0-9]*.sql; do
  if [[ "$(basename "$migration")" == "202610080001_pub_passport_visits.sql" ]]; then
    "${PSQL[@]}" -c "create table public.passport_test_war_definitions as select oid::regprocedure::text as signature, pg_get_functiondef(oid) as definition from pg_proc where proname in ('log_pint_verified','create_pub_review','delete_my_account','reject_deidentified_user_activity');" >>"$TEMP/bootstrap.log" 2>&1
  fi
  if ! "${PSQL[@]}" -f "$migration" >>"$TEMP/bootstrap.log" 2>&1; then
    echo "Migration failed: $(basename "$migration")"
    tail -25 "$TEMP/bootstrap.log"
    exit 1
  fi
done
"${PSQL[@]}" -f "$APP/scripts/passport-database.test.sql"
