#!/usr/bin/env node
/**
 * news-digest.mjs
 *
 * Daily news monitoring digest for TransSafeTravels.
 *
 * For each active news source, fetches RSS articles, deduplicates against
 * previously seen URLs, then asks Claude to analyze them against existing
 * POI/severity data and active watch items. Findings are stored in the DB
 * and emailed as a formatted HTML digest.
 *
 * Required env vars (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *   RESEND_API_KEY    — Resend API key for sending email
 *   DIGEST_FROM_EMAIL — sender address (must be verified in Resend)
 *   DIGEST_TO_EMAIL   — recipient address
 *
 * Run:
 *   node scripts/news-digest.mjs
 *   node scripts/news-digest.mjs --dry-run          # fetch + analyze, skip email + DB writes
 *   node scripts/news-digest.mjs --dry-run --debug  # also print Claude's raw JSON response
 */

import { createClient }  from '@supabase/supabase-js';
import Anthropic         from '@anthropic-ai/sdk';
import { Resend }        from 'resend';
import { XMLParser }     from 'fast-xml-parser';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/\s+#.*$/, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.resolve(ROOT, '.env.local'));

const DRY_RUN          = process.argv.includes('--dry-run');
const DEBUG            = process.argv.includes('--debug');
const MAX_ARTICLE_DAYS = 14; // skip articles published more than this many days ago

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY,
  RESEND_API_KEY,
  DIGEST_FROM_EMAIL,
  DIGEST_TO_EMAIL,
} = process.env;

const FROM_EMAIL = DIGEST_FROM_EMAIL ?? 'digest@transsafetravels.com';
const TO_EMAIL   = DIGEST_TO_EMAIL   ?? 'transsafetravels@gmail.com';

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}
if (!RESEND_API_KEY && !DRY_RUN) {
  console.error('Missing RESEND_API_KEY (use --dry-run to skip email)');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const supabase  = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const resend    = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// ---------------------------------------------------------------------------
// RSS fetching
// ---------------------------------------------------------------------------

async function fetchFeed(source) {
  const resp = await fetch(source.feed_url, {
    headers: { 'User-Agent': 'TransSafeTravels-Digest/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${source.feed_url}`);
  const xml  = await resp.text();
  const doc  = xmlParser.parse(xml);

  // Handle both RSS 2.0 and Atom
  const channel = doc?.rss?.channel ?? doc?.feed;
  if (!channel) throw new Error('Unrecognized feed format');

  const rawItems = channel.item ?? channel.entry ?? [];
  const items    = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.map((item) => ({
    title:       item.title       ?? item['title']?.['#text'] ?? '(no title)',
    url:         item.link        ?? item['link']?.['@_href'] ?? '',
    description: stripHtml(item.description ?? item.summary ?? item.content ?? ''),
    published:   item.pubDate     ?? item.published ?? item.updated ?? null,
    source_id:   source.id,
    source_name: source.name,
  })).filter((a) => a.url);
}

function stripHtml(str) {
  return String(str).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

// ---------------------------------------------------------------------------
// State centroids (for placing draft law POIs at state level)
// ---------------------------------------------------------------------------

const STATE_CENTROIDS = {
  AK: { lat: 61.310, lng: -154.560 }, AL: { lat: 32.615, lng:  -86.680 },
  AR: { lat: 34.750, lng:  -92.130 }, AZ: { lat: 34.165, lng: -111.935 },
  CA: { lat: 37.270, lng: -119.270 }, CO: { lat: 38.995, lng: -105.550 },
  CT: { lat: 41.520, lng:  -72.760 }, DC: { lat: 38.890, lng:  -77.015 },
  DE: { lat: 39.145, lng:  -75.385 }, FL: { lat: 27.760, lng:  -83.830 },
  GA: { lat: 32.680, lng:  -83.225 }, HI: { lat: 20.580, lng: -157.530 },
  IA: { lat: 41.935, lng:  -93.390 }, ID: { lat: 45.495, lng: -114.140 },
  IL: { lat: 39.740, lng:  -89.505 }, IN: { lat: 39.765, lng:  -86.440 },
  KS: { lat: 38.495, lng:  -98.320 }, KY: { lat: 37.825, lng:  -85.765 },
  LA: { lat: 30.975, lng:  -91.430 }, MA: { lat: 42.065, lng:  -71.720 },
  MD: { lat: 38.805, lng:  -77.270 }, ME: { lat: 45.260, lng:  -69.015 },
  MI: { lat: 45.000, lng:  -86.415 }, MN: { lat: 46.440, lng:  -93.365 },
  MO: { lat: 38.300, lng:  -92.435 }, MS: { lat: 32.590, lng:  -89.875 },
  MT: { lat: 46.680, lng: -110.045 }, NC: { lat: 35.215, lng:  -79.890 },
  ND: { lat: 47.470, lng: -100.300 }, NE: { lat: 41.500, lng:  -99.680 },
  NH: { lat: 44.005, lng:  -71.585 }, NJ: { lat: 40.145, lng:  -74.725 },
  NM: { lat: 34.165, lng: -106.025 }, NV: { lat: 38.500, lng: -117.025 },
  NY: { lat: 42.755, lng:  -75.810 }, OH: { lat: 40.365, lng:  -82.670 },
  OK: { lat: 35.310, lng:  -98.715 }, OR: { lat: 44.130, lng: -120.515 },
  PA: { lat: 40.995, lng:  -77.605 }, RI: { lat: 41.585, lng:  -71.490 },
  SC: { lat: 33.635, lng:  -80.945 }, SD: { lat: 44.215, lng: -100.250 },
  TN: { lat: 35.830, lng:  -85.980 }, TX: { lat: 31.170, lng: -100.080 },
  UT: { lat: 39.495, lng: -111.545 }, VA: { lat: 38.000, lng:  -79.460 },
  VT: { lat: 43.875, lng:  -72.470 }, WA: { lat: 47.270, lng: -120.830 },
  WI: { lat: 44.900, lng:  -89.570 }, WV: { lat: 38.920, lng:  -80.180 },
  WY: { lat: 43.000, lng: -107.555 },
};

// ---------------------------------------------------------------------------
// DB context helpers
// ---------------------------------------------------------------------------

async function pruneAndGetSeenUrls() {
  // Delete expired rows first
  await supabase
    .from('seen_articles')
    .delete()
    .lt('expires_at', new Date().toISOString());

  const { data } = await supabase
    .from('seen_articles')
    .select('article_url');
  return new Set((data ?? []).map((r) => r.article_url));
}

async function markArticlesSeen(articles) {
  if (!articles.length) return;
  const rows = articles.map((a) => ({
    article_url:  a.url,
    source_id:    a.source_id ?? null,
    first_seen_at: new Date().toISOString(),
    expires_at:   new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  }));
  // Upsert — safe to call even if URL already exists
  await supabase.from('seen_articles').upsert(rows, { onConflict: 'article_url', ignoreDuplicates: true });
}

async function getDBContext() {
  const [poisRes, watchRes, lawPoisRes, categoriesRes, statesRes] = await Promise.all([
    supabase
      .from('points_of_interest')
      .select('id, title, severity, effect_scope, state_abbr, county_name, city_name, description')
      .not('severity', 'is', null)
      .order('severity', { ascending: true })
      .limit(100),
    supabase
      .from('watch_items')
      .select('id, item_type, title, description, jurisdiction_type, status, next_check_date, severity_impact')
      .eq('status', 'monitoring')
      .order('created_at', { ascending: false })
      .limit(50),
    // Existing curated law/policy POIs — so Claude avoids suggesting duplicates
    // of our own hand-curated data. CATPALM and other 3rd-party imports are
    // intentionally excluded: we want to build our own curated POI for every
    // significant law regardless of whether a 3rd-party summary already covers it.
    supabase
      .from('points_of_interest')
      .select('id, title, state_abbr, source, severity')
      .in('source', ['curated', 'digest-draft'])
      .order('state_abbr')
      .limit(500),
    supabase
      .from('categories')
      .select('id, name'),
    supabase
      .from('states')
      .select('id, abbreviation'),
  ]);

  // Build category name → id map (lowercase keys for case-insensitive lookup)
  const categoryMap = new Map(
    (categoriesRes.data ?? []).map((c) => [c.name.toLowerCase(), c.id])
  );

  // Build state abbreviation → id map
  const stateMap = new Map(
    (statesRes.data ?? []).map((s) => [s.abbreviation.trim(), s.id])
  );

  return {
    pois:        poisRes.data    ?? [],
    watchItems:  watchRes.data   ?? [],
    lawPois:     lawPoisRes.data ?? [],
    categoryMap,
    stateMap,
  };
}

// ---------------------------------------------------------------------------
// Claude analysis
// ---------------------------------------------------------------------------

const SEVERITY_SCALE = `
Severity scale: -10 (confirmed recent hate violence) to +10 (model sanctuary jurisdiction).
Key thresholds:
  -9: criminal law with active enforcement, or area with multiple documented incidents
  -8: criminal law with credible enforcement history
  -6: civil penalties with real teeth
  -4: discriminatory policy without meaningful penalty
  -2: public officials actively making anti-trans statements
   0: neutral
  +2: non-discrimination protections in place
  +8: sanctuary/shield laws
`.trim();

const GUIDELINES = (() => {
  try {
    return fs.readFileSync(path.resolve(ROOT, 'data/digest-guidelines.md'), 'utf8');
  } catch {
    console.warn('WARN: data/digest-guidelines.md not found — using default prompt only');
    return '';
  }
})();

async function analyzeWithClaude(articles, context, batchOffset = 0) {
  const articlesText = articles.map((a, i) =>
    `[${i}] SOURCE: ${a.source_name}\nTITLE: ${a.title}\nURL: ${a.url}\nSNIPPET: ${a.description}\nDATE: ${a.published ?? 'unknown'}`
  ).join('\n\n');

  const highSeverityPois = context.pois
    .filter((p) => (p.severity ?? 0) <= -4)
    .map((p) => `${p.state_abbr ?? ''} ${p.county_name ?? ''} ${p.city_name ?? ''} — "${p.title}" (severity ${p.severity})`.trim())
    .join('\n');

  const watchItemsText = context.watchItems.length > 0
    ? context.watchItems.map((w) =>
        `[watch:${w.id}] ${w.jurisdiction_type.toUpperCase()} | ${w.item_type} | "${w.title}" (${w.status})${w.next_check_date ? ` — check by ${w.next_check_date}` : ''}`
      ).join('\n')
    : '(none)';

  // Group existing law/policy POIs by state for gap detection
  const lawPoisByState = {};
  for (const p of (context.lawPois ?? [])) {
    const st = p.state_abbr ?? 'US';
    if (!lawPoisByState[st]) lawPoisByState[st] = [];
    lawPoisByState[st].push(`"${p.title}" (severity ${p.severity}, source: ${p.source})`);
  }
  const lawPoisText = Object.entries(lawPoisByState)
    .map(([st, titles]) => `${st}: ${titles.join('; ')}`)
    .join('\n') || '(none yet)';

  const systemPrompt = `You are a monitoring assistant for TransSafeTravels, a safety resource for transgender travelers in the US and for international travel involving the US.

${SEVERITY_SCALE}

${GUIDELINES}

Respond ONLY with a raw JSON object — no commentary, no markdown fences, no preamble.`;

  const userPrompt = `## High-severity regions currently tracked
${highSeverityPois || '(none yet)'}

## Active watch items
${watchItemsText}

## Existing curated law/policy POIs (do NOT suggest a new POI if one already exists here)
Note: third-party summary data (e.g. CATPALM) is intentionally excluded — we want our own
curated POI for every significant law regardless of whether a 3rd-party entry already covers it.
${lawPoisText}

## New articles to analyze (${articles.length} total)
${articlesText}

Respond with this JSON structure:
{
  "digest_summary": "2-3 sentence overview of today's news batch",
  "findings": [
    {
      "article_index": <number>,
      "relevance": "high|medium|low|skip",
      "jurisdiction_type": "federal|state|county|city|reservation|territory",
      "jurisdiction_name": "<state name, county, city, or 'Federal'>",
      "state_abbr": "<2-letter abbr or null>",
      "summary": "<1-2 sentence summary of what happened and why it matters>",
      "suggested_action": "<what the reviewer should consider doing>",
      "severity_delta": <integer or null — suggested change to existing severity>,
      "confidence": <0.0 to 1.0>,
      "legislation_url": "<direct URL to bill, court docket, executive order, or other primary source — null if unknown>",
      "updates_watch_item_id": <watch item id or null>,
      "new_watch_item": null | {
        "item_type": "bill|lawsuit|executive_order|regulation|policy|event",
        "title": "<short title>",
        "description": "<what it is and why we're watching it>",
        "next_check_date": "<YYYY-MM-DD or null>"
      },
      "suggested_poi": null | {
        "title": "<specific law, ruling, or policy name — be precise>",
        "description": "<what this law/ruling does and its current status, 2-3 sentences>",
        "severity": <integer -10 to +10>,
        "state_abbr": "<2-letter state, or null for federal>",
        "category_hint": "<one of: Law — Anti-Trans | Law — Bathroom Access | Law — Birth Certificate | Law — Driver's License | Law — Healthcare | Policy Rating — Anti-Trans | Policy Rating — Bathroom Access | Policy Rating — Birth Certificate | Policy Rating — Driver's License | Policy Rating — Healthcare | Policy Rating — Non-Binary Recognition | Safety Incident | null>\nUse Law — * for a specific individual law, bill, or court ruling. Use Policy Rating — * for executive orders, agency policies, or general state/regional policy summaries.",
        "source_url": "<direct URL to primary source — bill text, court ruling, or authoritative press release>"
      },
      "incident": null | {
        "title": "<short descriptive title, e.g. 'Assault on trans woman in Dallas'>",
        "description": "<1-2 sentences describing what happened>",
        "incident_date": "<YYYY-MM-DD or null if unknown>",
        "incident_type": "<one of the types below>",
        "jurisdiction_type": "<one of: federal | state | county | city | reservation | territory>",
        "city": "<city name or null>",
        "county_name": "<county name or null>",
        "state_abbr": "<2-letter state abbr or null>",
        "confidence": <0.0 to 1.0>
      }
    }
  ]
}

Incident types (use the most specific match):
  Violence & threats:
    assault              — physical attack on a trans person
    murder               — killing of a trans person
    sexual_assault       — sexual violence against a trans person
    harassment           — verbal harassment, stalking, non-physical intimidation
    property_crime       — vandalism, arson, or destruction of LGBTQ+ property
    threat               — credible threat against a person, venue, or event
  Institutional (traveler-relevant):
    gov_discrimination   — government agency denying services (DMV, vital records, public accommodation)
    law_enforcement_failure    — police not investigating or ignoring violence against trans people
    law_enforcement_misconduct — police targeting, profiling, or mistreating trans people
    border_incident      — TSA, CBP, or border crossing issue targeting a trans traveler
    healthcare_denial    — hospital or clinic refusing care to a trans patient
  Climate:
    demonstration        — organized anti-trans rally or protest creating unsafe local conditions
    political_rhetoric   — anti-trans statements by an elected official or law enforcement leader
    vigilante            — private citizens confronting, filming, or reporting trans people
  Fallback:
    other

Only populate "incident" when the article describes a specific, locatable incident relevant to trans traveler safety. Do NOT populate for general legislation, policy analysis, or national advocacy news with no specific incident.
An article may have both a "suggested_poi" and an "incident" if warranted.

Only include findings with relevance "high", "medium", or "low" — omit "skip" entries entirely.
Only populate "suggested_poi" when ALL of these are true:
  1. The article discusses a specific law, court ruling, executive order, or policy
  2. It is NOT already covered by an entry in the "Existing law/policy POIs" list above
  3. It directly affects trans safety or travel in a specific US state or federally
  4. You have enough information to write a useful title and description
Do NOT suggest a POI for general news stories, advocacy pieces, or articles without a specific legal action.
A third-party policy summary covering the same state/topic is NOT a reason to skip — suggest a curated POI anyway.`;

  const message = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const raw = message.content[0]?.text ?? '{}';
  if (DEBUG) console.log('\n[DEBUG] Claude raw response:\n', raw.slice(0, 2000));

  // Try progressively looser extractions
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const candidates = [
    raw.trim(),
    stripped,
    // Extract first { ... } block (handles any preamble/postamble)
    (() => { const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); return s !== -1 && e > s ? raw.slice(s, e + 1) : ''; })(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch {}
  }

  console.error('Claude returned non-JSON:', raw.slice(0, 300));
  return { digest_summary: null, findings: [] };
}

// ---------------------------------------------------------------------------
// Draft POI research (best-effort article fetch + second Claude call)
// ---------------------------------------------------------------------------

async function fetchArticleText(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'TransSafeTravels-Digest/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const clean = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean.slice(0, 8000);
  } catch {
    return null;
  }
}

/**
 * Fetch the full article and run a targeted second Claude call to extract
 * legal specifics (bill number, case name, enactment year, current status).
 * Returns a merged suggestedPoi with improved title/description/source_url.
 * On any failure, returns the original suggestedPoi unchanged.
 */
async function researchDraftPoi(articleUrl, suggestedPoi) {
  const articleText = await fetchArticleText(articleUrl);
  if (!articleText) {
    console.log(`  Research: could not fetch article text — using initial draft`);
    return suggestedPoi;
  }

  const prompt = `You are extracting specific legal metadata from a news article about a law, bill, or court ruling.

Article URL: ${articleUrl}
Article text:
${articleText}

The article appears to reference: "${suggestedPoi.title}" in ${suggestedPoi.state_abbr ?? 'an unknown state'}.

Extract the following fields. Return ONLY a raw JSON object — no commentary, no markdown fences.

{
  "bill_number": "<e.g. SB 280, HB 100, or null if not a bill>",
  "case_name": "<official case name if a court ruling, e.g. 'Kalarchik v. Montana', or null>",
  "enactment_year": <year as integer, or null if not found>,
  "current_status": "<one of: passed | blocked | enjoined | pending | repealed | enacted | null>",
  "improved_title": "<concise title using bill/case identifiers — e.g. 'MT SB 280' or 'Kalarchik v. Montana'. Format: STATE BILL_NUMBER or case name. Fall back to the original title only if no specifics are found in the article>",
  "improved_description": "<2-3 sentences covering what the law/ruling does, its current status, and any key identifiers such as bill number or case name>",
  "authoritative_url": "<direct URL to official bill text, court docket, ACLU page, or Lambda Legal page found in this article — prefer over news article URLs. Null if none found>"
}`;

  try {
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0]?.text ?? '{}';
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const candidates = [
      raw.trim(),
      stripped,
      (() => { const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); return s !== -1 && e > s ? raw.slice(s, e + 1) : ''; })(),
    ];

    let enriched = null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      try { enriched = JSON.parse(candidate); break; } catch {}
    }

    if (!enriched) {
      console.warn(`  Research: failed to parse Claude response — using initial draft`);
      return suggestedPoi;
    }

    const result = { ...suggestedPoi };
    if (enriched.improved_title)       result.title       = enriched.improved_title;
    if (enriched.improved_description) result.description = enriched.improved_description;
    if (enriched.authoritative_url)    result.source_url  = enriched.authoritative_url;

    console.log(`  Research: "${suggestedPoi.title}" → "${result.title}"`);
    return result;
  } catch (err) {
    console.warn(`  Research: Claude call failed — using initial draft:`, err.message);
    return suggestedPoi;
  }
}

// ---------------------------------------------------------------------------
// Watch item check
// ---------------------------------------------------------------------------

function buildWatchItemSearchUrl(item) {
  const q = encodeURIComponent(`"${item.title.slice(0, 80)}"`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

async function checkWatchItem(item, context, runId) {
  // Fetch targeted articles for this watch item
  let articles = [];
  try {
    const url = buildWatchItemSearchUrl(item);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TransSafeTravels-Digest/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const xml  = await res.text();
      const doc  = xmlParser.parse(xml);
      const channel = doc?.rss?.channel;
      if (channel) {
        const rawItems = channel.item ?? [];
        const items = Array.isArray(rawItems) ? rawItems : [rawItems];
        articles = items.slice(0, 10).map((a) => ({
          title:       a.title ?? '(no title)',
          url:         a.link  ?? '',
          description: stripHtml(a.description ?? a.summary ?? ''),
          published:   a.pubDate ?? null,
        })).filter((a) => a.url);
      }
    }
  } catch (err) {
    console.warn(`  Watch item "${item.title}" — fetch failed: ${err.message}`);
  }

  console.log(`  "${item.title}" — ${articles.length} article(s) found`);

  if (articles.length === 0) {
    // Nothing found — push check date forward 30 days, don't create findings
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    await supabase.from('watch_items').update({
      next_check_date: nextDate.toISOString().slice(0, 10),
    }).eq('id', item.id);
    return { item, articles: [], summary: 'No articles found.', next_check_days: 30, status: item.status };
  }

  // Ask Claude to analyze the articles in context of this specific watch item
  const articlesText = articles.map((a, i) =>
    `[${i}] TITLE: ${a.title}\nURL: ${a.url}\nSNIPPET: ${a.description}\nDATE: ${a.published ?? 'unknown'}`
  ).join('\n\n');

  const prompt = `You are monitoring a specific development for TransSafeTravels, a trans travel safety resource.

Watch item: "${item.title}"
Type: ${item.item_type}
Jurisdiction: ${item.jurisdiction_type}
${item.description ? `Description: ${item.description}` : ''}
${item.severity_impact ? `What we're watching for: ${item.severity_impact}` : ''}

Articles found (${articles.length}):
${articlesText}

Respond with a JSON object:
{
  "has_updates": true|false,
  "summary": "<2-3 sentence summary of what was found and what it means for trans travelers>",
  "status": "<monitoring|resolved|escalated>",
  "next_check_days": <integer — see guidelines below>,
  "findings": [
    {
      "article_index": <number>,
      "relevance": "high|medium|low",
      "summary": "<what this article means for the watch item>",
      "suggested_action": "<what the reviewer should do>"
    }
  ]
}

Guidelines for next_check_days:
- 1–7: Active safety emergency or rapidly developing legal situation requiring close monitoring
- 7–14: High-priority development moving quickly
- 14–30: Some activity, normal monitoring pace
- 30–90: Low activity or stable situation
- Default to 30 if nothing of significance was found
Use "resolved" if the matter has clearly concluded. Use "escalated" if this requires immediate attention.
Only include findings with relevance "high" or "medium" — omit low-relevance articles.`;

  let result = { has_updates: false, summary: 'No updates found.', status: item.status, next_check_days: 30, findings: [] };
  try {
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw = message.content[0]?.text ?? '{}';
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const candidates = [raw.trim(), stripped, (() => { const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); return s !== -1 && e > s ? raw.slice(s, e + 1) : ''; })()];
    for (const c of candidates) {
      if (!c) continue;
      try { result = JSON.parse(c); break; } catch {}
    }
  } catch (err) {
    console.warn(`  Watch item Claude call failed: ${err.message}`);
  }

  // Store findings
  const checkedAt = new Date().toISOString();
  for (const f of (result.findings ?? [])) {
    const article = articles[f.article_index];
    if (!article) continue;
    await supabase.from('digest_findings').insert({
      digest_run_id:    runId,
      watch_item_id:    item.id,
      article_url:      article.url,
      article_title:    article.title,
      article_date:     article.published ? new Date(article.published).toISOString() : null,
      summary:          f.summary ?? null,
      suggested_action: f.suggested_action ?? null,
      relevance:        f.relevance ?? null,
      confidence:       0.8,
      jurisdiction_type: item.jurisdiction_type,
      finding_type:     'watch_item',
    });
  }

  // Update watch item
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + Math.max(1, Math.min(90, result.next_check_days ?? 30)));
  await supabase.from('watch_items').update({
    status:          result.status ?? item.status,
    next_check_date: nextDate.toISOString().slice(0, 10),
  }).eq('id', item.id);

  const findingCount = (result.findings ?? []).length;
  console.log(`    → ${result.has_updates ? `${findingCount} finding(s)` : 'no updates'}, next check in ${result.next_check_days ?? 30} days (${result.status})`);

  return { item, articles, summary: result.summary, next_check_days: result.next_check_days ?? 30, status: result.status, findings: result.findings ?? [] };
}

// ---------------------------------------------------------------------------
// Draft POI creation
// ---------------------------------------------------------------------------

async function createDraftPoi(suggestedPoi, categoryMap) {
  const { title, description, severity, state_abbr, category_hint, source_url } = suggestedPoi;
  if (!title) return null;

  const centroid = state_abbr ? STATE_CENTROIDS[state_abbr.toUpperCase()] : null;
  const categoryId = category_hint
    ? (categoryMap.get(category_hint.toLowerCase()) ?? null)
    : null;

  const { data, error } = await supabase
    .from('points_of_interest')
    .insert({
      title,
      description:      description ?? null,
      severity:         Math.max(-10, Math.min(10, severity ?? 0)),
      state_abbr:       state_abbr ?? null,
      effect_scope:     state_abbr ? 'state' : 'point',
      category_id:      categoryId,
      source:           'digest-draft',
      source_date:      new Date().toISOString().slice(0, 10),
      legislation_url:  source_url ?? null,
      is_verified:      false,
      is_visible:       false,
      geom: centroid
        ? `SRID=4326;POINT(${centroid.lng} ${centroid.lat})`
        : null,
    })
    .select('id')
    .single();

  if (error) {
    console.warn(`  WARN: Failed to create draft POI "${title}":`, error.message);
    return null;
  }
  console.log(`  Created draft POI id=${data.id}: "${title}"`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Email formatting
// ---------------------------------------------------------------------------

function severityBadge(delta) {
  if (!delta) return '';
  const color = delta < 0 ? '#dc2626' : '#16a34a';
  const sign  = delta > 0 ? '+' : '';
  return `<span style="display:inline-block;padding:1px 6px;border-radius:9999px;background:${color};color:#fff;font-size:11px;font-weight:600;margin-left:6px">${sign}${delta}</span>`;
}

function confidencePct(c) {
  return `${Math.round((c ?? 0) * 100)}%`;
}

function relevanceColor(r) {
  return r === 'high' ? '#dc2626' : r === 'medium' ? '#d97706' : '#6b7280';
}

function buildWatchItemUpdatesHtml(updates) {
  if (!updates || updates.length === 0) return '';
  const rows = updates.map((u) => {
    const statusColor = u.status === 'escalated' ? '#dc2626' : u.status === 'resolved' ? '#6b7280' : '#2563eb';
    const findingsList = (u.findings ?? []).filter((f) => f.relevance !== 'low').map((f) => {
      const article = u.articles?.[f.article_index];
      return `<div style="margin-top:8px;padding:8px;background:#f9fafb;border-radius:4px;font-size:12px">
        ${article?.url ? `<a href="${article.url}" style="color:#2563eb;font-weight:600;text-decoration:none">${article.title ?? 'Article'}</a><br>` : ''}
        <span style="color:#374151">${f.summary ?? ''}</span>
        ${f.suggested_action ? `<br><span style="color:#6b7280"><strong>Action:</strong> ${f.suggested_action}</span>` : ''}
      </div>`;
    }).join('');
    return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:12px;background:#fff">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${statusColor};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase">${u.status}</span>
        <span style="font-weight:600;font-size:14px;color:#111827">${u.item.title}</span>
      </div>
      <p style="margin:0 0 4px;font-size:13px;color:#374151">${u.summary ?? ''}</p>
      <p style="margin:0 0 6px;font-size:12px;color:#6b7280">Next check in ${u.next_check_days ?? 30} days</p>
      ${findingsList}
    </div>`;
  }).join('');

  return `<h2 style="font-size:16px;font-weight:700;color:#7c3aed;margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid #7c3aed">🔭 Watch Item Updates (${updates.length})</h2>${rows}`;
}

function buildEmailHtml(analysis, articles, runDate, watchItemUpdates = []) {
  const { digest_summary, findings = [] } = analysis;

  const CONFIDENCE_THRESHOLD = 0.9;
  const aboveThreshold = findings.filter((f) => (f.confidence ?? 0) >= CONFIDENCE_THRESHOLD);
  const belowThreshold = findings.filter((f) => (f.confidence ?? 0) <  CONFIDENCE_THRESHOLD);

  const international = aboveThreshold.filter((f) => f.jurisdiction_type === 'international');
  const domestic      = aboveThreshold.filter((f) => f.jurisdiction_type !== 'international');
  const high    = domestic.filter((f) => f.relevance === 'high');
  const medium  = domestic.filter((f) => f.relevance === 'medium');
  const low     = domestic.filter((f) => f.relevance === 'low');
  const federal = domestic.filter((f) => f.jurisdiction_type === 'federal');

  function renderFinding(f, muted = false) {
    const article = f._article ?? {};
    const bg      = muted ? '#f9fafb' : '#fff';
    const links   = [
      f.legislation_url ? `<a href="${f.legislation_url}" style="color:#7c3aed;font-weight:600;text-decoration:none">Primary source →</a>` : null,
      article.url       ? `<a href="${article.url}"       style="color:#6b7280;text-decoration:none">Article →</a>` : null,
    ].filter(Boolean).join('<span style="color:#d1d5db;margin:0 6px">|</span>');

    return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:12px;background:${bg}">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${relevanceColor(f.relevance)};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;white-space:nowrap">${f.relevance}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;color:#111827">${article.title ?? '(no title)'}</div>
            ${severityBadge(f.severity_delta)}
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${f.jurisdiction_name ?? ''} · ${article.source_name ?? ''} · confidence ${confidencePct(f.confidence)}</div>
          </div>
        </div>
        <p style="margin:0 0 6px;font-size:13px;color:#374151">${f.summary ?? ''}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#4b5563"><strong>Action:</strong> ${f.suggested_action ?? ''}</p>
        ${links ? `<div style="font-size:12px;margin-bottom:6px">${links}</div>` : ''}
        ${f.new_watch_item ? `<p style="margin:4px 0 0;font-size:12px;color:#7c3aed"><strong>Suggested watch item:</strong> ${f.new_watch_item.title}</p>` : ''}
        ${f.updates_watch_item_id ? `<p style="margin:4px 0 0;font-size:12px;color:#0369a1"><strong>Updates watch item #${f.updates_watch_item_id}</strong></p>` : ''}
      </div>`;
  }

  function renderSection(title, items, color, muted = false) {
    if (!items.length) return '';
    return `
      <h2 style="font-size:16px;font-weight:700;color:${color};margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid ${color}">${title} (${items.length})</h2>
      ${items.map((f) => renderFinding(f, muted)).join('')}`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>TransSafeTravels Digest — ${runDate}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f9fafb;color:#111827">
  <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)">

    <div style="border-bottom:2px solid #7c3aed;padding-bottom:16px;margin-bottom:20px">
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#7c3aed">TransSafeTravels</h1>
      <div style="font-size:13px;color:#6b7280">Daily News Digest · ${runDate}</div>
    </div>

    ${digest_summary ? `
    <div style="background:#f3f4f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:14px;color:#374151;line-height:1.5">
      ${digest_summary}
    </div>` : ''}

    <div style="font-size:13px;color:#6b7280;margin-bottom:20px">
      ${articles.length} articles scanned · ${aboveThreshold.length} above threshold
      (${high.length} high · ${medium.length} medium · ${low.length} low)
      · ${federal.length} federal · ${international.length} international
      ${belowThreshold.length ? `· <span style="color:#9ca3af">${belowThreshold.length} below 0.9 confidence</span>` : ''}
    </div>

    ${renderSection('🔴 High Priority', high, '#dc2626')}
    ${renderSection('🟡 Medium Priority', medium, '#d97706')}
    ${renderSection('⚪ Low Priority / FYI', low, '#6b7280')}
    ${federal.length ? renderSection('🏛️ Federal', federal.filter(f => f.relevance !== 'high' && f.relevance !== 'medium'), '#4f46e5') : ''}
    ${renderSection('🌎 International & Border', international, '#0369a1')}
    ${belowThreshold.length ? renderSection('🔘 Below Confidence Threshold (&lt;0.9) — FYI only', belowThreshold, '#d1d5db', true) : ''}
    ${buildWatchItemUpdatesHtml(watchItemUpdates)}

    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
      Generated by TransSafeTravels news-digest.mjs · For review only — no changes have been applied automatically.
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const runDate = new Date().toISOString().slice(0, 10);
  console.log(`\nTransSafeTravels News Digest — ${runDate}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  // 1. Create digest_run record
  let runId = null;
  if (!DRY_RUN) {
    const { data: run, error } = await supabase
      .from('digest_runs')
      .insert({ run_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error) { console.error('Failed to create digest_run:', error.message); process.exit(1); }
    runId = run.id;
    console.log(`digest_run id=${runId}`);
  }

  // 2. Fetch active sources
  const { data: sources, error: srcErr } = await supabase
    .from('news_sources')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (srcErr) { console.error('Failed to load news_sources:', srcErr.message); process.exit(1); }
  console.log(`Fetching ${sources.length} sources…`);

  // 3. Fetch + deduplicate articles
  const seenUrls    = await pruneAndGetSeenUrls();
  const allArticles = [];
  const sourceStats = {};

  for (const source of sources) {
    try {
      const articles  = await fetchFeed(source);
      const cutoff    = Date.now() - MAX_ARTICLE_DAYS * 24 * 60 * 60 * 1000;
      const recent    = articles.filter((a) => {
        if (!a.published) return true; // include if date unknown
        const ts = Date.parse(a.published);
        return isNaN(ts) || ts >= cutoff;
      });
      const fresh     = recent.filter((a) => !seenUrls.has(a.url));
      allArticles.push(...fresh);
      const tooOld    = articles.length - recent.length;
      sourceStats[source.id] = { fetched: articles.length, fresh: fresh.length };
      console.log(`  ${source.name}: ${articles.length} total, ${fresh.length} new${tooOld ? `, ${tooOld} too old` : ''}`);

      if (!DRY_RUN) {
        await supabase.from('news_sources').update({
          last_fetched_at: new Date().toISOString(),
          fetch_count:     (source.fetch_count ?? 0) + 1,
          article_count:   (source.article_count ?? 0) + articles.length,
          updated_at:      new Date().toISOString(),
        }).eq('id', source.id);
      }
    } catch (err) {
      console.warn(`  WARN: ${source.name} — ${err.message}`);
    }
  }

  console.log(`\n${allArticles.length} new articles total`);

  // Articles are marked seen after analysis completes (see step 11).
  // Doing it here would swallow articles if the script is killed mid-run.

  if (allArticles.length === 0) {
    console.log('Nothing new — skipping analysis and email.');
    if (!DRY_RUN && runId) {
      await supabase.from('digest_runs').update({
        articles_fetched: 0,
        findings_count:   0,
        attributes:       { note: 'no new articles' },
      }).eq('id', runId);
    }
    return;
  }

  // 4. Load DB context
  console.log('\nLoading DB context…');
  const context = await getDBContext();
  console.log(`  ${context.pois.length} POIs, ${context.watchItems.length} active watch items`);

  // 5. Analyze with Claude (batch to keep prompts manageable)
  const BATCH_SIZE = 15;
  const allFindings = [];
  let digestSummary = '';

  for (let i = 0; i < allArticles.length; i += BATCH_SIZE) {
    const batch     = allArticles.slice(i, i + BATCH_SIZE);
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allArticles.length / BATCH_SIZE);
    console.log(`\nAnalyzing batch ${batchNum}/${totalBatches} (${batch.length} articles)…`);

    const analysis = await analyzeWithClaude(batch, context, i);

    // Re-map article_index to global index
    for (const f of (analysis.findings ?? [])) {
      allFindings.push({ ...f, _article: batch[f.article_index], _batch_offset: i });
    }
    if (!digestSummary && analysis.digest_summary) {
      digestSummary = analysis.digest_summary;  // take first successful batch summary
    }
  }

  console.log(`\n${allFindings.length} findings flagged`);

  // 6. Store findings in DB (create draft POIs first so we can link them)
  if (!DRY_RUN && runId && allFindings.length > 0) {
    // Create draft POIs for findings that suggest one
    const suggestedPoiFindings = allFindings.filter((f) => f.suggested_poi);
    if (suggestedPoiFindings.length > 0) {
      console.log(`\nCreating ${suggestedPoiFindings.length} draft POI(s)…`);
      for (const f of suggestedPoiFindings) {
        const articleUrl = f._article?.url;
        const enriched = articleUrl
          ? await researchDraftPoi(articleUrl, f.suggested_poi)
          : f.suggested_poi;
        f._draft_poi_id = await createDraftPoi(enriched, context.categoryMap);
      }
    }

    const rows = allFindings.map((f) => ({
      digest_run_id:    runId,
      watch_item_id:    f.updates_watch_item_id ?? null,
      source_id:        f._article?.source_id ?? null,
      article_url:      f._article?.url ?? '',
      article_title:    f._article?.title ?? null,
      article_date:     f._article?.published ? new Date(f._article.published).toISOString() : null,
      summary:          f.summary ?? null,
      suggested_action: f.suggested_action ?? null,
      confidence:       f.confidence ?? null,
      relevance:        f.relevance ?? null,
      legislation_url:  f.legislation_url ?? null,
      jurisdiction_type: f.jurisdiction_type ?? null,
      state_id:         f.state_abbr ? (context.stateMap.get(f.state_abbr) ?? null) : null,
      severity_delta:   f.severity_delta ?? null,
      linked_poi_id:    f._draft_poi_id ?? null,
      finding_type:     f._draft_poi_id ? 'suggested_poi' : 'news',
    }));

    const { data: insertedFindings, error: findingsErr } = await supabase
      .from('digest_findings')
      .upsert(rows, { onConflict: 'digest_run_id,article_url', ignoreDuplicates: true })
      .select('id, article_url');
    if (findingsErr) console.warn('Failed to store findings:', findingsErr.message);

    // Map article_url → finding id so incidents can link back
    const findingIdByUrl = new Map((insertedFindings ?? []).map((r) => [r.article_url, r.id]));
    for (const f of allFindings) {
      f._finding_id = findingIdByUrl.get(f._article?.url ?? '') ?? null;
    }
  }

  // 7. Store incidents extracted by Claude
  if (!DRY_RUN && allFindings.length > 0) {
    const incidentFindings = allFindings.filter((f) => f.incident && f._finding_id);
    const incidentFindingsAll = allFindings.filter((f) => f.incident);
    if (incidentFindingsAll.length > 0) {
      console.log(`\nStoring ${incidentFindingsAll.length} incident(s)…`);
      for (const f of incidentFindingsAll) {
        const inc = f.incident;
        const stateAbbr = inc.state_abbr?.trim() ?? null;
        const { error } = await supabase.from('incidents').insert({
          title:             inc.title,
          description:       inc.description ?? null,
          incident_date:     /^\d{4}-\d{2}-\d{2}$/.test(inc.incident_date ?? '') ? inc.incident_date : null,
          incident_type:     inc.incident_type ?? null,
          jurisdiction_type: inc.jurisdiction_type ?? null,
          city:              inc.city ?? null,
          county_name:       inc.county_name ?? null,
          state_abbr:        stateAbbr,
          state_id:          stateAbbr ? (context.stateMap.get(stateAbbr) ?? null) : null,
          source_url:        f._article?.url ?? null,
          source_name:       f._article?.source_name ?? null,
          digest_run_id:     runId,
          digest_finding_id: f._finding_id ?? null,
          confidence:        inc.confidence ?? null,
        });
        if (error) console.warn(`  Incident insert failed: ${inc.title} — ${error.message}`);
        else console.log(`  Stored incident: "${inc.title}"`);
      }
    }
  }

  // 8. Create new watch items suggested by Claude
  if (!DRY_RUN && allFindings.length > 0) {
    for (const f of allFindings) {
      if (!f.new_watch_item) continue;
      const { error } = await supabase.from('watch_items').insert({
        item_type:         f.new_watch_item.item_type,
        title:             f.new_watch_item.title,
        description:       f.new_watch_item.description,
        jurisdiction_type: f.jurisdiction_type ?? 'federal',
        state_id:          f.state_abbr ? (context.stateMap.get(f.state_abbr) ?? null) : null,
        status:            'monitoring',
        next_check_date:   f.new_watch_item.next_check_date ?? null,
        source_url:        f._article?.url ?? null,
        source_name:       f._article?.source_name ?? null,
        severity_impact:   f.suggested_action ?? null,
        attributes:        { auto_created: true, confidence: f.confidence },
      });
      if (error) console.warn('Failed to create watch item:', error.message);
      else console.log(`  Created watch item: "${f.new_watch_item.title}"`);
    }
  }

  // 9. Check overdue watch items
  const watchItemUpdates = [];
  if (!DRY_RUN) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: overdueItems } = await supabase
      .from('watch_items')
      .select('*')
      .eq('status', 'monitoring')
      .lte('next_check_date', today);

    if (overdueItems && overdueItems.length > 0) {
      console.log(`\nChecking ${overdueItems.length} overdue watch item(s)…`);
      for (const item of overdueItems) {
        const update = await checkWatchItem(item, context, runId);
        if (update) watchItemUpdates.push(update);
      }
    }
  }

  // 10. Update digest_run totals
  if (!DRY_RUN && runId) {
    await supabase.from('digest_runs').update({
      articles_fetched: allArticles.length,
      findings_count:   allFindings.length,
      attributes:       { digest_summary: digestSummary, source_stats: sourceStats },
    }).eq('id', runId);
  }

  // 11. Mark articles as seen now that analysis is complete
  if (!DRY_RUN) await markArticlesSeen(allArticles);

  // 12. Build and send email
  const combinedAnalysis = {
    digest_summary: digestSummary,
    findings:       allFindings.map((f, i) => ({ ...f, article_index: i })),
  };
  const emailHtml = buildEmailHtml(combinedAnalysis, allFindings.map((f) => f._article), runDate, watchItemUpdates);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Email HTML written to /tmp/digest-preview.html');
    fs.writeFileSync('/tmp/digest-preview.html', emailHtml);
  } else if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from:    FROM_EMAIL,
        to:      TO_EMAIL,
        subject: `TransSafeTravels Digest — ${runDate} (${allFindings.length} findings${watchItemUpdates.length ? `, ${watchItemUpdates.length} watch updates` : ''})`,
        html:    emailHtml,
      });
      if (error) throw new Error(error.message);
      console.log(`\nEmail sent (id=${data.id}) to ${TO_EMAIL}`);
      await supabase.from('digest_runs').update({
        email_sent_at: new Date().toISOString(),
      }).eq('id', runId);
    } catch (err) {
      console.error('Failed to send email:', err.message);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
