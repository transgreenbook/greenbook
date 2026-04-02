#!/usr/bin/env bash
# Load TIGER/Line place polygons into the cities table.
# Requires the place shapefiles already downloaded by build-tiles.sh.
# Run this after build-tiles.sh and after applying migrations.
#
# Usage:
#   bash scripts/seed-cities.sh
#
# Requires: ogr2ogr (GDAL), psql
# DATABASE_URL must be set in your environment or .env.local

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
TMP="$ROOT/tmp/tiger"
YEAR=2023
PLACE_SHP="$TMP/place/cb_${YEAR}_us_place_500k.shp"

# Load DATABASE_URL from .env.local if not already set
if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/.env.local" ]; then
  export DATABASE_URL="$(grep '^DATABASE_URL=' "$ROOT/.env.local" | cut -d= -f2-)"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Add it to .env.local or export it before running."
  exit 1
fi

if [ ! -f "$PLACE_SHP" ]; then
  echo "ERROR: Place shapefile not found at $PLACE_SHP"
  echo "       Run scripts/build-tiles.sh first to download the TIGER shapefiles."
  exit 1
fi

echo "==> Converting place shapefile to GeoJSON (incorporated places only)..."
GEOJSON="$TMP/places_seed.geojson"

ogr2ogr \
  -f GeoJSON \
  -t_srs EPSG:4326 \
  -select "NAME,STATEFP,PLACEFP,LSAD" \
  -where "LSAD IN ('25','47','21','37','53')" \
  "$GEOJSON" \
  "$PLACE_SHP"

echo "==> Loading places into cities table..."

# Build a temporary SQL loader using ogr2ogr -> psql pipeline.
# We insert name, state_id (looked up by STATEFP), and geom (MultiPolygon).
# county_id is left NULL here — the geo trigger on POIs handles county lookup
# from the county polygon boundaries, not from the city record.

psql "$DATABASE_URL" <<'EOF'
-- Create a staging table for the raw TIGER place data
DROP TABLE IF EXISTS _tiger_places_stage;
CREATE TEMP TABLE _tiger_places_stage (
  name     TEXT,
  statefp  CHAR(2),
  placefp  CHAR(5),
  lsad     TEXT,
  geom     GEOMETRY(MultiPolygon, 4326)
);
EOF

ogr2ogr \
  -f PostgreSQL \
  PG:"$DATABASE_URL" \
  -nln _tiger_places_stage \
  -nlt MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -select "NAME,STATEFP,PLACEFP,LSAD" \
  -where "LSAD IN ('25','47','21','37','53')" \
  -overwrite \
  "$PLACE_SHP"

psql "$DATABASE_URL" <<'EOF'
-- Upsert into cities, matching on name + state
-- Inserts new cities; updates geom for existing ones.
INSERT INTO cities (name, state_id, geom)
SELECT
  s.name   AS name,
  st.id    AS state_id,
  -- Ensure MultiPolygon (some places may come in as Polygon)
  ST_Multi(s.geom)::GEOMETRY(MultiPolygon, 4326) AS geom
FROM _tiger_places_stage s
JOIN states st ON st.abbreviation = (
  SELECT abbreviation FROM states
  JOIN (
    SELECT statefp, abbreviation FROM (
      VALUES
        ('01','AL'),('02','AK'),('04','AZ'),('05','AR'),('06','CA'),
        ('08','CO'),('09','CT'),('10','DE'),('11','DC'),('12','FL'),
        ('13','GA'),('15','HI'),('16','ID'),('17','IL'),('18','IN'),
        ('19','IA'),('20','KS'),('21','KY'),('22','LA'),('23','ME'),
        ('24','MD'),('25','MA'),('26','MI'),('27','MN'),('28','MS'),
        ('29','MO'),('30','MT'),('31','NE'),('32','NV'),('33','NH'),
        ('34','NJ'),('35','NM'),('36','NY'),('37','NC'),('38','ND'),
        ('39','OH'),('40','OK'),('41','OR'),('42','PA'),('44','RI'),
        ('45','SC'),('46','SD'),('47','TN'),('48','TX'),('49','UT'),
        ('50','VT'),('51','VA'),('53','WA'),('54','WV'),('55','WI'),
        ('56','WY'),('60','AS'),('66','GU'),('69','MP'),('72','PR'),
        ('78','VI')
    ) AS fips_map(statefp, abbreviation)
    WHERE fips_map.statefp = s.statefp
  ) AS m ON TRUE
  LIMIT 1
)
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS _tiger_places_stage;

SELECT COUNT(*) AS cities_loaded FROM cities WHERE geom IS NOT NULL;
EOF

echo "==> Done. Cities table populated with TIGER place polygons."
echo "    Point-scoped POIs inserted going forward will have city_id auto-populated by trigger."
