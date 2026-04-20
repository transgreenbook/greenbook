#!/usr/bin/env node
/**
 * Import LGBTQ+ friendly campgrounds from Roadtrippers article:
 * https://roadtrippers.com/magazine/lgbtq-friendly-campgrounds/
 *
 * Coordinates are hardcoded from verified sources (Google Maps, Campendium,
 * campground websites) — no geocoding required.
 * All entries are set is_verified=false — review in admin before publishing.
 *
 * Usage:
 *   node scripts/import-lgbtq-campgrounds-roadtrippers.mjs --dry-run
 *   node scripts/import-lgbtq-campgrounds-roadtrippers.mjs
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
const SOURCE        = 'roadtrippers';
const SOURCE_URL    = 'https://roadtrippers.com/magazine/lgbtq-friendly-campgrounds/';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Campground data — coordinates verified from Google Maps / Campendium / websites
// ---------------------------------------------------------------------------

const CAMPGROUNDS = [
  {
    source_id:   'camping-camp-out-mt-nebo',
    title:       'Camp Out Mt. Nebo',
    city:        'East Stroudsburg',
    state_abbr:  'PA',
    lat:         41.0671,
    lng:         -75.1868,
    address:     '446 Mt Nebo Rd, East Stroudsburg, PA 18301',
    description: 'LGBTQ+ campground in the Poconos Mountains. Adults-only (21+). Features nightclub, pool, hot tub, and 220 sites.',
    long_description: `Camp Out Mt. Nebo is an adults-only (21+) LGBTQ+ campground nestled in the Pocono Mountains of northeast Pennsylvania.

**Address:** 446 Mt Nebo Rd, East Stroudsburg, PA 18301
**Phone:** 570-664-8100
**Website:** poconocampout.com

**Sites:** 220 sites including full-hookup RV sites, tent sites, and rental cabins
**Season:** Seasonal — confirm current dates on website
**Age restriction:** Adults 21+ only

**Amenities:** Outdoor pool, hot tub, on-site nightclub/bar, event pavilion, themed weekends and entertainment throughout the season.

Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify details before visiting.`,
    website_url: 'https://poconocampout.com',
  },
  {
    source_id:   'camping-oneida-pines',
    title:       'Oneida Pines Resort',
    city:        'Cleveland',
    state_abbr:  'NY',
    lat:         43.2332,
    lng:         -75.7514,
    address:     '2045 Mulholland Rd, Cleveland, NY 13042',
    description: 'LGBTQ+-owned campground near Oneida Lake. Kid-friendly with saltwater pool and themed events. 12 sites.',
    long_description: `Oneida Pines Resort is an LGBTQ+-owned and operated campground on Oneida Lake in central New York, known for its welcoming, family-friendly atmosphere.

**Address:** 2045 Mulholland Rd, Cleveland, NY 13042
**Phone:** 315-245-1377
**Website:** oneidapinesresort.com

**Sites:** 12 sites (tent and RV)
**Season:** Seasonal — confirm current dates on website
**Family policy:** Kid-friendly; all ages welcome

**Amenities:** Saltwater pool, lake access, themed weekend events, community gathering areas.

Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify details before visiting.`,
    website_url: 'https://www.campendium.com/oneida-pines-resort',
  },
  {
    source_id:   'camping-starlite-lodge',
    title:       'Starlite Lodge',
    city:        'Lenoir',
    state_abbr:  'NC',
    lat:         36.0463,
    lng:         -81.7045,
    address:     '5955 Globe Rd, Lenoir, NC 28645',
    description: 'Gay-owned and operated campground with full hookup sites, cabins, and tiny homes near the Johns River. 85 sites.',
    long_description: `Starlite Lodge is a gay-owned and operated campground near the Johns River in the foothills of North Carolina, offering a range of accommodation options.

**Address:** 5955 Globe Rd, Lenoir, NC 28645
**Website:** campendium.com/starlite-trailer-lodge

**Sites:** 85 sites including full-hookup RV sites, tent camping, rental cabins, and tiny homes
**Season:** Confirm current season dates on website

**Amenities:** Full hookup sites, cabin and tiny home rentals, river proximity, wooded setting in the Blue Ridge foothills.

Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify details before visiting.`,
    website_url: 'https://www.campendium.com/starlite-trailer-lodge',
  },
  {
    source_id:   'camping-sawmill-resort',
    title:       'Sawmill Camping Resort',
    city:        'Dade City',
    state_abbr:  'FL',
    lat:         28.3674,
    lng:         -82.2218,
    address:     '21710 US Hwy 98, Dade City, FL 33523',
    description: 'Adults-only, members-only LGBTQ+ resort. Drag shows, game nights, heated pool, and lake access. 60 sites.',
    long_description: `Sawmill Camping Resort is a members-only, adults-only LGBTQ+ resort in central Florida, operating year-round with a full entertainment calendar.

**Address:** 21710 US Hwy 98, Dade City, FL 33523
**Phone:** (352) 583-0664
**Website:** floridagaycamping.com

**Sites:** 60 sites (full hookup RV and tent)
**Season:** Year-round
**Age restriction:** Adults 21+ only
**Membership:** Required — annual membership $50/person; day passes available for $15/person

**Amenities:** 4 bars, on-site nightclub, heated pool, lake access, drag shows, game nights, themed weekends, and regular live entertainment throughout the year.

Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify current membership pricing and policies before visiting.`,
    website_url: 'https://www.floridagaycamping.com',
  },
  {
    source_id:   'camping-lv-campground',
    title:       'L.V. Campground',
    city:        'Coggon',
    state_abbr:  'IA',
    lat:         42.3182,
    lng:         -91.5771,
    address:     '1110 325th St, Coggon, IA 52218',
    description: 'Adults-only campground welcoming all campers. Pool, community kitchen, and regular entertainment.',
    long_description: `L.V. Campground is an adults-only campground in rural eastern Iowa that welcomes all campers, with a long history serving the LGBTQ+ community.

**Address:** 1110 325th St, Coggon, IA 52218
**Website:** campendium.com/l-v-campground

**Season:** Seasonal — confirm current dates on website
**Age restriction:** Adults only

**Amenities:** Swimming pool, community kitchen, regular weekend entertainment and events.

Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify details before visiting.`,
    website_url: 'https://www.campendium.com/l-v-campground',
  },
  {
    source_id:   'camping-campit-outdoor-resort',
    title:       'Campit Outdoor Resort',
    city:        'Fennville',
    state_abbr:  'MI',
    lat:         42.5978,
    lng:         -86.1373,
    address:     '6635 118th Ave, Fennville, MI 49408',
    description: 'LGBTQ+-inclusive resort near Saugatuck. Glamping, 200+ campsites, and Pride events.',
    long_description: `Campit Outdoor Resort is a large LGBTQ+-inclusive campground near Saugatuck in western Michigan, offering everything from tent camping to glamping accommodations.

**Address:** 6635 118th Ave, Fennville, MI 49408
**Phone:** (269) 543-4300
**Website:** campitresort.com

**Sites:** 200+ sites including tent sites, RV hookups, cabins, and glamping options
**Season:** Year-round (some amenities seasonal)
**Membership:** $15/person/year

**Amenities:** Multiple pools, recreation facilities, Pride weekend events, proximity to Saugatuck's LGBTQ+-friendly arts and dining scene, dog-friendly areas.

Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify current membership pricing and policies before visiting.`,
    website_url: 'https://www.campitresort.com',
  },
  {
    source_id:   'camping-el-morro-rv-park',
    title:       'El Morro RV Park and Cabins',
    city:        'Ramah',
    state_abbr:  'NM',
    lat:         35.0437,
    lng:         -108.3204,
    address:     '4018 Ice Caves Rd, Ramah, NM 87321',
    description: 'LGBTQ2S+-welcoming campground in the Zuni Mountains near Petrified Forest National Park. 120 full-hookup sites.',
    long_description: `El Morro RV Park and Cabins is an LGBTQ2S+-welcoming campground in the Zuni Mountains of western New Mexico, serving as a base for nearby national parks and monuments.

**Address:** 4018 Ice Caves Rd, Ramah, NM 87321
**Phone:** 505-783-4612
**Website:** elmorro-nm.com

**Sites:** 120 full-hookup RV sites plus cabin rentals
**Season:** Year-round

**Location highlights:** Near El Morro National Monument, Bandera Volcano and Ice Cave, and within driving distance of Petrified Forest National Park and Zuni Pueblo.

**Amenities:** Full hookups, on-site bakery and café, dark skies (Milky Way viewing), pet-friendly, laundry facilities.

The owners explicitly identify the property as LGBTQ2S+ supportive. Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify details before visiting.`,
    website_url: 'https://www.campendium.com/el-morro-rv-park-cabins',
  },
  {
    source_id:   'camping-rainbow-ranch',
    title:       'Rainbow Ranch Campground',
    city:        'Groesbeck',
    state_abbr:  'TX',
    lat:         31.4745,
    lng:         -96.4052,
    address:     '1662 LCR 800, Groesbeck, TX 76642',
    description: 'Award-winning LGBTQ+ campground on Limestone Lake. 700+ acres with extensive recreational facilities. 120 sites.',
    long_description: `Rainbow Ranch Campground is an award-winning LGBTQ+ campground on Limestone Lake in central Texas, set on over 700 acres of land.

**Address:** 1662 LCR 800, Groesbeck, TX 76642
**Phone:** 888-875-7596
**Website:** rainbowranch.net

**Sites:** 120 sites (full hookup RV, tent, and cabin rentals)
**Cost:** From $40/night
**Season:** Year-round

**Amenities:** Lake access, swimming, fishing, extensive hiking and recreation trails, multiple gathering areas, regular themed weekends and events throughout the year. The 700+ acre property offers significant privacy and natural space.

Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify current rates and policies before visiting.`,
    website_url: 'https://www.campendium.com/rainbow-ranch-campground',
  },
  {
    source_id:   'camping-umpquas-last-resort',
    title:       "Umpqua's Last Resort",
    city:        'Idleyld Park',
    state_abbr:  'OR',
    lat:         43.2958,
    lng:         -122.6068,
    address:     '115 Elk Ridge Lane, Idleyld Park, OR 97447',
    description: 'Gay-owned and operated in Umpqua National Forest. Guided outdoor activities, glamping, and full hookup sites. 15 sites.',
    long_description: `Umpqua's Last Resort is a gay-owned and operated campground deep in the Umpqua National Forest in southern Oregon, offering a remote wilderness experience.

**Address:** 115 Elk Ridge Lane, Idleyld Park, OR 97447
**Phone:** 541-498-2500
**Website:** golastresort.com

**Sites:** 15 sites (full hookup RV sites, glamping tents, and cabin options)
**Cost:** From $50/night
**Season:** Confirm current dates — remote location may limit season

**Important:** No cell service at the property. Plan accordingly.

**Amenities:** Guided outdoor activities (hiking, fishing, wildlife watching), glamping accommodations, hot springs access nearby, fully off-grid feel within the national forest. Close to North Umpqua River recreation area.

Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify details and make reservations well in advance — small property fills quickly.`,
    website_url: 'https://www.campendium.com/umpquas-last-resort',
  },
  {
    source_id:   'camping-sunny-valley-rv',
    title:       'Sunny Valley RV Park and Campground',
    city:        'Sunny Valley',
    state_abbr:  'OR',
    lat:         42.6292,
    lng:         -123.3838,
    address:     '140 Old Stage Rd, Sunny Valley, OR 97497',
    description: 'LGBTQ+-owned and operated. Pool, dog park, near Crater Lake and wineries. 59 sites. Seasonal March–October.',
    long_description: `Sunny Valley RV Park and Campground is an LGBTQ+-owned and operated campground in southern Oregon, conveniently located off I-5 near the Applegate Valley wine region.

**Address:** 140 Old Stage Rd, Sunny Valley, OR 97497
**Phone:** 541-479-0209
**Website:** sunnyvalleycamping.com

**Sites:** 59 sites (full hookup RV, partial hookup, and tent)
**Cost:** $25–$55/night depending on site type
**Season:** March through October (seasonal closure in winter)

**Amenities:** Swimming pool, dog park, laundry facilities, Wi-Fi. Pet-friendly. Convenient I-5 access makes it a good overnight stop or base for exploring southern Oregon.

**Nearby attractions:** Crater Lake National Park (~1.5 hrs), Oregon Caves National Monument, Applegate Valley wineries, Rogue River recreation.

Listed in Roadtrippers' guide to LGBTQ+-friendly campgrounds. Verify current rates and seasonal availability before visiting.`,
    website_url: 'https://www.campendium.com/sunny-valley-rv-park-and-campground',
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made.\n');

  // Resolve category
  const { data: cat, error: catErr } = await supabase
    .from('categories')
    .select('id')
    .eq('icon_slug', CATEGORY_SLUG)
    .single();
  if (catErr || !cat) {
    console.error(`Category "${CATEGORY_SLUG}" not found. Run the migration first.`);
    process.exit(1);
  }
  const categoryId = cat.id;
  console.log(`Category "${CATEGORY_SLUG}" id=${categoryId}\n`);

  // Fetch existing source_ids
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
      website_url:      camp.website_url,
      category_id:      categoryId,
      source:           SOURCE,
      source_id:        camp.source_id,
      state_abbr:       camp.state_abbr,
      city_name:        camp.city,
      severity:         2,
      prominence:       'local',
      effect_scope:     'point',
      is_verified:      false,
      geom:             `SRID=4326;POINT(${camp.lng} ${camp.lat})`,
      attributes: {
        address:     camp.address,
        source_url:  SOURCE_URL,
        source_note: 'Listed in Roadtrippers LGBTQ+-friendly campgrounds article. Coordinates verified from Google Maps/Campendium/campground websites. Review before marking as verified.',
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
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
