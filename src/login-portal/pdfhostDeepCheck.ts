/**
 * pdfhostDeepCheck.ts — real login-state check for PDFHost.
 *
 * PDFHost issues no distinguishing first-party session cookie at all — a logged-in
 * profile's cookie DB holds only `_ga`/`_ga_*` analytics cookies for .pdfhost.io,
 * same as a logged-out one (confirmed by inspecting a real meenakshi session that
 * WAS genuinely logged in per a live page load, yet had zero pdfhost-specific
 * cookies). So sessionResolver.ts's default cookie-name check can never work here
 * — it always reports "not logged in" regardless of real state (the bug behind
 * the dashboard showing meenakshi's Coda/Raindrop/PdfHost accounts as needing
 * re-login while they were actually fine). Same fix shape as mediumDeepCheck.ts /
 * devtoDeepCheck.ts: launch the profile for real and check the dashboard page
 * actually renders instead of redirecting to /login.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.resolve('.sessions-cookies/pdfhost-deep-check-cache.json');
const CACHE_TTL_MS = 3 * 60 * 1000;
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';

interface CacheEntry { ready: boolean; checkedAt: number; }

function readCache(): Record<string, CacheEntry> {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')); } catch { return {}; }
}

function writeCacheEntry(sessionDir: string, entry: CacheEntry): void {
  try {
    const cache = readCache();
    cache[sessionDir] = entry;
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch { /* non-critical */ }
}

function getCached(sessionDir: string): CacheEntry | null {
  return readCache()[sessionDir] ?? null;
}

const inFlight = new Set<string>();

async function runDeepCheck(sessionDir: string): Promise<void> {
  if (inFlight.has(sessionDir)) return;
  inFlight.add(sessionDir);
  let ctx: any;
  try {
    if (!fs.existsSync(sessionDir)) { writeCacheEntry(sessionDir, { ready: false, checkedAt: Date.now() }); return; }
    ctx = await chromium.launchPersistentContext(sessionDir, {
      headless: true,
      executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
      channel: fs.existsSync(CHROME_PATH) ? undefined : 'chrome',
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto('https://pdfhost.io/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    const ready = !page.url().includes('/login');
    writeCacheEntry(sessionDir, { ready, checkedAt: Date.now() });
  } catch {
    writeCacheEntry(sessionDir, { ready: false, checkedAt: Date.now() });
  } finally {
    await ctx?.close().catch(() => {});
    inFlight.delete(sessionDir);
  }
}

/** Returns the best-known login state; refreshes stale/missing cache in the background. */
export function isPdfhostLoggedInCached(sessionDir: string, cookieFallback: boolean): boolean {
  const cached = getCached(sessionDir);
  if (cached) {
    if (Date.now() - cached.checkedAt > CACHE_TTL_MS) void runDeepCheck(sessionDir);
    return cached.ready;
  }
  void runDeepCheck(sessionDir);
  return cookieFallback;
}
