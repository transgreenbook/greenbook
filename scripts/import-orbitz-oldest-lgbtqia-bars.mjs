#!/usr/bin/env node
/**
 * import-orbitz-oldest-lgbtqia-bars.mjs
 *
 * Imports venues from the Orbitz article:
 * "10 of America's oldest LGBTQIA bars" (September 2021)
 * https://www.orbitz.com/blog/2021/09/10-of-americas-oldest-lgbtqia-bars/
 *
 * Tavern on Camac (Philadelphia) is already in the DB from the 2019 article import
 * and is intentionally excluded here.
 *
 * All entries are set is_verified=false — review in admin before publishing.
 * Status verified April 2026.
 *
 * Usage:
 *   node scripts/import-orbitz-oldest-lgbtqia-bars.mjs --dry-run
 *   node scripts/import-orbitz-oldest-lgbtqia-bars.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const DRY_RUN   = process.argv.includes('--dry-run');

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

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT    = 'greenbook-import/1.0 (zerosquaredio@gmail.com)';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocode(query) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim returned ${res.status} for "${query}"`);
  const results = await res.json();
  if (!results.length) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

// ---------------------------------------------------------------------------
// Venues — all verified open April 2026
// Tavern on Camac (Philadelphia) already imported; excluded here.
// ---------------------------------------------------------------------------

const VENUES = [
  {
    source_id:     'orbitz-oldest-la-lafitte-in-exile',
    title:         'Café Lafitte in Exile',
    street_address: '901 Bourbon St, New Orleans, LA 70116',
    geocode_query: '901 Bourbon St, New Orleans, LA',
    state_abbr:    'LA',
    category:      'nightlife',
    tags:          ['lgbtq', 'bar', 'historic', 'oldest'],
    description:   'Oldest continuously operating gay bar in the U.S. since 1933 · 901 Bourbon St, New Orleans',
    long_description: `Café Lafitte in Exile claims the title of the oldest continuously operating gay bar in the United States, open since 1933. Located on Bourbon Street in New Orleans' French Quarter, it operates 24 hours a day. The bar takes its name from being "in exile" after its original location became Lafitte's Blacksmith Shop. Literary regulars have included Tennessee Williams and Truman Capote.

**Address:** 901 Bourbon St, New Orleans, LA 70116
**Phone:** (504) 522-8397
**Hours:** Open 24 hours, 7 days a week
**Founded:** 1933
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "10 of America's oldest LGBTQIA bars" (September 2021). Verify details before visiting.`,
    prominence:    'national',
    website_url:   'https://www.lafittes.com',
    phone:         '(504) 522-8397',
  },
  {
    source_id:     'orbitz-oldest-ca-white-horse-bar',
    title:         'White Horse Bar',
    street_address: '6551 Telegraph Ave, Oakland, CA 94609',
    geocode_query: '6551 Telegraph Ave, Oakland, CA',
    state_abbr:    'CA',
    category:      'nightlife',
    tags:          ['lgbtq', 'bar', 'historic', 'oldest', 'oakland'],
    description:   "One of the nation's oldest gay bars since 1933 · 6551 Telegraph Ave, Oakland, CA",
    long_description: `The White Horse Bar has operated continuously since 1933, making it one of the oldest gay bars in the United States — rivaling Café Lafitte in Exile for the title. Located on Telegraph Avenue in Oakland, it features karaoke, dance parties, and drag shows.

**Address:** 6551 Telegraph Ave, Oakland, CA 94609
**Phone:** (510) 652-3820
**Hours:** Mon–Fri 3pm–2am, Sat–Sun 1pm–2am
**Founded:** 1933
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "10 of America's oldest LGBTQIA bars" (September 2021). Verify details before visiting.`,
    prominence:    'national',
    website_url:   'https://whitehorsebar.com',
    phone:         '(510) 652-3820',
  },
  {
    source_id:     'orbitz-oldest-ny-julius',
    title:         "Julius'",
    street_address: '159 W 10th St, New York, NY 10014',
    geocode_query: '159 W 10th St, New York, NY',
    state_abbr:    'NY',
    category:      'nightlife',
    tags:          ['lgbtq', 'bar', 'historic', 'oldest', 'greenwich-village', 'landmark'],
    description:   "NYC's oldest gay bar and national historic landmark · 159 W 10th St, West Village",
    long_description: `Julius' is New York City's oldest continuously operating gay bar, with the building dating to 1864. It became a de facto gay bar in the early 20th century and was the site of the famous 1966 "Sip-In" protest, in which gay activists demanded to be served in defiance of a state law prohibiting service to gay people. Listed on the National Register of Historic Places in 2016 and designated a New York City landmark in 2022.

**Address:** 159 W 10th St, New York, NY 10014
**Hours:** Mon–Thu 4pm–2am, Fri 4pm–4am, Sat 12pm–4am
**Founded:** 1864 (as a bar); gay bar since the early 20th century
**Historic Status:** National Register of Historic Places (2016); NYC Landmark (2022)
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "10 of America's oldest LGBTQIA bars" (September 2021). Verify details before visiting.`,
    prominence:    'national',
    website_url:   'https://juliusbarny.com',
  },
  {
    source_id:     'orbitz-oldest-il-jeffery-pub',
    title:         'Jeffery Pub',
    street_address: '7041 S Jeffery Blvd, Chicago, IL 60649',
    geocode_query: '7041 S Jeffery Blvd, Chicago, IL',
    state_abbr:    'IL',
    category:      'nightlife',
    tags:          ['lgbtq', 'bar', 'historic', 'black-owned', 'south-side'],
    description:   "One of the nation's oldest Black-owned gay bars since the 1960s · 7041 S Jeffery Blvd, Chicago",
    long_description: `Jeffery Pub on Chicago's South Side has been serving its largely Black and gay clientele since the 1960s, making it one of the oldest Black-owned gay bars in the United States. A cornerstone of Black LGBTQ+ life in Chicago for over five decades.

**Address:** 7041 S Jeffery Blvd, Chicago, IL 60649
**Phone:** (773) 363-8555
**Hours:** Wed–Thu 6pm–4am, Fri 8pm–4am, Sat 8pm–5am, Sun 12pm–4am (closed Mon–Tue)
**Founded:** 1960s
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "10 of America's oldest LGBTQIA bars" (September 2021). Verify details before visiting.`,
    prominence:    'national',
    phone:         '(773) 363-8555',
  },
  {
    source_id:     'orbitz-oldest-wa-wildrose',
    title:         'The Wildrose',
    street_address: '1021 E Pike St, Seattle, WA 98122',
    geocode_query: '1021 E Pike St, Seattle, WA',
    state_abbr:    'WA',
    category:      'nightlife',
    tags:          ['lgbtq', 'bar', 'lesbian', 'capitol-hill', 'historic'],
    description:   "West Coast's longest-running lesbian bar since 1985 · 1021 E Pike St, Seattle",
    long_description: `The Wildrose has been Seattle's lesbian bar since 1985, making it the longest continuously operating lesbian bar on the West Coast and one of only a handful remaining in the country. Located in Capitol Hill, Seattle's LGBTQ+ neighborhood.

**Address:** 1021 E Pike St, Seattle, WA 98122
**Phone:** (206) 324-9210
**Hours:** Tue–Thu 5pm–12am, Fri–Sat 5pm–2am, Sun 4pm–9pm (closed Mon)
**Founded:** 1985
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "10 of America's oldest LGBTQIA bars" (September 2021). Verify details before visiting.`,
    prominence:    'national',
    website_url:   'https://www.thewildrosebar.com',
    phone:         '(206) 324-9210',
  },
  {
    source_id:     'orbitz-oldest-ak-the-raven',
    title:         'The Raven Bar',
    street_address: '708 E 4th Ave, Anchorage, AK 99501',
    geocode_query: '708 E 4th Ave, Anchorage, AK',
    state_abbr:    'AK',
    category:      'nightlife',
    tags:          ['lgbtq', 'bar', 'alaska', 'neighborhood'],
    description:   "Anchorage's neighborhood gay bar since 1982 · 708 E 4th Ave",
    long_description: `The Raven has been Anchorage's welcoming neighborhood gay bar since 1982. Given Alaska's conservative political climate, the Raven's decades of operation represent a significant community institution. Features a large outdoor patio, pool, jukebox, darts, and pinball.

**Address:** 708 E 4th Ave, Anchorage, AK 99501
**Phone:** (907) 276-9672
**Hours:** Mon–Thu & Sun 3pm–11pm, Fri–Sat 3pm–2:30am
**Founded:** 1982
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "10 of America's oldest LGBTQIA bars" (September 2021). Verify details before visiting.`,
    prominence:    'regional',
    phone:         '(907) 276-9672',
  },
  {
    source_id:     'orbitz-oldest-nj-club-feathers',
    title:         'Club Feathers',
    street_address: '77 Kinderkamack Rd, River Edge, NJ 07661',
    geocode_query: '77 Kinderkamack Rd, River Edge, NJ',
    state_abbr:    'NJ',
    category:      'nightlife',
    tags:          ['lgbtq', 'nightclub', 'historic', 'new-jersey'],
    description:   "New Jersey's oldest gay nightclub since 1978 · 77 Kinderkamack Rd, River Edge, NJ",
    long_description: `Club Feathers opened on June 21, 1978, making it the oldest gay nightclub in New Jersey — over 46 years of continuous operation. Located about 30 minutes from Manhattan in River Edge, Bergen County. The club has historically also served as a support center for LGBTQ+ youth rejected by their families.

**Address:** 77 Kinderkamack Rd, River Edge, NJ 07661
**Phone:** (201) 342-6410
**Hours:** Tue–Fri 7:30pm–2am, Sat 7:30pm–3am, Sun 7:30pm–2am (closed Mon)
**Founded:** June 21, 1978
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "10 of America's oldest LGBTQIA bars" (September 2021). Verify details before visiting.`,
    prominence:    'regional',
    phone:         '(201) 342-6410',
  },
  {
    source_id:     'orbitz-oldest-fl-hg-roosters',
    title:         'H.G. Roosters',
    street_address: '823 Belvedere Rd, West Palm Beach, FL 33405',
    geocode_query: '823 Belvedere Rd, West Palm Beach, FL',
    state_abbr:    'FL',
    category:      'nightlife',
    tags:          ['lgbtq', 'bar', 'historic', 'florida', 'west-palm-beach'],
    description:   "Florida's oldest gay bar, recently restored · 823 Belvedere Rd, West Palm Beach",
    long_description: `H.G. Roosters is Florida's longest-running gay bar, earned a City of West Palm Beach historic designation in 2021 — only the third LGBTQ bar in the country to receive such recognition. The bar was badly damaged by fire in May 2020 and rebuilt with a $2.5 million renovation, reopening in May 2025 after a five-year hiatus.

**Address:** 823 Belvedere Rd, West Palm Beach, FL 33405
**Hours:** Sun–Thu 3pm–3am, Fri–Sat 3pm–4am
**Historic Status:** City of West Palm Beach Historic Designation (2021)
**Status:** Open as of 2026 verification. Reopened May 2025 after fire restoration.
**Source:** Listed in Orbitz "10 of America's oldest LGBTQIA bars" (September 2021). Verify details before visiting.`,
    prominence:    'regional',
    website_url:   'https://hgroosters.com',
  },
  {
    source_id:     'orbitz-oldest-ny-henrietta-hudson',
    title:         'Henrietta Hudson',
    street_address: '438 Hudson St, New York, NY 10014',
    geocode_query: '438 Hudson St, New York, NY',
    state_abbr:    'NY',
    category:      'nightlife',
    tags:          ['lgbtq', 'bar', 'lesbian', 'west-village', 'historic'],
    description:   "Longest-running lesbian bar in NYC since 1991 · 438 Hudson St, West Village",
    long_description: `Henrietta Hudson has been New York City's legendary queer bar since 1991, founded by lesbians as a safe haven and activist space. One of the longest-running lesbian bars in the country, now operating as a lounge and restaurant. Located in the West Village.

**Address:** 438 Hudson St, New York, NY 10014
**Hours:** Wed–Thu & Sun 6pm–2am, Fri–Sat 6pm–4am (closed Mon–Tue)
**Founded:** 1991
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "10 of America's oldest LGBTQIA bars" (September 2021). Verify details before visiting.`,
    prominence:    'national',
    website_url:   'https://henriettahudson.com',
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('DRY RUN — no database writes will occur.\n');

  const { data: cats, error: catErr } = await supabase
    .from('categories')
    .select('id, icon_slug');
  if (catErr) throw catErr;
  const catBySlug = Object.fromEntries(cats.map(c => [c.icon_slug, c.id]));

  // Check all categories exist
  const neededSlugs = [...new Set(VENUES.map(v => v.category))];
  for (const slug of neededSlugs) {
    if (!catBySlug[slug]) {
      console.error(`Category "${slug}" not found. Run migrations first.`);
      process.exit(1);
    }
  }

  let inserted = 0, skipped = 0, failed = 0;

  for (const venue of VENUES) {
    process.stdout.write(`  ${venue.title} (${venue.state_abbr})… `);

    let lat, lng;
    if (venue.lat != null && venue.lng != null) {
      lat = venue.lat;
      lng = venue.lng;
    } else {
      await sleep(1100);
      const coords = await geocode(venue.geocode_query);
      if (!coords) {
        console.log('SKIP (geocode failed)');
        skipped++;
        continue;
      }
      lat = coords.lat;
      lng = coords.lng;
    }

    const poi = {
      title:           venue.title,
      description:     venue.description ?? null,
      long_description: venue.long_description ?? null,
      geom:            `SRID=4326;POINT(${lng} ${lat})`,
      category_id:     catBySlug[venue.category],
      tags:            venue.tags ?? [],
      street_address:  venue.street_address ?? null,
      website_url:     venue.website_url ?? null,
      phone:           venue.phone ?? null,
      is_verified:     false,
      effect_scope:    'point',
      prominence:      venue.prominence ?? 'local',
      source:          'orbitz',
      source_id:       venue.source_id,
      source_date:     '2021-09-01',
    };

    if (DRY_RUN) {
      console.log(`OK (dry) — ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      inserted++;
      continue;
    }

    const { error } = await supabase
      .from('points_of_interest')
      .upsert({ sheet_id: venue.source_id, ...poi }, { onConflict: 'sheet_id' });

    if (error) {
      console.log(`FAIL — ${error.message}`);
      failed++;
    } else {
      console.log(`OK — ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      inserted++;
    }
  }

  console.log(`\nDone. ${inserted} upserted, ${skipped} skipped, ${failed} failed.`);

  if (!DRY_RUN && inserted > 0) {
    const { error: seqErr } = await supabase.rpc('sync_poi_sequence');
    if (seqErr) console.warn('sync_poi_sequence:', seqErr.message);
  }
}

main().catch(err => {
  console.error('Import failed:', err?.message ?? err);
  process.exit(1);
});
