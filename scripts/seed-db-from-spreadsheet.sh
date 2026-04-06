#!/usr/bin/env bash
# seed-db-from-spreadsheet.sh
#
# Full local DB setup after a `supabase db reset`:
#   1. Seeds boundary tables (states, counties, cities) from TIGER/Line GeoJSON
#   2. Syncs POIs from the Google Sheet into the local DB
#   3. Backfills state_abbr, county_name, city_name for all POIs
#
# Run: bash scripts/seed-db-from-spreadsheet.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Step 1: Seeding boundary tables…"
bash "$SCRIPT_DIR/seed-boundaries.sh"

echo ""
echo "==> Step 2: Syncing POIs from spreadsheet…"
node "$SCRIPT_DIR/sync-pois.mjs"

echo ""
echo "==> Step 3: Backfilling geo text fields…"
supabase db query "
  UPDATE points_of_interest AS p
  SET
    state_id    = sub.state_id,
    state_abbr  = sub.state_abbr,
    county_id   = sub.county_id,
    county_name = sub.county_name,
    city_id     = sub.city_id,
    city_name   = sub.city_name
  FROM (
    SELECT
      p2.id,
      s.id             AS state_id,
      s.abbreviation   AS state_abbr,
      co.id            AS county_id,
      co.name          AS county_name,
      ci.id            AS city_id,
      COALESCE(ci.name, '-') AS city_name
    FROM points_of_interest p2
    JOIN   states   s  ON ST_Within(p2.geom, s.geom)
    LEFT JOIN counties co ON ST_Within(p2.geom, co.geom)
    LEFT JOIN cities   ci ON ST_Within(p2.geom, ci.geom)
    WHERE p2.geom IS NOT NULL
      AND p2.effect_scope = 'point'
      AND p2.state_abbr IS NULL
  ) sub
  WHERE p.id = sub.id;
"

echo ""
echo "Done. Local DB is ready."
