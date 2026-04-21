#!/usr/bin/env node
/**
 * Import KOA campgrounds from the KOA blog article on queer-friendly towns:
 * https://koa.com/blog/queer-friendly-american-small-towns-you-should-visit/
 * (Published January 2023)
 *
 * KOA's company-wide non-discrimination policy covers LGBTQ+ travelers.
 * Coordinates are hardcoded from verified sources (KOA GPS data, Yelp, Campendium,
 * CampingRoadTrip.com) — no geocoding required.
 * All entries are set is_verified=false — review in admin before publishing.
 *
 * Usage:
 *   node scripts/import-lgbtq-campgrounds-koa.mjs --dry-run
 *   node scripts/import-lgbtq-campgrounds-koa.mjs
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
const SOURCE        = 'koa-blog-2023';
const SOURCE_URL    = 'https://koa.com/blog/queer-friendly-american-small-towns-you-should-visit/';
const SOURCE_DATE   = '2023-01-01';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Campground data
// Coordinates sourced from: KOA GPS data, Yelp, Campendium, CampingRoadTrip.com
// ---------------------------------------------------------------------------

const CAMPGROUNDS = [
  {
    source_id:      'camping-koa-lookout-mountain-ga',
    title:          'Lookout Mountain / Chattanooga West KOA Holiday',
    city:           'Trenton',
    state_abbr:     'GA',
    lat:            34.918123,
    lng:            -85.489367,
    street_address: '930 Mountain Shadows Dr, Trenton, GA 30752',
    phone:          '(423) 821-4224',
    website_url:    'https://koa.com/campgrounds/lookout-mtn-west/',
    description:    'KOA Holiday campground near Lookout Mountain and Chattanooga. Full hookups, cabins, pool, and easy I-24 access.',
    long_description: `Lookout Mountain / Chattanooga West KOA Holiday is located in Trenton, Georgia, just minutes from Lookout Mountain and downtown Chattanooga, Tennessee.

**Address:** 930 Mountain Shadows Dr, Trenton, GA 30752
**Phone:** (423) 821-4224
**Website:** koa.com/campgrounds/lookout-mtn-west/

**KOA designation:** KOA Holiday (mid-tier; enhanced amenities)
**Season:** Confirm current dates on website

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, outdoor pool, camp store, playground.

**Nearby:** Lookout Mountain attractions (Rock City, Ruby Falls, Civil War sites), Chattanooga Aquarium (~30 min), Tennessee River.

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-chattanooga-north-tn',
    title:          'Chattanooga North / Cleveland KOA Journey',
    city:           'McDonald',
    state_abbr:     'TN',
    lat:            35.14967,
    lng:            -84.959077,
    street_address: '648 Pleasant Grove Rd, McDonald, TN 37353',
    phone:          '(423) 472-8928',
    website_url:    'https://koa.com/campgrounds/chattanooga-north/',
    description:    'KOA Journey campground off I-75 near Chattanooga. Full hookups, cabins, and easy freeway access.',
    long_description: `Chattanooga North / Cleveland KOA Journey is located in McDonald, Tennessee, conveniently off I-75 Exit 20 between Chattanooga and Cleveland.

**Address:** 648 Pleasant Grove Rd, McDonald, TN 37353
**Phone:** (423) 472-8928
**Website:** koa.com/campgrounds/chattanooga-north/

**KOA designation:** KOA Journey (road-trip stopover with essential amenities)
**Season:** Confirm current dates on website

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, Wi-Fi, camp store.

**Nearby:** Chattanooga (30 min south), Cleveland TN, Ocoee River white-water rafting, Cherokee National Forest.

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-harrisonburg-va',
    title:          'Harrisonburg / Shenandoah Valley KOA Holiday',
    city:           'Broadway',
    state_abbr:     'VA',
    lat:            38.535897,
    lng:            -78.706226,
    street_address: '12480 Mountain Valley Rd, Broadway, VA 22815',
    phone:          null,
    website_url:    'https://koa.com/campgrounds/harrisonburg/',
    description:    'KOA Holiday campground in the Shenandoah Valley near Harrisonburg. Pool, cabins, and mountain views.',
    long_description: `Harrisonburg / Shenandoah Valley KOA Holiday is located in Broadway, Virginia, set in the scenic Shenandoah Valley with views of the surrounding mountains.

**Address:** 12480 Mountain Valley Rd, Broadway, VA 22815
**Website:** koa.com/campgrounds/harrisonburg/

**KOA designation:** KOA Holiday (mid-tier; enhanced amenities)
**Access:** I-81 Exit 257, then 4 miles. Note: KOA advises not to follow GPS directions; follow I-81 Exit 257 → Route 11N → Route 608 for 3.1 miles.
**Season:** Confirm current dates on website

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, outdoor pool, playground, camp store.

**Nearby:** Harrisonburg (~10 min), Shenandoah National Park, Skyline Drive, Massanutten Resort.

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-las-cruces-nm',
    title:          'Las Cruces KOA Journey',
    city:           'Las Cruces',
    state_abbr:     'NM',
    lat:            32.2929157,
    lng:            -106.8592108,
    street_address: '814 Weinrich Rd, Las Cruces, NM 88007',
    phone:          null,
    website_url:    'https://koa.com/campgrounds/las-cruces/',
    description:    'KOA Journey campground near I-10 in Las Cruces. Full hookups, cabins, pool, and close to White Sands National Park.',
    long_description: `Las Cruces KOA Journey is located in Las Cruces, New Mexico, conveniently situated near both I-10 and I-25 for road-trippers crossing the Southwest.

**Address:** 814 Weinrich Rd, Las Cruces, NM 88007
**Website:** koa.com/campgrounds/las-cruces/

**KOA designation:** KOA Journey (road-trip stopover with essential amenities)
**Season:** Year-round (desert climate)

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, outdoor pool, camp store, Wi-Fi.

**Nearby:** White Sands National Park (~45 min), Organ Mountains-Desert Peaks National Monument, Old Mesilla historic plaza, New Mexico State University, Mesilla Valley Bosque State Park.

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-eureka-springs-ar',
    title:          'Eureka Springs KOA Journey',
    city:           'Eureka Springs',
    state_abbr:     'AR',
    lat:            36.4202679,
    lng:            -93.7930557,
    street_address: '15020 Hwy 187 S, Eureka Springs, AR 72631',
    phone:          '(479) 253-8036',
    website_url:    'https://koa.com/campgrounds/eureka-springs/',
    description:    'KOA Journey campground near the LGBTQ+-friendly arts town of Eureka Springs, Arkansas.',
    long_description: `Eureka Springs KOA Journey is located 4 miles west of Eureka Springs, Arkansas — one of the most LGBTQ+-welcoming small towns in the South, known for its Victorian architecture, arts scene, and progressive community.

**Address:** 15020 Hwy 187 S, Eureka Springs, AR 72631
**Phone:** (479) 253-8036
**Website:** koa.com/campgrounds/eureka-springs/

**KOA designation:** KOA Journey (road-trip stopover with essential amenities)
**Access:** 4 miles west of Eureka Springs on Hwy 62, left on Hwy 187 S, 1 mile on left. Note: Do not take the first Hwy 187 turnoff; continue to the second at River Lake Outdoor Center.
**Season:** Confirm current dates on website

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, pool, camp store.

**Nearby:** Eureka Springs historic downtown (~10 min), Beaver Lake, Ozark National Forest, Crystal Bridges Museum of American Art (~1 hr).

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. Eureka Springs has a long history of LGBTQ+ friendliness. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-branson-mo',
    title:          'Branson KOA Holiday',
    city:           'Branson',
    state_abbr:     'MO',
    lat:            36.6283416,
    lng:            -93.2853372,
    street_address: '397 Animal Safari Rd, Branson, MO 65616',
    phone:          '(417) 334-4414',
    website_url:    'https://koa.com/campgrounds/branson/',
    description:    'KOA Holiday campground near Branson entertainment district. Full hookups, pool, cabins, and proximity to Table Rock Lake.',
    long_description: `Branson KOA Holiday is located in Branson, Missouri, near the city's famous entertainment strip and just minutes from Table Rock Lake.

**Address:** 397 Animal Safari Rd, Branson, MO 65616
**Phone:** (417) 334-4414
**Website:** koa.com/campgrounds/branson/

**KOA designation:** KOA Holiday (mid-tier; enhanced amenities)
**Season:** Confirm current dates on website

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, outdoor pool, camp store, Wi-Fi.

**Nearby:** Branson live entertainment shows, Silver Dollar City theme park, Table Rock Lake, Taneycomo Trout Fishing, Ozark Mountain region.

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-missoula-mt',
    title:          'Missoula KOA Holiday',
    city:           'Missoula',
    state_abbr:     'MT',
    lat:            46.8966295,
    lng:            -114.0423180,
    street_address: '3450 Tina Ave, Missoula, MT 59808',
    phone:          null,
    website_url:    'https://koa.com/campgrounds/missoula/',
    description:    'KOA Holiday campground near Missoula. Pool, playground, and access to the outdoor recreation capital of Montana.',
    long_description: `Missoula KOA Holiday is located in Missoula, Montana — a progressive university city and outdoor recreation hub in the Northern Rockies.

**Address:** 3450 Tina Ave, Missoula, MT 59808
**Website:** koa.com/campgrounds/missoula/

**KOA designation:** KOA Holiday (mid-tier; enhanced amenities)
**Season:** Confirm current dates on website (seasonal in Montana)

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, outdoor pool, playground, camp store, Wi-Fi.

**Nearby:** Downtown Missoula (~5 min), University of Montana, Clark Fork River, Rattlesnake Wilderness, Glacier National Park (~2.5 hrs), Flathead Lake.

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. Missoula has an active LGBTQ+ community and progressive civic culture. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-sioux-falls-sd',
    title:          'Sioux Falls KOA Journey',
    city:           'Sioux Falls',
    state_abbr:     'SD',
    lat:            43.6072169,
    lng:            -96.7066203,
    street_address: '1401 E Robur Dr, Sioux Falls, SD 57104',
    phone:          '(605) 332-9987',
    website_url:    'https://koa.com/campgrounds/sioux-falls/',
    description:    'KOA Journey campground near I-90 in Sioux Falls. Full hookups, cabins, and close to Falls Park.',
    long_description: `Sioux Falls KOA Journey is located in Sioux Falls, South Dakota, conveniently positioned off I-90 Exit 399 near the heart of the city.

**Address:** 1401 E Robur Dr, Sioux Falls, SD 57104
**Phone:** (605) 332-9987
**Website:** koa.com/campgrounds/sioux-falls/

**KOA designation:** KOA Journey (road-trip stopover with essential amenities)
**Season:** Confirm current dates on website (seasonal in South Dakota)

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, camp store, Wi-Fi.

**Nearby:** Falls Park (Sioux Falls namesake waterfall), downtown Sioux Falls, Great Plains Zoo, Badlands National Park (~3.5 hrs), Wall Drug.

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-oklahoma-city-east-ok',
    title:          'Oklahoma City East KOA Holiday',
    city:           'Choctaw',
    state_abbr:     'OK',
    lat:            35.4533215,
    lng:            -97.2649951,
    street_address: '6200 S Choctaw Rd, Choctaw, OK 73020',
    phone:          null,
    website_url:    'https://koa.com/campgrounds/oklahoma-city/',
    description:    'KOA Holiday campground east of Oklahoma City in Choctaw. Full hookups, pool, and easy I-40 access.',
    long_description: `Oklahoma City East KOA Holiday is located in Choctaw, Oklahoma, just east of Oklahoma City off I-40 Exit 166.

**Address:** 6200 S Choctaw Rd, Choctaw, OK 73020
**Website:** koa.com/campgrounds/oklahoma-city/

**KOA designation:** KOA Holiday (mid-tier; enhanced amenities)
**Access:** I-40 Exit 166 (Choctaw Rd), then 3/4 mile north.
**Season:** Year-round (confirm current hours)

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, outdoor pool, playground, camp store, Wi-Fi.

**Nearby:** Oklahoma City (~25 min), National Memorial & Museum, Bricktown entertainment district, OKC Zoo, Scissortail Park.

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-hollywood-fl',
    title:          'Hollywood KOA',
    city:           'Hollywood',
    state_abbr:     'FL',
    lat:            26.0120832,
    lng:            -80.2065286,
    street_address: '5931 Polk St, Hollywood, FL 33021',
    phone:          '(954) 983-8225',
    website_url:    'https://koa.com/campgrounds/hollywood/',
    description:    'KOA campground between Miami and Fort Lauderdale in Hollywood, FL. Year-round, close to beaches and LGBTQ+ nightlife.',
    long_description: `Hollywood KOA is located in Hollywood, Florida, ideally situated between Miami and Fort Lauderdale on Florida's LGBTQ+-welcoming southeast coast.

**Address:** 5931 Polk St, Hollywood, FL 33021
**Phone:** (954) 983-8225
**Website:** koa.com/campgrounds/hollywood/

**KOA designation:** KOA (core campground)
**Season:** Year-round (South Florida climate)

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, pool, camp store, Wi-Fi.

**Nearby:** Hollywood Beach Broadwalk (~5 min), Fort Lauderdale Beach (Wilton Manors LGBTQ+ district ~25 min), Miami South Beach (~35 min), Everglades National Park (~1 hr).

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. This location offers convenient access to South Florida's extensive LGBTQ+ community and venues. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
  },
  {
    source_id:      'camping-koa-davie-fl',
    title:          'Davie / Ft. Lauderdale KOA Holiday',
    city:           'Davie',
    state_abbr:     'FL',
    lat:            26.072654,
    lng:            -80.336242,
    street_address: '3800 SW 142 Ave, Davie, FL 33330',
    phone:          '(954) 473-0231',
    website_url:    'https://koa.com/campgrounds/davie/',
    description:    'KOA Holiday campground near Fort Lauderdale in Davie, FL. Full hookups, pool, and close to LGBTQ+ venues in Wilton Manors.',
    long_description: `Davie / Ft. Lauderdale KOA Holiday is located in Davie, Florida, close to Fort Lauderdale and the LGBTQ+-welcoming community of Wilton Manors.

**Address:** 3800 SW 142 Ave, Davie, FL 33330
**Phone:** (954) 473-0231
**Website:** koa.com/campgrounds/davie/

**KOA designation:** KOA Holiday (mid-tier; enhanced amenities)
**Season:** Year-round (South Florida climate)

**Amenities:** Full hookup RV sites, tent sites, KOA cabin rentals, outdoor pool, playground, camp store, Wi-Fi.

**Nearby:** Fort Lauderdale Beach (~20 min), Wilton Manors (major LGBTQ+ hub, ~15 min), Hollywood Broadwalk (~20 min), Everglades National Park (~45 min), Miami (~40 min).

KOA campgrounds follow a company-wide non-discrimination policy welcoming all guests. This location is the closest KOA to Wilton Manors, one of the most LGBTQ+-friendly cities in the US. Listed in KOA's guide to queer-friendly small towns (Jan 2023). Verify details before visiting.`,
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
    console.log(`${camp.lat.toFixed(6)}, ${camp.lng.toFixed(6)}`);

    if (DRY_RUN) {
      const action = existingMap.has(camp.source_id) ? 'UPDATE' : 'INSERT';
      console.log(`    [dry] ${action} ${camp.source_id}`);
      continue;
    }

    const poi = {
      title:            camp.title,
      description:      camp.description,
      long_description: camp.long_description,
      street_address:   camp.street_address,
      website_url:      camp.website_url,
      phone:            camp.phone ?? null,
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
        source_note: 'Listed in KOA blog — queer-friendly small towns (Jan 2023). Coordinates from KOA GPS data / Yelp / CampingRoadTrip.com. Review before marking as verified.',
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
