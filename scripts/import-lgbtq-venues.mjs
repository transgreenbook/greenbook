#!/usr/bin/env node
/**
 * import-lgbtq-venues.mjs
 *
 * Queries OpenStreetMap via the Overpass API for LGBTQ+ bars, nightclubs,
 * and drag venues across the US, then upserts them into the local Supabase DB.
 *
 * Matching strategy:
 *   - Nodes/ways tagged lgbtq=primary or lgbtq=yes or lgbtq=only
 *   - Combined with amenity=bar, amenity=nightclub, or amenity=pub
 *
 * Category: "Entertainment" (must already exist in the categories table)
 * Tags applied:
 *   - "nightclub" for amenity=nightclub
 *   - "bar" for amenity=bar or amenity=pub
 *   - "drag" if name contains "drag" (case-insensitive)
 *   - "lgbtq" always
 *
 * Run: node scripts/import-lgbtq-venues.mjs
 * Dry run (no DB writes): node scripts/import-lgbtq-venues.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

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
    const raw = trimmed.slice(eq + 1).trim();
    const val = raw.replace(/\s+#.*$/, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.resolve(__dirname, '../.env.local'));

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Overpass query
// ---------------------------------------------------------------------------

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

// Fetch all LGBTQ-tagged bars/nightclubs/pubs in the continental US bounding box.
// Bounding box (S,W,N,E): covers contiguous US + AK/HI approximation.
// Using bbox instead of area[] — more reliable on Overpass for large queries.
// We use `out center` on ways so we always get a single lat/lng point.
const BBOX = '18.0,-180.0,72.0,-60.0'; // covers contiguous US, Alaska, Hawaii
const QUERY = `
[out:json][timeout:120];
(
  node["lgbtq"~"^(yes|primary|only)$"]["amenity"~"^(bar|nightclub|pub)$"](${BBOX});
  way["lgbtq"~"^(yes|primary|only)$"]["amenity"~"^(bar|nightclub|pub)$"](${BBOX});
);
out center;
`;

async function fetchFromOverpass() {
  for (const url of OVERPASS_MIRRORS) {
    console.log(`Querying ${new URL(url).hostname} (this may take 30–60 seconds)…`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'TransSafeTravels/1.0 (zerosquaredio@gmail.com)',
        },
        body: `data=${encodeURIComponent(QUERY)}`,
      });
      if (res.ok) {
        const json = await res.json();
        return json.elements ?? [];
      }
      console.warn(`  ${url} returned ${res.status} — trying next mirror…`);
    } catch (err) {
      console.warn(`  ${url} failed (${err.message}) — trying next mirror…`);
    }
  }
  throw new Error('All Overpass mirrors failed');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Returns distance in metres between two lat/lng points (Haversine).
function distanceMetres(a, b) {
  const R = 6_371_000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// Deduplicate elements that share a name and are within threshold metres of
// each other — keeps the one with more OSM tags (more complete data).
// Elements with the same name but far apart are kept as separate venues.
function deduplicateElements(elements, thresholdMetres = 200) {
  const result = [];
  for (const el of elements) {
    const name = el.tags?.name;
    const coords = getLngLat(el);
    if (!name || !coords) { result.push(el); continue; }

    const nearby = result.find(existing => {
      if (existing.tags?.name !== name) return false;
      const ec = getLngLat(existing);
      return ec && distanceMetres(coords, ec) < thresholdMetres;
    });

    if (!nearby) {
      result.push(el);
    } else if (Object.keys(el.tags).length > Object.keys(nearby.tags).length) {
      // Replace with the richer entry
      result.splice(result.indexOf(nearby), 1, el);
    }
    // else discard this one as a duplicate
  }
  return result;
}

function getLngLat(element) {
  if (element.type === 'node') {
    return { lng: element.lon, lat: element.lat };
  }
  // way with out center
  if (element.center) {
    return { lng: element.center.lon, lat: element.center.lat };
  }
  return null;
}

function buildTags(tags) {
  const result = ['lgbtq'];
  const amenity = tags.amenity ?? '';
  if (amenity === 'nightclub') result.push('nightclub');
  if (amenity === 'bar' || amenity === 'pub') result.push('bar');
  const name = (tags.name ?? '').toLowerCase();
  if (name.includes('drag')) result.push('drag');
  return result;
}

function buildDescription(tags) {
  const parts = [];
  if (tags.amenity) parts.push(tags.amenity.charAt(0).toUpperCase() + tags.amenity.slice(1));
  if (tags['addr:city'] && tags['addr:state']) {
    parts.push(`${tags['addr:city']}, ${tags['addr:state']}`);
  } else if (tags['addr:city']) {
    parts.push(tags['addr:city']);
  }
  return parts.join(' · ') || null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('DRY RUN — no database writes will occur.\n');
  const runDate = new Date().toISOString().slice(0, 10);

  // Look up the Entertainment category ID
  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, name')
    .ilike('name', 'nightlife')
    .limit(1);
  if (catErr) throw catErr;
  if (!categories.length) {
    console.error('No "nightlife" category found in the database. Create it first.');
    process.exit(1);
  }
  const categoryId = categories[0].id;
  console.log(`Using category "${categories[0].name}" (id: ${categoryId})`);

  const raw = await fetchFromOverpass();
  console.log(`Overpass returned ${raw.length} element(s).`);
  const elements = deduplicateElements(raw);
  if (raw.length !== elements.length) {
    console.log(`  Deduplicated to ${elements.length} (removed ${raw.length - elements.length} near-duplicate(s)).`);
  }

  // Pre-load existing OSM source_ids so we can insert vs update separately
  // (source_date is set on insert only — use updated_at to see when records changed)
  const existingIds = new Set();
  if (!DRY_RUN) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('points_of_interest')
        .select('source_id')
        .eq('source', 'openstreetmap')
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      for (const r of (data ?? [])) existingIds.add(r.source_id);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    console.log(`  ${existingIds.size} existing OSM venue(s) in DB.`);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name;
    if (!name) { skipped++; continue; }

    const coords = getLngLat(el);
    if (!coords) { skipped++; continue; }

    const osmId = `osm-${el.type}-${el.id}`;

    const houseNum = tags['addr:housenumber'];
    const street   = tags['addr:street'];
    const city     = tags['addr:city'];
    const state    = tags['addr:state'];
    const streetAddress = [
      houseNum && street ? `${houseNum} ${street}` : street ?? null,
      city,
      state,
    ].filter(Boolean).join(', ') || null;

    const poi = {
      title:          name,
      description:    buildDescription(tags),
      geom:           `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
      category_id:    categoryId,
      tags:           buildTags(tags),
      street_address: streetAddress,
      website_url:    tags.website ?? tags['contact:website'] ?? null,
      phone:          tags.phone ?? tags['contact:phone'] ?? null,
      is_verified:    true,
      effect_scope:   'point',
      prominence:     'local',
      source:         'openstreetmap',
      source_id:      osmId,
    };

    if (DRY_RUN) {
      console.log(`  [dry] ${poi.title} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) — ${poi.tags.join(', ')}`);
      inserted++;
      continue;
    }

    const isNew = !existingIds.has(osmId);

    if (isNew) {
      const { error } = await supabase
        .from('points_of_interest')
        .insert({ ...poi, source_date: runDate });
      if (error) {
        console.warn(`  Insert failed: ${name} — ${error.message}`);
        failed++;
      } else {
        existingIds.add(osmId);
        inserted++;
      }
    } else {
      const { error } = await supabase
        .from('points_of_interest')
        .update(poi)
        .eq('source', 'openstreetmap')
        .eq('source_id', osmId);
      if (error) {
        console.warn(`  Update failed: ${name} — ${error.message}`);
        failed++;
      } else {
        updated++;
      }
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} updated, ${skipped} skipped (no name/coords), ${failed} failed.`);
}

main().catch(err => {
  console.error('Import failed:', err?.message ?? err);
  process.exit(1);
});
