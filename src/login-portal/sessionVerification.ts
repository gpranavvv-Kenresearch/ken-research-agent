/**
 * sessionVerification.ts — the dashboard's "logged in" indicator today comes
 * only from `sessionResolver.ts`'s cookie-presence guess, which can be wrong
 * in both directions but especially "stuck ready": a profile that has a
 * session cookie on disk but whose actual login expired/was signed out shows
 * "● Logged in" / "👁 View session" forever, because nothing ever re-checks
 * it. Confirmed live 2026-09 for Mastodon (posting fails with "compose
 * textarea not found" — a logged-out page — while the dashboard still shows
 * ready) and for a ChatGPT profile stuck on a login modal.
 *
 * Fix: record the REAL outcome of an actual attempt — a poster's success/
 * failure, a login flow's own logged-in check — the single most reliable
 * signal there is, more trustworthy than any cookie guess. `isKnownLoggedOut`
 * lets the status endpoint override a stale cookie-based "ready" with this
 * real signal. A recorded "ready: true" is NOT used to override a "not
 * ready" cookie check — only a real negative signal short-circuits the
 * positive default, so this can only turn a wrong "ready" into "not ready",
 * never invent a false "ready".
 *
 * Negative results expire after NEGATIVE_TTL_MS so a manual re-login that
 * never happens to trigger a call here still self-heals eventually instead
 * of showing "not logged in" forever.
 */
import fs from 'fs';
import path from 'path';

const FILE = path.resolve('.sessions-cookies/session-verification.json');
const NEGATIVE_TTL_MS = 3 * 60 * 60 * 1000; // 3h — outlives one rotation lap, short enough to self-heal

interface Entry { ready: boolean; reason?: string; checkedAt: number; }
type Store = Record<string, Entry>;

function readStore(): Store {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function writeStore(s: Store): void {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(s, null, 2)); } catch { /* non-critical */ }
}
function key(platform: string, nickname: string): string {
  return `${platform.trim().toLowerCase()}:${nickname.trim().toLowerCase()}`;
}

/** Record what an actual login/post/generation attempt just found. */
export function recordSessionState(platform: string, nickname: string, ready: boolean, reason?: string): void {
  if (!nickname) return;
  const s = readStore();
  s[key(platform, nickname)] = { ready, reason, checkedAt: Date.now() };
  writeStore(s);
}

/** True only for a recent, real "this account is NOT logged in" signal. */
export function isKnownLoggedOut(platform: string, nickname: string): boolean {
  const e = readStore()[key(platform, nickname)];
  if (!e || e.ready) return false;
  return Date.now() - e.checkedAt < NEGATIVE_TTL_MS;
}

/** For the dashboard: the raw recorded entry, if any (used to show a reason/age). */
export function getRecordedState(platform: string, nickname: string): Entry | null {
  return readStore()[key(platform, nickname)] ?? null;
}
