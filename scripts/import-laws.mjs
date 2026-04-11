#!/usr/bin/env node
/**
 * import-laws.mjs
 *
 * Imports anti-trans (and affirming) laws from data/anti-trans-laws.json
 * into points_of_interest as region-scoped POIs.
 *
 * Severity is computed from data/severity-rules.json using each law's
 * category + penalty_type + enforcement fields. Edit severity-rules.json
 * and re-run this script to update all POIs in bulk.
 *
 * An explicit "severity" field in anti-trans-laws.json overrides the rules.
 *
 * Run:
 *   node scripts/import-laws.mjs           # upsert all laws
 *   node scripts/import-laws.mjs --dry-run # preview without writing
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

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

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE  = 'law_manual';

// ---------------------------------------------------------------------------
// Severity computation from rules file
// ---------------------------------------------------------------------------

const rules = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'data/severity-rules.json'), 'utf8'));

function computeSeverity(law) {
  // Explicit override always wins
  if (typeof law.severity === 'number') return law.severity;

  const categoryRules = rules.law_severity?.[law.category];
  if (!categoryRules) {
    throw new Error(`No severity rules for category "${law.category}" (source_id: ${law.source_id}). Add to severity-rules.json or set explicit "severity".`);
  }

  const base = categoryRules[law.penalty_type];
  if (base === undefined) {
    throw new Error(`No severity rule for category "${law.category}" / penalty_type "${law.penalty_type}" (source_id: ${law.source_id}). Add to severity-rules.json or set explicit "severity".`);
  }

  const modifier = rules.enforcement_modifier?.[law.enforcement] ?? 0;
  return Math.max(-10, Math.min(10, base + modifier));
}

function computeVisibleEnd(law) {
  if (law.visible_end) return law.visible_end;
  const expiryDays = rules.expiry_days?.[law.category];
  if (!expiryDays || !law.enacted_date) return null;
  const d = new Date(law.enacted_date);
  d.setDate(d.getDate() + expiryDays);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Centroid lookups
// ---------------------------------------------------------------------------

function loadCentroids() {
  function readGeo(file) {
    return JSON.parse(fs.readFileSync(path.resolve(ROOT, 'public', file), 'utf8'));
  }

  const stateMap = new Map();
  for (const f of readGeo('state-centroids.geojson').features) {
    stateMap.set(f.properties.STUSPS, {
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    });
  }

  const countyMap = new Map();
  for (const f of readGeo('county-centroids.geojson').features) {
    countyMap.set(f.properties.STATEFP + f.properties.COUNTYFP, {
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    });
  }

  const cityMap = new Map();
  for (const f of readGeo('city-centroids.geojson').features) {
    const key = `${f.properties.NAME.toLowerCase()}:${f.properties.STATEFP}`;
    cityMap.set(key, {
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    });
  }

  return { stateMap, countyMap, cityMap };
}

// ---------------------------------------------------------------------------
// Category lookup
// ---------------------------------------------------------------------------

async function loadCategories() {
  const { data, error } = await supabase.from('categories').select('id, icon_slug');
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  const map = new Map();
  for (const c of data ?? []) map.set(c.icon_slug, c.id);
  return map;
}

// ---------------------------------------------------------------------------
// Resolve coordinates for a law entry
// ---------------------------------------------------------------------------

function resolveCoords(law, stateMap, countyMap, cityMap) {
  if (law.scope === 'state') {
    const c = stateMap.get(law.state_abbr);
    if (!c) throw new Error(`Unknown state_abbr: ${law.state_abbr}`);
    return c;
  }
  if (law.scope === 'county') {
    if (!law.county_fips) throw new Error(`county_fips required for county scope`);
    const c = countyMap.get(law.county_fips);
    if (!c) throw new Error(`Unknown county_fips: ${law.county_fips}`);
    return c;
  }
  if (law.scope === 'city') {
    if (!law.city_name || !law.statefp) throw new Error(`city_name + statefp required for city scope`);
    const key = `${law.city_name.toLowerCase()}:${law.statefp}`;
    const c = cityMap.get(key);
    if (!c) throw new Error(`Unknown city: "${law.city_name}" statefp=${law.statefp}`);
    return c;
  }
  throw new Error(`Unknown scope "${law.scope}"`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made.\n');

  const laws = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'data/anti-trans-laws.json'), 'utf8'));
  console.log(`Loaded ${laws.length} law(s) from data/anti-trans-laws.json`);

  const { stateMap, countyMap, cityMap } = loadCentroids();
  const categoryMap = await loadCategories();

  const { data: existing } = await supabase
    .from('points_of_interest')
    .select('id, source_id')
    .eq('source', SOURCE);
  const existingMap = new Map((existing ?? []).map((r) => [r.source_id, r.id]));
  console.log(`${existingMap.size} existing law POI(s) in DB.\n`);

  const counters = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  for (const law of laws) {
    let coords, severity;
    try {
      coords   = resolveCoords(law, stateMap, countyMap, cityMap);
      severity = computeSeverity(law);
    } catch (err) {
      console.warn(`  SKIP ${law.source_id}: ${err.message}`);
      counters.skipped++;
      continue;
    }

    const categoryId = categoryMap.get(law.category);
    if (!categoryId) {
      console.warn(`  SKIP ${law.source_id}: unknown category "${law.category}" — run the safety-incident migration first`);
      counters.skipped++;
      continue;
    }

    const visibleEnd = computeVisibleEnd(law);

    const record = {
      title:             law.title,
      description:       law.description ?? null,
      long_description:  law.long_description ?? null,
      geom:              `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
      tags:              law.tags ?? [],
      severity,
      is_verified:       law.is_verified ?? true,
      effect_scope:      law.scope,
      category_id:       categoryId,
      is_user_submitted: false,
      source:            SOURCE,
      source_id:         law.source_id,
      visible_end:       visibleEnd ?? null,
      attributes: {
        enacted_date:  law.enacted_date  ?? null,
        penalty_type:  law.penalty_type  ?? null,
        enforcement:   law.enforcement   ?? null,
        source_url:    law.source_url    ?? null,
        // Scope identifiers — used by pois_in_state/county/city to match
        // without requiring the states/counties/cities SQL tables to be populated.
        state_abbr:    law.scope === 'state'  ? (law.state_abbr ?? null) : null,
        county_fips:   law.scope === 'county' ? (law.county_fips ?? null) : null,
        city_name:     law.scope === 'city'   ? (law.city_name ?? null) : null,
        statefp:       law.scope === 'city'   ? (law.statefp ?? null) : null,
      },
    };

    if (DRY_RUN) {
      const action = existingMap.has(law.source_id) ? 'UPDATE' : 'INSERT';
      console.log(`  [dry] ${action} ${law.source_id}`);
      console.log(`        title="${law.title}"`);
      console.log(`        scope=${law.scope}  severity=${severity}  visible_end=${visibleEnd ?? 'never'}`);
      console.log(`        coords=(${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
      continue;
    }

    const existingId = existingMap.get(law.source_id);
    if (existingId) {
      const { error } = await supabase.from('points_of_interest').update(record).eq('id', existingId);
      if (error) {
        console.warn(`  FAIL update ${law.source_id}: ${error.message}`);
        counters.failed++;
      } else {
        console.log(`  updated ${law.source_id}  severity=${severity}`);
        counters.updated++;
      }
    } else {
      const { error } = await supabase.from('points_of_interest').insert(record);
      if (error) {
        console.warn(`  FAIL insert ${law.source_id}: ${error.message}`);
        counters.failed++;
      } else {
        console.log(`  inserted ${law.source_id}  severity=${severity}`);
        counters.inserted++;
      }
    }
  }

  console.log(`\nDone. inserted=${counters.inserted}  updated=${counters.updated}  skipped=${counters.skipped}  failed=${counters.failed}`);
}

main().catch((err) => {
  console.error('Import failed:', err?.message ?? err);
  process.exit(1);
});
