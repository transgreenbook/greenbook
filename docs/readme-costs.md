# Current Costs

What we're actually paying for right now, and what's on free tiers.

---

## Currently Paying

| Service | Purpose | Notes |
|---|---|---|
| **Anthropic Claude** | News digest AI (article analysis, finding extraction) | Charged per token; only runs when digest is triggered |

Everything else is free.

---

## Free Tiers in Use

These are active integrations running on free tiers. They'll need attention as
usage grows — see [readme-paidupgrades.md](readme-paidupgrades.md) for upgrade
decision points.

| Service | What it does | Free limit | Notes |
|---|---|---|---|
| Supabase (local) | Database + Auth | Unlimited (local Docker) | No cloud costs; would need Supabase Cloud for production |
| Stadia Maps | Base map tiles + geocoding | 200k tile req/mo | API key configured; geocoding also active |
| Valhalla (OSM public) | Route calculation | No quota, but ~930 mi/route hard cap | **Blocks cross-country routing today** |
| Cloudinary | POI image storage | 25 GB storage | Configured; not yet used heavily |
| PostHog Cloud | Analytics + session recording | 1M events/mo | Active; events firing in production |
| OpenStates | Legislation bill data | Rate limited | Used for bill lookups and legislation tracking |
| Gmail SMTP | News digest emails | 500 emails/day | Using app password via nodemailer |
| Google Sheets API | POI sync from spreadsheet | Free | Service account configured |

---

## Keys Configured but Likely Inactive

| Service | Key present | Status |
|---|---|---|
| Resend | `RESEND_API_KEY` | Digest was switched to Gmail SMTP; Resend account may still exist but isn't being called |

---

## Hosting

The app runs on a self-hosted Ubuntu VM — no cloud hosting costs. The VM itself
(electricity, hardware, or VPS cost) is outside this doc.

---

## Near-Term Cost Changes

1. **Valhalla routing** — the ~930 mile cap is an immediate blocker for
   cross-country routes. Switching to Stadia Maps routing (~$8–16/1,000
   requests) or self-hosting Valhalla (~$20–40/mo VPS) is the first real cost.
   See [readme-paidupgrades.md](readme-paidupgrades.md).

2. **Supabase Cloud** — needed when moving to production hosting. Free tier
   (500 MB DB, 2 GB storage, 50k MAU) is sufficient for early launch.

3. **Stadia Maps tiles** — free tier covers ~200k tile requests/month. A
   moderately active user base could exceed this; Stadia paid plans or
   self-hosted PMTiles are the upgrade path.
