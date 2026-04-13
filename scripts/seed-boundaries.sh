#!/usr/bin/env bash
# seed-boundaries.sh
#
# Loads US state, county, and city boundary polygons from the TIGER/Line
# GeoJSON files (produced by build-tiles.sh) into the local Supabase DB.
#
# Requires: ogr2ogr (GDAL), local Supabase running (supabase start)
#
# Run: bash scripts/seed-boundaries.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
TMP="$ROOT/tmp/tiger"

DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

if [ ! -f "$TMP/states.geojson" ]; then
  echo "ERROR: $TMP/states.geojson not found. Run scripts/build-tiles.sh first."
  exit 1
fi
if [ ! -f "$TMP/reservations.geojson" ]; then
  echo "ERROR: $TMP/reservations.geojson not found. Run scripts/build-tiles.sh first."
  exit 1
fi

echo "==> Loading states…"
ogr2ogr \
  -f PostgreSQL \
  "$DB" \
  "$TMP/states.geojson" \
  -nln states_tmp \
  -nlt MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -overwrite \
  -lco GEOMETRY_NAME=geom \
  -lco FID=fid

# Upsert from staging table into real states table
docker exec supabase_db_greenbook psql -U postgres -c "
  INSERT INTO states (name, abbreviation, statefp, geom)
  SELECT name::text, stusps::text, geoid::char(2), ST_Multi(geom)
  FROM states_tmp
  ON CONFLICT (abbreviation) DO UPDATE SET
    name     = EXCLUDED.name,
    statefp  = EXCLUDED.statefp,
    geom     = EXCLUDED.geom;
  DROP TABLE states_tmp;
"
echo "   States loaded."

echo "==> Loading counties…"
ogr2ogr \
  -f PostgreSQL \
  "$DB" \
  "$TMP/counties.geojson" \
  -nln counties_tmp \
  -nlt MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -overwrite \
  -lco GEOMETRY_NAME=geom \
  -lco FID=fid

docker exec supabase_db_greenbook psql -U postgres -c "
  INSERT INTO counties (name, fips_code, state_id, geom)
  SELECT t.name::text, (t.statefp || t.countyfp)::char(5), s.id, ST_Multi(t.geom)
  FROM counties_tmp t
  JOIN states s ON s.statefp = t.statefp
  ON CONFLICT (fips_code) DO UPDATE SET
    name     = EXCLUDED.name,
    state_id = EXCLUDED.state_id,
    geom     = EXCLUDED.geom;
  DROP TABLE counties_tmp;
"
echo "   Counties loaded."

echo "==> Loading cities…"
ogr2ogr \
  -f PostgreSQL \
  "$DB" \
  "$TMP/places.geojson" \
  -nln cities_tmp \
  -nlt MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -overwrite \
  -lco GEOMETRY_NAME=geom \
  -lco FID=fid

docker exec supabase_db_greenbook psql -U postgres -c "
  INSERT INTO cities (name, state_id, county_id, geom)
  SELECT
    t.name::text,
    s.id,
    (SELECT co.id FROM counties co
     WHERE co.state_id = s.id
       AND ST_Within(ST_Centroid(t.geom), co.geom)
     LIMIT 1),
    ST_Multi(t.geom)
  FROM cities_tmp t
  JOIN states s ON s.statefp = t.statefp
  ON CONFLICT DO NOTHING;
  DROP TABLE cities_tmp;
"
echo "   Cities loaded."

echo "==> Loading reservations…"
ogr2ogr \
  -f PostgreSQL \
  "$DB" \
  "$TMP/reservations.geojson" \
  -nln reservations_tmp \
  -nlt MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -overwrite \
  -lco GEOMETRY_NAME=geom \
  -lco FID=fid

docker exec supabase_db_greenbook psql -U postgres -c "
  INSERT INTO reservations (name, geoid, aian_type, geom)
  SELECT
    namelsad::text,
    geoid::char(5),
    aiannhr::text,
    ST_Multi(geom)
  FROM reservations_tmp
  ON CONFLICT (geoid) DO UPDATE SET
    name      = EXCLUDED.name,
    aian_type = EXCLUDED.aian_type,
    geom      = EXCLUDED.geom;
  DROP TABLE reservations_tmp;
"
echo "   Reservations loaded."

echo ""
echo "Done. Boundary data is ready for spatial queries."
