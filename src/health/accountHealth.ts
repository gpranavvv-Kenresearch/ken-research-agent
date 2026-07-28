/**
 * accountHealth.ts — per-account health ledger + ban-avoidance gate.
 *
 * The bot already DETECTS restriction signals (resilientBrowser classifies
 * NEEDS_HUMAN / FATAL; error strings carry "checkpoint", "unusual activity",
 * etc.). What was missing is MEMORY + a DECISION: after an account flashes a
 * warning, keep posting on it and a recoverable warning becomes a permanent
 * ban. This module persists health and gates the next post.
 *
 * Not ML — bans come from a finite, known signal set. A rules engine with a
 * feedback loop kills the escalation deaths.
 *
 * Storage: one JSON file (.accounts/health.json). The poster runs sequentially
 * (one browser at a time), so no locking is needed.
 * ponytail: single-writer assumed. If posting ever goes concurrent (>1 browser
 * at once), add a file lock or move this to SQLite — otherwise two writers race.
 */
import fs from 'fs';
import path from 'path';

const LEDGER_FILE = process.env.HEALTH_LEDGER_FILE || path.join(process.cwd(), '.accounts', 'health.json');

export type Signal = 'SUCCESS' | 'SOFT' | 'HARD' | 'FATAL' | 'RETRYABLE';
export type Status = 'active' | 'cooldown' | 'quarantined' | 'dead';

export interface AccountHealth {
  platform: string;
  nickname: string;
  status: Status;
  healthScore: number;      // 0-100
  postsToday: number;
  dayStamp: string;         // IST YYYY-MM-DD — resets postsToday
  warmup: boolean;          // true only for accounts explicitly onboarded as NEW
  firstSeen: string;        // IST date of first record — drives warmup ramp
  consecutiveFails: number;
  lastSignal: string;
  cooldownUntil: string | null;   // ISO
  lastPostAt: string | null;
  totalPosts: number;
  totalFails: number;
  note: string;             // human-readable last event (for the dashboard/sheet)
}

/**
 * Ban-safe posts/account/day per platform (see capacity model). The ban-happy
 * three (X/FB/LinkedIn) are held a notch BELOW nominal because, with no proxies,
 * all accounts still share one datacenter IP — extra conservatism there buys
 * headroom against correlation flags. Raise once per-account proxies exist.
 */
const SAFE_CAP: Record<string, number> = {
  X: 6, Facebook: 4, LinkedIn: 2, 'LinkedIn Pulse': 1,
  Medium: 3, 'Dev.to': 3, Calisthenics: 3,
  Ameba: 5, Note: 5, Linkmate: 5, Paragraph: 8,
  Blogger: 10, WordPress: 10, 'Google Sites': 10, HackMD: 10, Notion: 10,
};
const DEFAULT_CAP = 5;

const WARMUP_DAYS = 18;          // ramp a new account to full cap over ~2.5 weeks
const SOFT_COOLDOWN_H = 48;      // rate-limit / temp-block → bench 2 days
const HARD_MEANS_QUARANTINE = true; // checkpoint/challenge → stop until a human clears it

function safeCap(platform: string): number {
  return SAFE_CAP[platform] ?? DEFAULT_CAP;
}

/** IST calendar day, so postsToday/warmup align with the posting schedule. */
function istDay(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

function daysBetween(fromDay: string, toDay: string): number {
  const a = new Date(fromDay + 'T00:00:00Z').getTime();
  const b = new Date(toDay + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// ── ledger IO ───────────────────────────────────────────────────────────────
type Ledger = Record<string, AccountHealth>;
let cache: Ledger | null = null;

function load(): Ledger {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache!;
}

function persist(): void {
  try {
    fs.mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(cache, null, 2));
  } catch { /* non-fatal: a failed write must never block posting */ }
}

const key = (platform: string, nickname: string) =>
  `${platform}:${nickname.toLowerCase().trim()}`;

function getOrInit(platform: string, nickname: string, nowIso: string): AccountHealth {
  const l = load();
  const k = key(platform, nickname);
  if (!l[k]) {
    // An account first SEEN by the ledger is assumed ESTABLISHED (warmup:false)
    // — the existing fleet was already warmed before this system existed, so it
    // must NOT be throttled to the day-1 cap. Warmup is opt-in via markNew().
    l[k] = {
      platform, nickname, status: 'active', healthScore: 100,
      postsToday: 0, dayStamp: istDay(nowIso), warmup: false, firstSeen: istDay(nowIso),
      consecutiveFails: 0, lastSignal: '', cooldownUntil: null,
      lastPostAt: null, totalPosts: 0, totalFails: 0, note: 'established',
    };
  }
  return l[k];
}

/** Roll daily counter + auto-clear an expired cooldown back to active. */
function refresh(h: AccountHealth, nowIso: string): void {
  const today = istDay(nowIso);
  if (h.dayStamp !== today) { h.dayStamp = today; h.postsToday = 0; }
  if (h.status === 'cooldown' && h.cooldownUntil && new Date(h.cooldownUntil) <= new Date(nowIso)) {
    h.status = 'active';
    h.cooldownUntil = null;
    h.note = 'cooldown expired → active';
  }
}

/** Effective daily cap = safe cap, throttled by warmup and by low health. */
export function effectiveCap(h: AccountHealth, nowIso: string): number {
  const base = safeCap(h.platform);
  let cap = base;
  if (h.warmup) { // only genuinely-new accounts ramp; established fleet uses full cap
    const age = daysBetween(h.firstSeen, istDay(nowIso));
    cap = Math.min(base, Math.max(1, Math.ceil(((age + 1) / WARMUP_DAYS) * base)));
  }
  if (h.healthScore < 50) cap = Math.max(1, Math.floor(cap / 2)); // recently warned → back off
  return cap;
}

/**
 * Onboard a genuinely-new account: start the warmup ramp from today. Call this
 * when provisioning a fresh account so it eases into full rate over ~2.5 weeks.
 * Existing accounts should NEVER be marked new (they'd get throttled to 1/day).
 */
export function markNew(platform: string, nickname: string): void {
  const now = new Date().toISOString();
  const h = getOrInit(platform, nickname, now);
  h.warmup = true;
  h.firstSeen = istDay(now);
  h.note = 'onboarded (warmup started)';
  persist();
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Can this account post right now? Call BEFORE posting. Fail-open on unknown
 * accounts (returns true) so a fresh account is never silently locked out.
 */
export function canPost(platform: string, nickname: string, nowIso = new Date().toISOString())
  : { ok: boolean; reason: string; cap: number; used: number } {
  const h = getOrInit(platform, nickname, nowIso);
  refresh(h, nowIso);
  persist();
  const cap = effectiveCap(h, nowIso);
  if (h.status === 'dead')        return { ok: false, reason: 'account dead (banned/suspended)', cap, used: h.postsToday };
  if (h.status === 'quarantined') return { ok: false, reason: 'quarantined — needs human review', cap, used: h.postsToday };
  if (h.status === 'cooldown')    return { ok: false, reason: `cooling down until ${h.cooldownUntil}`, cap, used: h.postsToday };
  // Daily cap removed by explicit instruction — only real ban signals (dead /
  // quarantined / cooldown, all above) gate posting now, not an arbitrary
  // posts-per-day ceiling. postsToday/cap are still tracked and returned for
  // visibility (dashboard/logs), just no longer enforced here.
  return { ok: true, reason: 'ok', cap, used: h.postsToday };
}

/** Classify a post result into a health signal. */
export function classify(result: { success?: boolean; error?: string; reason?: string }): Signal {
  if (result.success) return 'SUCCESS';
  const e = (result.error || '').toLowerCase();
  const r = (result.reason || '').toUpperCase();
  if (r === 'FATAL' || /\b(suspend|ban|disabl|deactivat|permanent|terminated)/.test(e))
    return 'FATAL';
  if (r === 'NEEDS_HUMAN' || /checkpoint|challenge|unusual activity|verify your|2fa|captcha|confirm your identity|\blocked\b/.test(e))
    return 'HARD';
  if (/rate.?limit|too many|too fast|slow down|action.?blocked|try again later|try later|temporarily|throttl|flood|restricted/.test(e))
    return 'SOFT';
  return 'RETRYABLE'; // selector timeout / network / generic — NOT a ban signal
}

/**
 * Record a post outcome. Call AFTER posting (success or failure). Updates the
 * ledger and applies the signal→action policy. Never throws.
 */
export function record(
  platform: string,
  nickname: string,
  result: { success?: boolean; error?: string; reason?: string },
  nowIso = new Date().toISOString(),
): Signal {
  const h = getOrInit(platform, nickname, nowIso);
  refresh(h, nowIso);
  const sig = classify(result);
  h.lastSignal = sig;
  h.lastPostAt = nowIso;

  switch (sig) {
    case 'SUCCESS':
      h.postsToday += 1;
      h.totalPosts += 1;
      h.consecutiveFails = 0;
      h.healthScore = Math.min(100, h.healthScore + 2);
      if (h.status === 'active') h.note = `posted (${h.postsToday}/day)`;
      break;
    case 'FATAL':
      h.status = 'dead';
      h.healthScore = 0;
      h.totalFails += 1;
      h.note = `DEAD: ${result.error || 'banned/suspended'}`;
      break;
    case 'HARD':
      h.totalFails += 1;
      h.consecutiveFails += 1;
      h.healthScore = Math.max(0, h.healthScore - 40);
      if (HARD_MEANS_QUARANTINE) {
        h.status = 'quarantined';
        h.note = `QUARANTINE: ${result.error || 'checkpoint/challenge'}`;
      }
      break;
    case 'SOFT':
      h.totalFails += 1;
      h.consecutiveFails += 1;
      h.healthScore = Math.max(0, h.healthScore - 20);
      h.status = 'cooldown';
      h.cooldownUntil = new Date(new Date(nowIso).getTime() + SOFT_COOLDOWN_H * 3_600_000).toISOString();
      h.note = `COOLDOWN ${SOFT_COOLDOWN_H}h: ${result.error || 'rate/temp block'}`;
      break;
    case 'RETRYABLE':
      // RETRYABLE = selector timeout / network / generic code failure — explicitly
      // NOT an account-ban signal. Benching the account here is counterproductive:
      // the NEXT account hits the same page/selector bug, so a single platform
      // regression (e.g. Medium's slow submission page) cascaded into a FLEET-WIDE
      // cooldown outage — the whole fleet benched for problems that aren't the
      // account's fault. So we TRACK the flaky failure but never cooldown on it.
      // Only real ban signals (SOFT/HARD/FATAL — checkpoint / suspended / dead)
      // bench an account. A genuinely broken account will surface one of those.
      h.totalFails += 1;
      h.consecutiveFails += 1;
      h.healthScore = Math.max(0, h.healthScore - 2);
      h.note = `flaky fail (${h.consecutiveFails}, no bench): ${result.error || 'unknown'}`;
      break;
  }
  persist();
  return sig;
}

/** Manual override — a human cleared the checkpoint / re-verified the account. */
export function reactivate(platform: string, nickname: string): void {
  const h = getOrInit(platform, nickname, new Date().toISOString());
  h.status = 'active';
  h.cooldownUntil = null;
  h.consecutiveFails = 0;
  h.healthScore = Math.max(h.healthScore, 60);
  h.note = 'manually reactivated';
  persist();
}

/** All ledger entries (for reports / A-B comparisons). */
export function allAccounts(): AccountHealth[] {
  return Object.values(load());
}

/** Snapshot for a dashboard / sheet / CLI. */
export function summary(): { total: number; byStatus: Record<Status, number>; needsAttention: AccountHealth[] } {
  const l = load();
  const byStatus: Record<Status, number> = { active: 0, cooldown: 0, quarantined: 0, dead: 0 };
  const needsAttention: AccountHealth[] = [];
  for (const h of Object.values(l)) {
    byStatus[h.status]++;
    if (h.status === 'quarantined' || h.status === 'dead') needsAttention.push(h);
  }
  return { total: Object.keys(l).length, byStatus, needsAttention };
}

// Test hook only — reset in-memory cache so the self-check starts clean.
export function _resetForTest(): void { cache = {}; }
