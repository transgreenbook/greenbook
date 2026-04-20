#!/usr/bin/env node
/**
 * import-catpalm-drivers-license.mjs
 *
 * Imports driver's license gender marker change policy ratings from
 * Transitics' CATPALM 2.0 dataset. Creates one state-scoped
 * policy-rating POI per jurisdiction (56 total).
 * Upserts on source_id so re-runs are safe.
 *
 * Severity scale:
 *   Most Progressive   → +3
 *   Highly Progressive → +2
 *   Progressive        → +1
 *   Neutral            →  0
 *   Restrictive        → -2
 *   Most Restrictive   → -4   (includes states where change is banned or
 *                               requires documents that are not issued)
 *
 * Run:
 *   node scripts/import-catpalm-drivers-license.mjs --dry-run
 *   node scripts/import-catpalm-drivers-license.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

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

const DRY_RUN       = process.argv.includes('--dry-run');
const SOURCE        = 'catpalm';
const CATEGORY_SLUG = 'policy-rating-drivers-license';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Severity map
// ---------------------------------------------------------------------------

const SEVERITY = {
  'Most Progressive':    3,
  'Highly Progressive':  2,
  'Progressive':         1,
  'Neutral':             0,
  'Restrictive':        -2,
  'Most Restrictive':   -4,
};

// ---------------------------------------------------------------------------
// Fallback centroids for territories absent from TIGER state file
// ---------------------------------------------------------------------------

const TERRITORY_FALLBACK = {
  GU: { lat:  13.4443, lng: 144.7937 },
  VI: { lat:  18.3358, lng: -64.8963 },
  MP: { lat:  15.0979, lng: 145.6739 },
  AS: { lat: -14.2710, lng: -170.1322 },
};

// ---------------------------------------------------------------------------
// Dataset (all 56 US jurisdictions) — source data as of 2026-04-19
// ---------------------------------------------------------------------------

const CATPALM_DATA_AS_OF = '2026-04-19';
const SOURCE_URL = 'https://transitics.substack.com/p/transitics-comprehensive-anti-trans-586';

const DATA = [
  { state: 'Alabama',                  abbr: 'AL', rating: 'Restrictive',        risk: 'Low',           status: "Allowed; Requires Amended Birth Certificate or Proof of Surgery",                                                     laws: 'Policy Order 63',                                                                                                                                           litigation: 'Policy Upheld By 11th Appeals Court',                                           since: '1992-07-01', change: null },
  { state: 'Alaska',                   abbr: 'AK', rating: 'Progressive',         risk: 'Low',           status: 'Allowed; Requires Some Medical Treatment',                                                                              laws: "Alaska DMV Certification For Change of Sex Designation on Driver's License or Identification Card",                                                         litigation: 'Surgery Requirement Removed By Alaskan Third Judicial District Court',          since: '2012-04-13', change: null },
  { state: 'Arizona',                  abbr: 'AZ', rating: 'Progressive',         risk: 'Moderate',      status: 'Allowed; Requires Some Medical Treatment',                                                                              laws: 'Policy 3.1.1',                                                                                                                                              litigation: 'Not Challenged',                                                                since: '2020-10-01', change: null },
  { state: 'Arkansas',                 abbr: 'AR', rating: 'Restrictive',         risk: 'Low',           status: 'Allowed; Requires Amended Birth Certificate',                                                                           laws: 'Arkansas Office of Driver Services Gender Application',                                                                                                     litigation: 'Policy Upheld By Arkansas Supreme Court',                                       since: '2024-03-12', change: 'Highly Progressive → Restrictive' },
  { state: 'California',               abbr: 'CA', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'California DMV Gender Identity Policy',                                                                                                                     litigation: 'Not Challenged',                                                                since: '2019-01-01', change: null },
  { state: 'Colorado',                 abbr: 'CO', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements For Adults, Requires Certification of Gender Identity For Minors',                             laws: 'Colorado DMV Change of Sex Designation Form',                                                                                                               litigation: 'Not Challenged',                                                                since: '2020-01-01', change: null },
  { state: 'Connecticut',              abbr: 'CT', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Connecticut DMV Gender Designation Form',                                                                                                                   litigation: 'Not Challenged',                                                                since: '2020-01-01', change: null },
  { state: 'Delaware',                 abbr: 'DE', rating: 'Highly Progressive',  risk: 'Low',           status: 'Allowed; Requires Certification of Gender Identity',                                                                    laws: 'Delaware DMV Request for Gender Change Form',                                                                                                               litigation: 'Not Challenged',                                                                since: '2011-11-10', change: null },
  { state: 'Florida',                  abbr: 'FL', rating: 'Most Restrictive',    risk: 'Cannot Worsen', status: 'Banned',                                                                                                                 laws: 'Florida HSMV Memo (1.24.2024)',                                                                                                                             litigation: 'Not Challenged',                                                                since: '2024-01-24', change: 'Most Progressive → Most Restrictive' },
  { state: 'Georgia',                  abbr: 'GA', rating: 'Neutral',             risk: 'Low',           status: 'Allowed; Requires Court Order or Proof of Surgery',                                                                     laws: 'Georgia DDS Gender Change Policy',                                                                                                                          litigation: 'Not Challenged',                                                                since: null,         change: null },
  { state: 'Hawaii',                   abbr: 'HI', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'HB 1165',                                                                                                                                                   litigation: 'Not Challenged',                                                                since: '2020-07-01', change: null },
  { state: 'Idaho',                    abbr: 'ID', rating: 'Most Restrictive',    risk: 'Low',           status: 'Allowed; Requires Amended Birth Certificate (Not Issued)',                                                               laws: 'Policy Confirmed By DOT Representative',                                                                                                                    litigation: 'Not Challenged',                                                                since: '2026-01-09', change: 'Highly Progressive → Most Restrictive' },
  { state: 'Illinois',                 abbr: 'IL', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: "Illinois Driver's License Gender Change Policy",                                                                                                            litigation: 'Not Challenged',                                                                since: '2019-07-01', change: null },
  { state: 'Indiana',                  abbr: 'IN', rating: 'Most Restrictive',    risk: 'High',          status: 'Allowed; Requires Amended Birth Certificate (Not Issued)',                                                               laws: 'Indiana Bureau of Motor Vehicles Gender Change Policy, Policy Confirmed By BMV Representative',                                                             litigation: 'Not Challenged',                                                                since: '2026-02-12', change: 'Progressive → Most Restrictive' },
  { state: 'Iowa',                     abbr: 'IA', rating: 'Most Restrictive',    risk: 'Low',           status: 'Allowed; Requires Amended Birth Certificate (Not Issued) or Passport (Not Issued)',                                      laws: 'IAC 601.4(7), Policy Confirmed By DOT Representative',                                                                                                      litigation: 'Not Challenged',                                                                since: '2025-11-19', change: 'Restrictive → Most Restrictive' },
  { state: 'Kansas',                   abbr: 'KS', rating: 'Most Restrictive',    risk: 'Cannot Worsen', status: 'Banned',                                                                                                                 laws: 'SB 244',                                                                                                                                                    litigation: 'Changes Mandated By Kansas Supreme Court (pre-SB 244)',                         since: '2026-02-26', change: 'Progressive → Most Restrictive' },
  { state: 'Kentucky',                 abbr: 'KY', rating: 'Neutral',             risk: 'Low',           status: 'Allowed; Requires Court Order, Amended Birth Certificate, or Proof of Surgery',                                         laws: 'Kentucky Valid Proof Documents Policy',                                                                                                                     litigation: 'Not Challenged',                                                                since: null,         change: null },
  { state: 'Louisiana',                abbr: 'LA', rating: 'Restrictive',         risk: 'Low',           status: 'Allowed; Requires Proof of Surgery',                                                                                    laws: 'Louisiana Office of Motor Vehicles Policy 22.01 Gender Change / Reassignment',                                                                              litigation: 'Not Challenged',                                                                since: '2009-03-12', change: null },
  { state: 'Maine',                    abbr: 'ME', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: "Guidance about Gender Designations on Maine Driver's Licenses (3.5.2025)",                                                                                  litigation: 'Not Challenged',                                                                since: '2018-06-01', change: null },
  { state: 'Maryland',                 abbr: 'MD', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'HB 421',                                                                                                                                                    litigation: 'Not Challenged',                                                                since: '2019-10-01', change: null },
  { state: 'Massachusetts',            abbr: 'MA', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Massachusetts Registry of Motor Vehicles Information Change Policy',                                                                                         litigation: 'Not Challenged',                                                                since: '2019-11-19', change: null },
  { state: 'Michigan',                 abbr: 'MI', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Michigan Department of State Sex Designation Policy',                                                                                                        litigation: 'Not Challenged',                                                                since: '2021-11-10', change: null },
  { state: 'Minnesota',                abbr: 'MN', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'MN Rules, part 7410.0400, subp. 1',                                                                                                                         litigation: 'Not Challenged',                                                                since: '2015-10-02', change: null },
  { state: 'Mississippi',              abbr: 'MS', rating: 'Most Restrictive',    risk: 'Cannot Worsen', status: 'Banned (Pending)',                                                                                                        laws: 'SB 2322',                                                                                                                                                   litigation: 'Not Challenged',                                                                since: '2026-07-01', change: 'Restrictive → Neutral → Most Restrictive' },
  { state: 'Missouri',                 abbr: 'MO', rating: 'Neutral',             risk: 'Moderate',      status: 'Allowed; Requires Court Order or Proof of Surgery',                                                                     laws: 'Unofficial Policy Change, Left Unclear By Missouri Department of Revenue in Document Requirements Page',                                                     litigation: 'Not Challenged',                                                                since: '2024-08-20', change: 'Progressive → Neutral' },
  { state: 'Montana',                  abbr: 'MT', rating: 'Highly Progressive',  risk: 'Low',           status: 'Allowed; Requires Amended Birth Certificate or Certification of Gender Identity',                                       laws: 'Unofficial Policy Change, SB 280',                                                                                                                          litigation: 'Preliminary Injunction Granted By Montana First District Court',               since: '2024-12-17', change: 'Restrictive → Highly Progressive' },
  { state: 'Nebraska',                 abbr: 'NE', rating: 'Progressive',         risk: 'Low',           status: 'Allowed; Requires Some Medical Treatment',                                                                              laws: 'Nebraska Department of Motor Vehicles Certification of Sex Reassignment Policy',                                                                             litigation: 'Not Challenged',                                                                since: '2016-06-24', change: null },
  { state: 'Nevada',                   abbr: 'NV', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'NV Admin. Codes § 483.070',                                                                                                                                 litigation: 'Not Challenged',                                                                since: '2018-05-16', change: null },
  { state: 'New Hampshire',            abbr: 'NH', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'New Hampshire Division of Motor Vehicles Gender Change Policy',                                                                                              litigation: 'Not Challenged',                                                                since: '2018-07-24', change: null },
  { state: 'New Jersey',               abbr: 'NJ', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'New Jersey Transgender Information Hub Gender Marker Policy Information',                                                                                     litigation: 'Not Challenged',                                                                since: '2021-04-19', change: null },
  { state: 'New Mexico',               abbr: 'NM', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'New Mexico Motor Vehicle Division Request For Sex Designation Change',                                                                                        litigation: 'Not Challenged',                                                                since: '2019-12-01', change: null },
  { state: 'New York',                 abbr: 'NY', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'S 4402--B',                                                                                                                                                 litigation: 'Not Challenged',                                                                since: '2021-12-21', change: null },
  { state: 'North Carolina',           abbr: 'NC', rating: 'Highly Progressive',  risk: 'Low',           status: 'Allowed; Requires Certification of Gender Identity, Updated Passport, Amended Birth Certificate, or Court Order',       laws: 'North Carolina Division of Motor Vehicles Sex Designation Form',                                                                                            litigation: 'Not Challenged',                                                                since: '2019-01-28', change: null },
  { state: 'North Dakota',             abbr: 'ND', rating: 'Highly Progressive',  risk: 'Moderate',      status: 'Allowed; Requires Certification of Social Transition',                                                                  laws: 'North Dakota Department of Transportation Gender Designation Form',                                                                                          litigation: 'Not Challenged',                                                                since: '2016-11-07', change: null },
  { state: 'Ohio',                     abbr: 'OH', rating: 'Highly Progressive',  risk: 'Moderate',      status: 'Allowed; Requires Certification of Gender Identity',                                                                    laws: 'Ohio Bureau of Motor Vehicles Declaration of Gender Change',                                                                                                litigation: 'Not Challenged',                                                                since: '2019-10-01', change: null },
  { state: 'Oklahoma',                 abbr: 'OK', rating: 'Most Restrictive',    risk: 'Cannot Worsen', status: 'Banned',                                                                                                                 laws: 'HJR no. 1032, Policy Confirmed By Service Oklahoma Representative',                                                                                          litigation: 'Not Challenged',                                                                since: '2026-03-03', change: 'Neutral → Most Restrictive' },
  { state: 'Oregon',                   abbr: 'OR', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Oregon Driver & Motor Vehicle Services Gender Marker Policy',                                                                                                litigation: 'Not Challenged',                                                                since: '2017-07-01', change: null },
  { state: 'Pennsylvania',             abbr: 'PA', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Pennsylvania Driver and Vehicle Services Gender Designation Policy',                                                                                         litigation: 'Not Challenged',                                                                since: '2020-01-01', change: null },
  { state: 'Rhode Island',             abbr: 'RI', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Rhode Island Division of Motor Vehicles Gender Designation Policy',                                                                                          litigation: 'Not Challenged',                                                                since: '2020-06-30', change: null },
  { state: 'South Carolina',           abbr: 'SC', rating: 'Neutral',             risk: 'Moderate',      status: 'Allowed; Requires Name Change & Court Order or Name Change & Amended Birth Certificate',                                laws: 'South Carolina Department of Motor Vehicles Name Change Policy',                                                                                            litigation: 'Not Challenged',                                                                since: '2006-06-06', change: null },
  { state: 'South Dakota',             abbr: 'SD', rating: 'Neutral',             risk: 'Moderate',      status: 'Allowed; Requires Court Order & Certification of Gender Identity',                                                      laws: 'Policy Confirmed By DPS Representative',                                                                                                                    litigation: 'Not Challenged',                                                                since: '2026-03-06', change: 'Unknown → Neutral' },
  { state: 'Tennessee',                abbr: 'TN', rating: 'Most Restrictive',    risk: 'Cannot Worsen', status: 'Banned',                                                                                                                 laws: 'SB 1440, TN Code § 55-50-321',                                                                                                                              litigation: 'Challenge Filed',                                                               since: '2023-07-01', change: null },
  { state: 'Texas',                    abbr: 'TX', rating: 'Most Restrictive',    risk: 'Cannot Worsen', status: 'Banned',                                                                                                                 laws: 'KP-0489',                                                                                                                                                   litigation: 'Not Challenged',                                                                since: '2024-08-20', change: 'Neutral → Most Restrictive' },
  { state: 'Utah',                     abbr: 'UT', rating: 'Neutral',             risk: 'Low',           status: 'Allowed; Requires Court Order',                                                                                         laws: 'Utah Courts Petition for Name or Sex Change Page',                                                                                                          litigation: 'Not Challenged',                                                                since: '2021-05-06', change: null },
  { state: 'Vermont',                  abbr: 'VT', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Vermont Department of Motor Vehicles Gender Change Policy',                                                                                                  litigation: 'Not Challenged',                                                                since: '2019-06-10', change: null },
  { state: 'Virginia',                 abbr: 'VA', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Virginia Department of Motor Vehicles Sex Designation Change Policy',                                                                                        litigation: 'Not Challenged',                                                                since: '2020-07-01', change: null },
  { state: 'Washington',               abbr: 'WA', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Washington State Department of Licensing Gender Designation Change Policy',                                                                                  litigation: 'Not Challenged',                                                                since: '2019-11-13', change: null },
  { state: 'West Virginia',            abbr: 'WV', rating: 'Highly Progressive',  risk: 'Moderate',      status: 'Allowed; Requires Certification of Gender Identity',                                                                    laws: 'West Virginia Division of Motor Vehicles Gender Designation Form',                                                                                           litigation: 'Not Challenged',                                                                since: '2021-07-23', change: null },
  { state: 'Wisconsin',                abbr: 'WI', rating: 'Progressive',         risk: 'Moderate',      status: 'Allowed; Requires Court Order or Some Medical Treatment',                                                               laws: "Wisconsin Driver's License Application Instructions, WI Admin. Code § Trans 102.14.8(b)(4)",                                                                litigation: 'Not Challenged',                                                                since: null,         change: null },
  { state: 'Wyoming',                  abbr: 'WY', rating: 'Most Restrictive',    risk: 'Low',           status: 'Allowed; Requires Amended Birth Certificate (Not Issued)',                                                               laws: 'Policy Confirmed By DOT Representative',                                                                                                                    litigation: 'Not Challenged',                                                                since: '2026-04-02', change: 'Highly Progressive → Most Restrictive' },
  { state: 'District of Columbia',     abbr: 'DC', rating: 'Most Progressive',    risk: 'Low',           status: 'Allowed; No Requirements',                                                                                              laws: 'Washington DC Department of Motor Vehicles Gender Designation Change Policy',                                                                                litigation: 'Not Challenged',                                                                since: '2017-06-19', change: null },
  { state: 'Puerto Rico',              abbr: 'PR', rating: 'Highly Progressive',  risk: 'Low',           status: 'Allowed; Requires Certification of Gender Identity, Updated Passport, or Amended Birth Certificate',                    laws: 'Solicitud Para el Cambio de Género de Personas Transgénero',                                                                                                litigation: 'Not Challenged',                                                                since: '2018-05-31', change: null },
  { state: 'U.S. Virgin Islands',      abbr: 'VI', rating: 'Progressive',         risk: 'Low',           status: 'Allowed; Requires Some Medical Treatment or Court Order',                                                               laws: 'Executive Order No. 543-2025',                                                                                                                              litigation: 'Not Challenged',                                                                since: '2025-10-08', change: 'Unknown → Progressive' },
  { state: 'Guam',                     abbr: 'GU', rating: 'Restrictive',         risk: 'Low',           status: 'Allowed; Requires Amended Birth Certificate or Proof of Surgery',                                                       laws: "Guam Department of Revenue and Taxation Driver's License and Identification Card Application",                                                               litigation: 'Not Challenged',                                                                since: '1995-01-01', change: null },
  { state: 'Northern Mariana Islands', abbr: 'MP', rating: 'Restrictive',         risk: 'Low',           status: 'Allowed; Requires Amended Birth Certificate or Proof of Surgery',                                                       laws: "Commonwealth of the Northern Mariana Islands Bureau of Motor Vehicles Driver's License Application, 9 CMNI Code § 2208",                                    litigation: 'Not Challenged',                                                                since: '2007-03-14', change: null },
  { state: 'American Samoa',           abbr: 'AS', rating: 'Restrictive',         risk: 'Low',           status: 'Allowed; Requires Amended Birth Certificate or Passport',                                                               laws: 'AS Code Ann § 13.0517, American Samoa Real ID Policy',                                                                                                      litigation: 'Not Challenged',                                                                since: null,         change: null },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made.\n');

  const centroidsPath = path.resolve(ROOT, 'public', 'state-centroids.geojson');
  const centroids     = JSON.parse(fs.readFileSync(centroidsPath, 'utf8'));
  const centroidMap   = new Map();
  for (const f of centroids.features) {
    centroidMap.set(f.properties.STUSPS, {
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    });
  }
  console.log(`Loaded ${centroidMap.size} state centroids.`);

  // Ensure category exists
  let categoryId;
  const { data: existingCat } = await supabase
    .from('categories')
    .select('id')
    .eq('icon_slug', CATEGORY_SLUG)
    .single();

  if (existingCat) {
    categoryId = existingCat.id;
    console.log(`Category "${CATEGORY_SLUG}" found (id=${categoryId}).`);
  } else if (!DRY_RUN) {
    const { data: newCat, error } = await supabase
      .from('categories')
      .insert({
        name:            "Policy Rating — Driver's License",
        icon_slug:       CATEGORY_SLUG,
        color:           '#3b82f6',
        map_visible:     false,
        severity_weight: 65,
      })
      .select('id')
      .single();
    if (error) { console.error('Failed to create category:', error.message); process.exit(1); }
    categoryId = newCat.id;
    console.log(`Category "${CATEGORY_SLUG}" created (id=${categoryId}).`);
  } else {
    console.log(`[dry-run] Would create category "${CATEGORY_SLUG}" (severity_weight=65).`);
    categoryId = 0;
  }

  const { data: existing } = await supabase
    .from('points_of_interest')
    .select('id, source_id')
    .eq('source', SOURCE)
    .like('source_id', 'catpalm-dl-%');
  const existingMap = new Map((existing ?? []).map((r) => [r.source_id, r.id]));
  console.log(`${existingMap.size} existing driver's license POIs in DB.\n`);

  const counters = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  for (const entry of DATA) {
    const severity = SEVERITY[entry.rating];
    if (severity === undefined) {
      console.warn(`  SKIP ${entry.abbr}: unknown rating "${entry.rating}"`);
      counters.skipped++;
      continue;
    }

    const coords = centroidMap.get(entry.abbr) ?? TERRITORY_FALLBACK[entry.abbr];
    if (!coords) {
      console.warn(`  SKIP ${entry.abbr}: no centroid found`);
      counters.skipped++;
      continue;
    }

    const sourceId = `catpalm-dl-${entry.abbr.toLowerCase()}`;

    const lines = [entry.status];
    if (entry.laws)       lines.push(`\nLaw/Policy: ${entry.laws}`);
    if (entry.litigation && entry.litigation !== 'Not Challenged') {
      lines.push(`Litigation: ${entry.litigation}`);
    }
    const description = lines.join('\n');

    const record = {
      title:             `${entry.abbr} Driver's License Gender Marker Policy`,
      description,
      long_description:  null,
      geom:              `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
      tags:              ["driver's-license", 'id-document', 'gender-marker', 'policy'],
      severity,
      is_verified:       true,
      effect_scope:      'state',
      category_id:       categoryId,
      is_user_submitted: false,
      source:            SOURCE,
      source_id:         sourceId,
      website_url:       SOURCE_URL,
      attributes: {
        state_abbr:         entry.abbr,
        catpalm_rating:     entry.rating,
        catpalm_risk:       entry.risk,
        catpalm_status:     entry.status,
        catpalm_laws:       entry.laws || null,
        catpalm_litigation: entry.litigation || null,
        since_date:         entry.since ?? null,
        change_since_2024:  entry.change ?? null,
        catpalm_data_as_of: CATPALM_DATA_AS_OF,
        source_url:         SOURCE_URL,
      },
    };

    if (DRY_RUN) {
      const action = existingMap.has(sourceId) ? 'UPDATE' : 'INSERT';
      console.log(`  [dry] ${action} ${sourceId}  severity=${severity}  (${entry.rating})`);
      console.log(`        ${entry.state}: ${entry.status.slice(0, 70)}`);
      continue;
    }

    const existingId = existingMap.get(sourceId);
    if (existingId) {
      const { error } = await supabase.from('points_of_interest').update(record).eq('id', existingId);
      if (error) { console.warn(`  FAIL update ${sourceId}: ${error.message}`); counters.failed++; }
      else { console.log(`  updated ${sourceId}  severity=${severity}`); counters.updated++; }
    } else {
      const { error } = await supabase.from('points_of_interest').insert(record);
      if (error) { console.warn(`  FAIL insert ${sourceId}: ${error.message}`); counters.failed++; }
      else { console.log(`  inserted ${sourceId}  severity=${severity}`); counters.inserted++; }
    }
  }

  console.log(`\nDone. inserted=${counters.inserted}  updated=${counters.updated}  skipped=${counters.skipped}  failed=${counters.failed}`);
}

main().catch((err) => {
  console.error('Import failed:', err?.message ?? err);
  process.exit(1);
});
