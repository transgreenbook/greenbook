#!/usr/bin/env node
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

const { data: cats } = await sb.from('categories').select('id,name,icon_slug,map_visible');
const lawCatIds = new Set(cats.filter(c => !c.map_visible).map(c => c.id));

// Paginate to fetch all rows (Supabase default limit is 1000)
const PAGE = 1000;
let pois = [], from = 0;
while (true) {
  const { data, error } = await sb
    .from('points_of_interest')
    .select('id,title,phone,street_address,long_description,source,source_id,category_id,website_url')
    .not('category_id', 'is', null)
    .order('id')
    .range(from, from + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  pois = pois.concat(data ?? []);
  if ((data?.length ?? 0) < PAGE) break;
  from += PAGE;
}

const relevant = pois.filter(p => !lawCatIds.has(p.category_id));

// ── Orbitz POIs specifically ───────────────────────────────────────────────
const orbitz = relevant.filter(p => p.source === 'orbitz');
console.log(`\n=== Orbitz POIs (${orbitz.length} total) ===`);

// Phone in desc but not in phone field
const phoneRegex = /\*\*Phone[:\*]*\s*([\(\d][\d\s\(\)\-\.]+)/;
const addrRegex  = /\*\*Address[:\*]*\s*(.+)/;

const orbitzMissingPhone = orbitz.filter(p => !p.phone);
const orbitzHasPhoneInDesc = orbitzMissingPhone.filter(p => p.long_description && phoneRegex.test(p.long_description));
const orbitzMissingAddr = orbitz.filter(p => !p.street_address);
const orbitzHasAddrInDesc = orbitzMissingAddr.filter(p => p.long_description && addrRegex.test(p.long_description));

console.log(`Missing phone: ${orbitzMissingPhone.length}  (has in long_desc: ${orbitzHasPhoneInDesc.length})`);
console.log(`Missing street_address: ${orbitzMissingAddr.length}  (has in long_desc: ${orbitzHasAddrInDesc.length})`);

if (orbitzHasPhoneInDesc.length) {
  console.log('\nPhone extractable:');
  orbitzHasPhoneInDesc.forEach(p => {
    const m = p.long_description.match(phoneRegex);
    console.log(` [${p.id}] ${p.title} -> "${m?.[1]?.trim()}"`);
  });
}
if (orbitzHasAddrInDesc.length) {
  console.log('\nAddress extractable:');
  orbitzHasAddrInDesc.forEach(p => {
    const m = p.long_description.match(addrRegex);
    console.log(` [${p.id}] ${p.title} -> "${m?.[1]?.trim()}"`);
  });
}

// Orbitz POIs missing BOTH address and phone, nothing in desc
const orbitzNeedsLookup = orbitz.filter(p => {
  const needsPhone = !p.phone && !(p.long_description && phoneRegex.test(p.long_description));
  const needsAddr  = !p.street_address && !(p.long_description && addrRegex.test(p.long_description));
  return needsPhone || needsAddr;
});
if (orbitzNeedsLookup.length) {
  console.log('\nOrbitz POIs needing web lookup:');
  orbitzNeedsLookup.forEach(p => {
    const flags = [!p.phone ? 'phone' : '', !p.street_address ? 'addr' : ''].filter(Boolean).join('+');
    console.log(` [${p.id}] ${p.title} (missing: ${flags}) source_id: ${p.source_id}`);
  });
}

// ── Older source:null POIs ─────────────────────────────────────────────────
const older = relevant.filter(p => p.source !== 'orbitz');
console.log(`\n=== Older / non-Orbitz POIs (${older.length} total) ===`);
const olderMissingAddr = older.filter(p => !p.street_address);
const olderHasAddrInDesc = olderMissingAddr.filter(p => p.long_description && addrRegex.test(p.long_description));
const olderMissingPhone = older.filter(p => !p.phone);
const olderHasPhoneInDesc = olderMissingPhone.filter(p => p.long_description && phoneRegex.test(p.long_description));

console.log(`Missing phone: ${olderMissingPhone.length}  (has in long_desc: ${olderHasPhoneInDesc.length})`);
console.log(`Missing street_address: ${olderMissingAddr.length}  (has in long_desc: ${olderHasAddrInDesc.length})`);

const sources = {};
older.forEach(p => { sources[p.source ?? 'null'] = (sources[p.source ?? 'null'] || 0) + 1; });
console.log('By source:', sources);
