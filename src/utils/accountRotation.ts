/**
 * accountRotation.ts — strict round-robin account selection for social
 * posting, for agents with more than one account on a platform (e.g. Vansh
 * has 2 X accounts, 3 Facebook accounts).
 *
 * The account count per agent+platform is a manual declaration — set via
 * the dashboard's Account Logins page ("how many accounts do you have
 * logged in for this platform") — not auto-detected from session state.
 * When the count is 2+, rotation assumes nicknames "{agent} 1".."{agent} N"
 * exist in that platform's account registry (however they were logged in —
 * the dashboard's "+ Add account" flow or a standalone CLI login script both
 * work, since every platform's login.ts resolves nicknames by exact match
 * regardless of how the session was created). If a declared account was
 * never actually logged in, the platform's own login.ts fails loudly
 * ("account not found") — same behavior as today, not swallowed here.
 */
import fs from 'fs';
import path from 'path';

const COUNTS_FILE = path.resolve('.accounts/account-counts.json');
const ROTATION_FILE = path.resolve('.accounts/rotation-state.json');

type CountsByAgent = Record<string, Record<string, number>>; // { agent: { platformKey: count } }

function loadJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function saveJson(file: string, data: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch { /* non-critical */ }
}

/** How many accounts the agent has declared for this platform (default 1 — today's behavior). */
export function getAccountCount(agent: string, platformKey: string): number {
  const counts = loadJson<CountsByAgent>(COUNTS_FILE, {});
  const n = counts[agent.toLowerCase()]?.[platformKey];
  return n && n > 0 ? Math.floor(n) : 1;
}

/** All declared counts for one agent, e.g. { x: 2, fb: 3 } — for the dashboard to display. */
export function getAccountCounts(agent: string): Record<string, number> {
  const counts = loadJson<CountsByAgent>(COUNTS_FILE, {});
  return counts[agent.toLowerCase()] ?? {};
}

export function setAccountCount(agent: string, platformKey: string, count: number): void {
  const counts = loadJson<CountsByAgent>(COUNTS_FILE, {});
  const key = agent.toLowerCase();
  counts[key] = { ...(counts[key] ?? {}), [platformKey]: Math.max(0, Math.floor(count)) };
  saveJson(COUNTS_FILE, counts);
}

/**
 * Pick which account to post from for `agent` on `platformKey`.
 * - count <= 1 (default, nothing declared) → `fallbackNickname` unchanged.
 * - count >= 2 → strict round-robin across "{agent} 1".."{agent} {count}",
 *   persisted across process restarts so consecutive posting cycles keep
 *   advancing instead of always starting over at account 1.
 */
export function selectAccountForPlatform(agent: string, platformKey: string, fallbackNickname: string): string {
  const count = getAccountCount(agent, platformKey);
  if (count <= 1) return fallbackNickname;

  const key = `${agent.toLowerCase()}:${platformKey}`;
  const state = loadJson<Record<string, number>>(ROTATION_FILE, {});
  const last = state[key] ?? 0;
  const next = last >= count ? 1 : last + 1;

  state[key] = next;
  saveJson(ROTATION_FILE, state);

  return `${agent} ${next}`;
}
