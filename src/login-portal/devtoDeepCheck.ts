/**
 * devtoDeepCheck.ts — real login-state check for Dev.to (Forem).
 *
 * Dev.to's Forem platform issues the same `_Devto_Forem_Session` cookie to EVERY
 * visitor, logged in or not — cookie-name presence (sessionResolver.ts's default
 * check) can never distinguish a real session from a guest one there. Confirmed
 * bug: fleet accounts showed "logged in" on the dashboard while actually logged
 * out when opened.
 *
 * Fix: actually launch the profile headless and check whether /dashboard (an
 * auth-gated page) loads for real, or Forem redirects to /enter / /users/sign_in.
 * Cached with a short TTL — the dashboard polls status frequently, and launching
 * a real browser on every poll would be far too slow.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.resolve('.sessions-cookies/devto-deep-check-cache.json');
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 min — balances freshness vs not hammering with browser launches
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

/** Launches the profile headless, checks if /dashboard actually loads (real login). */
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
    await page.goto('https://dev.to/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const url = page.url();
    // Logged out → Forem redirects to /enter or /users/sign_in; logged in → stays on /dashboard.
    const ready = url.includes('/dashboard') && !url.includes('/enter') && !url.includes('sign_in');
    writeCacheEntry(sessionDir, { ready, checkedAt: Date.now() });
  } catch {
    writeCacheEntry(sessionDir, { ready: false, checkedAt: Date.now() });
  } finally {
    await ctx?.close().catch(() => {});
    inFlight.delete(sessionDir);
  }
}

/**
 * Returns the best-known login state for a Dev.to profile. If the cache is
 * fresh, returns it immediately. If stale or missing, kicks off a background
 * recheck (fire-and-forget — doesn't block the caller) and returns the last
 * known value (or the cheap cookie-based fallback if there's no cache yet).
 */
export function isDevtoLoggedInCached(sessionDir: string, cookieFallback: boolean): boolean {
  const cached = getCached(sessionDir);
  if (cached) {
    if (Date.now() - cached.checkedAt > CACHE_TTL_MS) void runDeepCheck(sessionDir);
    return cached.ready;
  }
  void runDeepCheck(sessionDir);
  return cookieFallback;
}
