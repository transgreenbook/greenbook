#!/usr/bin/env bash
# Build boundary PMTiles from US Census TIGER/Line shapefiles.
# Output: tiles/boundaries.pmtiles
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

echo "==> Unzipping..."
unzip -qo "$TMP/state.zip"  -d "$TMP/state"
unzip -qo "$TMP/county.zip" -d "$TMP/county"

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

echo "==> Generating state label centroids..."
ogr2ogr \
  -f GeoJSON \
  -t_srs EPSG:4326 \
  -dialect SQLite \
  -sql "SELECT ST_Centroid(geometry) AS geometry, NAME, STUSPS FROM \"tl_${YEAR}_us_state\"" \
  "$ROOT/public/state-centroids.geojson" \
  "$TMP/state/tl_${YEAR}_us_state.shp"

echo "==> Building PMTiles with Tippecanoe..."

tippecanoe \
  --output="$OUT/boundaries.pmtiles" \
  --force \
  --no-tile-compression \
  --minimum-zoom=2 \
  --maximum-zoom=12 \
  -L states:"$TMP/states.geojson" \
  -L counties:"$TMP/counties.geojson" \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping

echo "==> Copying to public/tiles/ for local dev serving..."
mkdir -p "$ROOT/public/tiles"
cp "$OUT/boundaries.pmtiles" "$ROOT/public/tiles/boundaries.pmtiles"

echo ""
echo "Done. File: $OUT/boundaries.pmtiles"
echo "Local URL: http://localhost:3000/tiles/boundaries.pmtiles"
echo ""
echo "To use: set NEXT_PUBLIC_PMTILES_URL=http://localhost:3000/tiles/boundaries.pmtiles"
echo "        in .env.local and restart the dev server."
