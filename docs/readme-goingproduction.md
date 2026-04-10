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

# Restore a backup
gunzip -c ~/greenbook-backups/greenbook-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i supabase_db_greenbook psql -U postgres postgres
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
