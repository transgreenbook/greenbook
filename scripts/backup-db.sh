#!/bin/bash
# Dump the local Supabase Postgres database to a timestamped gzipped SQL file.
# Backs up both auth user data (auth.users, auth.identities) and the full
# public schema so a restore is completely self-contained.
# Keeps the 14 most recent backups and removes older ones.
#
# Run manually:   bash scripts/backup-db.sh
# Run via systemd: systemctl --user start greenbook-backup.service

set -euo pipefail

BACKUP_DIR="$HOME/greenbook-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Auto-detect the Supabase DB container (works across different project names).
CONTAINER="${CONTAINER:-$(docker ps --format '{{.Names}}' | grep -E 'supabase_db' | head -1)}"
if [ -z "$CONTAINER" ]; then
  echo "ERROR: No running Supabase DB container found. Is Supabase started?"
  exit 1
fi
OUTFILE="$BACKUP_DIR/greenbook-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting dump at $(date)"

{
  # ----------------------------------------------------------------
  # 1. Auth user data — output FIRST so auth.users rows exist before
  #    public.profiles (which has a FK to auth.users) is inserted.
  # ----------------------------------------------------------------
  echo "-- ============================================================"
  echo "-- Auth user data"
  echo "-- ============================================================"
  echo "DELETE FROM auth.identities;"
  echo "DELETE FROM auth.users;"
  echo ""
  docker exec "$CONTAINER" pg_dump -U postgres postgres \
    --data-only \
    --table=auth.users \
    --table=auth.identities \
    --column-inserts \
    --no-privileges
  echo ""

  # ----------------------------------------------------------------
  # 2. Public schema — schema + data with clean/recreate semantics
  # ----------------------------------------------------------------
  echo "-- ============================================================"
  echo "-- Public schema"
  echo "-- ============================================================"
  docker exec "$CONTAINER" pg_dump -U postgres postgres \
    --schema=public \
    --no-privileges \
    --no-owner \
    --clean \
    --if-exists

} | gzip > "$OUTFILE"

echo "[backup] Wrote $OUTFILE ($(du -h "$OUTFILE" | cut -f1))"

# Retain the 14 most recent backups (~2 weeks at nightly frequency)
KEEP=14
OLDER=$(ls -t "$BACKUP_DIR"/greenbook-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)))
if [ -n "$OLDER" ]; then
  echo "[backup] Removing old backups:"
  echo "$OLDER" | while read -r f; do
    echo "  $f"
    rm "$f"
  done
fi

echo "[backup] Done. Current backups:"
ls -lh "$BACKUP_DIR"/greenbook-*.sql.gz 2>/dev/null || echo "  (none)"
