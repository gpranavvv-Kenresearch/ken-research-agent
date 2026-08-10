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

// Same files each platform's own login.ts reads its account registry from —
// duplicated here (not imported) since each login.ts also carries its own
// per-platform field shape; only the nickname list is needed for this check.
const PLATFORM_ACCOUNTS_FILE: Record<string, string> = {
  x: '.accounts/accounts.json',
  fb: '.accounts/facebook-accounts.json',
  li: '.accounts/linkedin-accounts.json',
  medium: '.accounts/accounts-medium.json',
  wordpress: '.accounts/accounts-wordpress.json',
  blogger: '.accounts/accounts-blogger.json',
  notion: '.accounts/accounts-notion.json',
  patreon: '.accounts/accounts-patreon.json',
  paragraph: '.accounts/accounts-paragraph.json',
  substack: '.accounts/accounts-substack.json',
  hackmd: '.accounts/accounts-hackmd.json',
  devto: '.accounts/accounts-devto.json',
  googlesite: '.accounts/accounts-googlesite.json',
  calisthenics: '.accounts/accounts-calisthenics.json',
  linkmate: '.accounts/accounts-linkmate.json',
  note: '.accounts/accounts-note.json',
  ameba: '.accounts/accounts-ameba.json',
  articlescad: '.accounts/accounts-articlescad.json',
};

/** Nicknames actually registered for this platform, lowercased. Empty if the registry is unreadable. */
function registeredNicknames(platformKey: string): Set<string> {
  const file = PLATFORM_ACCOUNTS_FILE[platformKey];
  if (!file) return new Set();
  const list = loadJson<Array<{ nickname?: string }>>(path.resolve(file), []);
  if (!Array.isArray(list)) return new Set();
  return new Set(list.map(a => String(a.nickname ?? '').toLowerCase()).filter(Boolean));
}

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
 * - count <= 1 (default, nothing declared) → the clean `agent` identity
 *   (WORKER_NAME-preferred at every call site in masterCoordinator.ts), NOT
 *   `fallbackNickname` — that's always the sheet's raw Name cell, which can
 *   be stale (e.g. leftover "agent 2" from before a fleet was flattened to
 *   one account) and was silently trusted here instead of the known-good
 *   agent identity that was already resolved before this function was even
 *   called. The sheet's Name column should never need to be right for this
 *   to work — only WORKER_NAME does.
 *   Some platform registries (Blogger, LinkedIn) were built numbered from
 *   the start and never got a bare-name entry at all. Others have BOTH a
 *   legacy bare entry (often stored with real, possibly stale/dead
 *   credentials — e.g. Sanya's X account is registered as bare "sanya" but
 *   hasn't been logged in) AND a numbered "{agent} 1" entry created through
 *   the dashboard's session-only manual-login flow (no stored credentials,
 *   just a live browser session — see sessionResolver.ts's
 *   registerFleetAccount). The numbered form is the current, intended path
 *   for single-account agents too — so whenever "{agent} 1" is registered,
 *   use it, regardless of whether a bare entry also exists. Only fall back
 *   to bare when no numbered entry exists for this platform at all (e.g.
 *   HackMD, which some agents only ever registered under a bare API-key
 *   entry).
 * - count >= 2 → strict round-robin across "{agent} 1".."{agent} {count}",
 *   persisted across process restarts so consecutive posting cycles keep
 *   advancing instead of always starting over at account 1.
 */
export function selectAccountForPlatform(agent: string, platformKey: string, fallbackNickname: string): string {
  // Local per-row-name mode: callers pass (WORKER_NAME || rowName, platform, rowName),
  // so the WORKER normally wins and every row posts as the same worker account. When
  // PREFER_ROW_NAME=true (local fleet: one sheet, a different Name per row), use the
  // row's Name instead so each row logs into its own .sessions/x/{name} account. The
  // VPS never sets this flag, so its per-worker rotation is unchanged.
  if (process.env.PREFER_ROW_NAME === 'true' && fallbackNickname) {
    agent = fallbackNickname;
  }
  const count = getAccountCount(agent, platformKey);
  if (count <= 1) {
    const bare = agent || fallbackNickname;
    const registered = registeredNicknames(platformKey);
    if (registered.has(`${bare.toLowerCase()} 1`)) {
      return `${bare} 1`;
    }
    return bare;
  }

  const key = `${agent.toLowerCase()}:${platformKey}`;
  const state = loadJson<Record<string, number>>(ROTATION_FILE, {});
  const last = state[key] ?? 0;
  const next = last >= count ? 1 : last + 1;

  state[key] = next;
  saveJson(ROTATION_FILE, state);

  return `${agent} ${next}`;
}
