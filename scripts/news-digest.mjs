#!/usr/bin/env node
/**
 * news-digest.mjs
 *
 * Daily news monitoring digest for TransSafeTravels.
 *
 * For each active news source, fetches RSS articles, deduplicates against
 * previously seen URLs, then asks Claude to analyze them against existing
 * POI/severity data and active watch items. Findings are stored in the DB
 * and emailed as a formatted HTML digest.
 *
 * Required env vars (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *   DIGEST_GMAIL_USER         — Gmail address to send from
 *   DIGEST_GMAIL_APP_PASSWORD — Gmail App Password (not your account password)
 *   DIGEST_TO_EMAIL           — recipient (defaults to DIGEST_GMAIL_USER)
 *
 * Run:
 *   node scripts/news-digest.mjs
 *   node scripts/news-digest.mjs --dry-run          # fetch + analyze, skip email + DB writes
 *   node scripts/news-digest.mjs --dry-run --debug  # also print Claude's raw JSON response
 */

import { createClient }  from '@supabase/supabase-js';
import Anthropic         from '@anthropic-ai/sdk';
import nodemailer        from 'nodemailer';
import { XMLParser }     from 'fast-xml-parser';
import fs                from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Config
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

const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG   = process.argv.includes('--debug');

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY,
  DIGEST_GMAIL_USER,
  DIGEST_GMAIL_APP_PASSWORD,
  DIGEST_TO_EMAIL,
} = process.env;

const TO_EMAIL = DIGEST_TO_EMAIL ?? DIGEST_GMAIL_USER ?? 'transsafetravels@gmail.com';

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}
if ((!DIGEST_GMAIL_USER || !DIGEST_GMAIL_APP_PASSWORD) && !DRY_RUN) {
  console.error('Missing DIGEST_GMAIL_USER or DIGEST_GMAIL_APP_PASSWORD (use --dry-run to skip email)');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const supabase  = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const mailer    = (DIGEST_GMAIL_USER && DIGEST_GMAIL_APP_PASSWORD)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: DIGEST_GMAIL_USER, pass: DIGEST_GMAIL_APP_PASSWORD },
    })
  : null;
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// ---------------------------------------------------------------------------
// RSS fetching
// ---------------------------------------------------------------------------

async function fetchFeed(source) {
  const resp = await fetch(source.feed_url, {
    headers: { 'User-Agent': 'TransSafeTravels-Digest/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${source.feed_url}`);
  const xml  = await resp.text();
  const doc  = xmlParser.parse(xml);

  // Handle both RSS 2.0 and Atom
  const channel = doc?.rss?.channel ?? doc?.feed;
  if (!channel) throw new Error('Unrecognized feed format');

  const rawItems = channel.item ?? channel.entry ?? [];
  const items    = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.map((item) => ({
    title:       item.title       ?? item['title']?.['#text'] ?? '(no title)',
    url:         item.link        ?? item['link']?.['@_href'] ?? '',
    description: stripHtml(item.description ?? item.summary ?? item.content ?? ''),
    published:   item.pubDate     ?? item.published ?? item.updated ?? null,
    source_id:   source.id,
    source_name: source.name,
  })).filter((a) => a.url);
}

function stripHtml(str) {
  return String(str).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

// ---------------------------------------------------------------------------
// DB context helpers
// ---------------------------------------------------------------------------

async function pruneAndGetSeenUrls() {
  // Delete expired rows first
  await supabase
    .from('seen_articles')
    .delete()
    .lt('expires_at', new Date().toISOString());

  const { data } = await supabase
    .from('seen_articles')
    .select('article_url');
  return new Set((data ?? []).map((r) => r.article_url));
}

async function markArticlesSeen(articles) {
  if (!articles.length) return;
  const rows = articles.map((a) => ({
    article_url:  a.url,
    source_id:    a.source_id ?? null,
    first_seen_at: new Date().toISOString(),
    expires_at:   new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  }));
  // Upsert — safe to call even if URL already exists
  await supabase.from('seen_articles').upsert(rows, { onConflict: 'article_url', ignoreDuplicates: true });
}

async function getDBContext() {
  const [poisRes, watchRes] = await Promise.all([
    supabase
      .from('points_of_interest')
      .select('id, title, severity, scope, state_abbr, county_name, city_name, description')
      .not('severity', 'is', null)
      .order('severity', { ascending: true })
      .limit(100),
    supabase
      .from('watch_items')
      .select('id, item_type, title, description, jurisdiction_type, status, next_check_date, severity_impact')
      .eq('status', 'monitoring')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return {
    pois:       poisRes.data  ?? [],
    watchItems: watchRes.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Claude analysis
// ---------------------------------------------------------------------------

const SEVERITY_SCALE = `
Severity scale: -10 (confirmed recent hate violence) to +10 (model sanctuary jurisdiction).
Key thresholds:
  -9: criminal law with active enforcement, or area with multiple documented incidents
  -8: criminal law with credible enforcement history
  -6: civil penalties with real teeth
  -4: discriminatory policy without meaningful penalty
  -2: public officials actively making anti-trans statements
   0: neutral
  +2: non-discrimination protections in place
  +8: sanctuary/shield laws
`.trim();

async function analyzeWithClaude(articles, context) {
  const articlesText = articles.map((a, i) =>
    `[${i}] SOURCE: ${a.source_name}\nTITLE: ${a.title}\nURL: ${a.url}\nSNIPPET: ${a.description}\nDATE: ${a.published ?? 'unknown'}`
  ).join('\n\n');

  const highSeverityPois = context.pois
    .filter((p) => (p.severity ?? 0) <= -4)
    .map((p) => `${p.state_abbr ?? ''} ${p.county_name ?? ''} ${p.city_name ?? ''} — "${p.title}" (severity ${p.severity})`.trim())
    .join('\n');

  const watchItemsText = context.watchItems.length > 0
    ? context.watchItems.map((w) =>
        `[watch:${w.id}] ${w.jurisdiction_type.toUpperCase()} | ${w.item_type} | "${w.title}" (${w.status})${w.next_check_date ? ` — check by ${w.next_check_date}` : ''}`
      ).join('\n')
    : '(none)';

  const systemPrompt = `You are a monitoring assistant for TransSafeTravels, a safety resource for transgender travelers in the US.

${SEVERITY_SCALE}

Your job: analyze news articles and flag anything that could be relevant to trans safety and travel. Err on the side of inclusion — the human reviewer will dismiss things that aren't actionable. It is better to surface too much than to miss something important.

Flag articles that relate to:
1. Anti-trans or pro-trans legislation (passed, pending, or struck down) at any level
2. Court rulings or lawsuits affecting trans rights
3. Executive orders, federal regulations, or agency policy changes
4. Physical safety incidents targeting trans people
5. Statements or actions by officials that signal a changing climate in a jurisdiction
6. Shield laws, sanctuary designations, or other protective measures

Use "low" relevance liberally — if an article is about trans people and policy or safety, include it.
Only use "skip" for articles that are clearly unrelated (entertainment, sports, etc. with no policy angle).
Federal items may not affect the map directly but are important to track.

Respond ONLY with valid JSON — no commentary, no markdown fences.`;

  const userPrompt = `## High-severity regions currently tracked
${highSeverityPois || '(none yet)'}

## Active watch items
${watchItemsText}

## New articles to analyze (${articles.length} total)
${articlesText}

Respond with this JSON structure:
{
  "digest_summary": "2-3 sentence overview of today's news batch",
  "findings": [
    {
      "article_index": <number>,
      "relevance": "high|medium|low|skip",
      "jurisdiction_type": "federal|state|county|city|reservation|territory",
      "jurisdiction_name": "<state name, county, city, or 'Federal'>",
      "state_abbr": "<2-letter abbr or null>",
      "summary": "<1-2 sentence summary of what happened and why it matters>",
      "suggested_action": "<what the reviewer should consider doing>",
      "severity_delta": <integer or null — suggested change to existing severity>,
      "confidence": <0.0 to 1.0>,
      "updates_watch_item_id": <watch item id or null>,
      "new_watch_item": null | {
        "item_type": "bill|lawsuit|executive_order|regulation|policy|event",
        "title": "<short title>",
        "description": "<what it is and why we're watching it>",
        "next_check_date": "<YYYY-MM-DD or null>"
      }
    }
  ]
}

Only include findings with relevance "high", "medium", or "low" — omit "skip" entries entirely.`;

  const message = await anthropic.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 4096,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const raw     = message.content[0]?.text ?? '{}';
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  if (DEBUG) console.log('\n[DEBUG] Claude raw response:\n', cleaned.slice(0, 2000));
  try {
    return JSON.parse(cleaned);
  } catch {
    console.error('Claude returned non-JSON:', cleaned.slice(0, 500));
    return { digest_summary: 'Parse error — see logs.', findings: [] };
  }
}

// ---------------------------------------------------------------------------
// Email formatting
// ---------------------------------------------------------------------------

function severityBadge(delta) {
  if (!delta) return '';
  const color = delta < 0 ? '#dc2626' : '#16a34a';
  const sign  = delta > 0 ? '+' : '';
  return `<span style="display:inline-block;padding:1px 6px;border-radius:9999px;background:${color};color:#fff;font-size:11px;font-weight:600;margin-left:6px">${sign}${delta}</span>`;
}

function confidencePct(c) {
  return `${Math.round((c ?? 0) * 100)}%`;
}

function relevanceColor(r) {
  return r === 'high' ? '#dc2626' : r === 'medium' ? '#d97706' : '#6b7280';
}

function buildEmailHtml(analysis, articles, runDate) {
  const { digest_summary, findings = [] } = analysis;

  const high   = findings.filter((f) => f.relevance === 'high');
  const medium = findings.filter((f) => f.relevance === 'medium');
  const low    = findings.filter((f) => f.relevance === 'low');
  const federal = findings.filter((f) => f.jurisdiction_type === 'federal');

  function renderFinding(f) {
    const article = articles[f.article_index] ?? {};
    return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:12px;background:#fff">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${relevanceColor(f.relevance)};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;white-space:nowrap">${f.relevance}</span>
          <div>
            <a href="${article.url ?? '#'}" style="color:#1d4ed8;font-weight:600;text-decoration:none;font-size:14px">${article.title ?? '(no title)'}</a>
            ${severityBadge(f.severity_delta)}
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${f.jurisdiction_name ?? ''} · ${article.source_name ?? ''} · confidence ${confidencePct(f.confidence)}</div>
          </div>
        </div>
        <p style="margin:0 0 6px;font-size:13px;color:#374151">${f.summary ?? ''}</p>
        <p style="margin:0;font-size:13px;color:#4b5563"><strong>Action:</strong> ${f.suggested_action ?? ''}</p>
        ${f.new_watch_item ? `<p style="margin:6px 0 0;font-size:12px;color:#7c3aed"><strong>Suggested watch item:</strong> ${f.new_watch_item.title}</p>` : ''}
        ${f.updates_watch_item_id ? `<p style="margin:6px 0 0;font-size:12px;color:#0369a1"><strong>Updates watch item #${f.updates_watch_item_id}</strong></p>` : ''}
      </div>`;
  }

  function renderSection(title, items, color) {
    if (!items.length) return '';
    return `
      <h2 style="font-size:16px;font-weight:700;color:${color};margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid ${color}">${title} (${items.length})</h2>
      ${items.map(renderFinding).join('')}`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>TransSafeTravels Digest — ${runDate}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f9fafb;color:#111827">
  <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)">

    <div style="border-bottom:2px solid #7c3aed;padding-bottom:16px;margin-bottom:20px">
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#7c3aed">TransSafeTravels</h1>
      <div style="font-size:13px;color:#6b7280">Daily News Digest · ${runDate}</div>
    </div>

    <div style="background:#f3f4f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:14px;color:#374151;line-height:1.5">
      ${digest_summary ?? 'No summary available.'}
    </div>

    <div style="font-size:13px;color:#6b7280;margin-bottom:20px">
      ${articles.length} articles scanned · ${findings.length} flagged
      (${high.length} high · ${medium.length} medium · ${low.length} low)
      · ${federal.length} federal
    </div>

    ${renderSection('🔴 High Priority', high, '#dc2626')}
    ${renderSection('🟡 Medium Priority', medium, '#d97706')}
    ${renderSection('⚪ Low Priority / FYI', low, '#6b7280')}
    ${federal.length ? renderSection('🏛️ Federal', federal.filter(f => f.relevance !== 'high' && f.relevance !== 'medium'), '#4f46e5') : ''}

    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
      Generated by TransSafeTravels news-digest.mjs · For review only — no changes have been applied automatically.
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const runDate = new Date().toISOString().slice(0, 10);
  console.log(`\nTransSafeTravels News Digest — ${runDate}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  // 1. Create digest_run record
  let runId = null;
  if (!DRY_RUN) {
    const { data: run, error } = await supabase
      .from('digest_runs')
      .insert({ run_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error) { console.error('Failed to create digest_run:', error.message); process.exit(1); }
    runId = run.id;
    console.log(`digest_run id=${runId}`);
  }

  // 2. Fetch active sources
  const { data: sources, error: srcErr } = await supabase
    .from('news_sources')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (srcErr) { console.error('Failed to load news_sources:', srcErr.message); process.exit(1); }
  console.log(`Fetching ${sources.length} sources…`);

  // 3. Fetch + deduplicate articles
  const seenUrls    = await pruneAndGetSeenUrls();
  const allArticles = [];
  const sourceStats = {};

  for (const source of sources) {
    try {
      const articles = await fetchFeed(source);
      const fresh    = articles.filter((a) => !seenUrls.has(a.url));
      allArticles.push(...fresh);
      sourceStats[source.id] = { fetched: articles.length, fresh: fresh.length };
      console.log(`  ${source.name}: ${articles.length} total, ${fresh.length} new`);

      if (!DRY_RUN) {
        await supabase.from('news_sources').update({
          last_fetched_at: new Date().toISOString(),
          fetch_count:     (source.fetch_count ?? 0) + 1,
          article_count:   (source.article_count ?? 0) + articles.length,
          updated_at:      new Date().toISOString(),
        }).eq('id', source.id);
      }
    } catch (err) {
      console.warn(`  WARN: ${source.name} — ${err.message}`);
    }
  }

  console.log(`\n${allArticles.length} new articles total`);

  // Mark all fetched articles as seen now, before analysis.
  // This ensures skipped articles aren't re-analyzed on future runs.
  if (!DRY_RUN) await markArticlesSeen(allArticles);

  if (allArticles.length === 0) {
    console.log('Nothing new — skipping analysis and email.');
    if (!DRY_RUN && runId) {
      await supabase.from('digest_runs').update({
        articles_fetched: 0,
        findings_count:   0,
        attributes:       { note: 'no new articles' },
      }).eq('id', runId);
    }
    return;
  }

  // 4. Load DB context
  console.log('\nLoading DB context…');
  const context = await getDBContext();
  console.log(`  ${context.pois.length} POIs, ${context.watchItems.length} active watch items`);

  // 5. Analyze with Claude (batch to keep prompts manageable)
  const BATCH_SIZE = 25;
  const allFindings = [];
  let digestSummary = '';

  for (let i = 0; i < allArticles.length; i += BATCH_SIZE) {
    const batch     = allArticles.slice(i, i + BATCH_SIZE);
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allArticles.length / BATCH_SIZE);
    console.log(`\nAnalyzing batch ${batchNum}/${totalBatches} (${batch.length} articles)…`);

    const analysis = await analyzeWithClaude(batch, context);

    // Re-map article_index to global index
    for (const f of (analysis.findings ?? [])) {
      allFindings.push({ ...f, _article: batch[f.article_index], _batch_offset: i });
    }
    if (!digestSummary && analysis.digest_summary) {
      digestSummary = analysis.digest_summary;
    }
  }

  console.log(`\n${allFindings.length} findings flagged`);

  // 6. Store findings in DB
  if (!DRY_RUN && runId && allFindings.length > 0) {
    const rows = allFindings.map((f) => ({
      digest_run_id:    runId,
      watch_item_id:    f.updates_watch_item_id ?? null,
      source_id:        f._article?.source_id ?? null,
      article_url:      f._article?.url ?? '',
      article_title:    f._article?.title ?? null,
      article_date:     f._article?.published ? new Date(f._article.published).toISOString() : null,
      summary:          f.summary ?? null,
      suggested_action: f.suggested_action ?? null,
      confidence:       f.confidence ?? null,
      jurisdiction_type: f.jurisdiction_type ?? null,
      severity_delta:   f.severity_delta ?? null,
    }));

    const { error: findingsErr } = await supabase.from('digest_findings').insert(rows);
    if (findingsErr) console.warn('Failed to store findings:', findingsErr.message);
  }

  // 7. Create new watch items suggested by Claude
  if (!DRY_RUN && allFindings.length > 0) {
    for (const f of allFindings) {
      if (!f.new_watch_item) continue;
      const { error } = await supabase.from('watch_items').insert({
        item_type:         f.new_watch_item.item_type,
        title:             f.new_watch_item.title,
        description:       f.new_watch_item.description,
        jurisdiction_type: f.jurisdiction_type ?? 'federal',
        status:            'monitoring',
        next_check_date:   f.new_watch_item.next_check_date ?? null,
        source_url:        f._article?.url ?? null,
        source_name:       f._article?.source_name ?? null,
        severity_impact:   f.suggested_action ?? null,
        attributes:        { auto_created: true, confidence: f.confidence },
      });
      if (error) console.warn('Failed to create watch item:', error.message);
      else console.log(`  Created watch item: "${f.new_watch_item.title}"`);
    }
  }

  // 8. Update digest_run totals
  if (!DRY_RUN && runId) {
    await supabase.from('digest_runs').update({
      articles_fetched: allArticles.length,
      findings_count:   allFindings.length,
      attributes:       { digest_summary: digestSummary, source_stats: sourceStats },
    }).eq('id', runId);
  }

  // 9. Build and send email
  const combinedAnalysis = {
    digest_summary: digestSummary,
    findings:       allFindings.map((f, i) => ({ ...f, article_index: i })),
  };
  const emailHtml = buildEmailHtml(combinedAnalysis, allFindings.map((f) => f._article), runDate);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Email HTML written to /tmp/digest-preview.html');
    fs.writeFileSync('/tmp/digest-preview.html', emailHtml);
  } else if (mailer) {
    try {
      const info = await mailer.sendMail({
        from:    DIGEST_GMAIL_USER,
        to:      TO_EMAIL,
        subject: `TransSafeTravels Digest — ${runDate} (${allFindings.length} findings)`,
        html:    emailHtml,
      });
      console.log(`\nEmail sent (messageId=${info.messageId}) to ${TO_EMAIL}`);
      await supabase.from('digest_runs').update({
        email_sent_at: new Date().toISOString(),
      }).eq('id', runId);
    } catch (err) {
      console.error('Failed to send email:', err.message);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
