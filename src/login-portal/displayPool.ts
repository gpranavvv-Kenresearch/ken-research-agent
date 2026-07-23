/**
 * displayPool.ts — ephemeral virtual-display manager for concurrent logins.
 *
 * Each active login gets an isolated Xvfb display + x11vnc (localhost) + a real
 * Chrome pointed at the target platform login URL with the account's profile dir.
 * A single shared websockify (started by server.ts) fronts every display's VNC
 * port via the token-plugin; we write one token file per login so the noVNC URL
 * routes to the right display. teardown() kills the process group and frees the slot.
 *
 * Proven end-to-end by the Phase 0 spike (spawn + render + clean teardown).
 */

import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { chromium } from 'playwright';
import { DISPLAY_POOL, DisplaySlotDef, TOKEN_DIR, LOGIN_TTL_MS, CHROME_PATH, PUBLIC_BASE_URL } from './config.js';
import { tryAcquireBrowserSlot } from '../utils/browserSlots.js';
import { STEALTH_USER_AGENT } from '../utils/stealth.js';
import { isLoggedIn, fleetNickname, getFleetCredentials } from './sessionResolver.js';
import { fillCredentials } from './fillCredentials.js';

interface ActiveLogin {
  token: string;
  slot: DisplaySlotDef;
  agent: string;
  platform: string;
  index: number;
  sessionDir: string;
  pids: number[];      // spawned process group leaders (Xvfb, x11vnc, chrome)
  expiresAt: number;
  release: () => void; // frees the box-wide browser slot (see tryAcquireBrowserSlot)
}

/**
 * The dashboard runs in the operator's browser, so the noVNC client URL must go
 * through the public HTTPS tunnel (Tailscale Funnel → Nginx → shared websockify
 * on 6090), never a bare localhost. websockify's TokenFile plugin routes the
 * WebSocket to this login's private x11vnc port by the ?token= we wrote to
 * TOKEN_DIR. Real VNC input (not synthetic CDP events) is what makes CAPTCHAs
 * and every login behave exactly as on a normal machine.
 */
function buildNovncUrl(token: string): string {
  const base = (PUBLIC_BASE_URL || 'http://localhost:6090').replace(/\/$/, '');
  const wsPath = encodeURIComponent(`websockify?token=${token}`);
  return `${base}/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=${wsPath}`;
}

// This browser is a plain, raw Chrome process (spawned directly, no CDP/Playwright
// attached) — it was never automation-flagged (navigator.webdriver) in the first
// place, so `--disable-blink-features=AutomationControlled` did nothing useful
// here except trigger Chrome's own "unsupported command-line flag" warning bar.
// Dropped so the login browser looks like a completely normal Chrome window.
const CHROME_ARGS = [
  // This VPS's Chrome sandbox doesn't initialize (every poster runs --no-sandbox
  // for the same reason); without it Chrome exits immediately and the operator
  // connects to a blank VNC desktop. Also matches the poster's fingerprint.
  '--no-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--start-maximized',
  '--disable-infobars',
];

/** token -> active login */
const active = new Map<string, ActiveLogin>();
/** which display slots are currently in use */
const busy = new Set<string>();

function freeSlot(): DisplaySlotDef | null {
  for (const slot of DISPLAY_POOL) {
    if (!busy.has(slot.display)) return slot;
  }
  return null;
}

function spawnDetached(cmd: string, args: string[], env: NodeJS.ProcessEnv): number {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', env });
  child.unref();
  return child.pid as number;
}

/** Poll until a file exists (Xvfb ready = its /tmp/.X11-unix socket appears),
 *  instead of a fixed sleep. Returns false on timeout (caller falls back). */
async function waitForFile(p: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(p)) return true;
    await sleep(50);
  }
  return false;
}

/** Poll until a localhost TCP port accepts a connection (x11vnc / Chrome debug
 *  port is up), instead of a fixed sleep. */
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = net.connect({ host: '127.0.0.1', port }, () => { sock.destroy(); resolve(true); });
      sock.on('error', () => { sock.destroy(); resolve(false); });
    });
    if (ok) return true;
    await sleep(80);
  }
  return false;
}

/**
 * One-shot credential auto-fill over CDP, then DETACH — so the operator only
 * solves the challenge (real VNC mouse), never types email/password over the
 * laggy tunnel. Safe against anti-bot detection: we attach only long enough to
 * type the two fields (no submit), then disconnect, so no Arkose/MatchKey check
 * ever runs while CDP is attached — the submit + challenge are all real input.
 * Best-effort and fire-and-forget: any failure just leaves the form for the human.
 */
async function autofillOverCdp(debugPort: number, platform: string, agent: string, index: number): Promise<void> {
  const creds = getFleetCredentials(platform, fleetNickname(agent, index));
  if (!creds) return; // no stored creds → human types them
  try {
    if (!(await waitForPort(debugPort, 12000))) return;
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    try {
      const ctx = browser.contexts()[0];
      const page = ctx?.pages()[0];
      if (page) await fillCredentials(page, platform, creds, { submit: false });
    } finally {
      await browser.close().catch(() => {}); // disconnect only — Chrome keeps running on the display
    }
  } catch { /* best-effort: human finishes over VNC */ }
}

function killGroup(pid: number): void {
  try { process.kill(-pid, 'SIGKILL'); } catch { /* group gone */ }
  try { process.kill(pid, 'SIGKILL'); } catch { /* proc gone */ }
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Chrome batches cookie writes to its on-disk SQLite DB rather than flushing on
 * every set — a bare SIGKILL right after login can throw away a just-completed
 * login's cookies before they ever reach disk. Ask Chrome to exit cleanly
 * (SIGTERM, which triggers its normal shutdown/flush path) and give it a real
 * chance to do so; only SIGKILL as a last resort if it won't exit in time.
 */
async function killChromeGracefully(pid: number, timeoutMs = 3000): Promise<void> {
  try { process.kill(-pid, 'SIGTERM'); } catch { /* group gone */ return; }
  try { process.kill(pid, 'SIGTERM'); } catch { /* proc gone */ }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return; // exited cleanly, cookies flushed
    await sleep(150);
  }
  console.warn(`[login-api] Chrome pid ${pid} did not exit after SIGTERM — forcing SIGKILL`);
  killGroup(pid);
}

function writeTokenFile(token: string, vncPort: number): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  // websockify TokenFile plugin format: "identifier: host:port"
  fs.writeFileSync(path.join(TOKEN_DIR, token), `${token}: localhost:${vncPort}\n`, 'utf-8');
}

function removeTokenFile(token: string): void {
  try { fs.rmSync(path.join(TOKEN_DIR, token)); } catch { /* already gone */ }
}

export interface StartedLogin {
  token: string;
  display: string;
  viewerUrl: string;  // noVNC client URL the dashboard embeds/opens
  expiresAt: number;
  reused?: boolean;
  // displayPool has no auto-fill (raw Chrome, no CDP), so a human always drives
  // the login — kept for interface parity with the dashboard's queue.
  state: 'needs-human';
}

/** Find an already-active login for this exact account (same profile dir), if any. */
function findActiveFor(agent: string, platform: string, index: number): ActiveLogin | null {
  for (const login of active.values()) {
    if (login.agent === agent && login.platform === platform && login.index === index) return login;
  }
  return null;
}

/**
 * Allocate a display, spawn Xvfb + x11vnc + Chrome for this account's login,
 * and register a websockify token routing to it. Returns the login token.
 * Throws if the pool is exhausted (all 5 slots busy).
 *
 * If a login for this exact (agent, platform, index) is already running, reuses
 * it instead of spawning a second Chrome on the same profile dir — a duplicate
 * launch silently fails (Chrome's profile lock) and leaves a black VNC screen.
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
      token: existing.token, display: existing.slot.display,
      viewerUrl: buildNovncUrl(existing.token), expiresAt: existing.expiresAt,
      reused: true, state: 'needs-human',
    };
  }

  const slot = freeSlot();
  if (!slot) throw new Error('POOL_EXHAUSTED');

  // Respect the box-wide browser cap shared with the posting scheduler: refuse
  // fast if a posting session holds the slot(s), so the portal can say "posting
  // in progress, try again" instead of piling Chromes on and OOMing the box.
  const release = await tryAcquireBrowserSlot(`login:${params.agent}/${params.platform}`);
  if (!release) throw new Error('BOX_BUSY');

  busy.add(slot.display);
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + LOGIN_TTL_MS;
  const pids: number[] = [];

  try {
    fs.mkdirSync(params.sessionDir, { recursive: true });

    // Clear any stale X lock/socket for this slot before spawning. teardown()
    // SIGKILLs Xvfb (fast, but it leaves /tmp/.X<n>-lock behind), so a reused
    // slot would otherwise hit "server already active for display" — Xvfb exits
    // instantly and x11vnc/Chrome die with it, surfacing as noVNC's "Failed to
    // connect". The slot is marked free here, so removing its lock is safe.
    const dn = slot.display.replace(':', '');
    fs.rmSync(`/tmp/.X${dn}-lock`, { force: true });
    fs.rmSync(`/tmp/.X11-unix/X${dn}`, { force: true });

    // 1) virtual display. 1024x768 (readable for logins, ~32% fewer pixels than
    // 1280x900) at 16-bit depth instead of 24 — a login form needs no true-color,
    // and 16bpp is ~⅓ less colour data for x11vnc to encode/ship each frame, so
    // it feels snappier over the tunnel. Poll the X socket for readiness instead
    // of a blind sleep (Xvfb is usually up in <250ms, not 600).
    pids.push(spawnDetached('Xvfb', [slot.display, '-screen', '0', '1024x768x16'], process.env));
    await waitForFile(`/tmp/.X11-unix/X${dn}`, 5000);

    // 2) VNC server bound to localhost only (Nginx/websockify terminate outward).
    // -threads: use both vCPUs for scan/poll work instead of one.
    // -defer 5: coalesce updates over 5ms instead of 10 — lower input-to-paint
    // latency (the interactive feel) at a small extra frame cost, fine on a login.
    // -noshm: plain X11 GetImage instead of MIT-SHM. x11vnc's default SHM path
    // draws from a small, fixed system-wide SysV shared-memory pool (shmmni) that
    // isn't reliably freed when a display is SIGKILL'd — repeated logins exhausted
    // it (4096/4096, every new x11vnc then failed "shmget: No space left on
    // device", silently, stdio ignored). -noshm sidesteps that pool entirely.
    pids.push(spawnDetached(
      'x11vnc',
      ['-display', slot.display, '-rfbport', String(slot.vncPort), '-localhost', '-nopw', '-forever', '-shared', '-quiet', '-threads', '-defer', '5', '-noshm'],
      process.env,
    ));
    await waitForPort(slot.vncPort, 5000);

    // 3) token routing for the shared websockify
    writeTokenFile(token, slot.vncPort);

    // 4) real Chrome pointed at the login URL, using this account's profile dir.
    // Match the poster's user-agent so the session this login creates doesn't
    // read as a "new device" when the poster later reuses the same profile
    // (login + posting share the box/IP; UA is the cheap, high-value tell to
    // align). Raw Chrome already has navigator.webdriver=false, so no CDP-side
    // stealth patch is needed here.
    // --remote-debugging-port (localhost only) lets us attach CDP once to type
    // the credentials, then detach (see autofillOverCdp). It does NOT set
    // navigator.webdriver — that tell comes from Playwright's own launch flags,
    // which we don't use here — so the browser still looks like a normal Chrome.
    pids.push(spawnDetached(
      CHROME_PATH,
      [...CHROME_ARGS, `--remote-debugging-port=${slot.debugPort}`, `--user-agent=${STEALTH_USER_AGENT}`, `--user-data-dir=${params.sessionDir}`, params.loginUrl],
      { ...process.env, DISPLAY: slot.display },
    ));

    active.set(token, {
      token, slot, agent: params.agent, platform: params.platform,
      index: params.index, sessionDir: params.sessionDir, pids, expiresAt, release,
    });

    // Fire-and-forget: fill the creds in the background so the noVNC URL returns
    // immediately (screen opens fast) and the operator watches the fields fill,
    // then just solves the challenge. Never blocks or fails the login.
    void autofillOverCdp(slot.debugPort, params.platform, params.agent, params.index);

    return { token, display: slot.display, viewerUrl: buildNovncUrl(token), expiresAt, state: 'needs-human' };
  } catch (err) {
    // best-effort cleanup on partial failure
    for (const pid of pids) killGroup(pid);
    removeTokenFile(token);
    busy.delete(slot.display);
    release();
    throw err;
  }
}

/**
 * Kill everything for a login token and free its slot. Idempotent.
 *
 * Order matters: Chrome (the last pid — see startLogin) is asked to exit
 * gracefully FIRST so it flushes any just-set cookies to disk, and only after
 * it's actually gone do we tear down the supporting Xvfb/x11vnc processes
 * (which hold no state worth preserving, so those get killed immediately).
 * Callers that need to read the session's cookies right after teardown
 * (e.g. the finish route) must await this — reading before Chrome exits
 * risks seeing a stale/incomplete Cookies DB.
 */
export async function teardown(token: string): Promise<boolean> {
  const login = active.get(token);
  if (!login) return false;

  const chromePid = login.pids[login.pids.length - 1];
  const supportPids = login.pids.slice(0, -1);

  await killChromeGracefully(chromePid);
  for (const pid of supportPids) killGroup(pid);

  removeTokenFile(token);
  busy.delete(login.slot.display);
  login.release(); // free the box-wide browser slot only after Chrome is dead
  active.delete(token);
  return true;
}

export function getLogin(token: string): ActiveLogin | undefined {
  return active.get(token);
}

export interface LoginQueueEntry {
  token: string;
  platform: string;
  index: number;
  nickname: string;
  /** 'ready' = session is logged in on disk (safe to finish); 'needs-human' =
   *  operator still has to type creds / clear a challenge over the VNC screen. */
  status: 'ready' | 'needs-human';
  novncUrl: string;
  expiresAt: number;
}

/** Snapshot of this agent's live logins for the dashboard's "needs you" queue.
 *  No auto-fill here, so each login is 'needs-human' until the on-disk session
 *  actually shows logged-in, at which point it flips to 'ready'. */
export function loginQueue(agent: string): LoginQueueEntry[] {
  const out: LoginQueueEntry[] = [];
  for (const login of active.values()) {
    if (login.agent !== agent) continue;
    out.push({
      token: login.token,
      platform: login.platform,
      index: login.index,
      nickname: fleetNickname(login.agent, login.index),
      status: isLoggedIn(login.sessionDir, login.platform) ? 'ready' : 'needs-human',
      novncUrl: buildNovncUrl(login.token),
      expiresAt: login.expiresAt,
    });
  }
  return out.sort((a, b) => a.platform.localeCompare(b.platform) || a.index - b.index);
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
  return { capacity: DISPLAY_POOL.length, inUse: busy.size, active: active.size };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
