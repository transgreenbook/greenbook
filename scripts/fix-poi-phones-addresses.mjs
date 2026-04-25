#!/usr/bin/env node
/**
 * Applies phone numbers and addresses to POIs that were missing them.
 * Data sourced from web lookups (Yelp, venue websites, KOA, etc.)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function loadEnv(f) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('='); if (eq < 0) continue;
      const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim().replace(/\s+#.*$/, '');
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {}
}
loadEnv(path.resolve(ROOT, '.env.local'));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Updates: [id, {phone?, street_address?}]
// Only non-null values are applied; null means "leave unchanged" unless explicitly clearing
const UPDATES = [
  // ── Orbitz 2019 ──────────────────────────────────────────────────────────
  [75027, { phone: '(602) 265-0224' }],                                          // Charlie's, Phoenix AZ
  [75028, { phone: '(602) 244-9943' }],                                          // Cash Nightclub & Lounge, Phoenix AZ
  [75029, { phone: '(602) 254-0231' }],                                          // Karamba, Phoenix AZ
  [75030, { phone: '(855) 725-5720' }],                                          // Crescent Hotel & Spa, Eureka Springs AR
  [75031, { phone: '(203) 789-1915' }],                                          // 168 York Street Cafe, New Haven CT
  [75032, { phone: '(208) 345-4320' }],                                          // Flying M Coffeehouse, Boise ID
  [75034, { phone: '(812) 333-3123' }],                                          // The Back Door, Bloomington IN
  [75035, { phone: '(319) 338-7145' }],                                          // Studio 13, Iowa City IA
  [75036, { phone: '(319) 337-2681' }],                                          // Prairie Lights Books, Iowa City IA
  [75038, { phone: '(504) 519-9396' }],                                          // Oz New Orleans, LA
  [75039, { phone: '(207) 646-5101' }],                                          // MaineStreet Ogunquit, ME
  [75040, { phone: '(508) 487-2808' }],                                          // Spiritus Pizza, Provincetown MA
  [75041, { phone: '(410) 235-7887' }],                                          // Rocket to Venus, Baltimore MD
  [75044, { phone: '(228) 206-7717' }],                                          // Sipps Bar, Gulfport MS
  [75045, { phone: '(406) 926-1791' }],                                          // Plonk, Missoula MT
  [75046, { phone: '(402) 408-1020' }],                                          // Flixx Lounge & Cabaret, Omaha NE
  [75047, { phone: '(844) 600-7275' }],                                          // Park MGM / Dolby Live, Las Vegas NV
  [75048, { phone: '(732) 774-0100', street_address: '101 Asbury Ave, Asbury Park, NJ 07712' }], // Empress Hotel & Paradise Club
  [75049, { phone: '(505) 200-0663' }],                                          // Albuquerque Social Club, NM
  [75052, { phone: '(405) 528-2221' }],                                          // District Hotel OKC, OK
  [75053, { phone: '(215) 545-1893' }],                                          // Woody's Bar, Philadelphia PA
  [75054, { phone: '(215) 545-0900' }],                                          // Tavern on Camac, Philadelphia PA
  [75055, { phone: '(401) 272-6950' }],                                          // The Stable, Providence RI
  [75056, { phone: '(843) 577-6779' }],                                          // Dudley's on Ann, Charleston SC
  [75057, { phone: '(605) 274-0700', street_address: '214 W 10th St, Sioux Falls, SD 57104' }], // Club David
  [75058, { phone: '(512) 431-2133' }],                                          // Cheer Up Charlie's, Austin TX
  [75059, { phone: '(385) 528-0952' }],                                          // Metro Music Hall, Salt Lake City UT
  [75060, { phone: '(804) 355-9330', street_address: '3166 W Cary St, Richmond, VA 23221' }], // Babe's of Carytown
  [75061, { phone: '(206) 420-2958' }],                                          // Neighbours Nightclub, Seattle WA
  [75062, { phone: '(202) 328-0090' }],                                          // JR's Bar, Washington DC
  [75063, { phone: '(304) 897-5707', street_address: '288 Settlers Valley Way, Lost River, WV 26810' }], // Guesthouse Lost River

  // ── Orbitz 2021 ──────────────────────────────────────────────────────────
  [75067, { phone: '(212) 243-1928' }],                                          // Julius', New York NY
  [75072, { phone: '(561) 517-8180' }],                                          // H.G. Roosters, West Palm Beach FL
  [75073, { phone: '(212) 924-3347' }],                                          // Henrietta Hudson, New York NY

  // ── rvshare ──────────────────────────────────────────────────────────────
  [75000, { phone: '(805) 933-3200' }],                                          // Ventura Ranch KOA Holiday, CA

  // ── koa-blog-2023 ────────────────────────────────────────────────────────
  [75010, { phone: '(540) 896-8929' }],                                          // Harrisonburg / Shenandoah Valley KOA Holiday, VA
  [75011, { phone: '(575) 526-6555' }],                                          // Las Cruces KOA Journey, NM
  [75014, { phone: '(406) 549-0881' }],                                          // Missoula KOA Holiday, MT
  [75016, { phone: '(405) 391-5000' }],                                          // Oklahoma City East KOA Holiday, OK

  // ── newsisout-2023 ───────────────────────────────────────────────────────
  [75020, { phone: '(267) 639-3453' }],                                          // Winkel, Philadelphia PA
  [75021, { phone: '(215) 383-1200' }],                                          // Mission Taqueria, Philadelphia PA
  [75022, { phone: '(215) 608-8471' }],                                          // Darnel's Cakes (N 3rd St), Philadelphia PA
];

let updated = 0, failed = 0, skipped = 0;

for (const [id, fields] of UPDATES) {
  // Only include non-null values
  const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined));
  if (Object.keys(patch).length === 0) { skipped++; continue; }

  const { error } = await sb.from('points_of_interest').update(patch).eq('id', id);
  if (error) {
    console.error(`  FAIL [${id}]: ${error.message}`);
    failed++;
  } else {
    const desc = Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`  OK [${id}] ${desc}`);
    updated++;
  }
}

console.log(`\nDone. ${updated} updated, ${failed} failed, ${skipped} skipped.`);
