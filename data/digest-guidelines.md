# TransSafeTravels News Digest — Analysis Guidelines

This file controls how the AI analyzes news articles in the daily digest.
Edit it to adjust filtering rules without touching the script.

---

## Purpose

TransSafeTravels is a safety resource for transgender travelers in the US (and increasingly, international travel involving the US). The digest exists to surface news that could:

1. Require a severity level change on an existing map location
2. Create or update a watch item (pending legislation, lawsuit, court date)
3. Signal a new or changed physical safety threat to travelers
4. Inform travelers about border crossing, passport, or international travel conditions

The audience is **travelers making real-world decisions** — not policy advocates or general LGBTQ news readers. Prioritize accordingly.

---

## What to Flag

### High priority
- A law, executive order, or court ruling **that has taken effect or will take effect on a specific date**
- A Supreme Court case that has been **accepted for review** or has a **decision date set**, where the outcome would affect trans people's rights or safety
- State legislation that has **passed a chamber** or is **scheduled for a floor vote**
- A **confirmed** physical safety incident (hate crime, attack, documented harassment pattern)
- A federal policy change that **concretely restricts or expands** what trans travelers can do or access (passport rules, federal facility access, TSA policy, etc.)
- **Canada or Mexico issuing travel advisories or warnings** about the US relevant to LGBTQ travelers
- US passport or border crossing policy changes that affect trans travelers

### Medium priority
- A lawsuit that has been **filed** (not just threatened) that could affect trans rights in a specific jurisdiction
- State legislation that has been **introduced and referred to committee** with a realistic path forward
- A court **injunction** blocking or reinstating a law
- Local ordinances or policies with concrete effect in a specific city or county
- Documented patterns of enforcement (or lack thereof) of existing laws

### Low priority — include but don't over-weight
- Articles that provide **climate context** for a jurisdiction already on the map (even if no specific action is required)
- Shield law or sanctuary designation updates
- Federal agency guidance (not regulation) that signals direction without immediate legal effect

---

## What to Skip

Mark these as `"relevance": "skip"` — do not include them in findings:

- **Pure speculation** about what the Trump administration (or any administration) "could," "might," or "is considering" doing, with no specific bill number, court filing, executive order number, or scheduled date attached
- Articles about **transgender youth in sports** — these are important as cultural/climate context but are not directly actionable for adult travelers making route decisions. Exception: if a law covers adults or affects access to public facilities.
- Articles about **transgender healthcare for minors** — same reasoning. Exception: if the law also restricts adult care or travel to obtain care.
- **Opinion pieces, editorials, and advocacy statements** unless they contain factual reporting of a specific new development
- Articles that are **clearly duplicates** of something already covered in this batch (same event, different outlet)
- **International LGBTQ issues unrelated to US travel** (e.g., laws in Uganda, UK gender recognition debates) unless they directly affect Americans traveling to or from those countries

---

## Jurisdiction Types

Use exactly one of these values for `jurisdiction_type`:

| Value | Use for |
|-------|---------|
| `federal` | US federal government actions, agencies, Supreme Court |
| `state` | State-level laws, legislation, court rulings |
| `county` | County or parish-level actions |
| `city` | City or municipality-level actions |
| `reservation` | Tribal nation actions or policies |
| `territory` | US territory actions (Puerto Rico, Guam, USVI, etc.) |
| `international` | Cross-border travel, passport policy, Canada/Mexico advisories, border crossing |

---

## International Travel Section

Flag articles as `jurisdiction_type: "international"` when they concern:

- Canada or Mexico issuing travel warnings or advisories about the US for LGBTQ travelers
- US passport policy changes (gender marker rules, name changes, passport denial)
- TSA screening policies affecting trans travelers
- Border crossing procedures that affect trans people (CBP, ICE enforcement at borders)
- US entry/exit restrictions that could strand trans travelers
- Canadian or Mexican laws or policies that affect trans Americans traveling there

---

## Confidence Guidelines

| Score | Meaning |
|-------|---------|
| 0.9–1.0 | Specific, confirmed, sourced from a reliable outlet with named officials or court documents |
| 0.7–0.89 | Credible outlet, specific claims, but not yet confirmed by primary sources |
| 0.5–0.69 | Plausible but vague, single source, or unclear timeline |
| Below 0.5 | Speculative — consider skipping unless the topic is important enough to watch |

---

## Severity Delta Guidelines

Only suggest a `severity_delta` if the article describes a **concrete, enforceable change** in a specific jurisdiction:

- New criminal law enacted: -2 to -3
- New civil penalty law enacted: -1 to -2
- Law struck down or enjoined: +1 to +2
- Sanctuary/shield law enacted: +2 to +3
- Active enforcement of existing law documented: -1
- Pattern of non-enforcement documented: +1

When in doubt, leave `severity_delta` as `null` and describe the situation in `suggested_action`.
