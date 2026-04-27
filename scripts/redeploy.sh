#!/bin/bash
# Deploy latest code from git to the production server.
# Run this on the server after pushing changes from your dev machine.
#
# Usage:
#   bash scripts/redeploy.sh
#
# What it does:
#   1. git pull
#   2. npm install  (only if package.json / package-lock.json changed)
#   3. Apply any new SQL migrations added by the pull
#   4. npm run build
#   5. pm2 restart
#
# What it does NOT handle (manual steps):
#   - Copying public/tiles/boundaries.pmtiles  (not in git — scp separately)
#   - Updating .env.local                       (not in git — edit manually)

set -euo pipefail

APP_DIR="/var/www/transsafetravels"
cd "$APP_DIR"

echo "── TransSafeTravels redeploy ──────────────────────────────"

# ── 1. Pull ──────────────────────────────────────────────────
PREV_SHA=$(git rev-parse HEAD)
echo "→ Pulling..."
git pull
NEW_SHA=$(git rev-parse HEAD)

if [ "$PREV_SHA" = "$NEW_SHA" ]; then
  echo "  Already up to date ($(git rev-parse --short HEAD)). Nothing to do."
  exit 0
fi

echo "  $(git rev-parse --short "$PREV_SHA") → $(git rev-parse --short "$NEW_SHA")"

# ── 2. Dependencies ──────────────────────────────────────────
if git diff "$PREV_SHA" "$NEW_SHA" --name-only | grep -qE "^package(-lock)?\.json$"; then
  echo "→ package.json changed — installing dependencies..."
  npm install
else
  echo "→ Dependencies unchanged, skipping npm install."
fi

# ── 3. Migrations ────────────────────────────────────────────
NEW_MIGRATIONS=$(git diff "$PREV_SHA" "$NEW_SHA" --name-only --diff-filter=A -- "supabase/migrations/" | grep "\.sql$" || true)

if [ -n "$NEW_MIGRATIONS" ]; then
  DB_CONTAINER=$(docker ps -qf "name=supabase_db" | head -1)
  if [ -z "$DB_CONTAINER" ]; then
    echo "⚠  Supabase DB container not running — start it with: supabase start"
    echo "   Then apply these migrations manually:"
    while IFS= read -r f; do echo "   $f"; done <<< "$NEW_MIGRATIONS"
  else
    echo "→ Applying migrations..."
    while IFS= read -r f; do
      echo "  $f"
      docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < "$f"
    done <<< "$NEW_MIGRATIONS"
  fi
else
  echo "→ No new migrations."
fi

# ── 4. Build ─────────────────────────────────────────────────
echo "→ Building..."
npm run build

# ── 5. Restart ───────────────────────────────────────────────
echo "→ Restarting app..."
pm2 restart transsafetravels

echo "✓ Deployed $(git rev-parse --short HEAD)"
echo "────────────────────────────────────────────────────────────"
