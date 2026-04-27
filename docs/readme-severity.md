# Severity Scale & Law Import

## Overview

Every POI in TransSafeTravels has a `severity` field ranging from **-10** (most dangerous) to **+10** (most affirming). Negative values color a state/county/city red-orange on the map; positive values color it green. The intensity of the color scales with the magnitude.

Region colors are determined by the **most severe** POI in that region. Clicking a region shows all individual law/incident POIs so users can see the full picture.

---

## Severity Scale

| Severity | Meaning |
|----------|---------|
| **-10** | Confirmed recent hate violence at a specific location (attack within last 2 years), or active credible threat |
| **-9** | Criminal law with documented active enforcement, OR area with multiple documented anti-trans incidents |
| **-8** | Criminal law (felony or misdemeanor) with credible enforcement history |
| **-7** | Criminal law on books, rarely or never enforced |
| **-6** | Civil penalties with real teeth (significant fines, loss of licenses or benefits) |
| **-5** | Civil penalties — discriminatory policy with some legal consequence |
| **-4** | Discriminatory policy without meaningful legal penalty |
| **-3** | Multiple minor anti-trans laws or policies in effect |
| **-2** | Public officials actively making anti-trans statements or publicly advocating for legislation, even if nothing has been formally proposed |
| **-1** | Anti-trans legislation passed in the last 5 years (minor in scope) |
| **0** | Neutral — no notable laws or climate indicators in either direction |
| **+1** | No anti-trans laws on the books in this jurisdiction, generally friendly reputation |
| **+2** | Non-discrimination protections or pro-trans laws in place |
| **+3** | Non-discrimination protections actively enforced with documented outcomes |
| **+4** | Protections across multiple domains (employment, housing, public accommodations) |
| **+5** | Strong multi-domain protections with enforcement track record |
| **+6** | Strong protections plus community infrastructure (legal aid, trans-specific services) |
| **+7** | Comprehensive protections, welcoming community, low documented incident rate |
| **+8** | Sanctuary status or shield laws (protect residents from enforcement of other states' anti-trans laws) |
| **+9** | Multiple affirming laws, active enforcement, and strong community support |
| **+10** | Model jurisdiction — sanctuary laws, shield laws, comprehensive protections, active welcoming community |

---

## POI Categories for Laws & Safety

| Category (`icon_slug`) | Use |
|------------------------|-----|
| `law-bathroom` | Bathroom/facility restriction laws |
| `law-antitrans` | Broad anti-trans laws (healthcare bans, drag bans, etc.) |
| `law-discrimination` | Discrimination law — either a harmful gap or an affirming protection |
| `legalresource` | Legal aid, know-your-rights resources, sanctuary designations |
| `safety-incident` | Physical safety events — hate crimes, attacks, documented harassment patterns |

---

## Recency Tiers for Safety Incidents

Safety incidents use `visible_end` to automatically expire from the map (default: 2 years after the incident). The POI detail panel displays a recency badge based on the `enacted_date` / event date stored in `attributes.enacted_date`:

| Badge | Condition |
|-------|-----------|
| **Recent** | Within the last 30 days |
| **This year** | 31 days – 12 months ago |
| **1–2 years ago** | 12–24 months ago |
| *(no badge)* | Older than 2 years (or no date recorded) |

---

## Adjusting Severity

Severity is computed from `data/severity-rules.json` using each law's `category` + `penalty_type` + `enforcement` fields. To adjust the scale:

1. Edit `data/severity-rules.json`
2. Re-run the import: `node scripts/import-laws.mjs`

All existing law POIs update automatically. An explicit `"severity"` field in `anti-trans-laws.json` overrides the rules for that specific entry.

### `penalty_type` values by category

**`law-bathroom` / `law-antitrans`**
- `criminal_felony` — felony charge
- `criminal_misdemeanor` — misdemeanor charge
- `criminal_unenforced` — criminal law, no known enforcement
- `civil_significant` — significant civil penalties
- `civil_minor` — minor civil penalties
- `policy_only` — policy without legal penalty
- `rhetoric_only` — no law, only political rhetoric *(law-antitrans only)*

**`law-discrimination`**
- `no_protections` — no non-discrimination protections
- `partial_protections` — some domains covered
- `full_protections` — most domains covered
- `strong_protections` — broad, actively enforced protections
- `sanctuary_shield` — sanctuary or shield law status

**`safety-incident`**
- `violence_recent` — confirmed physical attack (within 2 years)
- `violence_ongoing` — ongoing or repeated attacks
- `harassment_pattern` — documented pattern of harassment
- `hostile_climate` — documented hostile environment without specific incidents

### `enforcement` modifier (added to base severity, capped at ±10)

| Value | Modifier |
|-------|----------|
| `active` | -1 (worse) |
| `moderate` | 0 |
| `low` | +1 (less severe) |
| `none` | +2 (less severe) |

---

## Adding a Law

Add an entry to `data/anti-trans-laws.json`:

```json
{
  "source_id": "TX-SB12-2023",
  "title": "SB 12 — Drag performance restriction",
  "description": "Restricts drag performances in public spaces or where minors may be present.",
  "long_description": "Detailed markdown description with links...",
  "scope": "state",
  "state_abbr": "TX",
  "category": "law-antitrans",
  "penalty_type": "civil_significant",
  "enforcement": "moderate",
  "enacted_date": "2023-06-18",
  "tags": ["drag", "performance", "civil-penalty"],
  "is_verified": true
}
```

For county scope, add `"county_fips": "48201"` (5-digit FIPS).  
For city scope, add `"city_name": "Houston"` and `"statefp": "48"`.

Then run:
```bash
node scripts/import-laws.mjs --dry-run   # preview
node scripts/import-laws.mjs             # import
```

---

## Adding a Safety Incident

```json
{
  "source_id": "FL-PULSE-ORLANDO-2016",
  "title": "Pulse Nightclub Attack — Orlando",
  "description": "Mass shooting at an LGBTQ nightclub; 49 killed.",
  "long_description": "On June 12, 2016, a gunman opened fire at Pulse, a gay nightclub in Orlando...",
  "scope": "city",
  "city_name": "Orlando",
  "statefp": "12",
  "category": "safety-incident",
  "penalty_type": "violence_recent",
  "enacted_date": "2016-06-12",
  "tags": ["mass-shooting", "nightclub", "hate-crime"],
  "is_verified": true
}
```

Safety incidents automatically expire from the map 2 years after `enacted_date` (configurable in `severity-rules.json` → `expiry_days`).
