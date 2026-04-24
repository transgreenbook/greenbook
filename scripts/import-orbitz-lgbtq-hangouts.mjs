#!/usr/bin/env node
/**
 * import-orbitz-lgbtq-hangouts.mjs
 *
 * Imports LGBTQ+ venues from the Orbitz article:
 * "Best LGBTQ hangouts in all 50 states" (April 2019)
 * https://www.orbitz.com/blog/2019/04/best-lgbtq-hangouts-in-all-50-states/
 *
 * Addresses were verified in April 2026. Closed venues are excluded.
 * All entries are set is_verified=false — review in admin before publishing.
 * Coordinates are resolved via Nominatim at import time.
 *
 * Usage:
 *   node scripts/import-orbitz-lgbtq-hangouts.mjs --dry-run
 *   node scripts/import-orbitz-lgbtq-hangouts.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const DRY_RUN   = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Env
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

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Nominatim geocoding
// ---------------------------------------------------------------------------

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
// Venue data — verified open as of April 2026
// ---------------------------------------------------------------------------
// source_id: stable slug used for upsert deduplication
// geocode_query: passed to Nominatim when no hardcoded coords
// lat/lng: optional hardcoded coords (skips Nominatim call)
// category: icon_slug from the categories table
// prominence: 'neighborhood' | 'local' | 'regional' | 'national'
// ---------------------------------------------------------------------------

const VENUES = [
  // ── ALABAMA ───────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-al-spikes-bar',
    title:        "Spike's Bar",
    street_address: '620 27th St S, Birmingham, AL 35233',
    lat:          33.4973,
    lng:          -86.8156,
    state_abbr:   'AL',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'leather'],
    description:  "Leather bar · 620 27th St S, Birmingham, AL",
    long_description: `Alabama's only leather bar, located in Birmingham's Southside neighborhood. Features lively dance music, themed parties, and an on-site leather shop.

**Address:** 620 27th St S, Birmingham, AL 35233
**Phone:** (205) 265-1496
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    phone:        '(205) 265-1496',
  },

  // ── ARIZONA ───────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-az-charlies',
    title:        "Charlie's",
    street_address: '727 W Camelback Rd, Phoenix, AZ 85013',
    geocode_query: '727 W Camelback Rd, Phoenix, AZ',
    state_abbr:   'AZ',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'country'],
    description:  "Gay country bar · 727 W Camelback Rd, Phoenix, AZ",
    long_description: `Charlie's is a beloved gay country bar in Phoenix, Arizona, offering line dancing, drag shows, and a welcoming atmosphere.

**Address:** 727 W Camelback Rd, Phoenix, AZ 85013
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
  },
  {
    source_id:    'orbitz-az-cash-nightclub',
    title:        'Cash Nightclub & Lounge',
    street_address: '1730 E McDowell Rd, Phoenix, AZ 85006',
    geocode_query: '1730 E McDowell Rd, Phoenix, AZ',
    state_abbr:   'AZ',
    category:     'nightlife',
    tags:         ['lgbtq', 'nightclub'],
    description:  "Gay nightclub · 1730 E McDowell Rd, Phoenix, AZ",
    long_description: `Cash Nightclub & Lounge is a gay nightclub in Phoenix's LGBTQ+ McDowell corridor.

**Address:** 1730 E McDowell Rd, Phoenix, AZ 85006
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'local',
  },
  {
    source_id:    'orbitz-az-karamba',
    title:        'Karamba',
    street_address: '1724 E McDowell Rd, Phoenix, AZ 85006',
    geocode_query: '1724 E McDowell Rd, Phoenix, AZ',
    state_abbr:   'AZ',
    category:     'nightlife',
    tags:         ['lgbtq', 'nightclub', 'latin'],
    description:  "LGBTQ+ nightclub · 1724 E McDowell Rd, Phoenix, AZ",
    long_description: `Karamba is an LGBTQ+ nightclub on Phoenix's McDowell Road, known for Latin nights and a diverse crowd.

**Address:** 1724 E McDowell Rd, Phoenix, AZ 85006
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'local',
  },

  // ── ARKANSAS ──────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ar-crescent-hotel',
    title:        'Crescent Hotel & Spa',
    street_address: '75 Prospect Ave, Eureka Springs, AR 72632',
    geocode_query: '75 Prospect Ave, Eureka Springs, AR',
    state_abbr:   'AR',
    category:     'trans-lodging',
    tags:         ['lgbtq', 'hotel', 'historic'],
    description:  "Historic LGBTQ-friendly resort · 75 Prospect Ave, Eureka Springs, AR",
    long_description: `The Crescent Hotel & Spa is a historic Victorian hotel in Eureka Springs, Arkansas — a consistently LGBTQ+-welcoming resort town. The hotel operates year-round and hosts an annual gay pride weekend.

**Address:** 75 Prospect Ave, Eureka Springs, AR 72632
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.crescent-hotel.com',
  },

  // ── CONNECTICUT ───────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ct-168-york-st-cafe',
    title:        '168 York Street Cafe',
    street_address: '168 York St, New Haven, CT 06511',
    geocode_query: '168 York St, New Haven, CT',
    state_abbr:   'CT',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'drag'],
    description:  "One of CT's oldest gay bars · 168 York St, New Haven, CT",
    long_description: `168 York Street Cafe is one of Connecticut's oldest gay bars, located in downtown New Haven near Yale University. Gay-owned and operated, it serves dinners and hosts regular drag shows.

**Address:** 168 York St, New Haven, CT 06511
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://168yorkstcafe.com',
  },

  // ── IDAHO ─────────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-id-flying-m-coffeehouse',
    title:        'Flying M Coffeehouse',
    street_address: '500 W Idaho St, Boise, ID 83702',
    geocode_query: '500 W Idaho St, Boise, ID',
    state_abbr:   'ID',
    category:     'restaurant',
    tags:         ['lgbtq', 'coffeehouse', 'community'],
    description:  "LGBTQ+-friendly coffeehouse · 500 W Idaho St, Boise, ID",
    long_description: `Flying M Coffeehouse is Boise's beloved LGBTQ+-friendly independent coffeehouse, operating since 1993. Known for its funky, welcoming atmosphere and community events.

**Address:** 500 W Idaho St, Boise, ID 83702
**Hours:** Mon–Fri 6:30am–10pm, Sat 7:30am–10pm, Sun 7:30am–6pm
**Status:** Open as of 2026 verification (celebrating 32+ years in business).
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'local',
    website_url:  'https://www.flyingmcoffee.com',
  },

  // ── ILLINOIS ──────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-il-big-chicks',
    title:        'Big Chicks',
    street_address: '5024 N Sheridan Rd, Chicago, IL 60640',
    geocode_query: '5024 N Sheridan Rd, Chicago, IL',
    state_abbr:   'IL',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'art'],
    description:  "LGBTQ+ bar with fine art collection · 5024 N Sheridan Rd, Chicago, IL",
    long_description: `Big Chicks is a beloved LGBTQ+ bar in Chicago's Uptown neighborhood, known for its welcoming all-are-welcome vibe and walls lined with fine art. Open since the late 1980s.

**Address:** 5024 N Sheridan Rd, Chicago, IL 60640
**Phone:** (773) 728-5511
**Status:** Open as of 2026 verification. Dance parties have resumed post-pandemic.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://bigchicks.squarespace.com',
  },

  // ── INDIANA ───────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-in-back-door',
    title:        'The Back Door',
    street_address: '207 S College Ave, Bloomington, IN 47403',
    geocode_query: '207 S College Ave, Bloomington, IN',
    state_abbr:   'IN',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'lesbian'],
    description:  "Queer bar · 207 S College Ave, Bloomington, IN",
    long_description: `The Back Door is a queer bar in Bloomington, Indiana — the only dedicated LGBTQ+ bar in the city. Known as Indiana's last lesbian bar, it serves the full LGBTQ+ community and their allies.

**Address:** 207 S College Ave, Bloomington, IN 47403
**Hours:** Mon–Thu 7pm–12am, Fri–Sat 7pm–3am, Sun 7pm–12am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.bckdoor.com',
  },

  // ── IOWA ──────────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ia-studio-13',
    title:        'Studio 13',
    street_address: '13 S Linn St, Iowa City, IA 52240',
    geocode_query: '13 S Linn St, Iowa City, IA',
    state_abbr:   'IA',
    category:     'nightlife',
    tags:         ['lgbtq', 'nightclub', 'drag'],
    description:  "LGBTQ+ nightclub · 13 S Linn St, Iowa City, IA",
    long_description: `Studio 13 is Iowa City's premier LGBTQ+ nightclub and dance bar. Celebrated its 25th anniversary in 2025. Features drag shows Wednesday through Sunday.

**Address:** 13 S Linn St, Iowa City, IA 52240
**Status:** Open as of 2026 verification (25th anniversary in 2025).
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
  },
  {
    source_id:    'orbitz-ia-prairie-lights',
    title:        'Prairie Lights Books',
    street_address: '15 S Dubuque St, Iowa City, IA 52240',
    geocode_query: '15 S Dubuque St, Iowa City, IA',
    state_abbr:   'IA',
    category:     'shop',
    tags:         ['lgbtq', 'bookstore', 'community'],
    description:  "Independent bookstore · 15 S Dubuque St, Iowa City, IA",
    long_description: `Prairie Lights is Iowa City's renowned independent bookstore, consistently named one of the best in the country. Known for hosting major literary events and being a welcoming community space.

**Address:** 15 S Dubuque St, Iowa City, IA 52240
**Hours:** Mon–Fri 10am–9pm, Sat–Sun 10am–6pm
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://prairielights.com',
  },
  {
    source_id:    'orbitz-ia-englert-theatre',
    title:        'Englert Theatre',
    street_address: '221 E Washington St, Iowa City, IA 52240',
    geocode_query: '221 E Washington St, Iowa City, IA',
    state_abbr:   'IA',
    category:     'venue',
    tags:         ['lgbtq', 'theater', 'arts'],
    description:  "Nonprofit arts venue · 221 E Washington St, Iowa City, IA",
    long_description: `The Englert Theatre is a leading nonprofit arts presenter in downtown Iowa City, offering diverse programming including live music, film, theater, and educational events.

**Address:** 221 E Washington St, Iowa City, IA 52240
**Phone:** (319) 688-2653
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'local',
    website_url:  'https://englert.org',
  },

  // ── LOUISIANA ─────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-la-oz-new-orleans',
    title:        'Oz New Orleans',
    street_address: '800 Bourbon St, New Orleans, LA 70116',
    geocode_query: '800 Bourbon St, New Orleans, LA',
    state_abbr:   'LA',
    category:     'nightlife',
    tags:         ['lgbtq', 'nightclub', 'drag'],
    description:  "Gay dance club · 800 Bourbon St, New Orleans, LA",
    long_description: `Oz New Orleans is a landmark LGBTQ+ dance club on Bourbon Street in the French Quarter, established in 1993. Known for DJ sets, drag shows, go-go dancers, and a balcony overlooking Bourbon Street.

**Address:** 800 Bourbon St, New Orleans, LA 70116
**Hours:** Mon–Wed 6pm–4am, Thu–Sun 12pm–4am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'national',
    website_url:  'https://www.ozneworleans.com',
  },

  // ── MAINE ─────────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-me-mainestreet-ogunquit',
    title:        'MaineStreet Ogunquit',
    street_address: '195 Main St, Ogunquit, ME 03907',
    geocode_query: '195 Main St, Ogunquit, ME',
    state_abbr:   'ME',
    category:     'nightlife',
    tags:         ['lgbtq', 'nightclub', 'dance'],
    description:  "Gay dance club · 195 Main St, Ogunquit, ME",
    long_description: `MaineStreet is the premier dance club and lounge in Ogunquit, Maine's celebrated LGBTQ+ beach town. Operating since 2000, it's a cornerstone of New England's gay summer scene.

**Address:** 195 Main St, Ogunquit, ME 03907
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.mainestreetogunquit.com',
  },

  // ── MASSACHUSETTS ─────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ma-spiritus-pizza',
    title:        'Spiritus Pizza',
    street_address: '190 Commercial St, Provincetown, MA 02657',
    geocode_query: '190 Commercial St, Provincetown, MA',
    state_abbr:   'MA',
    category:     'restaurant',
    tags:         ['lgbtq', 'restaurant', 'pizza', 'late-night'],
    description:  "Provincetown institution since 1971 · 190 Commercial St, Provincetown, MA",
    long_description: `Spiritus Pizza is a Provincetown landmark since 1971 — a cash-only, late-night pizza joint on Commercial Street that has been a gathering place for the LGBTQ+ community for generations. Open until 2am.

**Address:** 190 Commercial St, Provincetown, MA 02657
**Hours:** 11:30am–2:00am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://spirituspizza.com',
  },

  // ── MARYLAND ──────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-md-rocket-to-venus',
    title:        'Rocket to Venus',
    street_address: '3360 Chestnut Ave, Baltimore, MD 21211',
    geocode_query: '3360 Chestnut Ave, Baltimore, MD',
    state_abbr:   'MD',
    category:     'restaurant',
    tags:         ['lgbtq', 'bar', 'restaurant', 'hampden'],
    description:  "Eclectic gastropub in Baltimore's Hampden neighborhood · 3360 Chestnut Ave",
    long_description: `Rocket to Venus is a kitschy space-themed gastropub in Baltimore's artsy Hampden neighborhood, a longtime LGBTQ+-friendly area featured in John Waters films. Known for creative cocktails and comfort food.

**Address:** 3360 Chestnut Ave, Baltimore, MD 21211
**Hours:** Mon–Thu 5pm–11pm, Fri–Sat 12pm–12am, Sun 12pm–11pm
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'local',
    website_url:  'https://www.rockettovenus.com',
  },

  // ── MICHIGAN ──────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-mi-campit-resort',
    title:        'Campit Outdoor Resort',
    street_address: '6635 118th Ave, Fennville, MI 49408',
    geocode_query: '6635 118th Ave, Fennville, MI',
    state_abbr:   'MI',
    category:     'trans-camping',
    tags:         ['lgbtq', 'camping', 'resort', 'saugatuck'],
    description:  "LGBTQ+ membership campground near Saugatuck · 6635 118th Ave, Fennville, MI",
    long_description: `Campit Outdoor Resort is a membership-based LGBTQ+ campground on 33 wooded acres near Saugatuck, Michigan and Lake Michigan. Offers tent camping, RV sites, cabins, heated pool, and weekend entertainment.

**Address:** 6635 118th Ave, Fennville, MI 49408
**Phone:** (269) 543-4300
**Membership:** Required — day passes and annual memberships available
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019) and Campit's own confirmation. Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.campitresort.com',
  },

  // ── MINNESOTA ─────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-mn-gay-90s',
    title:        "Gay 90's",
    street_address: '408 Hennepin Ave, Minneapolis, MN 55401',
    geocode_query: '408 Hennepin Ave, Minneapolis, MN',
    state_abbr:   'MN',
    category:     'nightlife',
    tags:         ['lgbtq', 'nightclub', 'drag', 'dance'],
    description:  "Minneapolis LGBTQ+ cornerstone since the 1980s · 408 Hennepin Ave",
    long_description: `Gay 90's is the heart of LGBTQ+ nightlife in downtown Minneapolis. With two floors, seven bars, and a large dance floor, it remains the city's premier LGBTQ+ venue. Features the Infamous LaFemme Drag Show.

**Address:** 408 Hennepin Ave, Minneapolis, MN 55401
**Phone:** (612) 333-7755
**Hours:** Wed–Thu 6pm–2am, Fri–Sat 4pm–3am, Sun 9pm–2am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'national',
    website_url:  'https://gay90s.com',
  },

  // ── MISSISSIPPI ───────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ms-sipps',
    title:        'Sipps Bar',
    street_address: '2218 25th Ave, Gulfport, MS 39501',
    geocode_query: '2218 25th Ave, Gulfport, MS',
    state_abbr:   'MS',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'drag'],
    description:  "LGBTQ+ bar · 2218 25th Ave, Gulfport, MS",
    long_description: `Sipps Bar is the heart of LGBTQ+ nightlife on Mississippi's Gulf Coast, located in Gulfport. Known for Drag Bingo Sundays, Karaoke Fridays, and a welcoming community atmosphere.

**Address:** 2218 25th Ave, Gulfport, MS 39501
**Hours:** Mon–Sun 4pm–2am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
  },

  // ── MONTANA ───────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-mt-plonk',
    title:        'Plonk',
    street_address: '322 N Higgins Ave, Missoula, MT 59801',
    geocode_query: '322 N Higgins Ave, Missoula, MT',
    state_abbr:   'MT',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'wine', 'rooftop'],
    description:  "Cocktail bar & rooftop restaurant · 322 N Higgins Ave, Missoula, MT",
    long_description: `Plonk is a well-regarded wine bar and rooftop cocktail lounge in downtown Missoula, recommended as a welcoming LGBTQ+-friendly hangout in Montana.

**Address:** 322 N Higgins Ave, Missoula, MT 59801
**Hours:** Mon–Thu 3pm–10pm, Fri–Sat 3pm–11pm
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'local',
    website_url:  'https://plonkwine.com',
  },

  // ── NEBRASKA ──────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ne-flixx-cabaret',
    title:        'Flixx Lounge & Cabaret',
    street_address: '1019 S 10th St, Omaha, NE 68108',
    geocode_query: '1019 S 10th St, Omaha, NE',
    state_abbr:   'NE',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'drag', 'cabaret'],
    description:  "LGBTQ+-owned lounge and drag cabaret · 1019 S 10th St, Omaha, NE",
    long_description: `Flixx Lounge & Cabaret Show Bar is an all-inclusive LGBTQ+-owned and operated bar in Omaha featuring a dedicated drag cabaret room, pool tables, darts, and regular community events.

**Address:** 1019 S 10th St, Omaha, NE 68108
**Hours:** Mon–Sun 4pm–2am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.flixxlounge.com',
  },

  // ── NEVADA ────────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-nv-park-mgm',
    title:        'Park MGM (Dolby Live)',
    street_address: '3770 S Las Vegas Blvd, Las Vegas, NV 89109',
    geocode_query: '3770 S Las Vegas Blvd, Las Vegas, NV',
    state_abbr:   'NV',
    category:     'venue',
    tags:         ['lgbtq', 'entertainment', 'las-vegas'],
    description:  "LGBTQ+-welcoming hotel and entertainment venue · Las Vegas Strip",
    long_description: `Park MGM is an LGBTQ+-welcoming hotel and entertainment complex on the Las Vegas Strip, home to Dolby Live (formerly Park Theater) — a major performance venue that has hosted LGBTQ+-beloved artists. The hotel markets itself as an inclusive destination.

**Address:** 3770 S Las Vegas Blvd, Las Vegas, NV 89109
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'national',
    website_url:  'https://www.parkmgm.com',
  },

  // ── NEW JERSEY ────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-nj-empress-hotel-asbury-park',
    title:        'Empress Hotel & Paradise Club',
    geocode_query: 'Empress Hotel, 101 Asbury Ave, Asbury Park, NJ',
    state_abbr:   'NJ',
    category:     'trans-lodging',
    tags:         ['lgbtq', 'hotel', 'nightclub', 'asbury-park'],
    description:  "Gay resort and nightclub · Asbury Park, NJ",
    long_description: `The Empress Hotel is a gay-owned resort in Asbury Park, New Jersey. The attached Paradise Club is one of the oldest continuously operating gay clubs in New Jersey. Asbury Park itself has been a significant LGBTQ+ beach town for decades.

**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
  },

  // ── NEW MEXICO ────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-nm-albuquerque-social-club',
    title:        'Albuquerque Social Club',
    street_address: '4021 Central Ave NE, Albuquerque, NM 87108',
    geocode_query: '4021 Central Ave NE, Albuquerque, NM',
    state_abbr:   'NM',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'drag', 'dance'],
    description:  "Oldest gay bar in Albuquerque · 4021 Central Ave NE",
    long_description: `Albuquerque Social Club is the oldest gay bar in Albuquerque, New Mexico. Located on Route 66, it features dancing, drag shows, community markets, and regular events.

**Address:** 4021 Central Ave NE, Albuquerque, NM 87108
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.abqsocial.org',
  },

  // ── NEW YORK ──────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ny-fire-island-pines',
    title:        'Fire Island Pines',
    geocode_query: 'Fire Island Pines, NY',
    state_abbr:   'NY',
    category:     'community',
    tags:         ['lgbtq', 'beach', 'community', 'fire-island'],
    description:  "Legendary LGBTQ+ beach community on Fire Island, NY",
    long_description: `Fire Island Pines is one of the most iconic LGBTQ+ summer destinations in America. This car-free barrier island community has been a gay haven since the 1960s, featuring beaches, guest houses, restaurants, and nightlife. Home to the annual Invasion of the Pines (July 4) and Pines Party.

**Access:** Ferry from Bay Shore or Sayville, Long Island
**Season:** Primarily summer (Memorial Day through Labor Day); some year-round residents
**Status:** Active destination as of 2025 season.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'national',
  },
  {
    source_id:    'orbitz-ny-cherry-grove',
    title:        'Cherry Grove',
    geocode_query: 'Cherry Grove, Fire Island, NY',
    state_abbr:   'NY',
    category:     'community',
    tags:         ['lgbtq', 'beach', 'community', 'fire-island', 'lesbian'],
    description:  "America's first LGBTQ+ beach town · Fire Island, NY",
    long_description: `Cherry Grove on Fire Island is recognized as America's first openly gay and lesbian town, with a history dating to the 1920s. Adjacent to Fire Island Pines, it has traditionally been more lesbian-identified and features the annual Cherry Grove Pride Parade.

**Access:** Ferry from Bay Shore or Sayville, Long Island
**Season:** Primarily summer; some year-round residents
**Status:** Active destination as of 2025 season.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'national',
  },

  // ── OKLAHOMA ──────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ok-district-hotel',
    title:        'District Hotel OKC',
    street_address: '2200 NW 40th St, Oklahoma City, OK 73112',
    geocode_query: '2200 NW 40th St, Oklahoma City, OK',
    state_abbr:   'OK',
    category:     'trans-lodging',
    tags:         ['lgbtq', 'hotel', 'resort', 'nightclub', 'pool'],
    description:  "LGBTQ+ resort hotel · 2200 NW 40th St, Oklahoma City, OK",
    long_description: `The District Hotel is a 21+ LGBTQ+ resort in Oklahoma City's 39th Street District, described as the queer capital of the Plains. Features multiple nightclubs, two outdoor pools with entertainment, and a piano bar.

**Address:** 2200 NW 40th St, Oklahoma City, OK 73112
**Status:** Open as of 2026 verification. Currently under new LGBTQ+ ownership and renovation.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'national',
  },

  // ── PENNSYLVANIA ──────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-pa-woodys',
    title:        "Woody's Bar",
    street_address: '202 S 13th St, Philadelphia, PA 19107',
    geocode_query: '202 S 13th St, Philadelphia, PA',
    state_abbr:   'PA',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'nightclub', 'dance', 'gayborhood'],
    description:  "Philly Gayborhood landmark since the 1980s · 202 S 13th St",
    long_description: `Woody's has been the beating heart of Philadelphia's gay nightlife for over 40 years. Two floors with five themed spaces, DJ nights, Monday karaoke, and five distinctive party lounges.

**Address:** 202 S 13th St, Philadelphia, PA 19107
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://woodysbar.com',
  },
  {
    source_id:    'orbitz-pa-tavern-on-camac',
    title:        'Tavern on Camac',
    street_address: '243 S Camac St, Philadelphia, PA 19107',
    lat:          39.9458,
    lng:          -75.1577,
    state_abbr:   'PA',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'piano-bar', 'karaoke', 'gayborhood'],
    description:  "Philadelphia's longest-running gay bar since 1925 · 243 S Camac St",
    long_description: `Tavern on Camac has been operating as a gay establishment since 1925, making it the longest-running gay bar in Philadelphia. Spread across three floors on one of Philly's most charming side streets, with a beloved second-floor piano bar featuring nightly karaoke.

**Address:** 243 S Camac St, Philadelphia, PA 19107
**Status:** Open as of 2026 verification. Reopened with new chef and upgraded menu in July 2025.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
  },

  // ── RHODE ISLAND ──────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ri-the-stable',
    title:        'The Stable',
    street_address: '125 Washington St, Providence, RI 02903',
    geocode_query: '125 Washington St, Providence, RI',
    state_abbr:   'RI',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'drag'],
    description:  "Providence's premier gay bar · 125 Washington St",
    long_description: `The Stable is Providence's premier LGBTQ+ bar, located in downtown. Features weekly Sangria Sundays with guest bartenders, drag events, and a welcoming seven-day-a-week schedule.

**Address:** 125 Washington St, Providence, RI 02903
**Hours:** Mon–Thu 12pm–1am, Fri–Sat 12pm–2am, Sun 12pm–1am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.stablepvd.com',
  },

  // ── SOUTH CAROLINA ────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-sc-dudleys-on-ann',
    title:        "Dudley's on Ann",
    street_address: '42 Ann St, Charleston, SC 29403',
    geocode_query: '42 Ann St, Charleston, SC',
    state_abbr:   'SC',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'drag', 'karaoke'],
    description:  "Charleston's premier gay bar for 28+ years · 42 Ann St",
    long_description: `Dudley's on Ann is Charleston's most popular gay bar, operating for over 28 years downtown. Open 7 days a week with daily happy hour, karaoke, and drag shows.

**Address:** 42 Ann St, Charleston, SC 29403
**Hours:** Daily 4pm–2am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.dudleys42ann.com',
  },

  // ── SOUTH DAKOTA ──────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-sd-club-david',
    title:        'Club David',
    geocode_query: 'Club David, Sioux Falls, SD',
    state_abbr:   'SD',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'drag', 'dance'],
    description:  "LGBTQ+ bar and dance club · Sioux Falls, SD",
    long_description: `Club David is a longtime LGBTQ+ bar and dance club in downtown Sioux Falls, South Dakota. Since opening in 2006, it has been a central venue for South Dakota Pride celebrations and the local LGBTQ+ community.

**Status:** Open as of 2026 verification. Recently remodeled.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.clubdavidsiouxfalls.com',
  },

  // ── TEXAS ─────────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-tx-cheer-up-charlies',
    title:        "Cheer Up Charlie's",
    street_address: '900 Red River St, Austin, TX 78701',
    geocode_query: '900 Red River St, Austin, TX',
    state_abbr:   'TX',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'music', 'outdoor'],
    description:  "Queer outdoor bar and music venue · 900 Red River St, Austin, TX",
    long_description: `Cheer Up Charlie's is a beloved queer outdoor bar and music venue in Austin's Red River Entertainment District. In August 2025, the community raised over $58,000 in a crowdfunding campaign to keep the bar open after financial hardship.

**Address:** 900 Red River St, Austin, TX 78701
**Status:** Open as of 2026 verification (survived fundraising crisis in Aug 2025).
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://cheerupcharlies.com',
  },

  // ── UTAH ──────────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-ut-metro-music-hall',
    title:        'Metro Music Hall',
    street_address: '615 W 100 S, Salt Lake City, UT 84104',
    geocode_query: '615 W 100 S, Salt Lake City, UT',
    state_abbr:   'UT',
    category:     'venue',
    tags:         ['lgbtq', 'music', 'nightclub', 'dance'],
    description:  "LGBTQ+-welcoming music venue and dance club · 615 W 100 S, Salt Lake City, UT",
    long_description: `Metro Music Hall is a mid-size concert venue and open-format event space in downtown Salt Lake City, known as an LGBTQ+-welcoming space for live music and dance events.

**Address:** 615 W 100 S, Salt Lake City, UT 84104
**Hours:** Wed–Sat 7pm–12am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'local',
    website_url:  'https://www.metromusichall.com',
  },

  // ── VIRGINIA ──────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-va-babes-of-carytown',
    title:        "Babe's of Carytown",
    geocode_query: "Babe's of Carytown, Richmond, VA",
    state_abbr:   'VA',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'lesbian', 'drag'],
    description:  "One of America's oldest lesbian bars, since 1979 · Richmond, VA",
    long_description: `Babe's of Carytown is one of the nation's oldest lesbian bars, founded in 1979 in Richmond's Carytown neighborhood. One of only about 30 remaining lesbian bars in the country. The bar continues operating after the passing of beloved owner Vicky Hester in September 2025.

**Status:** Open as of 2026 verification. Continuing under its existing staff after owner's passing (Sept 2025).
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'national',
  },

  // ── WASHINGTON ────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-wa-neighbours-nightclub',
    title:        'Neighbours Nightclub',
    street_address: '1509 Broadway, Seattle, WA 98122',
    geocode_query: '1509 Broadway, Seattle, WA',
    state_abbr:   'WA',
    category:     'nightlife',
    tags:         ['lgbtq', 'nightclub', 'drag', 'dance', 'capitol-hill'],
    description:  "Seattle's oldest continuously operating LGBTQ+ club since 1983 · 1509 Broadway",
    long_description: `Neighbours Nightclub is Seattle's oldest operating LGBTQ+ club, open since 1983 on Capitol Hill. Features drag performances, themed nights, a large dance floor, and a balcony. Neighbors is a cornerstone of Seattle's queer scene.

**Address:** 1509 Broadway, Seattle, WA 98122
**Hours:** Wed–Fri, Sun from 9pm; Sat from 10pm; closing 2–4am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
  },

  // ── WASHINGTON DC ─────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-dc-jrs-bar',
    title:        "JR's Bar",
    street_address: '1519 17th St NW, Washington, DC 20009',
    geocode_query: '1519 17th St NW, Washington, DC',
    state_abbr:   'DC',
    category:     'nightlife',
    tags:         ['lgbtq', 'bar', 'dupont-circle'],
    description:  "Dupont Circle LGBTQ+ bar since 1986 · 1519 17th St NW, Washington, DC",
    long_description: `JR's Bar has been a pillar of Washington DC's LGBTQ+ community since 1986. Located in Dupont Circle, it offers a friendly neighborhood atmosphere with regular events including SHOWTUNES Mondays.

**Address:** 1519 17th St NW, Washington, DC 20009
**Hours:** Mon–Thu 4pm–2am, Fri 4pm–3am, Sat 1pm–3am, Sun 1pm–2am
**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://bardc.com/bars/jrs-bar/',
  },

  // ── WEST VIRGINIA ─────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-wv-guesthouse-lost-river',
    title:        'Guesthouse Lost River',
    lat:          38.9065,
    lng:          -79.1797,
    state_abbr:   'WV',
    category:     'trans-lodging',
    tags:         ['lgbtq', 'hotel', 'mountain', 'retreat'],
    description:  "LGBTQ+-welcoming mountain inn · Lost River, WV",
    long_description: `Guesthouse Lost River is an 18-room inn, restaurant, and lounge tucked into the Lost River Valley of the West Virginia mountains, about 2 hours from Washington DC. A beloved LGBTQ+ mountain retreat for over 30 years. Lost River Pride (annual event) draws 500+ attendees.

**Status:** Open as of 2026 verification.
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019). Verify details before visiting.`,
    prominence:   'regional',
    website_url:  'https://www.guesthouselostriver.com',
  },

  // ── WYOMING ───────────────────────────────────────────────────────────────
  {
    source_id:    'orbitz-wy-matthew-shepard-bench',
    title:        'Matthew Shepard Memorial Bench',
    lat:          41.3132,
    lng:          -105.5656,
    state_abbr:   'WY',
    category:     'historical',
    tags:         ['lgbtq', 'memorial', 'history', 'hate-crime'],
    description:  "Memorial bench honoring Matthew Shepard · University of Wyoming, Laramie",
    long_description: `A memorial bench dedicated to Matthew Shepard, a University of Wyoming student who was murdered in a hate crime in 1998. Located at Quealy Plaza in front of the Arts and Sciences building on the UW campus.

The plaque reads: "Matthew Wayne Shepard Dec. 1, 1976 – Oct. 12, 1998. Beloved son, brother, and friend. He continues to make a difference. Peace be with him and all who sit here."

Dedicated September 27, 2008. This is the only public memorial to Matthew Shepard in Laramie.

**Location:** Quealy Plaza, College of Arts and Sciences, University of Wyoming, Laramie, WY
**Access:** Public — free to visit, on the UW campus
**Source:** Listed in Orbitz "Best LGBTQ hangouts in all 50 states" (April 2019).`,
    prominence:   'national',
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('DRY RUN — no database writes will occur.\n');

  // Look up category IDs
  const { data: cats, error: catErr } = await supabase
    .from('categories')
    .select('id, icon_slug');
  if (catErr) throw catErr;
  const catBySlug = Object.fromEntries(cats.map(c => [c.icon_slug, c.id]));

  const neededSlugs = [...new Set(VENUES.map(v => v.category))];
  for (const slug of neededSlugs) {
    if (!catBySlug[slug]) {
      console.error(`Category "${slug}" not found in database. Run migrations first.`);
      process.exit(1);
    }
  }

  let inserted = 0, skipped = 0, failed = 0;

  for (const venue of VENUES) {
    process.stdout.write(`  ${venue.title} (${venue.state_abbr})… `);

    // Geocode
    let lat, lng;
    if (venue.lat != null && venue.lng != null) {
      lat = venue.lat;
      lng = venue.lng;
    } else {
      await sleep(1100); // Nominatim rate limit: 1 req/sec
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
      title:          venue.title,
      description:    venue.description ?? null,
      long_description: venue.long_description ?? null,
      geom:           `SRID=4326;POINT(${lng} ${lat})`,
      category_id:    catBySlug[venue.category],
      tags:           venue.tags ?? [],
      street_address: venue.street_address ?? null,
      website_url:    venue.website_url ?? null,
      phone:          venue.phone ?? null,
      is_verified:    false,
      effect_scope:   'point',
      prominence:     venue.prominence ?? 'local',
      source:         'orbitz',
      source_id:      venue.source_id,
      source_date:    '2019-04-01',
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
