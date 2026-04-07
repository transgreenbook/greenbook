# Refuge Restrooms Data Source

Records are imported from the [Refuge Restrooms API](https://www.refugerestrooms.org/api/docs/) into the `points_of_interest` table with `source = 'refuge_restrooms'`.

Only unisex restrooms are imported. Records with a downvote ratio above 25% are excluded (records with zero votes are included).

---

## Scripts

### `scripts/import-refuge-restrooms.mjs`

Fetches restroom records from the Refuge Restrooms API and upserts them into Supabase.

Records missing coordinates are geocoded via Nominatim (OpenStreetMap) at 1 req/sec. Records that cannot be geocoded are skipped.

**Daily mode (default)** — fetches only records created or updated since yesterday. Intended for the daily cron job.

**Full mode (`--full`)** — paginates through all unisex restrooms and upserts everything. Also prunes any local records that no longer exist in the API. Use this for the initial import or a periodic full refresh. Pages are upserted as they arrive, so progress is not lost if the API goes down mid-run.

---

## Commands

### Daily update (changes since yesterday)

```
node scripts/import-refuge-restrooms.mjs
```

Or via npm:

```
npm run import-restrooms
```

### Full import / refresh

```
node scripts/import-refuge-restrooms.mjs --full
```

> Note: `npm run import-restrooms:full` is also defined in `package.json` but passes `--full` as a script argument. If that form doesn't work in your shell, use the `node` command directly.

---

## Filters applied at import time

| Filter | Value |
|---|---|
| Unisex only | `unisex=true` |
| Minimum rating | ≥ 75% upvotes (zero-vote records pass) |

## Tags written to POI records

| Tag | Condition |
|---|---|
| `unisex` | always |
| `ada-accessible` | `accessible === true` |
| `changing-table` | `changing_table === true` |
