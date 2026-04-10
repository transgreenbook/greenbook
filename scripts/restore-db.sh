#!/bin/bash
# Restore the local Supabase Postgres database from a backup file.
#
# Usage:
#   bash scripts/restore-db.sh                        # restore latest backup
#   bash scripts/restore-db.sh greenbook-20260410-194741.sql.gz  # specific file
#
# WARNING: This will DROP and recreate the public schema, replacing all data.

set -euo pipefail

BACKUP_DIR="$HOME/greenbook-backups"
CONTAINER="supabase_db_greenbook"

# Resolve the target file
if [ $# -ge 1 ]; then
  # Accept a bare filename or a full path
  if [ -f "$1" ]; then
    BACKUP_FILE="$1"
  elif [ -f "$BACKUP_DIR/$1" ]; then
    BACKUP_FILE="$BACKUP_DIR/$1"
  else
    echo "ERROR: File not found: $1"
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/greenbook-*.sql.gz 2>/dev/null || echo "  (none)"
    exit 1
  fi
else
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/greenbook-*.sql.gz 2>/dev/null | head -1)
  if [ -z "$BACKUP_FILE" ]; then
    echo "ERROR: No backups found in $BACKUP_DIR"
    exit 1
  fi
  echo "No file specified — using latest backup:"
fi

echo "Restoring from: $BACKUP_FILE"
echo ""
read -r -p "This will REPLACE all current data. Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "[restore] Starting restore at $(date)"
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U postgres postgres
echo "[restore] Done at $(date)"
