#!/usr/bin/env node
/**
 * Extracts phone numbers from long_description into the phone column
 * for POIs where phone is null but long_description contains **Phone:**
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

const { data: cats } = await sb.from('categories').select('id,map_visible');
const lawCatIds = new Set(cats.filter(c => !c.map_visible).map(c => c.id));

const phoneRegex = /\*\*Phone[:\*]*\s*([\(\d][\d\s\(\)\-\.]+)/;

// Paginate through all POIs with missing phone but non-null long_description
let pois = [], from = 0;
while (true) {
  const { data, error } = await sb.from('points_of_interest')
    .select('id,title,source,phone,long_description,category_id')
    .is('phone', null)
    .not('long_description', 'is', null)
    .not('category_id', 'is', null)
    .order('id')
    .range(from, from + 999);
  if (error) { console.error(error); process.exit(1); }
  pois = pois.concat(data ?? []);
  if ((data?.length ?? 0) < 1000) break;
  from += 1000;
}

const extractable = pois.filter(p => !lawCatIds.has(p.category_id) && phoneRegex.test(p.long_description));

console.log(`Found ${extractable.length} POIs with extractable phone numbers`);

let updated = 0, failed = 0;
for (const p of extractable) {
  const m = p.long_description.match(phoneRegex);
  const phone = m[1].trim();
  const { error } = await sb.from('points_of_interest').update({ phone }).eq('id', p.id);
  if (error) {
    console.error(`  FAIL [${p.id}] ${p.title}: ${error.message}`);
    failed++;
  } else {
    console.log(`  OK [${p.id}] ${p.title} (${p.source}) → ${phone}`);
    updated++;
  }
}

console.log(`\nDone. ${updated} updated, ${failed} failed.`);
