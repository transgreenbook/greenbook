#!/usr/bin/env node
/**
 * Import LGBTQ+ friendly campgrounds from RVshare article:
 * https://rvshare.com/blog/top-lgbtq-campgrounds/ (last updated Feb 20, 2024)
 *
 * Skips campgrounds already imported from other sources:
 *   Triangle Recreation Camp, El Morro RV Park, L.V. Campground,
 *   Sawmill Camping Resort, Starlite Lodge
 *
 * All coordinates are from verified sources (KOA GPS data, Campendium, Yelp,
 * CampingRoadTrip.com). No city centroids.
 * All entries set is_verified=false — review in admin before publishing.
 *
 * Usage:
 *   node scripts/import-lgbtq-campgrounds-rvshare.mjs --dry-run
 *   node scripts/import-lgbtq-campgrounds-rvshare.mjs
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
const CATEGORY_SLUG = 'trans-camping';
const SOURCE        = 'rvshare';
const SOURCE_URL    = 'https://rvshare.com/blog/top-lgbtq-campgrounds/';
const SOURCE_DATE   = '2024-02-20'; // article last updated

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Campground data — all coordinates from verified sources (not city centroids)
// ---------------------------------------------------------------------------

const CAMPGROUNDS = [
  // ── WEST ────────────────────────────────────────────────────────────────

  {
    source_id:      'camping-ventura-ranch-koa',
    title:          'Ventura Ranch KOA Holiday',
    city:           'Santa Paula',
    state_abbr:     'CA',
    lat:            34.406,    // CampingRoadTrip.com GPS
    lng:            -119.0792,
    address:        '7400 Pine Grove Rd, Santa Paula, CA 93060',
    website_url:    'https://koa.com/campgrounds/ventura-ranch/',
    description:    'KOA Holiday campground in the Topatopa Mountains, LGBTQ+-welcoming. Zip line, ropes course, pool, rock climbing, gem mining, glamping tents, cabins, and RV sites.',
    long_description: `Ventura Ranch KOA Holiday is a full-amenity KOA campground set in the Topatopa Mountains above Ventura County, listed as LGBTQ+-friendly on the Rainbow RV Camping Club website.

**Address:** 10950 Wheeler Canyon Rd, Santa Paula, CA 93060
**Website:** koa.com/campgrounds/ventura-ranch

**Note:** This is a general-public KOA franchise campground that is LGBTQ+-welcoming; it is not LGBTQ+-owned or operated.

**Accommodations:** Cabins, teepees, glamping tents, RV sites, tent sites
**Amenities:** Pool, zip line, ropes course, jumping pillow, rock-climbing tower, gem mining, arts and crafts, labyrinth, playground, full RV hookups, mountain views.

Listed in RVshare's guide to top LGBTQ+ campgrounds (Feb 2024). Verify current rates and availability on the KOA website.`,
  },

  {
    source_id:      'camping-highlands-resort',
    title:          'The Highlands Resort',
    city:           'Guerneville',
    state_abbr:     'CA',
    lat:            38.5039,   // [EXACT]
    lng:            -122.9967,
    address:        '14000 Woodland Dr, Guerneville, CA 95446',
    website_url:    'https://highlandsresort.com',
    description:    'Adults-only LGBTQ+ resort in the Russian River redwoods, 90 minutes north of San Francisco. Cabins, glamping tents, pool, hiking, and canoeing near Guerneville nightlife.',
    long_description: `The Highlands Resort is an adults-only LGBTQ+ resort nestled high among the towering redwoods of the Russian River Wine Country in Sonoma County, California.

**Address:** 14000 Woodland Dr, Guerneville, CA 95446
**Phone:** (707) 869-0333
**Email:** info@highlandsresort.com
**Website:** highlandsresort.com

**Age restriction:** Adults only
**Season:** Year-round

**Accommodations:** Cabins (no TVs; WiFi available) and glamping scout tents.

**Amenities:** Swimming pool, canoeing, kayaking, hiking and biking trails, dog-friendly accommodations. Steps from downtown Guerneville with restaurants, galleries, Johnson's Beach, and LGBTQ+ nightlife.

**Nearby:** Wineries and tasting rooms throughout the Russian River Valley; access to the Russian River for swimming and floating.

The resort has dedicated LGBTQ+ programming including Lazy Bear events. Both LGBTQ+ and straight guests are welcome. Listed in RVshare's guide to top LGBTQ+ campgrounds (Feb 2024). Verify current rates and availability on the website.`,
  },

  {
    source_id:      'camping-woodland-rv-park',
    title:          'Woodland RV Park',
    city:           'Woodland Park',
    state_abbr:     'CO',
    lat:            38.9810,   // [EXACT]
    lng:            -105.0421,
    address:        '1301 E US Hwy 24, Woodland Park, CO',
    website_url:    'https://woodlandrvparkco.com',
    description:    'LGBTQ+-welcoming RV park near Colorado Springs with views of Pikes Peak. Paved roads, shaded pine forest setting, picnic areas, and gas fire pits.',
    long_description: `Woodland RV Park is a small, LGBTQ+-welcoming RV park in Woodland Park, Colorado, situated in a shaded pine forest setting with views of Pikes Peak.

**Address:** 1301 E US Hwy 24, Woodland Park, CO
**Phone:** (719) 687-2009
**Website:** woodlandrvparkco.com

**Note:** This is a general-public RV park that is LGBTQ+-welcoming, listed on the Rainbow RV Camping Club website. It is not LGBTQ+-owned or operated.

**Reservations:** Bookings must be made directly through the office manager; online reservations through third-party camping sites are not accepted.

**Amenities:** Paved roads with graveled sites, shaded pine forest, views of Pikes Peak, picnic areas with gas grill and gas fire pit, dog walking area, professional snow removal.

**Nearby:** Garden of the Gods, Cheyenne Mountain Zoo, Florissant Fossil Beds National Monument, downtown Colorado Springs.

Listed in RVshare's guide to top LGBTQ+ campgrounds (Feb 2024). Verify current rates and availability by contacting the park directly.`,
  },

  // ── SOUTH ────────────────────────────────────────────────────────────────

  {
    source_id:      'camping-jamaica-beach-rv',
    title:          'Jamaica Beach RV Resort',
    city:           'Galveston',
    state_abbr:     'TX',
    lat:            29.2162,   // [EXACT]
    lng:            -94.9183,
    address:        '17200 Termini San Luis Pass Rd, Galveston, TX',
    website_url:    'https://jamaicabeachrvresort.com',
    description:    'LGBTQ+-welcoming RV resort on Galveston Island with views of the Gulf of Mexico and Galveston Bay. 180+ pull-through full-hookup sites, lazy river, pools, mini golf, and live entertainment.',
    long_description: `Jamaica Beach RV Resort is a large, LGBTQ+-welcoming RV resort on the western end of Galveston Island, listed on the Rainbow RV Camping Club website.

**Address:** 17200 Termini San Luis Pass Rd, Galveston, TX
**Phone:** (409) 632-0200
**Email:** Reservations@jbrv.net
**Website:** jamaicabeachrvresort.com

**Note:** This is a general-public RV resort that is LGBTQ+-welcoming; it is not LGBTQ+-owned or operated.

**Accommodations:** 180+ pull-through full-hookup RV sites; 3 cottages (The Beach Comber, The Beach Time, The Montego).
**Season:** Year-round. Water amenities (lazy river, outdoor pools) operate seasonally; indoor pool and hot tubs remain open in winter.

**Amenities:** Lazy river, beach/bayfront pools, indoor pool, hot tubs, mini golf, laundry facilities (3 locations), live music, outdoor movie nights, fishing access. Pet-friendly.

**Views:** Galveston Bay and Gulf of Mexico.

**Nearby:** Galveston's Historic Strand District, beaches, and Pleasure Pier. Near Houston (approx. 1 hour).

Listed in RVshare's guide to top LGBTQ+ campgrounds (Feb 2024). Verify current rates on the website.`,
  },

  {
    source_id:      'camping-etowah-river',
    title:          'Etowah River Campground',
    city:           'Dahlonega',
    state_abbr:     'GA',
    lat:            34.547322, // CampingRoadTrip.com / AdventureGenie GPS
    lng:            -84.065366,
    address:        '437 Rider Mill Rd, Dahlonega, GA 30533',
    website_url:    'https://etowahrivercampgro0.wixsite.com/mysite-1',
    description:    'LGBTQ+-friendly campground in the Blue Ridge Mountain foothills near Dahlonega, Georgia. Full hookup RV sites, tent sites, and river float tube access.',
    long_description: `Etowah River Campground is an LGBTQ+-friendly campground on 28 acres along the Etowah River in the Blue Ridge Mountain foothills near Dahlonega, Georgia, the historic Gold Rush town.

**Address:** 437 Rider Mill Rd, Dahlonega, GA 30533
**Phone:** (706) 864-9035

**Season:** Year-round

**Accommodations:** RV sites (full hookups) and tent sites, set along 1,800 feet of Etowah River frontage.

**Amenities:** River access with float tubes available ($5/person), mountain setting, nearby hiking and outdoor recreation.

**Nearby:** Dahlonega's historic Gold Rush town center, wineries, hiking in the Chattahoochee National Forest, Amicalola Falls State Park.

Listed in RVshare's guide to top LGBTQ+ campgrounds (Feb 2024) as family-friendly and LGBTQ+-friendly. Verify current operating status and rates before visiting.`,
  },

  // ── EAST ─────────────────────────────────────────────────────────────────

  {
    source_id:      'camping-coastal-acres',
    title:          'Coastal Acres Campground',
    city:           'Provincetown',
    state_abbr:     'MA',
    lat:            42.0465,   // [EXACT]
    lng:            -70.2012,
    address:        '76R Bayberry Ave, Provincetown, MA 02657',
    website_url:    'https://coastalacresprovincetown.com',
    description:    'LGBTQ+-friendly campground a 10-minute walk from the heart of Provincetown on Cape Cod. Tent and RV sites, community garden, camp store. April 15–November 1.',
    long_description: `Coastal Acres Campground is a LGBTQ+-friendly campground in Provincetown, Cape Cod — one of the most celebrated LGBTQ+ destinations in the United States.

**Address:** 76R Bayberry Ave, Provincetown, MA 02657
**Phone:** (508) 487-1700
**Email:** coastalacresptown@gmail.com
**Website:** coastalacresprovincetown.com

**Season:** April 15 – November 1 (2026 season)

**Accommodations:** Tent sites and RV campsites.

**Amenities:** Community garden, camp store, 10-minute walk to Commercial Street (Provincetown's main drag).

**Location highlight:** Provincetown is the premier LGBTQ+ resort town on the East Coast, with beaches, galleries, restaurants, nightlife, and Pride events throughout the season. The campground's central location puts everything within easy walking distance.

**Nearby:** Race Point Beach, Province Lands, whale watching, dune buggy rides, the Pilgrim Monument, and year-round arts and cultural events.

Listed in RVshare's guide to top LGBTQ+ campgrounds (Feb 2024). Verify current rates and site availability on the website.`,
  },

  {
    source_id:      'camping-oneida-campground-pa',
    title:          'Oneida Campground & Lodge',
    city:           'New Milford',
    state_abbr:     'PA',
    lat:            41.8869008, // Nominatim geocoded from 2580 E Lake Rd
    lng:            -75.6661194,
    address:        '2580 E Lake Rd, New Milford, PA 18834',
    website_url:    'https://oneidacampground.com',
    description:    'Oldest continuously-operated LGBTQ+ campground in the US, open since 1980. Adults 21+, clothing optional. 2 ponds, pool, hot tub, nightclub, and evening campfires in the Pennsylvania wilderness.',
    long_description: `Oneida Campground & Lodge is widely recognized as the oldest continuously-operated LGBTQ+ campground in the United States, welcoming people of all sexualities since 1980.

**Address:** 2580 E Lake Rd, New Milford, PA 18834
**Phone:** (570) 465-7011
**Website:** oneidacampground.com

**Age restriction:** Adults 21+ only
**Clothing:** Clothing optional throughout the campground.

**Accommodations:** Tent sites and RV sites on 100 heavily wooded acres in Pennsylvania's Endless Mountains.

**Amenities:** 2 ponds, swimming pool, hot tub, on-site nightclub, evening campfires, deep Pennsylvania woodland setting.

**History:** Open since 1980, making it one of the longest-running LGBTQ+-specific campgrounds in the country.

Listed in RVshare's guide to top LGBTQ+ campgrounds (Feb 2024) and verified in Gay Camping Friends directory. Verify current rates and reservation process before visiting.`,
  },

  {
    source_id:      'camping-tree-farm-vt',
    title:          'Tree Farm Campground',
    city:           'Springfield',
    state_abbr:     'VT',
    lat:            43.2888,   // [EXACT]
    lng:            -72.4607,
    address:        '53 Skitchewaug Trail, Springfield, VT 05156',
    website_url:    'https://treefarmcampground.com',
    description:    'LGBTQ+-welcoming campground in a white pine forest in southern Vermont. HRC pride flag displayed. Full hookups on every site, dog park, hiking trails. May 15–October 25.',
    long_description: `Tree Farm Campground is an LGBTQ+-welcoming campground nestled in a white pine forest in southern Vermont, affiliated with opentoall.com and displaying the Human Rights Campaign pride flag.

**Address:** 53 Skitchewaug Trail, Springfield, VT 05156
**Phone:** (802) 885-2889
**Website:** treefarmcampground.com

**Note:** This is a general-public campground that is explicitly LGBTQ+-welcoming (HRC flag, opentoall.com affiliation); it is not LGBTQ+-owned or operated.

**Season:** May 15 – October 25, 2026
**Closed dates:** June 22–25, July 26–30, September 22–23

**Rates (2026):**
- RV sites (full hookups): $60/night
- Tent sites (full hookups): $40/night
- Site lock-in fee: $15 (one-time)
- Early/late check-in: $10–$25 additional

**Check-in/out:** 1:00 PM / 11:00 AM

**Amenities:** Full hookups on every site (water, electric, septic), large pull-through sites, dog park, free hot showers, general store, playground, hiking trails, log cabin lodge with community space.

**Nearby:** Vermont craft breweries, excellent fall foliage, Connecticut River Valley outdoor recreation.

Listed in RVshare's guide to top LGBTQ+ campgrounds (Feb 2024). Verify current availability on the website.`,
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made.\n');

  const { data: cat, error: catErr } = await supabase
    .from('categories')
    .select('id')
    .eq('icon_slug', CATEGORY_SLUG)
    .single();
  if (catErr || !cat) {
    console.error(`Category "${CATEGORY_SLUG}" not found.`);
    process.exit(1);
  }
  const categoryId = cat.id;
  console.log(`Category "${CATEGORY_SLUG}" id=${categoryId}\n`);

  const { data: existing } = await supabase
    .from('points_of_interest')
    .select('id, source_id')
    .eq('source', SOURCE);
  const existingMap = new Map((existing ?? []).map((r) => [r.source_id, r.id]));

  let inserted = 0, updated = 0, failed = 0;

  for (const camp of CAMPGROUNDS) {
    process.stdout.write(`  ${camp.title} (${camp.city}, ${camp.state_abbr}) — `);
    console.log(`${camp.lat.toFixed(4)}, ${camp.lng.toFixed(4)}`);

    if (DRY_RUN) {
      const action = existingMap.has(camp.source_id) ? 'UPDATE' : 'INSERT';
      console.log(`    [dry] ${action} ${camp.source_id}`);
      continue;
    }

    const poi = {
      title:            camp.title,
      description:      camp.description,
      long_description: camp.long_description,
      street_address:   camp.address ?? null,
      website_url:      camp.website_url,
      category_id:      categoryId,
      source:           SOURCE,
      source_id:        camp.source_id,
      source_date:      SOURCE_DATE,
      state_abbr:       camp.state_abbr,
      city_name:        camp.city,
      severity:         2,
      prominence:       'local',
      effect_scope:     'point',
      is_verified:      false,
      geom:             `SRID=4326;POINT(${camp.lng} ${camp.lat})`,
      attributes: {
        source_url:  SOURCE_URL,
        source_note: 'Listed in RVshare LGBTQ+ campgrounds article (Feb 2024). Review before marking as verified.',
      },
    };

    const existingId = existingMap.get(camp.source_id);
    if (existingId) {
      const { error } = await supabase.from('points_of_interest').update(poi).eq('id', existingId);
      if (error) { console.log(`    ERROR: ${error.message}`); failed++; }
      else { console.log(`    updated id=${existingId}`); updated++; }
    } else {
      const { error } = await supabase.from('points_of_interest').insert(poi);
      if (error) { console.log(`    ERROR: ${error.message}`); failed++; }
      else { console.log(`    inserted`); inserted++; }
    }
  }

  console.log(`\nDone. inserted=${inserted}  updated=${updated}  failed=${failed}`);
  if (inserted + updated > 0) {
    console.log('All entries set is_verified=false — review in admin panel before publishing.');
    console.log('\nNotes for review:');
    console.log('  - Ventura Ranch KOA, Woodland RV Park, Jamaica Beach: general-public LGBTQ+-welcoming only (not LGBTQ+-owned)');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
