import 'dotenv/config';
import { callSerpApi } from '../src/config/serpApiClient.js';

/**
 * track-indexing.ts — for every posted report URL, check if Google has it
 * indexed (site: query via the shared SERP client), persist Yes/No to the
 * Social Media tab's `seoIndexed` column, and print posted-vs-indexed counts.
 *
 *   npx ts-node scripts/track-indexing.ts [--limit N] [--only-untracked] [--dry] [--selfcheck]
 */

const WEBAPP = 'https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec';

// host+path, lowercased, no scheme / query / trailing slash — the identity of a page
function normUrl(u: string): string {
  try {
    const { host, pathname } = new URL(u.trim());
    return (host + pathname).toLowerCase().replace(/\/+$/, '');
  } catch {
    return u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

function istDate(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

async function isIndexed(url: string): Promise<boolean> {
  const target = normUrl(url);
  const res = await callSerpApi({ q: `site:${target}`, num: '10' });
  return (res.organic_results ?? []).some((r: any) => normUrl(r.link || '') === target);
}

async function readSocial(): Promise<any[]> {
  const res = await fetch(`${WEBAPP}?action=social-media-read`);
  return res.json() as Promise<any[]>;
}

async function writeIndexed(targetUrl: string, value: string): Promise<void> {
  await fetch(WEBAPP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'social-media-update', targetUrl, updates: { seoIndexed: value } }),
  });
}

const isPosted = (r: any) =>
  ['X Status', 'FB Status', 'LinkedIn Status', 'Instagram Status', 'Thread status']
    .some((k) => String(r[k] ?? '').trim().toLowerCase() === 'posted');

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selfcheck')) return selfcheck();
  const dry = args.includes('--dry');
  const onlyUntracked = args.includes('--only-untracked');
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 ? parseInt(args[limIdx + 1], 10) : Infinity;

  const rows = await readSocial();
  const posted = rows.filter((r) => r.targetUrl && isPosted(r));

  // dedup by page identity, keep first occurrence
  const seen = new Set<string>();
  let targets = posted.filter((r) => {
    const k = normUrl(r.targetUrl);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (onlyUntracked) targets = targets.filter((r) => !String(r.seoIndexed ?? '').trim());
  targets = targets.slice(0, limit);

  const today = istDate();
  let indexed = 0, notIndexed = 0, failed = 0;
  const missing: string[] = [];

  console.log(`Posted URLs: ${seen.size}  |  checking: ${targets.length}${onlyUntracked ? ' (untracked only)' : ''}\n`);

  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    try {
      const ok = await isIndexed(r.targetUrl);
      if (ok) indexed++; else { notIndexed++; missing.push(r.targetUrl); }
      if (!dry) await writeIndexed(r.targetUrl, `${today}: ${ok ? 'Yes' : 'No'}`);
      console.log(`[${i + 1}/${targets.length}] ${ok ? '✅' : '❌'} ${r.targetUrl}`);
    } catch (e: any) {
      failed++;
      console.log(`[${i + 1}/${targets.length}] ⚠️  ${r.targetUrl} — ${e.message}`);
    }
    await new Promise((res) => setTimeout(res, 300));
  }

  const checked = indexed + notIndexed;
  const pct = checked ? Math.round((indexed / checked) * 100) : 0;
  console.log(`\n╔══ Page indexing — ${today} ══╗`);
  console.log(`   Posted (unique):  ${seen.size}`);
  console.log(`   Checked:          ${targets.length}`);
  console.log(`   Indexed:          ${indexed}`);
  console.log(`   Not indexed:      ${notIndexed}`);
  if (failed) console.log(`   Check failed:     ${failed}`);
  console.log(`   Indexed rate:     ${pct}%`);
  console.log(`╚${'═'.repeat(28)}╝`);
  if (missing.length) {
    console.log(`\nNot indexed (${missing.length}):`);
    missing.forEach((u) => console.log('  ' + u));
  }
}

function selfcheck() {
  const eq = (a: string, b: string) => { if (a !== b) throw new Error(`FAIL: ${a} !== ${b}`); };
  eq(normUrl('https://www.kenresearch.com/foo-market/'), 'www.kenresearch.com/foo-market');
  eq(normUrl('http://www.kenresearch.com/foo-market?utm=x'), 'www.kenresearch.com/foo-market');
  eq(normUrl('www.kenresearch.com/foo-market'), 'www.kenresearch.com/foo-market');
  // different path must not match
  if (normUrl('https://www.kenresearch.com/a') === normUrl('https://www.kenresearch.com/b'))
    throw new Error('FAIL: distinct paths matched');
  console.log('selfcheck OK');
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
