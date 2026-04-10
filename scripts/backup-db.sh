#!/bin/bash
# Dump the local Supabase Postgres database to a timestamped gzipped SQL file.
# Keeps the 14 most recent backups and removes older ones.
#
# Run manually:   bash scripts/backup-db.sh
# Run via systemd: systemctl --user start greenbook-backup.service

set -euo pipefail

BACKUP_DIR="$HOME/greenbook-backups"
CONTAINER="supabase_db_greenbook"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTFILE="$BACKUP_DIR/greenbook-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting dump at $(date)"
docker exec "$CONTAINER" pg_dump -U postgres postgres | gzip > "$OUTFILE"
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
