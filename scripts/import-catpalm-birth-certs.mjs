#!/usr/bin/env node
/**
 * import-catpalm-birth-certs.mjs
 *
 * One-time import of birth certificate gender marker change policies from
 * Transitics' CATPALM 2.0 dataset. Creates one state-scoped POI per
 * jurisdiction, upserted on source_id so re-runs are safe.
 *
 * Severity scale:
 *   Most Progressive   → +3    Highly Progressive → +2    Progressive → +1
 *   Neutral            →  0
 *   Restrictive        → -2    Most Restrictive   → -3
 *
 * Run:
 *   node scripts/import-catpalm-birth-certs.mjs
 *   node scripts/import-catpalm-birth-certs.mjs --dry-run
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
const CATEGORY_SLUG = 'policy-rating-birth-cert';

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
  'Most Progressive':   3,
  'Highly Progressive': 2,
  'Progressive':        1,
  'Neutral':            0,
  'Restrictive':       -2,
  'Most Restrictive':  -3,
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
// Dataset (all 56 US jurisdictions)
// Source data as of: 2026-04-10
// ---------------------------------------------------------------------------

const CATPALM_DATA_AS_OF = '2026-04-10';
const SOURCE_URL = 'https://transitics.substack.com/p/transitics-comprehensive-anti-trans-586';

const DATA = [
  { state: 'Alabama',                  abbr: 'AL', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Name Change, Court Order, & Proof of Surgery',                                              laws: 'AL Code § 22-9A-19',                                                                                                                since: '1992-07-01', change: null },
  { state: 'Alaska',                   abbr: 'AK', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment or Court Order',                                                      laws: 'Guidance for Obtaining a Change in Sex Marker on an Alaska Birth Certificate',                                                      since: '2023-11-08', change: null },
  { state: 'Arizona',                  abbr: 'AZ', rating: 'Neutral',             risk: 'Moderate',       status: 'Allowed; Requires Court Order or Proof of Surgery',                                                            laws: 'Arizona Vital Records Amendment Policy',                                                                                            since: '2023-08-10', change: null },
  { state: 'Arkansas',                 abbr: 'AR', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Name Change, Court Order, & Proof of Surgery',                                              laws: 'Arkansas Public Health Birth Certificate Policy',                                                                                   since: '1981-07-01', change: null },
  { state: 'California',               abbr: 'CA', rating: 'Most Progressive',   risk: 'Low',            status: 'Allowed; No Requirements; Issues Court Orders for Residents Born Elsewhere',                                  laws: 'SB 179, California Court Form NC-300, CA Code of Civil Procedure § 1276(g)(1)',                                                     since: '2023-01-01', change: null },
  { state: 'Colorado',                 abbr: 'CO', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'Vital Statistics Rule 5, Code of Colorado Regulations 1006-1',                                                                     since: '2020-01-01', change: null },
  { state: 'Connecticut',              abbr: 'CT', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment; Issues Court Orders for Residents Born Elsewhere',                   laws: 'Connecticut Department of Public Health Gender Change Policy, CT Gen Stat § 19a-42b',                                               since: '2015-10-01', change: null },
  { state: 'Delaware',                 abbr: 'DE', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment',                                                                     laws: 'Delaware Vital Statistics Gender Reassignment Packet',                                                                              since: '2017-02-02', change: null },
  { state: 'Florida',                  abbr: 'FL', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'Unofficial Policy Change',                                                                                                          since: '2024-07-23', change: 'Progressive → Most Restrictive' },
  { state: 'Georgia',                  abbr: 'GA', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Name Change, Court Order, & Proof of Surgery',                                              laws: 'GA Code § 31-10-23',                                                                                                                since: '2004-07-01', change: null },
  { state: 'Hawaii',                   abbr: 'HI', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment',                                                                     laws: 'HI Rev Stat § 338-17.7',                                                                                                            since: '2015-07-13', change: null },
  { state: 'Idaho',                    abbr: 'ID', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'HB 509',                                                                                                                            since: '2026-01-09', change: 'Highly Progressive → Most Restrictive' },
  { state: 'Illinois',                 abbr: 'IL', rating: 'Most Progressive',   risk: 'Low',            status: 'Allowed; No Requirements; Issues Court Orders for Residents Born Elsewhere',                                  laws: 'HB 9, HB 5507',                                                                                                                    since: '2024-07-01', change: 'Highly Progressive → Most Progressive' },
  { state: 'Indiana',                  abbr: 'IN', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'EO 25-36',                                                                                                                          since: '2025-03-04', change: 'Neutral → Most Restrictive' },
  { state: 'Iowa',                     abbr: 'IA', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'SF 418',                                                                                                                            since: '2025-07-01', change: 'Restrictive → Most Restrictive' },
  { state: 'Kansas',                   abbr: 'KS', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'SB 180',                                                                                                                            since: '2023-05-04', change: null },
  { state: 'Kentucky',                 abbr: 'KY', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Name Change & Proof of Surgery',                                                             laws: 'KY Rev Stat § 213.121',                                                                                                             since: '1990-07-13', change: null },
  { state: 'Louisiana',                abbr: 'LA', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Court Order & Proof of Surgery',                                                             laws: 'LA Rev Stat § 40:62',                                                                                                               since: '1979-08-01', change: null },
  { state: 'Maine',                    abbr: 'ME', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'Maine Vital Records Gender Marker Policy',                                                                                          since: '2021-06-16', change: null },
  { state: 'Maryland',                 abbr: 'MD', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment',                                                                     laws: 'Maryland Division of Vital Records Sex Change Policy',                                                                              since: '2015-10-01', change: null },
  { state: 'Massachusetts',            abbr: 'MA', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'Massachusetts Registry of Vital Records and Statistics Sex Change Policy',                                                          since: '2025-07-01', change: 'Progressive → Highly Progressive' },
  { state: 'Michigan',                 abbr: 'MI', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'Michigan Vital Records and Statistics Change of Sex Designation Policy',                                                            since: '2021-06-30', change: null },
  { state: 'Minnesota',                abbr: 'MN', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment or Court Order',                                                      laws: 'Minnesota Vital Records and Certificates Policy on Amendments',                                                                    since: null,         change: null },
  { state: 'Mississippi',              abbr: 'MS', rating: 'Neutral',             risk: 'Moderate',       status: 'Allowed; Requires Court Order',                                                                                laws: 'MS Code of Rules 15-5-85-3.21.2',                                                                                                   since: '2025-11-10', change: 'Restrictive → Neutral' },
  { state: 'Missouri',                 abbr: 'MO', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Name Change, Court Order, & Proof of Surgery',                                              laws: 'MO Rev Stat § 193.215',                                                                                                             since: '1984-08-28', change: null },
  { state: 'Montana',                  abbr: 'MT', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'SB 280, Montana Office of Vital Statistics Gender Designation Form',                                                                since: '2024-12-17', change: 'Most Restrictive → Highly Progressive' },
  { state: 'Nebraska',                 abbr: 'NE', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Name Change & Proof of Surgery',                                                             laws: 'NE Rev Stat § 71-604.01',                                                                                                           since: '1994-04-19', change: null },
  { state: 'Nevada',                   abbr: 'NV', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; Requires Medical Records or a Statement of Corroboration',                                           laws: 'NV Admin. Codes § 440.030',                                                                                                         since: '2020-02-01', change: null },
  { state: 'New Hampshire',            abbr: 'NH', rating: 'Neutral',             risk: 'Low',            status: 'Allowed; Requires Court Order',                                                                                laws: 'NH RSA 5-C:87',                                                                                                                     since: '2006-01-01', change: null },
  { state: 'New Jersey',               abbr: 'NJ', rating: 'Most Progressive',   risk: 'Low',            status: 'Allowed; No Requirements; Issues Court Orders for Residents Born Elsewhere',                                  laws: 'S 478',                                                                                                                             since: '2019-03-01', change: null },
  { state: 'New Mexico',               abbr: 'NM', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'SB 20',                                                                                                                             since: '2019-03-28', change: null },
  { state: 'New York',                 abbr: 'NY', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'New York Vital Records Gender Designation Amendments Policy, New York City Gender Marker Corrections Policy',                      since: '2023-01-09', change: null },
  { state: 'North Carolina',           abbr: 'NC', rating: 'Highly Progressive', risk: 'Low',            status: "Allowed; Requires Certification of Gender Identity, Updated Passport, or Updated NC Driver's License",         laws: 'North Carolina Office of Vital Records Birth Certificate Modification Application',                                                 since: '2022-06-22', change: null },
  { state: 'North Dakota',             abbr: 'ND', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Proof of Surgery',                                                                           laws: 'ND Century Codes 23-02.1-25.1',                                                                                                     since: '2023-08-01', change: null },
  { state: 'Ohio',                     abbr: 'OH', rating: 'Neutral',             risk: 'Moderate',       status: 'Allowed; Requires Court Order',                                                                                laws: 'Ohio Vital Statistics Changing or Correcting a Birth Record Policy',                                                                since: '2020-12-16', change: null },
  { state: 'Oklahoma',                 abbr: 'OK', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'EO 2021-24, 63 O.S. § 1-321',                                                                                                      since: '2021-11-08', change: null },
  { state: 'Oregon',                   abbr: 'OR', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'HB 2673',                                                                                                                           since: '2017-10-06', change: null },
  { state: 'Pennsylvania',             abbr: 'PA', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment',                                                                     laws: 'Pennsylvania Vital Records Forms',                                                                                                  since: '2016-08-08', change: null },
  { state: 'Rhode Island',             abbr: 'RI', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'Rhode Island Office of Vital Records Requirements and Fees for Changes to Birth, Marriage, or Death Records',                     since: '2019-10-01', change: null },
  { state: 'South Carolina',           abbr: 'SC', rating: 'Neutral',             risk: 'Moderate',       status: 'Allowed; Requires Court Order',                                                                                laws: 'SC Code of Laws § 44-63-150',                                                                                                       since: '2006-06-06', change: null },
  { state: 'South Dakota',             abbr: 'SD', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'In the Matter of the Petition of Sigrid Kristiane Nielsen For An Amended Birth Certificate',                                       since: '2026-03-04', change: 'Neutral → Most Restrictive' },
  { state: 'Tennessee',                abbr: 'TN', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'TN Code § 68-3-203',                                                                                                                since: '1977-07-01', change: null },
  { state: 'Texas',                    abbr: 'TX', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'KP-0489',                                                                                                                           since: '2024-08-27', change: 'Neutral → Most Restrictive' },
  { state: 'Utah',                     abbr: 'UT', rating: 'Neutral',             risk: 'Low',            status: 'Allowed; Requires Court Order',                                                                                laws: 'UT Code § 26B-8-111',                                                                                                               since: '2021-05-06', change: null },
  { state: 'Vermont',                  abbr: 'VT', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: '8 V.S.A. § 5112, Vermont Affidavit of Gender Identity',                                                                            since: '2022-07-01', change: null },
  { state: 'Virginia',                 abbr: 'VA', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment',                                                                     laws: 'Virginia Vital Records Gender Transition Policy',                                                                                   since: '2020-06-29', change: null },
  { state: 'Washington',               abbr: 'WA', rating: 'Highly Progressive', risk: 'Low',            status: 'Allowed; No Requirements',                                                                                     laws: 'WAC 246-490-075, Washington Vital Records Sex Designation Change Policy',                                                           since: '2018-01-27', change: null },
  { state: 'West Virginia',            abbr: 'WV', rating: 'Highly Progressive', risk: 'Moderate',       status: 'Allowed; Requires Certification of Gender Identity',                                                           laws: 'West Virginia Health Statistics Center Certificate Amendment Policy',                                                               since: '2022-10-26', change: null },
  { state: 'Wisconsin',                abbr: 'WI', rating: 'Restrictive',        risk: 'Moderate',       status: 'Allowed; Requires Court Order & Proof of Surgery',                                                             laws: 'Wisconsin Vital Records Amendment Policy',                                                                                          since: '1986-04-29', change: null },
  { state: 'Wyoming',                  abbr: 'WY', rating: 'Most Restrictive',   risk: 'Cannot Worsen', status: 'Banned',                                                                                                        laws: 'WY Admin. R. Health, Vital Records Services Ch 10, Section 4 (e)',                                                                  since: '2026-03-13', change: 'Neutral → Most Restrictive' },
  { state: 'District of Columbia',     abbr: 'DC', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment',                                                                     laws: 'DC Health Gender Designation Application',                                                                                          since: '2014-10-16', change: null },
  { state: 'Puerto Rico',              abbr: 'PR', rating: 'Highly Progressive', risk: 'Low',            status: "Allowed; Requires Certification of Gender Identity, Updated Passport, or Updated Driver's License",             laws: 'Puerto Rico Departamento de Salud Instructions For Gender Change On Birth Certificate',                                             since: '2018-04-20', change: null },
  { state: 'U.S. Virgin Islands',      abbr: 'VI', rating: 'Progressive',         risk: 'Low',            status: 'Allowed; Requires Some Medical Treatment or Court Order',                                                      laws: 'Executive Order No. 543-2025',                                                                                                      since: '2025-10-08', change: null },
  { state: 'Guam',                     abbr: 'GU', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Proof of Surgery',                                                                           laws: '10 Guam Code Ann § 3222',                                                                                                           since: '1995-01-01', change: null },
  { state: 'Northern Mariana Islands', abbr: 'MP', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Court Order & Proof of Surgery',                                                             laws: '1 CMNI Code § 26018',                                                                                                               since: '2007-03-14', change: null },
  { state: 'American Samoa',           abbr: 'AS', rating: 'Restrictive',        risk: 'Low',            status: 'Allowed; Requires Proof of Surgery',                                                                           laws: 'AS Code Ann § 13.0530',                                                                                                             since: null,         change: null },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made.\n');

  // Load state centroids
  const centroidsPath = path.resolve(ROOT, 'public', 'state-centroids.geojson');
  const centroids = JSON.parse(fs.readFileSync(centroidsPath, 'utf8'));
  const centroidMap = new Map();
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
        name:            'Policy Rating — Birth Certificate',
        icon_slug:       CATEGORY_SLUG,
        color:           '#8b5cf6',
        map_visible:     false,
        severity_weight: 25,
      })
      .select('id')
      .single();
    if (error) { console.error('Failed to create category:', error.message); process.exit(1); }
    categoryId = newCat.id;
    console.log(`Category "${CATEGORY_SLUG}" created (id=${categoryId}).`);
  } else {
    console.log(`[dry-run] Would create category "${CATEGORY_SLUG}".`);
    categoryId = 0;
  }

  // Load existing POIs for this source (for upsert tracking)
  const { data: existing } = await supabase
    .from('points_of_interest')
    .select('id, source_id')
    .eq('source', SOURCE)
    .like('source_id', 'catpalm-bc-%');
  const existingMap = new Map((existing ?? []).map((r) => [r.source_id, r.id]));
  console.log(`${existingMap.size} existing birth-cert POIs in DB.\n`);

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

    const sourceId = `catpalm-bc-${entry.abbr.toLowerCase()}`;

    const statusLine = entry.status === 'Banned'
      ? `Birth certificate gender marker changes are banned in ${entry.state}.`
      : `${entry.status}.`;
    const description = `${statusLine}\n\nLaw/Policy: ${entry.laws}`;

    const record = {
      title:             `${entry.abbr} Birth Certificate Gender Marker Policy`,
      description,
      long_description:  null,
      geom:              `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
      tags:              ['birth-certificate', 'gender-marker', 'policy'],
      severity,
      is_verified:       true,
      effect_scope:      'state',
      category_id:       categoryId,
      is_user_submitted: false,
      source:            SOURCE,
      source_id:         sourceId,
      website_url:       SOURCE_URL,
      source_date:       CATPALM_DATA_AS_OF,
      attributes: {
        state_abbr:          entry.abbr,
        catpalm_rating:      entry.rating,
        catpalm_risk:        entry.risk,
        catpalm_status:      entry.status,
        catpalm_laws:        entry.laws,
        since_date:          entry.since ?? null,
        change_since_2024:   entry.change ?? null,
        catpalm_data_as_of:  CATPALM_DATA_AS_OF,
        source_url:          SOURCE_URL,
      },
    };

    if (DRY_RUN) {
      const action = existingMap.has(sourceId) ? 'UPDATE' : 'INSERT';
      console.log(`  [dry] ${action} ${sourceId}  severity=${severity}  (${entry.rating})`);
      console.log(`        ${entry.state}: ${entry.status}`);
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
