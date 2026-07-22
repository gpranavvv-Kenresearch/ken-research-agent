/**
 * proxyCheck.ts — verify account proxies through the SAME Playwright path the
 * posters use. Shared by scripts/proxy-check.ts (CLI) and the login-api
 * /api/proxy/test endpoint, so there is one implementation, not two.
 */
import { chromium } from 'playwright';
import { getLaunchIdentity } from './proxyPool.js';

const IP_ENDPOINT = 'https://ifconfig.co/json'; // {ip, country_iso, ...}
const TIMEOUT = 15000;

export interface ProxyResult {
  nick: string;
  server: string;
  ok: boolean;
  ip?: string;
  country?: string;
  ms?: number;
  error?: string;
  /** true when the exit IP equals the box's own IP → proxy isn't actually routing. */
  notRouting?: boolean;
}

async function probe(browser: import('playwright').Browser, nick: string, proxy: any): Promise<ProxyResult> {
  const server = proxy?.server || '(direct)';
  const ctx = await browser.newContext(proxy ? { proxy } : {});
  const t0 = Date.now();
  try {
    const page = await ctx.newPage();
    await page.goto(IP_ENDPOINT, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
    const body = JSON.parse(await page.innerText('body'));
    return { nick, server, ok: true, ip: body.ip, country: body.country_iso || body.country, ms: Date.now() - t0 };
  } catch (e: any) {
    return { nick, server, ok: false, ms: Date.now() - t0, error: (e.message || String(e)).split('\n')[0] };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Probe the box's own egress (baseline) plus each nick's proxy. Marks a proxy
 * `notRouting` when its exit IP equals the baseline. Launches ONE browser and
 * reuses it (one context per proxy), capped concurrency for the 2-vCPU box.
 */
export async function checkProxies(nicks: string[]): Promise<{ baseline: ProxyResult; results: ProxyResult[] }> {
  const browser = await chromium.launch({
    headless: true,
    args: process.platform !== 'win32' ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : [],
  });
  try {
    const baseline = await probe(browser, '(no proxy)', undefined);
    const results: ProxyResult[] = [];
    const POOL = 5;
    for (let i = 0; i < nicks.length; i += POOL) {
      const batch = nicks.slice(i, i + POOL);
      const r = await Promise.all(batch.map(n => probe(browser, n, getLaunchIdentity(n).proxy)));
      for (const res of r) {
        if (res.ok && baseline.ok && res.ip === baseline.ip) res.notRouting = true;
        results.push(res);
      }
    }
    return { baseline, results };
  } finally {
    await browser.close().catch(() => {});
  }
}
