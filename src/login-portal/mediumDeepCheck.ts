/**
 * mediumDeepCheck.ts — real login-state check for Medium.
 *
 * Medium's homepage (https://medium.com/) is fully public — it never redirects an
 * anonymous visitor to /m/signin, so neither a URL check (medium/login.ts's own
 * `!url.includes('signin')`) nor cookie-name presence (sessionResolver.ts's default
 * check, `sid`/`uid`) can tell a real session from a dead one there. Confirmed bug
 * via production logs (2026-07-26..28): session-health reported abhinav's 12/12
 * Medium fleet sessions "logged in" via cookie DB, yet the SAME accounts
 * (abhinav 1, 6, 11, 12) hit "Write button not found" on every single run — the
 * homepage rendered the logged-out header (no [data-testid="headerWriteButton"]),
 * proving those cookies were stale/guest cookies, not a real login.
 *
 * Fix: actually launch the profile headless and check whether the authenticated-only
 * "Write" button renders on the homepage, same signal poster.ts itself waits on
 * before it will attempt to post. Cached with a short TTL — the dashboard polls
 * status frequently, and launching a real browser on every poll would be too slow.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.resolve('.sessions-cookies/medium-deep-check-cache.json');
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 min — matches devtoDeepCheck's balance of freshness vs cost
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
  const entry = readCache()[sessionDir];
  return entry ?? null;
}

const inFlight = new Set<string>();

/** Launches the profile headless, checks whether the authenticated "Write" button
 *  actually renders on the homepage (real login) instead of the logged-out shell. */
async function runDeepCheck(sessionDir: string): Promise<void> {
  if (inFlight.has(sessionDir)) return; // don't stack concurrent checks for the same profile
  inFlight.add(sessionDir);
  let ctx: any;
  try {
    if (!fs.existsSync(sessionDir)) { writeCacheEntry(sessionDir, { ready: false, checkedAt: Date.now() }); return; }
    ctx = await chromium.launchPersistentContext(sessionDir, {
      headless: true,
      executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
      channel: fs.existsSync(CHROME_PATH) ? undefined : 'chrome',
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationControlled'],
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto('https://medium.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Same element poster.ts itself gates on before attempting to post — the
    // single reliable signal that this is an authenticated header, not a guest one.
    const ready = await page.locator('[data-testid="headerWriteButton"]').count() > 0;
    writeCacheEntry(sessionDir, { ready, checkedAt: Date.now() });
  } catch {
    writeCacheEntry(sessionDir, { ready: false, checkedAt: Date.now() });
  } finally {
    await ctx?.close().catch(() => {});
    inFlight.delete(sessionDir);
  }
}

/**
 * Returns the best-known login state for a Medium profile. If the cache is
 * fresh, returns it immediately. If stale or missing, kicks off a background
 * recheck (fire-and-forget — doesn't block the caller) and returns the last
 * known value (or the cheap cookie-based fallback if there's no cache yet).
 */
export function isMediumLoggedInCached(sessionDir: string, cookieFallback: boolean): boolean {
  const cached = getCached(sessionDir);
  if (cached) {
    if (Date.now() - cached.checkedAt > CACHE_TTL_MS) void runDeepCheck(sessionDir);
    return cached.ready;
  }
  void runDeepCheck(sessionDir);
  return cookieFallback;
}
