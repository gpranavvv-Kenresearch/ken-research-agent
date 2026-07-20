/**
 * cdpLoginPool.ts — CDP-based replacement for displayPool.ts.
 *
 * Same external API (startLogin/teardown/getLogin/sweepExpired/poolStatus) as
 * the old Xvfb+x11vnc pool, so server.ts barely changes — but there's no X
 * server anywhere in this version. Each login gets: a truly headless Chrome
 * process (--headless=new --remote-debugging-port=N, pointed at the account's
 * real profile dir and the platform's login URL), Playwright attached to it
 * over that CDP port, and a screencastServer (interactive: true) streaming
 * and controlling that one page. The token/session-dir/finish contract server.ts
 * relies on is unchanged; only the transport underneath is different.
 */

import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import { chromium, Browser } from 'playwright';
import { SCREENCAST_PORT_POOL, ScreencastPortSlot, LOGIN_TTL_MS, CHROME_PATH, PUBLIC_BASE_URL } from './config.js';
import { startScreencastServer, ScreencastServerHandle } from '../screencast/screencastServer.js';

interface ActiveLogin {
  token: string;
  slot: ScreencastPortSlot;
  agent: string;
  platform: string;
  index: number;
  sessionDir: string;
  chromePid: number;
  browser: Browser;
  screencast: ScreencastServerHandle;
  expiresAt: number;
}

const active = new Map<string, ActiveLogin>();
const busy = new Set<number>(); // by debugPort

function freeSlot(): ScreencastPortSlot | null {
  for (const slot of SCREENCAST_PORT_POOL) {
    if (!busy.has(slot.debugPort)) return slot;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function killGroup(pid: number): void {
  try { process.kill(-pid, 'SIGKILL'); } catch { /* group gone */ }
  try { process.kill(pid, 'SIGKILL'); } catch { /* proc gone */ }
}

/** Same reasoning as the old pool: SIGTERM first so Chrome flushes cookies to
 * disk on its normal shutdown path; only SIGKILL if it won't exit in time. */
async function killChromeGracefully(pid: number, timeoutMs = 3000): Promise<void> {
  try { process.kill(-pid, 'SIGTERM'); } catch { /* group gone */ return; }
  try { process.kill(pid, 'SIGTERM'); } catch { /* proc gone */ }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await sleep(150);
  }
  console.warn(`[cdp-login-pool] Chrome pid ${pid} did not exit after SIGTERM — forcing SIGKILL`);
  killGroup(pid);
}

/**
 * The dashboard runs in the *user's* browser, so a bare "http://localhost:PORT"
 * only ever means their own machine, never the VPS — it must go through the
 * same public Nginx + Tailscale Funnel URL the old noVNC flow used. Nginx maps
 * /screencast/{port}/ to that local port (see deploy notes). Falls back to a
 * plain localhost URL when no public URL is configured (local dev/testing).
 */
function buildViewerUrl(port: number, token: string): string {
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL.replace(/\/$/, '')}/screencast/${port}/?t=${token}`;
  }
  return `http://localhost:${port}/?t=${token}`;
}

async function waitForDebugPort(port: number, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`Chrome debug port ${port} never came up`);
}

export interface StartedLogin {
  token: string;
  viewerUrl: string;
  expiresAt: number;
  reused?: boolean;
}

/** Find an already-active login for this exact account (same profile dir), if any. */
function findActiveFor(agent: string, platform: string, index: number): ActiveLogin | null {
  for (const login of active.values()) {
    if (login.agent === agent && login.platform === platform && login.index === index) return login;
  }
  return null;
}

/**
 * Allocate a slot, launch headless Chrome + attach Playwright over CDP + start
 * an interactive screencast for this account's login. Returns the login token.
 * Throws POOL_EXHAUSTED if all 5 slots are busy.
 *
 * If a login for this exact (agent, platform, index) is already running,
 * reuses it instead of launching a second Chrome on the same profile dir —
 * same duplicate-profile-lock hazard the old pool guarded against.
 */
export async function startLogin(params: {
  agent: string;
  platform: string;
  index: number;
  sessionDir: string;
  loginUrl: string;
}): Promise<StartedLogin> {
  const existing = findActiveFor(params.agent, params.platform, params.index);
  if (existing) {
    existing.expiresAt = Date.now() + LOGIN_TTL_MS; // renew TTL on reuse
    return {
      token: existing.token,
      viewerUrl: buildViewerUrl(existing.slot.viewerPort, existing.token),
      expiresAt: existing.expiresAt,
      reused: true,
    };
  }

  const slot = freeSlot();
  if (!slot) throw new Error('POOL_EXHAUSTED');

  busy.add(slot.debugPort);
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + LOGIN_TTL_MS;

  let chromeProc: ChildProcess | undefined;
  let browser: Browser | undefined;
  let screencast: ScreencastServerHandle | undefined;

  try {
    fs.mkdirSync(params.sessionDir, { recursive: true });

    // Launch blank, not pointed at loginUrl directly — Chrome's own initial
    // tab from a launch-arg URL isn't reliably the same object Playwright's
    // context.pages()[0] hands back after connectOverCDP (race between Chrome
    // creating its default target and Playwright's CDP session attaching to
    // it), which silently streamed a blank page in testing. Navigating
    // ourselves after attaching guarantees we know exactly which page we're
    // streaming.
    chromeProc = spawn(CHROME_PATH, [
      '--headless=new',
      `--remote-debugging-port=${slot.debugPort}`,
      `--user-data-dir=${params.sessionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      'about:blank',
    ], { detached: true, stdio: 'ignore' });
    chromeProc.unref();

    await waitForDebugPort(slot.debugPort);

    browser = await chromium.connectOverCDP(`http://localhost:${slot.debugPort}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(params.loginUrl, { waitUntil: 'domcontentloaded' });

    // Smaller/lower-quality frames than the default — this session is viewed
    // over the real internet (via Tailscale Funnel), not localhost, and a
    // login form doesn't need 1280x900 to be usable. Measured real capture
    // time on Substack's actual sign-in page: ~59.5ms average (10-sample
    // test), so 100ms leaves real headroom without piling up overlapping
    // capture attempts like the earlier 66ms setting risked.
    screencast = await startScreencastServer(page, slot.viewerPort, {
      interactive: true, token, quality: 55, maxWidth: 1024, maxHeight: 768, frameIntervalMs: 100,
    });

    active.set(token, {
      token, slot, agent: params.agent, platform: params.platform, index: params.index,
      sessionDir: params.sessionDir, chromePid: chromeProc.pid!, browser, screencast, expiresAt,
    });

    return { token, viewerUrl: buildViewerUrl(slot.viewerPort, token), expiresAt };
  } catch (err) {
    if (screencast) await (screencast as ScreencastServerHandle).stop().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (chromeProc?.pid) killGroup(chromeProc.pid);
    busy.delete(slot.debugPort);
    throw err;
  }
}

/**
 * Kill everything for a login token and free its slot. Idempotent.
 *
 * Order matters, same as the old pool: Chrome is asked to exit gracefully
 * FIRST (flushing any just-set cookies), and only after it's actually gone do
 * we tear down the screencast server. Callers that need to read the session's
 * cookies right after teardown (the finish route) must await this.
 */
export async function teardown(token: string): Promise<boolean> {
  const login = active.get(token);
  if (!login) return false;

  await login.browser.close().catch(() => {}); // detach the CDP connection cleanly first
  await killChromeGracefully(login.chromePid);
  await login.screencast.stop().catch(() => {});

  busy.delete(login.slot.debugPort);
  active.delete(token);
  return true;
}

export function getLogin(token: string): ActiveLogin | undefined {
  return active.get(token);
}

/** Force-teardown any login past its TTL. Called on an interval by the server. */
export function sweepExpired(): number {
  const now = Date.now();
  let n = 0;
  for (const [token, login] of active) {
    if (login.expiresAt <= now) { void teardown(token); n++; }
  }
  return n;
}

export function poolStatus() {
  return { capacity: SCREENCAST_PORT_POOL.length, inUse: busy.size, active: active.size };
}
