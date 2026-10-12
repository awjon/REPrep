#!/usr/bin/env bash
# Local throwaway Postgres for database tests.
#   scripts/test-db.sh start   -> initdb + start on $PGPORT (default 54329), apply shim + migrations
#   scripts/test-db.sh stop
#   scripts/test-db.sh reset   -> drop and recreate the database, re-apply
# Prints the DATABASE_URL to use. CI uses a postgis service container + `apply` instead.
set -euo pipefail

PGPORT="${PGPORT:-54329}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA_DIR="${TEST_PG_DIR:-${TMPDIR:-/tmp}/reprep-test-pg}"
DB=reprep_test
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="postgres://postgres@127.0.0.1:${PGPORT}/${DB}"

as_pg() {
  if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi
}

apply() {
  local url="${1:-$URL}"
  psql "$url" -v ON_ERROR_STOP=1 -q -f "$ROOT/tests/db/supabase-shim.sql"
  psql "$url" -v ON_ERROR_STOP=1 -q -c "create extension if not exists postgis;" 2>/dev/null || true
  for f in "$ROOT"/lib/db/migrations/*.sql; do
    psql "$url" -v ON_ERROR_STOP=1 -q -f "$f"
  done
}

case "${1:-start}" in
  start)
    if [ ! -d "$DATA_DIR" ]; then
      mkdir -p "$DATA_DIR"
      [ "$(id -u)" = "0" ] && chown postgres "$DATA_DIR"
      as_pg "$PGBIN/initdb -D '$DATA_DIR' -U postgres --auth=trust -E UTF8 >/dev/null"
    fi
    as_pg "$PGBIN/pg_ctl -D '$DATA_DIR' -o '-p $PGPORT -k /tmp' -l '$DATA_DIR/log' -w start >/dev/null" || true
    psql "postgres://postgres@127.0.0.1:${PGPORT}/postgres" -q -c "drop database if exists ${DB};" -c "create database ${DB};"
    apply
    echo "$URL"
    ;;
  stop)
    as_pg "$PGBIN/pg_ctl -D '$DATA_DIR' -m fast stop >/dev/null" || true
    ;;
  reset)
    psql "postgres://postgres@127.0.0.1:${PGPORT}/postgres" -q -c "drop database if exists ${DB} with (force);" -c "create database ${DB};"
    apply
    echo "$URL"
    ;;
  apply)
    apply "${2:?usage: test-db.sh apply <database-url>}"
    ;;
  *)
    echo "usage: $0 start|stop|reset|apply <url>" >&2; exit 1 ;;
esac
