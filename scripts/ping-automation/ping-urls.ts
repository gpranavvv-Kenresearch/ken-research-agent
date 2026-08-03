import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { saveArtifacts } from '../base.js';

/**
 * ping-urls.ts — submits report targetUrls from the Social Media sheet to
 * public search-engine ping tools (prepostseo bulk, duplichecker single).
 *
 *   npx tsx scripts/ping-automation/ping-urls.ts [--limit N] [--dry] [--selfcheck]
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP = 'https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec';
const LEDGER_PATH = path.join(__dirname, 'pinged_urls.json');

type Ledger = Record<string, { prepostseo: string | null; duplichecker: string | null }>;

function normUrl(u: string): string {
  try {
    const { host, pathname } = new URL(u.trim());
    return (host + pathname).toLowerCase().replace(/\/+$/, '');
  } catch {
    return u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function loadLedger(): Ledger {
  if (!fs.existsSync(LEDGER_PATH)) return {};
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
}

function saveLedger(ledger: Ledger) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

async function fetchSheetRows(): Promise<any[]> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${WEBAPP}?action=social-media-read`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      console.log(`  ⚠️  sheet fetch returned non-JSON (attempt ${attempt}/4), retrying...`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error('Sheet webapp kept returning non-JSON after 4 attempts');
}

async function readTargetUrls(): Promise<string[]> {
  const rows = await fetchSheetRows();
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const r of rows) {
    if (!r.targetUrl) continue;
    const k = normUrl(r.targetUrl);
    if (seen.has(k)) continue;
    seen.add(k);
    urls.push(String(r.targetUrl).trim());
  }
  return urls;
}

async function withRetry(step: () => Promise<void>, page: import('playwright').Page, label: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await step();
      return true;
    } catch (e: any) {
      console.log(`  ⚠️  ${label} attempt ${attempt} failed: ${e.message}`);
      if (attempt === 1) {
        await page.reload().catch(() => {});
        await page.waitForTimeout(1000);
      } else {
        await saveArtifacts(page, label, e);
      }
    }
  }
  return false;
}

async function pingPrepostseo(page: import('playwright').Page, urls: string[]): Promise<boolean> {
  return withRetry(async () => {
    await page.goto('https://www.prepostseo.com/ping-multiple-urls-online', { waitUntil: 'domcontentloaded' });
    await page.locator('#cat').selectOption({ label: 'Marketing' });
    await page.locator('#urls').fill(urls.join('\n'));
    // step 1: reveals the search-engine panel (checkboxes come pre-checked, leave as-is)
    await page.locator('#stepOne').click();
    // step 2: confirm submission
    await page.locator('#pingConfirm').click({ timeout: 15000 });
    await page.waitForTimeout(3000);
  }, page, 'prepostseo');
}

async function pingDuplichecker(page: import('playwright').Page, url: string): Promise<boolean> {
  return withRetry(async () => {
    await page.goto('https://www.duplichecker.com/search-engine-pinging-website-tool.php', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/enter url/i).fill(url);
    await page.getByRole('button', { name: /ping url now/i }).click();
    await page.waitForTimeout(3000);
  }, page, 'duplichecker');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selfcheck')) return selfcheck();
  const dry = args.includes('--dry');
  const limIdx = args.indexOf('--limit');
  const limit = limIdx >= 0 ? parseInt(args[limIdx + 1], 10) : Infinity;
  const startIdx = args.indexOf('--start');
  const start = startIdx >= 0 ? parseInt(args[startIdx + 1], 10) : 1; // 1-based row into the not-yet-fully-pinged list

  const allUrls = await readTargetUrls();
  const ledger = loadLedger();
  const notPinged = allUrls.filter((u) => {
    const l = ledger[normUrl(u)];
    return !l || !l.prepostseo || !l.duplichecker;
  });
  const pending = notPinged.slice(start - 1, start - 1 + limit);

  console.log(`Sheet URLs: ${allUrls.length} | already fully pinged: ${allUrls.length - notPinged.length} | starting at row ${start} | to process: ${pending.length}`);
  if (dry) {
    pending.forEach((u) => console.log('  would ping:', u));
    return;
  }
  if (!pending.length) return;

  const browser = await chromium.launch({
    headless: args.includes('--headless'),
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const page = await browser.newPage();

  let pinged = 0, failed = 0;

  // prepostseo: batch of up to 10, only URLs not yet done there
  const needPrepostseo = pending.filter((u) => !ledger[normUrl(u)]?.prepostseo);
  for (const batch of chunk(needPrepostseo, 10)) {
    const ok = await pingPrepostseo(page, batch);
    const ts = new Date().toISOString();
    for (const u of batch) {
      const k = normUrl(u);
      ledger[k] = ledger[k] || { prepostseo: null, duplichecker: null };
      if (ok) ledger[k].prepostseo = ts;
    }
    console.log(`[prepostseo] batch of ${batch.length} ${ok ? '✅' : '⚠️ failed'}`);
    if (ok) pinged += batch.length; else failed += batch.length;
    saveLedger(ledger);
  }

  // duplichecker: one at a time, only URLs not yet done there
  const needDuplichecker = pending.filter((u) => !ledger[normUrl(u)]?.duplichecker);
  for (const url of needDuplichecker) {
    const ok = await pingDuplichecker(page, url);
    const k = normUrl(url);
    ledger[k] = ledger[k] || { prepostseo: null, duplichecker: null };
    if (ok) ledger[k].duplichecker = new Date().toISOString();
    console.log(`[duplichecker] ${url} ${ok ? '✅' : '⚠️ failed'}`);
    saveLedger(ledger);
  }

  await browser.close();
  console.log(`\nDone. Ledger updates written to ${LEDGER_PATH}`);
}

function selfcheck() {
  const eq = (a: string, b: string) => { if (a !== b) throw new Error(`FAIL: ${a} !== ${b}`); };
  eq(normUrl('https://www.kenresearch.com/foo-market/'), 'www.kenresearch.com/foo-market');
  eq(normUrl('http://www.kenresearch.com/foo-market?utm=x'), 'www.kenresearch.com/foo-market');

  const sizes = (n: number) => chunk(Array.from({ length: n }), 10).map((c) => c.length);
  if (JSON.stringify(sizes(0)) !== '[]') throw new Error('FAIL: chunk(0)');
  if (JSON.stringify(sizes(5)) !== '[5]') throw new Error('FAIL: chunk(5)');
  if (JSON.stringify(sizes(10)) !== '[10]') throw new Error('FAIL: chunk(10)');
  if (JSON.stringify(sizes(11)) !== '[10,1]') throw new Error('FAIL: chunk(11)');
  if (JSON.stringify(sizes(23)) !== '[10,10,3]') throw new Error('FAIL: chunk(23)');

  console.log('selfcheck OK');
}

main().catch((e) => { console.error('ERROR:', e.stack); process.exit(1); });
