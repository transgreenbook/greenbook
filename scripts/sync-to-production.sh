#!/bin/bash
# Push the latest git commits and copy the local database to the production server.
#
# Usage:
#   bash scripts/sync-to-production.sh
#
# What it does:
#   1. git push origin main
#   2. Dump the local Supabase database (via backup-db.sh)
#   3. scp the dump to the production server
#   4. Print the manual steps to finish on the server
#
# Prerequisites:
#   - SSH key-based auth configured for PROD_USER@PROD_HOST
#   - backup-db.sh working (Docker Supabase container running locally)

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────
PROD_HOST="transsafetravels.com"
PROD_USER="root"
PROD_BACKUP_DIR="~/greenbook-backups"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$HOME/greenbook-backups"

# ── 1. Push git ───────────────────────────────────────────────
echo "── 1. Pushing git ─────────────────────────────────────────"
git -C "$SCRIPT_DIR/.." push origin main
echo "  ✓ Pushed to origin/main"

# ── 2. Dump local database ────────────────────────────────────
echo ""
echo "── 2. Dumping local database ──────────────────────────────"
bash "$SCRIPT_DIR/backup-db.sh"

DUMP_FILE=$(ls -t "$BACKUP_DIR"/greenbook-*.sql.gz 2>/dev/null | head -1)
if [ -z "$DUMP_FILE" ]; then
  echo "ERROR: No backup file found after dump."
  exit 1
fi
echo "  Dump: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

# ── 3. scp to production ──────────────────────────────────────
echo ""
echo "── 3. Copying database to production ──────────────────────"
ssh "$PROD_USER@$PROD_HOST" "mkdir -p $PROD_BACKUP_DIR"
scp "$DUMP_FILE" "$PROD_USER@$PROD_HOST:$PROD_BACKUP_DIR/"
DUMP_FILENAME=$(basename "$DUMP_FILE")
echo "  ✓ Copied $DUMP_FILENAME to $PROD_USER@$PROD_HOST:$PROD_BACKUP_DIR/"

# ── 4. Finish on the server ───────────────────────────────────
echo ""
echo "── Done — finish on the production server: ────────────────"
echo ""
echo "  ssh $PROD_USER@$PROD_HOST"
echo ""
echo "  # Restore the database:"
echo "  bash /var/www/transsafetravels/scripts/restore-db.sh $PROD_BACKUP_DIR/$DUMP_FILENAME"
echo ""
echo "  # Pull code + apply migrations + rebuild + restart:"
echo "  bash /var/www/transsafetravels/scripts/redeploy.sh"
echo ""
