# Service Management

The TransGreenbook Next.js dev server runs as a user systemd service (`greenbook.service`). It starts automatically on boot and stays running whether or not anyone is logged in.

## Prerequisites

`loginctl enable-linger` must be run once per machine to allow user services to persist after logout:

```bash
sudo loginctl enable-linger cdlucas
```

This is persistent — it does not need to be re-run after a reboot.

---

## Next.js app — `greenbook.service`

**Start / stop / restart:**
```bash
systemctl --user start greenbook.service
systemctl --user stop greenbook.service
systemctl --user restart greenbook.service
```

**Check status / logs:**
```bash
systemctl --user status greenbook.service
journalctl --user -u greenbook.service -f
journalctl --user -u greenbook.service --since "1 hour ago"
```

**Service file:** `~/.config/systemd/user/greenbook.service`

After editing the service file, reload the daemon before restarting:
```bash
systemctl --user daemon-reload
systemctl --user restart greenbook.service
```

---

## Supabase

Supabase runs as Docker containers managed by the Supabase CLI. The containers start automatically via Docker on boot. The `greenbook.service` unit's `ExecStartPre` step automatically restarts any exited Supabase containers before the Next.js server launches.

**Useful commands:**
```bash
supabase status          # show running containers and connection URLs
supabase start           # start all containers (if stopped)
supabase stop            # stop all containers
supabase migration up    # apply pending migrations to local DB
```

**Local DB connection:**
```
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

**Studio (local UI):** http://127.0.0.1:54323

---

## Database backup — `greenbook-backup.service` / `greenbook-backup.timer`

Nightly backup of the local Supabase Postgres database. Keeps the 14 most recent backups (~2 weeks). Backups are stored in `~/greenbook-backups/` as gzipped SQL files.

**Run manually:**
```bash
bash scripts/backup-db.sh
# or via systemd:
systemctl --user start greenbook-backup.service
```

**Check timer / logs:**
```bash
systemctl --user status greenbook-backup.timer
journalctl --user -u greenbook-backup.service --since "1 day ago"
```

**Service files:**
- `~/.config/systemd/user/greenbook-backup.service`
- `~/.config/systemd/user/greenbook-backup.timer`

---

## Google Sheets POI Sync — `greenbook-sync.service` / `greenbook-sync.timer`

POI data can be managed in a Google Sheet and synced to Supabase hourly via `greenbook-sync.timer`. This is one of two ways to do bulk POI editing — the admin UI also supports CSV export/import directly (see [Admin POI Bulk Editing](#admin-poi-bulk-editing) below).

### One-time setup

**1. Supabase service role key**

In `.env.local`, set `SUPABASE_SERVICE_ROLE_KEY` to the service role key from:
Supabase dashboard → Settings → API → `service_role` key

**2. Google service account**

1. Go to [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts
2. Create a service account (e.g. `greenbook-sync`)
3. Create a JSON key → download the file
4. Enable the **Google Sheets API** for the project
5. Set `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env.local` to the absolute path of the downloaded JSON file

**3. Share the sheet**

In `.env.local`, set `GOOGLE_SHEET_ID` to the ID from the sheet URL:
`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`

Share the sheet with the service account's email (`client_email` in the JSON file) and give it **Editor** access.

**4. Sheet format**

The first row must be a header row with these column names (case-insensitive):

| Column | Required | Notes |
|--------|----------|-------|
| `poi_id` | — | Auto-populated by sync script. Leave blank for new rows. |
| `title` | ✓ | |
| `description` | | |
| `lat` | ✓ | Decimal degrees |
| `lng` | ✓ | Decimal degrees |
| `category` | | Must match a name in the categories table |
| `tags` | | Comma-separated e.g. `food, outdoor` |
| `is_verified` | | `TRUE` or `FALSE` — data quality flag (has this been confirmed accurate?) |
| `is_visible` | | `TRUE` or `FALSE` — controls whether POI appears on the map |
| `website_url` | | |

Name the sheet tab `POIs` (or set `GOOGLE_SHEET_TAB` in `.env.local` to match).

### Running the sync

**Manually:**
```bash
node scripts/sync-pois-to-db.mjs
```

**Via systemd (runs hourly automatically):**
```bash
systemctl --user start greenbook-sync.service   # run now
systemctl --user status greenbook-sync.timer    # check timer
journalctl --user -u greenbook-sync.service -f  # follow logs
```

### How it works

- Rows with a `poi_id` are updated in place
- Rows with no `poi_id` are inserted and the new DB id is written back to the sheet
- Rows deleted from the sheet have `is_visible` set to `FALSE` in the DB (not hard-deleted)
- Set `is_visible = FALSE` in the sheet to hide a POI from the map without deleting it

---

## Admin POI Bulk Editing

The admin UI at `/admin/pois` supports CSV export and import for bulk editing without requiring Google Sheets.

### Export

1. Use the category filters to narrow down the POIs you want to edit
2. Click **Export CSV** — downloads the currently visible rows with all editable fields
3. Open in Google Sheets, Excel, or any spreadsheet app and make changes

### Import

1. Click **Import CSV** and select your edited file
2. A diff preview shows every row classified as **new**, **update**, or **conflict**
   - A **conflict** means the record was modified in the DB after you downloaded it (`updated_at` mismatch)
3. For each conflicted row you can **skip** (leave the DB as-is) or **overwrite** (apply your CSV value)
4. Click **Skip conflicts & import** or **Overwrite all & import** to commit
5. A summary shows how many rows were updated / created / skipped, with an option to download the skipped rows as a CSV for follow-up

### CSV column reference

| Column | Notes |
|--------|-------|
| `id` | Leave blank to create a new POI; present to update an existing one |
| `title` | Required |
| `description` | Short one-line description |
| `category` | Must match a category name exactly |
| `is_verified` | `true` / `false` — data quality signal |
| `is_visible` | `true` / `false` — controls map visibility |
| `prominence` | `national` / `regional` / `local` / `neighborhood` |
| `street_address` | |
| `phone` | |
| `website_url` | |
| `tags` | Pipe-separated e.g. `lgbtq\|bar\|historic` |
| `lat` / `lng` | Required for new POIs; ignored on updates (coordinates not changed via CSV) |
| `source` / `source_date` | Import provenance |
| `review_after` / `review_note` | Scheduled review fields |
| `updated_at` | Read-only — used for conflict detection, do not edit |
