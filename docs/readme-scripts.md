# Scripts

All scripts live in `scripts/`. They can be run manually from the project root.

---

## Database backup

### `scripts/backup-db.sh`

Dumps the full local Supabase database to a compressed file in `~/greenbook-backups/`.
Retains the 14 most recent backups (~2 weeks at nightly frequency).

```bash
bash scripts/backup-db.sh
```

Also runs automatically every night via `greenbook-backup.timer`. See
**[readme-goingproduction.md](readme-goingproduction.md)** for offsite backup options.

### `scripts/restore-db.sh`

Restores the local Supabase database from a backup file. Defaults to the most
recent backup if no file is specified. Accepts either a bare filename or a full
path. Prompts for confirmation before overwriting. If the specified file is not
found, lists the available backups so you can pick one.

```bash
bash scripts/restore-db.sh                               # restore latest backup
bash scripts/restore-db.sh greenbook-20260410-194741.sql.gz  # specific backup
```

---

## POI sync (Google Sheets ↔ Supabase)

### `scripts/sync-pois-to-db.mjs`

Syncs POIs from the Google Sheet into the local Supabase DB. This is the script
that runs hourly via `greenbook-sync.timer`.

- Rows with a `poi_id` in the sheet are updated in place.
- Rows without a `poi_id` are inserted and the new DB id is written back to the sheet.
- POIs deleted from the sheet have `is_verified` set to `FALSE` in the DB (not hard-deleted).

```bash
node scripts/sync-pois-to-db.mjs
```

### `scripts/seed-sheet-from-db.mjs`

One-time (or re-runnable) export in the other direction: reads all POIs from
Supabase and writes them as rows in the Google Sheet, then back-fills `sheet_id`
in the DB so the hourly sync can manage them going forward.

Use this to populate the sheet from an existing database, or to recover the sheet
if it gets wiped.

```bash
node scripts/seed-sheet-from-db.mjs
```

---

## Database seeding (after a reset)

### `scripts/seed-db-from-spreadsheet.sh`

Full local DB setup after a `supabase db reset`. Runs the following steps in order:

1. Seeds boundary tables (states, counties, cities) from TIGER/Line GeoJSON
2. Syncs POIs from the Google Sheet into the local DB
3. Backfills `state_abbr`, `county_name`, `city_name` for all POIs

```bash
bash scripts/seed-db-from-spreadsheet.sh
```

This is the script to run any time the local database is wiped.

### `scripts/seed-boundaries.sh`

Loads US state, county, and city boundary polygons from TIGER/Line GeoJSON files
into the local Supabase DB. Requires `ogr2ogr` (GDAL) and that `build-tiles.sh`
has already been run (so the GeoJSON files exist in `tmp/tiger/`).

```bash
bash scripts/seed-boundaries.sh
```

### `scripts/seed-cities.sh`

Loads TIGER/Line place polygons into the `cities` table. Run after
`build-tiles.sh` and after applying migrations. Requires `ogr2ogr` and `psql`.

```bash
bash scripts/seed-cities.sh
```

---

## Map tile build

### `scripts/build-tiles.sh`

Builds boundary PMTiles from US Census TIGER/Line shapefiles. Downloads shapefiles
if not already present, then uses `tippecanoe` and `tile-join` to produce
`tiles/boundaries.pmtiles`.

```bash
bash scripts/build-tiles.sh
```

- **Local dev:** the output file is served from `public/tiles/` by Next.js.
- **Production:** upload `tiles/boundaries.pmtiles` to Cloudflare R2 and set
  `NEXT_PUBLIC_PMTILES_URL` in `.env.local`.

---

## Data imports

See **[docs/internal/sources/readme-imports.md](../internal/sources/readme-imports.md)** for documentation on all import scripts, their schedules, and one-time historical imports.
