/**
 * proxy-check.ts — verify each account's proxy actually works before you rely on it.
 *
 * Self-built, no third-party code, no network server (nothing to hijack). Uses the
 * SAME Playwright proxy path the posting browsers use, so a pass here means posting
 * will really egress through that IP. For each account it reports: works?, exit IP,
 * country, latency — and flags any proxy whose exit IP equals the box's own IP
 * (i.e. the proxy isn't actually routing).
 *
 * Usage:
 *   node --import=tsx scripts/proxy-check.ts --direct            # baseline: the box's own IP
 *   node --import=tsx scripts/proxy-check.ts aniket krishi vansh # test these accounts' proxies
 *   node --import=tsx scripts/proxy-check.ts                     # test all byNickname entries
 */
import { chromium } from 'playwright';
import { getLaunchIdentity, proxiesConfigured } from '../src/health/proxyPool.js';

const IP_ENDPOINT = 'https://ifconfig.co/json'; // returns {ip, country_iso, ...}
const TIMEOUT = 15000;

interface Result { nick: string; server: string; ok: boolean; ip?: string; country?: string; ms?: number; error?: string; }

async function probe(browser: import('playwright').Browser, nick: string, proxy: any): Promise<Result> {
  const server = proxy?.server || '(direct)';
  const ctx = await browser.newContext(proxy ? { proxy } : {});
  const t0 = Date.now();
  try {
    const page = await ctx.newPage();
    await page.goto(IP_ENDPOINT, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
    const body = JSON.parse(await page.innerText('body'));
    return { nick, server, ok: true, ip: body.ip, country: body.country_iso || body.country, ms: Date.now() - t0 };
  } catch (e: any) {
    return { nick, server, ok: false, ms: Date.now() - t0, error: e.message.split('\n')[0] };
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  const direct = args.includes('--direct');
  const nicks = args.filter(a => !a.startsWith('--'));

  if (!direct && !proxiesConfigured()) {
    console.log('No proxies configured (.accounts/proxies.json absent/empty).');
    console.log('Run with --direct to see the box\'s own egress IP as a baseline.');
    return;
  }

  const browser = await chromium.launch({
    headless: true,
    args: process.platform !== 'win32' ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : [],
  });

  // Baseline: the box's own IP (no proxy) — the value a working proxy must DIFFER from.
  const baseline = await probe(browser, '(no proxy)', undefined);
  console.log(`\nBaseline (box's own egress): ${baseline.ok ? `${baseline.ip} [${baseline.country}] ${baseline.ms}ms` : 'FAILED ' + baseline.error}\n`);

  if (direct) { await browser.close(); return; }

  const targets = nicks.length ? nicks : []; // (byNickname enumeration omitted: pass nicks explicitly)
  if (!targets.length) {
    console.log('Pass account nicknames to test, e.g.:  node --import=tsx scripts/proxy-check.ts aniket krishi');
    await browser.close();
    return;
  }

  const results: Result[] = [];
  // small concurrency so we don't open 40 contexts at once on the 2-vCPU box
  const POOL = 5;
  for (let i = 0; i < targets.length; i += POOL) {
    const batch = targets.slice(i, i + POOL);
    results.push(...await Promise.all(batch.map(n => probe(browser, n, getLaunchIdentity(n).proxy))));
  }
  await browser.close();

  console.log('nick            status  exit-ip           cc   latency  note');
  console.log('----            ------  -------           --   -------  ----');
  let dead = 0, notRouting = 0;
  for (const r of results.sort((a, b) => a.nick.localeCompare(b.nick))) {
    let note = '';
    if (!r.ok) { dead++; note = 'DEAD: ' + (r.error || ''); }
    else if (baseline.ok && r.ip === baseline.ip) { notRouting++; note = '⚠ NOT ROUTING (== box IP)'; }
    console.log(
      `${r.nick.padEnd(15)} ${(r.ok ? 'ok' : 'FAIL').padEnd(6)} ${(r.ip || '-').padEnd(17)} ${(r.country || '-').padEnd(4)} ${((r.ms ?? 0) + 'ms').padEnd(8)} ${note}`
    );
  }
  console.log(`\n${results.length} tested · ${results.length - dead - notRouting} healthy · ${dead} dead · ${notRouting} not-routing`);
  if (dead || notRouting) process.exitCode = 1; // non-zero so a cron/CI can catch bad proxies
}

main().catch(e => { console.error('proxy-check error:', e.message); process.exit(1); });
