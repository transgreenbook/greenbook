# Data Sources

Reference guide for the most useful and reliable sources when adding laws, policies, and safety data to TransSafeTravels.

---

## Primary Sources

### Trans Legislation Tracker
**URL:** https://translegislation.com/  
**Type:** Law listings by state  
**Coverage:** Active and recently passed anti-trans legislation across all 50 states  
**API:** None — manual import only  
**Attribution:** Required. Link back to the specific law page when using data from this source.  
**Best for:** Finding recently introduced or passed bills; cross-referencing law status (introduced, passed, failed, signed, vetoed)  
**Notes:** Good for identifying new entries to add to `anti-trans-laws.json`. Check it when adding laws with `category: law-antitrans` or `category: law-bathroom`.

---

### MAP (Movement Advancement Project) — Bathroom Bans
**URL:** https://www.mapresearch.org/equality-maps/nondiscrimination/bathroom_bans  
**Type:** State-level policy map and table  
**Coverage:** All 50 states; tracks scope of bathroom/facility restrictions  
**API:** None — manual import from table  
**Attribution:** Cite MAP as source; link to the specific map page in `source_url`  
**Best for:** Determining `penalty_type` and scope for `law-bathroom` entries  
**Notes on columns:**
- **"Some But Not All Government-Owned Buildings/Places"** → `penalty_type: policy_only` or `civil_minor` depending on enforcement mechanism
- **"All Schools, Colleges, & Government-Owned Buildings"** → typically `criminal_misdemeanor` or `civil_significant`; check the underlying bill for penalty details

---

### MAP — Public Accommodations Non-Discrimination Laws
**URL:** https://www.mapresearch.org/equality-maps/non_discrimination_laws/public-accommodations  
**Type:** State-level policy map and table  
**Coverage:** All 50 states; tracks whether trans people are protected in public accommodations  
**API:** None — manual import  
**Attribution:** Cite MAP; link to the specific map page in `source_url`  
**Best for:** Positive-side entries (`category: law-discrimination`, `penalty_type: full_protections` / `strong_protections` / `partial_protections`)  
**Notes:** States with strong public accommodations protections often pair with other affirming protections — check for employment and housing coverage to determine whether `full_protections` or `strong_protections` applies.

---

### Erin in the Morning — Anti-Trans National Risk Assessment
**URL:** https://www.erininthemorning.com/p/anti-trans-national-risk-assessment  
**Type:** Periodic risk assessment article (Substack)  
**Coverage:** State-level risk ratings with narrative context  
**API:** None — manual reading  
**Attribution:** Link to article in `source_url`; note it as an opinion/analysis source  
**Best for:** Calibrating severity ratings; understanding the cumulative effect of multiple laws in a state; identifying states where severity should be adjusted upward due to enforcement climate  
**Notes:** Erin Reed's assessments factor in enforcement behavior, political climate, and cumulative law burden — useful for deciding when a state with "moderate" laws on paper deserves a higher severity due to enforcement. Updated periodically; check publication date before use.

---

## Source Quality Tiers

| Tier | Description | Examples |
|------|-------------|---------|
| **Primary** | Official government records or established civil rights orgs with documented methodology | MAP Research, official state legislature sites |
| **Secondary** | Reputable journalism and advocacy tracking with sourced claims | Trans Legislation Tracker, Erin in the Morning, ACLU state trackers |
| **Tertiary** | News reports, social media, advocacy group statements | Use only to flag for further verification; set `is_verified: false` |

---

## Attribution in `anti-trans-laws.json`

Always include a `source_url` pointing to the most specific available page for the law:

```json
{
  "source_id": "FL-HB1521-2023",
  "source_url": "https://www.flsenate.gov/Session/Bill/2023/1521",
  ...
}
```

If the primary source is MAP or Trans Legislation Tracker rather than the bill text itself, link there:

```json
{
  "source_url": "https://translegislation.com/bills/2023/FL/HB1521"
}
```

`source_url` is stored in `attributes.source_url` and shown as a "Source" link in the POI detail panel.

---

### ProPublica Congress API
**URL:** https://projects.propublica.org/api-docs/congress-api/  
**Type:** RESTful API — federal legislative data  
**Coverage:** All U.S. federal legislation; bills, votes, member sponsorships, committee actions, lobbying filings, congressional statements  
**API:** Yes — free, requires API key (sign up at ProPublica's developer portal)  
**Attribution:** Required per ProPublica's Data Terms of Use. Cite ProPublica as the data source.  
**Best for:**
- Tracking **federal anti-trans bills** (e.g., national bathroom bans, Medicaid restrictions, military bans) as they move through committee and to the floor
- Looking up bill sponsors, co-sponsors, and which members voted for/against a given bill
- Detecting **new federal legislation** to add as entries with `effect_scope: "state"` or a future `"federal"` scope
- Cross-referencing a bill number (e.g., H.R.734 "Protection of Women and Girls in Sports Act") against vote tallies and current status  

**Key endpoints:**
- `GET /congress/v1/bills/search.json?query=transgender` — full-text bill search
- `GET /congress/v1/{congress}/{chamber}/bills/{type}.json` — recent bills by type/chamber
- `GET /congress/v1/members/{member-id}/votes.json` — member voting record
- `GET /congress/v1/{congress}/lobbying/latest.json` — recent lobbying filings

**Notes:** API key goes in `X-API-Key` header. Rate limits are not published but are liberal for non-commercial use. Federal laws and bills will be surfaced in a dedicated **Federal** tab in the app (before the About tab) rather than duplicated across state panels — since they apply everywhere and can't be avoided by routing, they're informational context rather than route-relevant warnings. Good candidate for the future automated news pipeline.

---

## Legislation Sync Sources

Structured data sources used by automated sync scripts to populate the `legislation_bills` table. Unlike RSS feeds, these sources are curated — every row is definitively relevant. Status changes trigger digest findings for admin review.

---

### ACLU — Tracking Anti-LGBTQ Bills

**URL:** https://www.aclu.org/legislative-attacks-on-lgbtq-rights  
**CSV endpoint:** `https://www.aclu.org/wp-json/api/legislation/csv/107155`  
**Type:** Curated CSV download — state-level anti-LGBTQ legislation  
**Coverage:** All 50 states; ~728 bills as of April 2026  
**API:** No formal API — WordPress JSON endpoint serving a CSV. URL contains a post ID (`107155`) that may change if the ACLU republishes the page; verify periodically.  
**Authentication:** None  
**Script:** `scripts/sync-aclu-legislation.mjs` (planned)  
**Best for:** Initial population of `legislation_bills`; catching new bills and status changes  
**Columns:**

| Column | Notes |
|--------|-------|
| State | Full state name — normalize to 2-letter abbr for DB |
| Bill Name | e.g. "S.B. 1264" — normalize (strip punctuation) for dedup key |
| Issues | Pipe-separated categories e.g. "Healthcare restrictions \| School facilities bans" |
| Status | "Advancing", "Passed into Law", "Defeated", etc. |
| Status Detail | Procedural detail e.g. "Governor signed" |
| Status Date | MM/DD/YYYY — convert to ISO 8601 for DB |
| In Court Link | Mostly empty |

**Dedup key:** `(state_abbr, normalized_bill_number)` — source-agnostic so the same bill from LegiScan won't create a duplicate.  
**Limitations:** No bill text URL, no session year, no federal bills.

---

### LegiScan API

**URL:** https://legiscan.com/  
**API docs:** https://legiscan.com/legiscan-api  
**Type:** RESTful API — state and federal legislative data  
**Coverage:** All 50 states + federal; full bill lifecycle tracking  
**API:** Yes — free tier available (requires API key); register at legiscan.com  
**Authentication:** API key as query parameter (`key=`)  
**Script:** Planned as enrichment layer on top of ACLU sync  
**Best for:**
- Enriching `legislation_bills` rows with `bill_text_url` (direct link to state legislature page)
- Catching bills the ACLU hasn't yet indexed
- Session year data needed to construct reliable URLs

**Key endpoints:**
- `GET /api/?op=getDataset&state=TX&category=T` — full state bill dataset (transgender-related category)
- `GET /api/?op=getBill&id={bill_id}` — full bill detail including text URLs
- `GET /api/?op=search&state=TX&query=transgender` — keyword search

**Notes:** LegiScan returns a `url` field pointing directly to the official state legislature page — this is the value to store in `legislation_bills.bill_text_url`. The free tier has rate limits; dataset downloads are more efficient than per-bill lookups for bulk sync. Add `LEGISCAN_API_KEY` to `.env.local` when integrating.

---

## News Digest Sources (Active RSS Feeds)

All active feeds for the automated daily digest (`scripts/news-digest.mjs`). All are **Google News RSS** — no date-range filtering is supported server-side; the digest script applies a client-side cutoff (`MAX_ARTICLE_DAYS`, currently 14 days). Google News RSS returns approximately the 10 most recent results per query.

| Priority | Name | Query focus |
|----------|------|-------------|
| 10 | Google News — trans safety hate crime | Physical safety events, hate crimes, hate violence targeting trans people |
| 10 | Google News — federal trans policy | Federal policy changes, executive orders, Title IX |
| 10 | Google News — Canada travel advisory LGBTQ US | Canadian travel warnings about the US for LGBTQ travelers |
| 9 | Google News — anti-trans legislation | Anti-trans law and legislation coverage |
| 9 | Google News — gender-affirming care | Gender-affirming care bans |
| 9 | Google News — transgender rights court | Court rulings and lawsuits affecting trans rights |
| 9 | Google News — US passport transgender policy | US passport and ID policy changes |
| 9 | Google News — border crossing transgender | Border crossing, CBP, customs, TSA issues |
| 8 | Google News — bathroom bill | Bathroom bills and facility restrictions |
| 8 | Google News — trans travel safety | Travel safety, safe states, shield/sanctuary laws |
| 7 | Google News — Mexico Canada trans travel | Trans travel conditions in Mexico and Canada |

Feed URLs are stored in the `news_sources` table (seeded in `supabase/migrations/20260413000003_monitoring_tables.sql` and `20260413000005_international_news_sources.sql`). Add or disable feeds there — no code changes required.

---

## Sources Under Consideration

These have not been used yet but may be useful:

- **OpenStates** (https://openstates.org/) — alternative to LegiScan for state bill data; open source; overlaps significantly with LegiScan coverage
- **HRC (Human Rights Campaign)** — state scorecards for employer/public accommodation protections

---

## Boundary Data Sources

### US Census TIGER/Line — AIANNH (Native American Reservations)
**URL:** https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html  
**Type:** Shapefile / GeoJSON download  
**Coverage:** All federally recognized American Indian Areas, Alaska Native Areas, and Hawaiian Home Lands  
**API:** No API — bulk annual shapefile download  
**Best for:** Loading a `reservations` PostGIS table for tribal jurisdiction detection  
**Notes:** Same TIGER data family as county/city boundaries. Actual polygon boundaries needed (not bboxes) because reservation shapes are too irregular for bbox intersection. The layer is called **AIANNH** in TIGER. BIA (Bureau of Indian Affairs) is the authoritative federal source and publishes compatible boundary data. No tribal law data exists yet — boundary data would support detecting when a route or click falls inside tribal territory so state POIs can be annotated or suppressed. See `docs/readme-visibility.md → Jurisdictional Override Zones`.
