/**
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
function loadFile(): ProxyFile {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(proxyFilePath(), 'utf8')); }
  catch { cache = {}; }
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

/** Sticky proxy for this account, or undefined if none configured. */
export function getProxy(nickname: string): ProxyConfig | undefined {
  const f = loadFile();
  const n = nickname.toLowerCase().trim();
  const rot = loadRotation()[n] || 0;
  if (f.byNickname?.[n]) return subst(f.byNickname[n], n, rot);
  if (f.sessionTemplate)  return subst(f.sessionTemplate, n, rot);
  if (f.default)          return subst(f.default, n, rot);
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
export function getLaunchIdentity(nickname: string): LaunchIdentity {
  const h = hash(nickname.toLowerCase().trim());
  const geo = geoFor(nickname);
  return {
    proxy: getProxy(nickname),
    userAgent: UA_POOL[h % UA_POOL.length],
    viewport: VIEWPORTS[(h >> 8) % VIEWPORTS.length],
    locale: geo.locale,
    timezoneId: geo.timezoneId,
  };
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
export function identityLaunchOverrides(sessionDir: string, nickname: string):
  Partial<{ proxy: ProxyConfig; userAgent: string; viewport: { width: number; height: number }; locale: string; timezoneId: string }> {
  try {
    if (fs.existsSync(sessionDir)) return {}; // established session → change nothing
  } catch { return {}; }
  const id = getLaunchIdentity(nickname);
  const out: any = { userAgent: id.userAgent, viewport: id.viewport, locale: id.locale, timezoneId: id.timezoneId };
  if (id.proxy) out.proxy = id.proxy;
  return out;
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
