# Data Sources — Pending Outreach

Organizations whose data would be valuable to import but where we want to establish a data partnership before scraping or bulk use. Contact before building any automated import.

---

## HRC — Municipal Equality Index (MEI)

**URL:** https://reports.hrc.org/municipal-equality-index-2025
**City scores:** https://www.hrc.org/resources/mei-see-your-cities-scores
**Contact:** mei@hrc.org
**What we want:** Full scored city list (city, state, total score, sub-scores by category) for all 506 rated municipalities from the current MEI year
**Why it's valuable:** City-level LGBTQ+ policy ratings covering non-discrimination laws, employer policies, services and programs, law enforcement, and leadership — complements CATPALM's state-level data with city-level granularity for travelers. 132 cities scored perfect 100 in 2025; national average 70.
**Proposed use:** Import as a new `policy-rating-mei` category, city-scoped POIs. Severity mapped from score: 90–100 → +3, 70–89 → +2, 50–69 → +1, 30–49 → 0, <30 → −1. Store raw score in `attributes`.
**Notes:** No public CSV or API. State pages link only to individual PDF scorecards. The `/resources/municipalities` search is JavaScript-rendered and likely hits a backend API (could be reverse-engineered with dev tools, but prefer a data agreement). Annual dataset — one CSV export per year would be sufficient. MEI team has a dedicated contact separate from general HRC inquiries.

---

## HRC — State Equality Index (SEI)

**URL:** https://www.hrc.org/resources/state-scorecards
**Contact:** https://www.hrc.org/about/contact-us (no dedicated SEI email found — try general contact or mei@hrc.org as a starting point)
**What we want:** Full state-by-state ratings across all 13 scored criteria for all 50 states + DC
**Why it's valuable:** State-level LGBTQ+ policy assessment covering employment, housing, public accommodations, education, hate crimes, adoption, gender ID updates, gender-affirming care bans, and more. Broad category overlap with CATPALM but independently scored — useful as a cross-reference and for categories CATPALM doesn't cover (adoption, hate crimes, HIV criminalization).
**Proposed use:** Cross-reference against existing CATPALM state POIs; could supplement or replace for categories not yet covered. Overall classification (e.g., "High Priority to Achieve Basic Equality" vs. "Working Toward Innovative Equality") maps naturally to severity.
**Notes:** No downloadable data found. States are rated with "Supports / Partially supports / Does not support" per criterion rather than a numeric score. May be worth requesting as part of the same outreach as the MEI — both come from HRC and a single data share agreement could cover both.

---

## HRC — Healthcare Equality Index (HEI)

**URL:** https://www.hrc.org/resources/healthcare-equality-index
**Facility search:** https://www.hrc.org/resources/healthcare-facilities
**Contact:** https://www.hrc.org/contact (use "Data / Research" inquiry type)
**What we want:** Full facility list (name, address, city, state, designation) for Leaders and High Performers from the current HEI year
**Why it's valuable:** ~846 hospitals and healthcare facilities rated as LGBTQ+-affirming across all 50 states — strong positive-side POI set for travelers needing affirming care
**Proposed use:** Import as `category: affirming-healthcare`, severity +3 for Leaders, +2 for High Performers
**Notes:** Data is server-side rendered HTML with ~10 results/page — technically scrapable, but we'd rather have a data share agreement. Annual dataset so a one-time CSV export per year would be sufficient. As a trans safety nonprofit we have a solid case for a partnership ask.

---

## OutCare — OutList Provider Directory

**URL:** https://outcarehealth.org
**Contact:** https://outcarehealth.org/contact
**What we want:** Provider list (name, specialty, city, state) from the OutList directory
**Why it's valuable:** LGBTQ+-affirming individual providers (clinicians, therapists, GPs) — more granular than HRC's hospital-level data; specifically includes trans/GD-affirming specialists
**Proposed use:** Import as `category: affirming-healthcare` with positive severity; link to OutCare provider page
**Notes:** ToS explicitly prohibits scraping — outreach required. Also does not screen providers so any import should note that caveat. As a nonprofit with aligned mission, a data share is a reasonable ask. They also do not screen providers so any import should note that caveat in the POI description.

---

## LGBTQ+ Healthcare Directory (Tegan and Sara Foundation / GLMA)

**URL:** https://lgbtqhealthcaredirectory.org
**Contact — Tegan and Sara Foundation:** https://teganandsara.com/foundation/contact
**Contact — GLMA:** https://glma.org/contact.php
**What we want:** Provider list (name, credentials, specialties, city, state/province) for US entries
**Why it's valuable:** 2,700+ self-registered LGBTQ+-affirming providers across the US and Canada; includes virtual care; broader than HRC's hospital focus
**Proposed use:** Import as `category: affirming-healthcare`; note profiles are self-reported and unverified
**Notes:** No explicit ToS prohibition on data use found (unlike OutCare). Two orgs share ownership — either GLMA or Tegan and Sara Foundation could grant a data partnership. Good mission alignment. Providers are not screened at signup so POI descriptions should reflect that caveat.

---

## True Colors United — LGBTQ+ Youth Shelter Network

**URL:** https://truecolorsunited.org
**Contact:** https://truecolorsunited.org/contact
**What we want:** Directory of LGBTQ+-affirming emergency shelters and transitional housing providers, with location data
**Why it's valuable:** LGBTQ+ youth are 120% more likely to face homelessness; trans-affirming shelter locations are a life-safety resource for travelers in crisis
**Proposed use:** Import as `category: trans-shelter` with high positive severity; note whether each provider is trans-specific or general LGBTQ+-affirming
**Notes:** No public shelter database found on their site — data likely lives in their training/technical assistance programs. Outreach required. Also worth asking if they can refer us to regional affiliates who maintain local shelter lists.

---

## Gay Camping Friends — LGBTQ+ Campground Directory

**URL:** https://gaycampingfriends.com
**Contact:** info@gaycampingfriends.com
**What we want:** Full campground list (name, address, city, state, phone, website URL) for US entries across their LGBTQ+, Gay, Lesbian, LGBTQ+ Owned, and LGBT Friendly categories
**Why it's valuable:** Community-maintained directory of ~150–200 US LGBTQ+-friendly campgrounds; broader coverage than the 10-entry Roadtrippers article already imported
**Proposed use:** Import as `category: trans-camping`, severity +2, prominence `local`; note profiles are community-submitted and unverified
**Notes:** Category listing pages are server-side rendered (name/city/state/brief description accessible). Individual campground pages are client-side rendered — address, phone, website, and coordinates require a headless browser scrape or data export. ToS has no explicit scraping prohibition but a data partnership ask is the cleaner path. Small community org with aligned mission. If they can provide a CSV or JSON export, a one-time import script would be straightforward.

---
