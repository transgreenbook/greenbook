# Going to Production

A checklist of things that need to be in place before TransSafeTravels launches publicly. See the linked docs for detailed upgrade notes on each service.

---

## Hosting & infrastructure

- [ ] **Deploy frontend to Vercel** — connect GitHub repo, set production env vars, configure custom domain.
- [ ] **Migrate to Supabase cloud** — create a production project, run `supabase db push` to apply all migrations, update `NEXT_PUBLIC_SUPABASE_URL` and keys.
- [ ] **Upload PMTiles to Cloudflare R2** — run `scripts/build-tiles.sh`, upload `boundaries.pmtiles`, update the R2 URL env var.
- [ ] **Add production domain to Stadia Maps API key allowlist.**

See **[stack-summary.md](stack-summary.md)** for the full hosting architecture.

---

## Routing

- [ ] **Switch to Stadia Maps routing** — the current free Valhalla instance has a ~932-mile limit, which breaks cross-country routes.

See **[readme-routing.md](readme-routing.md)** and **[readme-paidupgrades.md](readme-paidupgrades.md)** for upgrade instructions.

---

## Database backups

- [ ] **Set up offsite backups** — the current nightly backup writes to `~/greenbook-backups/` on the local machine. If the machine is lost, the backups go with it. Before launch, add offsite replication.

### Current local backup setup

A nightly systemd timer (`greenbook-backup.timer`) runs `scripts/backup-db.sh`, which:
- Dumps the full Postgres database via `pg_dump` inside the `supabase_db_greenbook` container
- Compresses to `~/greenbook-backups/greenbook-YYYYMMDD-HHMMSS.sql.gz`
- Retains the 14 most recent backups (~2 weeks)

**Common commands:**

```bash
# Run a backup now
systemctl --user start greenbook-backup.service

# Check timer schedule
systemctl --user list-timers greenbook-backup.timer

# Follow backup logs
journalctl --user -u greenbook-backup.service -f

# Restore latest backup
bash scripts/restore-db.sh

# Restore a specific backup
bash scripts/restore-db.sh greenbook-YYYYMMDD-HHMMSS.sql.gz
```

### Offsite backup options (production)

| Option | Notes |
|--------|-------|
| **rclone → Google Drive** | Free, easy. Add `rclone copy ~/greenbook-backups gdrive:greenbook-backups` to the backup script. One-time `rclone config` setup. |
| **rclone → Backblaze B2** | ~$0.006/GB/mo. Good for larger databases. |
| **rclone → AWS S3** | Standard choice; free tier 5 GB, then ~$0.023/GB/mo. |
| **Supabase cloud backups** | If hosting on Supabase cloud, daily backups are included on free tier (7-day retention); paid plans add point-in-time recovery. No script needed. |

### Adding rclone offsite (when ready)

1. Install: `sudo apt install rclone`
2. Configure a remote: `rclone config` (follow prompts for your chosen provider)
3. Add to the end of `scripts/backup-db.sh`:
   ```bash
   rclone copy "$BACKUP_DIR" <remote-name>:greenbook-backups --log-level INFO
   ```

---

## Local device testing

When testing on a physical phone, the browser JS runs on the phone. `http://127.0.0.1:54321` resolves to the phone itself, not the dev machine, so Supabase calls fail silently (no POIs, "Load failed" in console).

**Temporary fix for local device testing:**

1. Find the dev machine's local IP:
   ```bash
   hostname -I | awk '{print $1}'
   ```
2. In `.env.local`, change:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   ```
   to:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://192.168.x.x:54321
   ```
3. Restart the Next.js dev server (env vars are inlined at build time).
4. The phone must be on the same Wi-Fi network as the dev machine.

**Revert before deploying** — the production Supabase URL goes here instead.

### Geolocation and other secure-context features

The browser Geolocation API (used by the "locate me" button on the map) requires a **secure context** — either `https://` or `http://localhost`. It will not work when the app is accessed via a plain HTTP IP address (e.g. `http://192.168.x.x:3000`), which is common during phone testing on the local network.

**Workarounds for local phone testing:**

- **Use localhost on the same machine** — `http://localhost:3000` works fine in desktop browsers.
- **Use mkcert for local HTTPS** — allows geolocation to work on phones and other devices on the network:
  ```bash
  # Install mkcert (once)
  sudo apt install mkcert
  mkcert -install

  # Generate a cert for your local IP
  mkcert 192.168.x.x localhost 127.0.0.1

  # Run Next.js with HTTPS
  next dev --experimental-https
  # or use the generated cert files with a local proxy (e.g. caddy, nginx)
  ```
  You'll also need to install the mkcert root CA on the phone (mkcert prints instructions).

**In production** — geolocation works automatically once the site is on a real HTTPS domain. No code changes needed.

---

## Security

- [ ] **Rotate all API keys and secrets** — generate fresh keys for production (Supabase, Stadia Maps, Google service account). Never reuse dev keys in production.
- [ ] **Review Supabase RLS policies** — confirm all tables have appropriate Row Level Security before exposing to public traffic.
- [ ] **Set `NEXT_PUBLIC_` env vars carefully** — only values that are safe to expose to the browser should use this prefix.

---

## Data & content

- [ ] **Verify all POIs are reviewed and `is_verified = TRUE`** before launch — only verified POIs are publicly visible.
- [ ] **Confirm Google Sheets sync is running** in production (or disable it and manage POIs directly via the admin panel).
- [ ] **Legal disclaimer review** — have the "informational purposes only" language reviewed if needed.

---

## Monitoring

- [ ] **Set up PostHog** (or another analytics provider) with a production API key.
- [ ] **Configure error alerting** — Vercel has built-in error reporting; consider adding Sentry for client-side errors.

See **[readme-paidupgrades.md](readme-paidupgrades.md)** for analytics upgrade options.

---

## News digest pipeline

The daily news digest (`scripts/news-digest.mjs`) requires several services and env vars before it can run in production.

### Required env vars

Add these to production environment (Vercel env vars or server `.env`):

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key — get from console.anthropic.com |
| `DIGEST_GMAIL_USER` | Gmail address to send from (e.g. `transsafetravels@gmail.com`) |
| `DIGEST_GMAIL_APP_PASSWORD` | Gmail App Password (not your account password) |
| `DIGEST_TO_EMAIL` | Recipient — defaults to `DIGEST_GMAIL_USER` if omitted |

### Gmail App Password setup

1. Enable 2-Step Verification on the sending Gmail account
2. Go to Google Account → Security → App Passwords
3. Create an App Password for "Mail"
4. Add the 16-character password as `DIGEST_GMAIL_APP_PASSWORD`

> **Note:** If you later acquire a domain, switching to a transactional email service (Resend, Postmark, SendGrid) is recommended for higher deliverability and multi-recipient support. The `resend` package is already installed.

### Scheduling (production)

The digest should run daily on the production server. Options:

**GitHub Actions (recommended — no server needed):**

Create `.github/workflows/news-digest.yml`:
```yaml
name: Daily News Digest
on:
  schedule:
    - cron: '0 9 * * *'   # 9am UTC = 4am/5am ET
  workflow_dispatch:       # allow manual runs
jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: node scripts/news-digest.mjs
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          DIGEST_GMAIL_USER: ${{ secrets.DIGEST_GMAIL_USER }}
          DIGEST_GMAIL_APP_PASSWORD: ${{ secrets.DIGEST_GMAIL_APP_PASSWORD }}
          DIGEST_TO_EMAIL: transsafetravels@gmail.com
```

Add each secret under GitHub repo → Settings → Secrets and variables → Actions.

**Systemd timer (if self-hosting):**

Similar pattern to the existing database backup timer. Create `greenbook-digest.service` and `greenbook-digest.timer` following the same pattern as the backup service.

### Local testing

```bash
# Preview fetch + analysis without writing to DB or sending email
node scripts/news-digest.mjs --dry-run
# Output: /tmp/digest-preview.html — open in browser to review
```

### Cost estimate

Each daily run processes ~50-150 articles across 7 RSS sources and makes 1-6 Claude API calls (batched at 25 articles each). At claude-opus-4-6 pricing this is roughly **$0.10–0.40/day**. Usage can be reduced by switching to `claude-haiku-4-5-20251001` for initial triage and only escalating high-confidence findings to Opus.

### Multi-reviewer support (future)

Currently digest emails go to one address. When ready to add reviewers:
- Add a `digest_reviewers` table with email + role
- Update `news-digest.mjs` to query the table for recipients
- Add `reviewed_by` to `digest_findings` for attribution
- Consider a `/digest` admin route in the app showing unreviewed findings inline
