# Service Management

The TransGreenbook Next.js dev server runs as a user systemd service (`greenbook.service`). It starts automatically on boot and stays running whether or not anyone is logged in.

## Prerequisites

`loginctl enable-linger` must be run once per machine to allow user services to persist after logout:

```bash
sudo loginctl enable-linger cdlucas
```

This is persistent — it does not need to be re-run after a reboot.

## Common commands

**Start / stop / restart the server:**
```bash
systemctl --user start greenbook.service
systemctl --user stop greenbook.service
systemctl --user restart greenbook.service
```

**Check status:**
```bash
systemctl --user status greenbook.service
```

**Follow live logs:**
```bash
journalctl --user -u greenbook.service -f
```

**View recent logs:**
```bash
journalctl --user -u greenbook.service --since "1 hour ago"
```

## Service file location

```
~/.config/systemd/user/greenbook.service
```

After editing the service file, reload the daemon before restarting:

```bash
systemctl --user daemon-reload
systemctl --user restart greenbook.service
```

## Supabase

Supabase runs as Docker containers and starts automatically via the Docker systemd service on boot. The `greenbook.service` unit declares `After=docker.service` so it waits for Docker before starting.

If any Supabase containers fail to start, the service's `ExecStartPre` step will restart them automatically before the Next.js server launches.

---

## Google Sheets POI Sync

POI data is managed in a Google Sheet and synced to Supabase hourly via `greenbook-sync.timer`.

### One-time setup

**1. Supabase service role key**

In `.env.local`, set `SUPABASE_SERVICE_ROLE_KEY` to the service role key from:
Supabase dashboard → Settings → API → `service_role` key

**2. Google service account**

1. Go to [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts
2. Create a service account (name it e.g. `greenbook-sync`)
3. Create a JSON key for it → download the file
4. Enable the **Google Sheets API** for the project
5. Set `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env.local` to the absolute path of the downloaded JSON file

**3. Share the sheet**

In `.env.local`, set `GOOGLE_SHEET_ID` to the ID from the sheet URL:
`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`

Share the sheet with the service account's email address (found in the JSON file as `client_email`) and give it **Editor** access.

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
| `is_verified` | | `TRUE` or `FALSE` — controls public visibility |
| `website_url` | | |

Name the sheet tab `POIs` (or set `GOOGLE_SHEET_TAB` in `.env.local` to match).

### Running the sync

**Manually:**
```bash
node scripts/sync-pois.mjs
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
- Rows deleted from the sheet have `is_verified` set to `FALSE` in the DB (not hard-deleted)
- Set `is_verified = FALSE` in the sheet to unpublish a POI without deleting it
