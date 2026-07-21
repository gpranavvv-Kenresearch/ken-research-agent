/**
 * sessionResolver.ts — single source of truth for the fleet session convention.
 *
 * Convention (see plan):
 *   .sessions-{agent}/{platform}-{index}/     ← persistent Chrome profile dir
 *   sheet Name cell "{agent} {index}"          ← nickname the scheduler resolves
 *
 * The scheduler already routes a row's `Name` verbatim to the platform login
 * lookup (masterCoordinator.ts). So registering a password-less account whose
 * nickname is "{agent} {index}" and whose sessionDir points at the profile below
 * makes fleet sessions reachable with NO scheduler code change.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { PLATFORMS, PLATFORM_KEYS } from './config.js';
import { isDevtoLoggedInCached } from './devtoDeepCheck.js';

/**
 * ChatGPT (and the image-gen variant) get one profile PER AGENT, not per-index —
 * each agent's blog writer is a single persistent session, separate from every
 * other agent's, so two agents can generate concurrently without fighting over
 * the same Chrome profile lock. "abhinav" keeps the original un-suffixed path
 * (the session already logged in there before this became per-agent) so nothing
 * about the live, working session changes; every other agent gets its own
 * `chatgpt-profile-{agent}` dir.
 */
function chatgptProfileDir(agent: string, base: 'chatgpt-profile' | 'chatgpt-image-profile'): string {
  const a = agent.toLowerCase();
  return path.resolve('.sessions-cookies', a === 'abhinav' ? base : `${base}-${a}`);
}

/** Absolute path to a fleet account's Chrome profile dir. */
export function agentSessionDir(agent: string, platform: string, index: number): string {
  if (platform === 'chatgpt') return chatgptProfileDir(agent, 'chatgpt-profile');
  if (platform === 'chatgpt-image') return chatgptProfileDir(agent, 'chatgpt-image-profile');
  return path.resolve(`.sessions-${agent.toLowerCase()}`, `${platform}-${index}`);
}

/** The nickname the sheet Name cell must contain to route to this account. */
export function fleetNickname(agent: string, index: number): string {
  return `${agent.toLowerCase()} ${index}`;
}

/** Locate the Chrome Cookies SQLite DB inside a profile dir (newer path first). */
function cookiesDbPath(dir: string): string | null {
  const candidates = [
    path.join(dir, 'Default', 'Network', 'Cookies'),
    path.join(dir, 'Default', 'Cookies'),
  ];
  return candidates.find(fs.existsSync) || null;
}

function cookieCondition(names: string[]): string {
  // Build an OR of exact-name and prefix (trailing '*') matches. Cookie names
  // come from config (not user input), so simple quoting is safe here.
  return names
    .map((n) => (n.endsWith('*')
      ? `name LIKE '${n.slice(0, -1).replace(/'/g, "''")}%'`
      : `name='${n.replace(/'/g, "''")}'`))
    .join(' OR ');
}

/**
 * Cheap "is this account logged in" check (no browser): looks for any of the
 * platform's post-login auth cookie NAMES in the profile's Cookies DB. Cookie
 * names are stored unencrypted, so a name lookup needs no decryption. This
 * distinguishes a real login from a profile that merely opened the login page
 * (which leaves only guest cookies) — for MOST platforms. Falls back to false
 * on any error.
 */
function cookieBasedLoggedIn(dir: string, platform: string): boolean {
  const plat = PLATFORMS[platform];
  if (!plat || !plat.authCookies.length) return false;
  const db = cookiesDbPath(dir);
  if (!db) return false;
  try {
    // Read-only, immutable open so a live Chrome lock doesn't block us.
    const out = execFileSync(
      'sqlite3',
      [`file:${db}?immutable=1`, `SELECT 1 FROM cookies WHERE ${cookieCondition(plat.authCookies)} LIMIT 1;`],
      { encoding: 'utf-8', timeout: 4000 },
    );
    return out.trim() === '1';
  } catch {
    return false;
  }
}

/**
 * Best-known "is this account logged in" check. Dev.to (Forem) issues the same
 * session cookie to every visitor — logged in or not — so cookie-presence alone
 * is unreliable there (confirmed: fleet accounts showed "logged in" while
 * actually logged out). For Dev.to specifically, use a cached real browser
 * check instead; every other platform keeps the cheap cookie check.
 */
export function isLoggedIn(dir: string, platform: string): boolean {
  const cookieResult = cookieBasedLoggedIn(dir, platform);
  if (platform === 'devto') return isDevtoLoggedInCached(dir, cookieResult);
  return cookieResult;
}

/** Back-compat name used across the portal: readiness = logged in. */
export function sessionReadyForDir(dir: string, platform: string): boolean {
  return isLoggedIn(dir, platform);
}

export interface FleetAccountStatus {
  platform: string;
  index: number;
  nickname: string;
  sessionDir: string;
  ready: boolean;      // has a saved session on disk
}

export interface AgentStatus {
  agent: string;
  platforms: Record<string, FleetAccountStatus[]>;
}

/**
 * Derive an agent's fleet status by scanning `.sessions-{agent}/{platform}-*`.
 * Accounts appear once a login has been started (the dir is created then).
 */
export function listAgentStatus(agent: string): AgentStatus {
  const a = agent.toLowerCase();
  const root = path.resolve(`.sessions-${a}`);
  const platforms: Record<string, FleetAccountStatus[]> = {};
  for (const key of PLATFORM_KEYS) platforms[key] = [];

  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root)) {
      const m = entry.match(/^([a-z]+)-(\d+)$/);
      if (!m) continue;
      const platform = m[1];
      const index = Number(m[2]);
      if (!PLATFORMS[platform]) continue;
      const dir = path.join(root, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      platforms[platform].push({
        platform,
        index,
        nickname: fleetNickname(a, index),
        sessionDir: dir,
        ready: isLoggedIn(dir, platform),
      });
    }
  }

  for (const key of PLATFORM_KEYS) platforms[key].sort((x, y) => x.index - y.index);

  // ChatGPT sessions live outside .sessions-{agent} (see agentSessionDir) — one
  // profile per agent, not per-index; report this agent's own profile directly.
  if (PLATFORMS['chatgpt']) {
    const dir = chatgptProfileDir(a, 'chatgpt-profile');
    platforms['chatgpt'] = [{
      platform: 'chatgpt', index: 1, nickname: a,
      sessionDir: dir, ready: isLoggedIn(dir, 'chatgpt'),
    }];
  }
  if (PLATFORMS['chatgpt-image']) {
    const dir = chatgptProfileDir(a, 'chatgpt-image-profile');
    platforms['chatgpt-image'] = [{
      platform: 'chatgpt-image', index: 1, nickname: a,
      sessionDir: dir, ready: isLoggedIn(dir, 'chatgpt-image'),
    }];
  }

  return { agent: a, platforms };
}

/** Next free index for a platform (max existing + 1, else 1). */
export function nextIndex(agent: string, platform: string): number {
  const status = listAgentStatus(agent);
  const list = status.platforms[platform] || [];
  return list.length ? Math.max(...list.map(a => a.index)) + 1 : 1;
}

/**
 * Register a password-less fleet account in the flat registry the scheduler reads,
 * so `row.name = "{agent} {index}"` resolves to this session. Idempotent.
 * No credentials are stored — the user logs in via the live browser.
 */
export function registerFleetAccount(agent: string, platform: string, index: number): void {
  const plat = PLATFORMS[platform];
  if (!plat) throw new Error(`Unknown platform: ${platform}`);
  // ChatGPT sessions are shared engine sessions, not scheduler posting targets — no registry entry.
  if (platform === 'chatgpt' || platform === 'chatgpt-image') return;

  const file = path.resolve(plat.registryFile);
  const nickname = fleetNickname(agent, index);
  const sessionDir = `.sessions-${agent.toLowerCase()}/${platform}-${index}`;

  let list: any[] = [];
  if (fs.existsSync(file)) {
    try { list = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { list = []; }
    if (!Array.isArray(list)) list = [];
  }

  const already = list.some(
    (e) => (e?.nickname || '').toLowerCase() === nickname && (e?.sessionDir || '') === sessionDir
  );
  if (already) return;

  // X registry entries also carry `handle`; keep it equal to the nickname so the
  // X lookup (handle OR nickname match) still resolves this entry.
  const entry: Record<string, unknown> = { nickname, sessionDir, active: true };
  if (platform === 'x') { entry.handle = nickname; entry.username = ''; entry.password = ''; }
  else { entry.email = ''; entry.password = ''; }

  list.push(entry);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf-8');
}
