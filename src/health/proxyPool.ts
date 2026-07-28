/**
 * PROXIES DISABLED 2026-07-28 — every proxy-returning export is a no-op; no
 * proxy/tunnel is ever attached to a browser launch or a network request. Dead
 * residential/DC proxies were breaking logins (net::ERR_TUNNEL_CONNECTION_FAILED
 * on x.com/facebook.com/hackmd login pages). getProxy() and proxyDispatcher()
 * now return undefined unconditionally, so getLaunchIdentity/identityLaunchOverrides
 * carry no `proxy` field (fingerprint UA/viewport/locale/timezone still work).
 * Re-enable by reverting this file from git history and restoring .accounts/proxies.json.
 *
 * proxyPool.ts — sticky per-account proxy + consistent per-account fingerprint.
 *
 * Root cause of most blocks: ~240 accounts all posted from ONE datacenter IP.
 * FB/LinkedIn/X correlate accounts by IP and distrust datacenter ranges. The
 * fix is one *sticky* residential/mobile IP per account, plus a fingerprint
 * (UA / viewport / timezone / locale) that stays STABLE for that account — a
 * "person" whose IP and device keep changing looks more like a bot than one
 * whose identity is boring and consistent.
 *
 * Config: .accounts/proxies.json (absent/empty ⇒ every call returns undefined,
 * so this is a safe no-op until you actually buy proxies). Shape:
 * {
 *   // Most residential providers do sticky sessions via a username suffix.
 *   // {nick} is substituted with the account nickname ⇒ same account, same IP.
 *   "sessionTemplate": {
 *     "server": "http://gate.provider.com:7000",
 *     "username": "customer-USER-sessid-{nick}",
 *     "password": "PASS",
 *     "geo": { "timezoneId": "Asia/Kolkata", "locale": "en-IN" }
 *   },
 *   // Optional explicit per-account overrides (distinct endpoints).
 *   "byNickname": { "aniket": { "server": "...", "username": "...", "password": "...", "geo": {...} } }
 * }
 */
import fs from 'fs';
import path from 'path';
import { ProxyAgent } from 'undici';

const proxyFilePath = () => process.env.PROXY_POOL_FILE || path.join(process.cwd(), '.accounts', 'proxies.json');
const rotationFilePath = () => process.env.PROXY_ROTATION_FILE || path.join(process.cwd(), '.accounts', 'proxy-rotation.json');

export interface ProxyConfig { server: string; username?: string; password?: string; }
export interface Geo { timezoneId: string; locale: string; }
export interface LaunchIdentity {
  proxy?: ProxyConfig;
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  timezoneId: string;
}

interface ProxyEntry extends ProxyConfig { geo?: Geo; }
interface ProxyFile {
  sessionTemplate?: ProxyEntry;
  byNickname?: Record<string, ProxyEntry>;
  default?: ProxyEntry;
}

let cache: ProxyFile | null = null;
let cacheMtime = -1;
function loadFile(): ProxyFile {
  // Cache keyed on the file's mtime (-2 = absent) so deleting or editing
  // proxies.json takes effect on the NEXT launch without a scheduler restart.
  // A forever-cache here kept a long-running scheduler posting through dead
  // proxies for hours after the config was removed (Jul 2026 incident).
  let mtime = -2;
  try { mtime = fs.statSync(proxyFilePath()).mtimeMs; } catch { /* absent */ }
  if (cache && mtime === cacheMtime) return cache;
  try { cache = JSON.parse(fs.readFileSync(proxyFilePath(), 'utf8')); }
  catch { cache = {}; }
  cacheMtime = mtime;
  return cache!;
}

// Deterministic 32-bit hash so an account's fingerprint never changes between runs.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// A small pool of realistic, current desktop UAs. Deterministically pinned per
// account — NOT rotated, because a stable device is less suspicious than a
// shape-shifting one.
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
];
const VIEWPORTS = [
  { width: 1366, height: 768 }, { width: 1920, height: 1080 },
  { width: 1440, height: 900 }, { width: 1536, height: 864 },
];

// Rotation counters. Appended to the {nick} session token so a rotation makes the
// provider hand out a NEW sticky IP for that account. Only affects sessionTemplate
// (or any username containing {nick}); static byNickname IPs have no {nick} so they
// don't rotate — that's correct, a fixed IP can't be rotated client-side.
function loadRotation(): Record<string, number> {
  try { return JSON.parse(fs.readFileSync(rotationFilePath(), 'utf8')); } catch { return {}; }
}

function subst(entry: ProxyEntry, nick: string, rot = 0): ProxyConfig {
  const n = nick.toLowerCase().trim();
  const token = rot > 0 ? `${n}-r${rot}` : n;
  return {
    server: entry.server,
    username: entry.username?.replace(/\{nick\}/g, token),
    password: entry.password,
  };
}

/**
 * Sticky proxy for this account, or undefined if none configured.
 * When `platform` is given, a per-(user,platform) IP `"{nick}:{platform}"` wins
 * over the per-user key `"{nick}"` — so one user can hold a distinct static IP
 * per ban-prone platform (X/FB/LinkedIn/HackMD) while everything else shares one.
 */
export function getProxy(_nickname: string, _platform?: string): ProxyConfig | undefined {
  // PROXIES DISABLED 2026-07-28 — always return no proxy. Every browser launch
  // (via getLaunchIdentity/identityLaunchOverrides) and every fetch (via
  // proxyDispatcher) routes through this, so nothing can ever attach a tunnel.
  // Original config-driven lookup lives in git history — revert this file to restore.
  return undefined;
}

/**
 * Rotate this account onto a fresh sticky IP by bumping its session token.
 * Returns the new proxy config (or undefined if no proxy is configured / the
 * config has no {nick} token to rotate). Persists the counter.
 */
export function rotateProxy(nickname: string): { rotated: boolean; rotation: number; proxy?: ProxyConfig; reason?: string } {
  const n = nickname.toLowerCase().trim();
  const f = loadFile();
  const entry = f.byNickname?.[n] || f.sessionTemplate || f.default;
  if (!entry) return { rotated: false, rotation: 0, reason: 'no proxy configured' };
  if (!entry.username?.includes('{nick}')) {
    return { rotated: false, rotation: loadRotation()[n] || 0, reason: 'static IP (no {nick} token) — cannot rotate client-side' };
  }
  const rotation = (loadRotation()[n] || 0) + 1;
  const all = loadRotation();
  all[n] = rotation;
  try {
    fs.mkdirSync(path.dirname(rotationFilePath()), { recursive: true });
    fs.writeFileSync(rotationFilePath(), JSON.stringify(all, null, 2));
  } catch { /* non-fatal */ }
  cache = null; // force reload so getProxy reflects new rotation immediately
  return { rotated: true, rotation, proxy: subst(entry, n, rotation) };
}

function geoFor(nickname: string): Geo {
  const f = loadFile();
  const n = nickname.toLowerCase().trim();
  const g = f.byNickname?.[n]?.geo || f.sessionTemplate?.geo || f.default?.geo;
  return g || { timezoneId: 'Asia/Kolkata', locale: 'en-IN' }; // sensible default for this org
}

/**
 * Full stable identity for a launch: proxy + fingerprint. Deterministic in the
 * nickname, so every launch of the same account presents the same device.
 * Timezone/locale come from the proxy's geo when set, so they match the exit IP.
 */
export function getLaunchIdentity(nickname: string, platform?: string): LaunchIdentity {
  const h = hash(nickname.toLowerCase().trim());
  const geo = geoFor(nickname);
  return {
    proxy: getProxy(nickname, platform),
    userAgent: UA_POOL[h % UA_POOL.length],
    viewport: VIEWPORTS[(h >> 8) % VIEWPORTS.length],
    locale: geo.locale,
    timezoneId: geo.timezoneId,
  };
}

/** Marker written into a session dir by the LOGIN flow when it launched Chrome
 *  through the account's proxy. Its presence tells the poster to keep this
 *  account on its proxy IP for life; its absence means a legacy box-IP account
 *  that must never be switched (Option A). */
export const PROXY_BORN_MARKER = '.proxy-born';

function markerExists(sessionDir: string, marker: string): boolean {
  try { return fs.existsSync(path.join(sessionDir, marker)); } catch { return false; }
}

/** Call from the login flow AFTER Chrome was launched through the proxy, so the
 *  poster will route this account's posts through the same IP. Idempotent. */
export function markProxyBorn(sessionDir: string): void {
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, PROXY_BORN_MARKER), 'logged in via proxy\n');
  } catch { /* non-fatal — worst case the poster falls back to box IP */ }
}

/**
 * Playwright launchPersistentContext option overrides for an account.
 *
 * Applied ONLY to FRESH profiles (new accounts). Changing the UA/viewport/
 * timezone of an already-logged-in session can itself trigger a "new device"
 * checkpoint — the very restriction we're trying to avoid — so established
 * sessions are left completely untouched. New accounts get a stable, distinct
 * fingerprint (and proxy, once configured) from their very first launch.
 *
 * Spreads directly into launch options: field names match Playwright's.
 */
export function identityLaunchOverrides(sessionDir: string, nickname: string, platform?: string):
  Partial<{ proxy: ProxyConfig; userAgent: string; viewport: { width: number; height: number }; locale: string; timezoneId: string }> {
  const id = getLaunchIdentity(nickname, platform);
  const out: any = {};
  // PROXY only for accounts BORN on a proxy — the login writes a `.proxy-born`
  // marker in the session dir when it launched through the proxy, so the session's
  // whole lifetime (login + every post) stays on ONE consistent IP. Accounts that
  // were already logged in on the box IP have no marker → they keep the box IP and
  // are NEVER switched, avoiding the "new device/location" checkpoint an IP jump
  // on an established session would trip. (Option A.)
  const bornOnProxy = markerExists(sessionDir, PROXY_BORN_MARKER);
  if (bornOnProxy && id.proxy) out.proxy = id.proxy;
  // FINGERPRINT (UA/viewport/locale/timezone) only for FRESH profiles — same reason:
  // changing an established session's device can trip a checkpoint.
  let fresh = true;
  try { fresh = !fs.existsSync(sessionDir); } catch { fresh = false; }
  if (fresh) { out.userAgent = id.userAgent; out.viewport = id.viewport; out.locale = id.locale; out.timezoneId = id.timezoneId; }
  return out;
}

/**
 * undici dispatcher that routes a native `fetch()` through this account's proxy,
 * or undefined if none configured. Used by API-based posters (e.g. HackMD) so
 * their HTTP calls leave from the same static IP as their browser sessions.
 */
export function proxyDispatcher(_nickname: string, _platform?: string): ProxyAgent | undefined {
  // PROXIES DISABLED 2026-07-28 — fetch()/undici always uses no proxy dispatcher.
  // Original implementation lives in git history — revert this file to restore.
  return undefined;
}

/**
 * Non-sensitive summary for the dashboard: which accounts have an explicit proxy,
 * whether a template exists, and rotation counters. NEVER returns credentials.
 */
export function proxySummary(): { configured: boolean; template: boolean; accounts: string[]; rotations: Record<string, number> } {
  const f = loadFile();
  return {
    configured: proxiesConfigured(),
    template: !!f.sessionTemplate,
    accounts: Object.keys(f.byNickname || {}),
    rotations: loadRotation(),
  };
}

/** True once proxies.json actually defines something. Lets callers log/skip. */
export function proxiesConfigured(): boolean {
  const f = loadFile();
  return !!(f.sessionTemplate || f.default || (f.byNickname && Object.keys(f.byNickname).length));
}

export function _resetForTest(): void { cache = null; }
