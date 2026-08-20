/**
 * sessionDelete.ts — fully remove ONE fleet account: session profile, registry
 * entry, health ledger entry, and any cookies-only fallback file. A "delete" that
 * only rm -rf'd the session dir would leave the account resolvable (via its
 * registry entry) and its health/warmup history intact — the scheduler would still
 * try to post to it. This removes every reference so the account genuinely stops
 * existing anywhere in the system.
 */
import fs from 'fs';
import path from 'path';
import { PLATFORMS } from './config.js';
import { agentSessionDir, fleetNickname } from './sessionResolver.js';

export interface DeleteResult {
  nickname: string;
  platform: string;
  removed: {
    sessionDir: boolean;
    registryEntry: boolean;
    healthEntry: boolean;
    cookiesFile: boolean;
  };
}

/** Remove one fleet nickname from a platform's flat JSON registry, if present. */
function removeFromRegistry(registryFile: string, nickname: string): boolean {
  const file = path.resolve(registryFile);
  if (!fs.existsSync(file)) return false;
  let list: any[];
  try { list = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return false; }
  if (!Array.isArray(list)) return false;
  const nick = nickname.toLowerCase();
  const next = list.filter((e) => (e?.nickname || '').toLowerCase() !== nick);
  if (next.length === list.length) return false;
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8');
  return true;
}

/** Remove this account's entry from the account-health ledger (.accounts/health.json). */
function removeFromHealth(platformLabel: string, nickname: string): boolean {
  const file = path.resolve('.accounts/health.json');
  if (!fs.existsSync(file)) return false;
  let ledger: Record<string, unknown>;
  try { ledger = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return false; }
  const key = `${platformLabel}:${nickname.toLowerCase().trim()}`;
  if (!(key in ledger)) return false;
  delete ledger[key];
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2), 'utf-8');
  return true;
}

/** Remove the cookies-only fallback file for this nickname, if present (x/fb/li use this path). */
function removeCookiesFile(platformKey: string, nickname: string): boolean {
  const candidates = [
    path.resolve('.sessions-cookies', `${platformKey}-${nickname}.json`),
    path.resolve('.sessions-cookies', `${platformKey}_${nickname}.json`),
  ];
  let removedAny = false;
  for (const f of candidates) {
    if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); removedAny = true; }
  }
  return removedAny;
}

/**
 * Delete a single fleet account entirely: session profile dir, registry entry,
 * health ledger entry, cookies fallback file. Idempotent — deleting an
 * already-gone account is a no-op, not an error.
 */
export function deleteFleetAccount(agent: string, platform: string, index: number): DeleteResult {
  const plat = PLATFORMS[platform];
  if (!plat) throw new Error(`Unknown platform: ${platform}`);
  const nickname = fleetNickname(agent, index);
  const sessionDir = agentSessionDir(agent, platform, index);

  let sessionRemoved = false;
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    sessionRemoved = true;
  }

  const registryRemoved = removeFromRegistry(plat.registryFile, nickname);
  // Health ledger keys by the human-readable platform label used across the
  // scheduler (e.g. "X", "Facebook", "LinkedIn"), not the portal's short key —
  // match masterCoordinator's healthGate() call sites.
  const healthLabel = HEALTH_LABEL[platform] || plat.label;
  const healthRemoved = removeFromHealth(healthLabel, nickname);
  const cookiesRemoved = removeCookiesFile(platform, nickname);

  return {
    nickname, platform,
    removed: {
      sessionDir: sessionRemoved,
      registryEntry: registryRemoved,
      healthEntry: healthRemoved,
      cookiesFile: cookiesRemoved,
    },
  };
}

// Portal key → the label accountHealth.ts / masterCoordinator.ts actually use.
const HEALTH_LABEL: Record<string, string> = {
  x: 'X', fb: 'Facebook', li: 'LinkedIn', 'linkedin-pulse': 'LinkedIn Pulse',
  medium: 'Medium', devto: 'Dev.to', calisthenics: 'Calisthenics',
  note: 'Note', linkmate: 'Linkmate',
  blogger: 'Blogger', wordpress: 'WordPress', googlesite: 'Google Sites',
  hackmd: 'HackMD', notion: 'Notion',
};
