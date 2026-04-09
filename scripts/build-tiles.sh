#!/usr/bin/env bash
# Build boundary PMTiles from US Census TIGER/Line shapefiles.
# Output: tiles/boundaries.pmtiles
#
# Strategy: build states and counties+places separately, then merge with
# tile-join. This prevents tippecanoe's --drop-densest-as-needed from
# dropping state polygon features (which caused NE, KS, GA to not render
# at zoom 4 when built in a single pass).
#
# Usage:
#   bash scripts/build-tiles.sh
#
# For production: upload tiles/boundaries.pmtiles to Cloudflare R2 and set
# NEXT_PUBLIC_PMTILES_URL in .env.local.
# For local dev:  the file is served from public/tiles/ by Next.js.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
TMP="$ROOT/tmp/tiger"
OUT="$ROOT/tiles"
YEAR=2023

mkdir -p "$TMP" "$OUT"

echo "==> Downloading TIGER/Line shapefiles (year $YEAR)..."

BASE="https://www2.census.gov/geo/tiger/TIGER${YEAR}"

download() {
  local url="$1" dest="$2"
  if [ ! -f "$dest" ]; then
    curl -fsSL "$url" -o "$dest"
    echo "    Downloaded $(basename $dest)"
  else
    echo "    Skipped $(basename $dest) (already exists)"
  fi
}

download "${BASE}/STATE/tl_${YEAR}_us_state.zip"   "$TMP/state.zip"
download "${BASE}/COUNTY/tl_${YEAR}_us_county.zip" "$TMP/county.zip"
download "https://www2.census.gov/geo/tiger/GENZ${YEAR}/shp/cb_${YEAR}_us_place_500k.zip" "$TMP/place.zip"

echo "==> Unzipping..."
unzip -qo "$TMP/state.zip"  -d "$TMP/state"
unzip -qo "$TMP/county.zip" -d "$TMP/county"
unzip -qo "$TMP/place.zip"  -d "$TMP/place"

echo "==> Converting shapefiles to GeoJSON..."

# States — keep only the fields we use
ogr2ogr \
  -f GeoJSON \
  -t_srs EPSG:4326 \
  -select "NAME,STUSPS,GEOID" \
  "$TMP/states.geojson" \
  "$TMP/state/tl_${YEAR}_us_state.shp"

# Counties — keep only the fields we use
ogr2ogr \
  -f GeoJSON \
  -t_srs EPSG:4326 \
  -select "NAME,STATEFP,COUNTYFP,GEOID" \
  "$TMP/counties.geojson" \
  "$TMP/county/tl_${YEAR}_us_county.shp"

# Places — incorporated cities/towns only (exclude CDPs, LSAD=57)
ogr2ogr \
  -f GeoJSON \
  -t_srs EPSG:4326 \
  -select "NAME,STATEFP,PLACEFP,LSAD" \
  -where "LSAD IN ('25','47','21','37','53')" \
  "$TMP/places.geojson" \
  "$TMP/place/cb_${YEAR}_us_place_500k.shp"

echo "==> Generating state label centroids..."
ogr2ogr \
  -f GeoJSON \
  -t_srs EPSG:4326 \
  -dialect SQLite \
  -sql "SELECT ST_Centroid(geometry) AS geometry, NAME, STUSPS FROM \"tl_${YEAR}_us_state\"" \
  "$ROOT/public/state-centroids.geojson" \
  "$TMP/state/tl_${YEAR}_us_state.shp"

echo "==> Generating county label centroids..."
ogr2ogr \
  -f GeoJSON \
  -t_srs EPSG:4326 \
  -dialect SQLite \
  -sql "SELECT ST_Centroid(geometry) AS geometry, NAME, STATEFP, COUNTYFP FROM \"tl_${YEAR}_us_county\"" \
  "$ROOT/public/county-centroids.geojson" \
  "$TMP/county/tl_${YEAR}_us_county.shp"

echo "==> Generating city label centroids..."
ogr2ogr \
  -f GeoJSON \
  -t_srs EPSG:4326 \
  -dialect SQLite \
  -sql "SELECT ST_Centroid(geometry) AS geometry, NAME, STATEFP, PLACEFP, LSAD
        FROM \"cb_${YEAR}_us_place_500k\"
        WHERE LSAD IN ('25','47','21','37','53')" \
  "$ROOT/public/city-centroids.geojson" \
  "$TMP/place/cb_${YEAR}_us_place_500k.shp"

echo "==> Building states PMTiles (zoom 2-8, no feature dropping)..."
tippecanoe \
  --output="$OUT/states.pmtiles" \
  --force \
  --no-tile-compression \
  --minimum-zoom=2 \
  --maximum-zoom=8 \
  --no-feature-limit \
  --no-simplification-of-shared-nodes \
  -L states:"$TMP/states.geojson"

echo "==> Building counties + places PMTiles (zoom 5-12)..."
tippecanoe \
  --output="$OUT/counties-places.pmtiles" \
  --force \
  --no-tile-compression \
  --minimum-zoom=5 \
  --maximum-zoom=12 \
  -L counties:"$TMP/counties.geojson" \
  -L places:"$TMP/places.geojson" \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping

echo "==> Merging with tile-join..."
tile-join \
  --output="$OUT/boundaries.pmtiles" \
  --force \
  --no-tile-compression \
  "$OUT/states.pmtiles" \
  "$OUT/counties-places.pmtiles"

echo "==> Copying to public/tiles/ for local dev serving..."
mkdir -p "$ROOT/public/tiles"
cp "$OUT/boundaries.pmtiles" "$ROOT/public/tiles/boundaries.pmtiles"

echo ""
echo "Done. File: $OUT/boundaries.pmtiles"
echo "Local URL: http://localhost:3000/tiles/boundaries.pmtiles"
echo ""
echo "To use: set NEXT_PUBLIC_PMTILES_URL=http://localhost:3000/tiles/boundaries.pmtiles"
echo "        in .env.local and restart the dev server."
