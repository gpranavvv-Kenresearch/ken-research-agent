/**
 * nightly-social-rotation.ts — daily SOCIAL posting rotation (X, Facebook,
 * LinkedIn post, Mastodon, Tumblr) across the 6 personal-sheet agents, run in
 * per-ACCOUNT passes so every account a member has gets the full daily quota
 * — the same quota for everyone:
 *
 *   DAILY_TARGET (posts per ACCOUNT per day):  x 4 · fb 4 · lipost 3 · mastodon 2 · tumblr 2
 *
 * How one day runs (agent order vijay → hritika → sanya → meenakshi → vansh → sameeksha):
 *
 *   Account pass 1  — everyone's account #1
 *     batch 1: each agent, in order, posts 1 on x, fb, lipost, mastodon, tumblr
 *     batch 2: the same again                        → mastodon & tumblr reach 2, drop out
 *     batch 3: each agent posts 1 on x, fb, lipost    → lipost reaches 3, drops out
 *     batch 4: each agent posts 1 on x, fb            → x & fb reach 4, done
 *   Account pass 2  — account #2, ONLY for agents who declared one on that
 *                     platform; anyone without an account #2 is skipped (no post)
 *     batches 1–4 exactly as above
 *   Account pass 3, 4, …  as far as the highest declared count goes
 *   → "Social day complete", then wait for tomorrow's SOCIAL_START.
 *
 * Batches are derived from DAILY_TARGET (batch k = every platform whose target
 * is >= k) and passes from .accounts/account-counts.json (the "Accounts" number
 * each member sets per platform on their dashboard page — see
 * accountRotation.ts), re-read at the start of every day — so declaring a new
 * account or changing a quota needs no code change.
 *
 * One "step" = one agent × one batch × one account: a counted post cycle with
 * count 1 per platform (postCycle.ts startPostCycle → run-post-cycle-once.ts →
 * runCountedPostCycle = exactly one round, no gap). The account is pinned with
 * POST_ACCOUNT_INDEX (accountRotation.ts explicit mode) — no round-robin — so
 * "sanya 1" gets all 4 of its X posts before "sanya 2" starts.
 *
 * Blog-platform posting (Medium, WordPress, Notion, …) is a separate process —
 * scripts/nightly-blogpost-rotation.ts — with its own schedule. Their child
 * cycles serialize through the box-wide post-cycle job slot; a same-agent
 * collision is handled by runPostCycleToCompletion (wait for the other one,
 * then run ours — never skip).
 *
 * Content supply: a row is "Posted" on X once, whichever account posted it —
 * so an agent with 2 X accounts needs 8 fresh X-eligible rows a day to hit the
 * quota. When a sheet runs dry the batch logs "No rows available" and the step
 * simply completes with nothing posted.
 *
 * Config (env):
 *   SOCIAL_START            "HH:MM" IST (default 08:00)
 *   SOCIAL_DAILY_TARGET     JSON merged over the defaults, e.g. '{"lipost":2,"tumblr":1}'
 *   SOCIAL_AGENTS           comma-separated agent subset (testing), e.g. "vijay"
 *   SOCIAL_PERSON_GAP_MIN   pause after each step (default 2)
 *   SOCIAL_BATCH_GAP_MIN    pause between batches (default 10)
 *   SOCIAL_PASS_GAP_MIN     pause between account passes (default 15)
 *   SOCIAL_ROTATION_LOG     log file (default /tmp/nightly-social-rotation.log)
 *
 * Usage:
 *   npx tsx scripts/nightly-social-rotation.ts          # waits for the next SOCIAL_START, then runs daily (production)
 *   npx tsx scripts/nightly-social-rotation.ts --now    # skip the wait, run today's passes immediately, then exit (testing)
 *   npx tsx scripts/nightly-social-rotation.ts --plan   # print today's full step list + per-agent totals; posts nothing
 */
import fs from 'fs';
import { runPostCycleToCompletion } from '../src/login-portal/postCycle.js';
import { getAccountCount } from '../src/utils/accountRotation.js';

const DEFAULT_AGENTS = ['vijay', 'hritika', 'sanya', 'meenakshi', 'vansh', 'sameeksha'];
const AGENTS: string[] = (() => {
  const custom = (process.env.SOCIAL_AGENTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return custom.length ? custom : DEFAULT_AGENTS;
})();

// Posts per ACCOUNT per day. Key = runCountedPostCycle platform key
// (scheduler-new.ts COUNTED_PLATFORMS). Key ORDER = the order the platforms
// run within one step.
const DEFAULT_TARGET: Record<string, number> = { x: 4, fb: 4, lipost: 3, mastodon: 2, tumblr: 2 };
const DAILY_TARGET: Record<string, number> = (() => {
  const target = { ...DEFAULT_TARGET };
  const raw = process.env.SOCIAL_DAILY_TARGET;
  if (raw) {
    try {
      const override = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, value] of Object.entries(override)) {
        if (!(key in DEFAULT_TARGET)) { console.warn(`SOCIAL_DAILY_TARGET: unknown platform "${key}" ignored`); continue; }
        const n = Math.floor(Number(value));
        if (Number.isFinite(n) && n >= 0) target[key] = n;
        else console.warn(`SOCIAL_DAILY_TARGET: bad value for "${key}" ignored`);
      }
    } catch (e) {
      console.warn(`SOCIAL_DAILY_TARGET is not valid JSON — using defaults (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return target;
})();

// Posting-cycle key → the key the account count is declared under
// (.accounts/account-counts.json, i.e. selectAccountForPlatform's platformKey).
// Only LinkedIn differs: one login covers both LinkedIn posts (lipost) and Pulse.
const DECL_KEY: Record<string, string> = { x: 'x', fb: 'fb', lipost: 'li', mastodon: 'mastodon', tumblr: 'tumblr' };

const PERSON_GAP_MS = Number(process.env.SOCIAL_PERSON_GAP_MIN || 2) * 60 * 1000;
const BATCH_GAP_MS = Number(process.env.SOCIAL_BATCH_GAP_MIN || 10) * 60 * 1000;
const PASS_GAP_MS = Number(process.env.SOCIAL_PASS_GAP_MIN || 15) * 60 * 1000;
const POLL_MS = 15_000;

const SKIP_WAIT = process.argv.includes('--now');
const PLAN_ONLY = process.argv.includes('--plan');

const LOG_FILE = process.env.SOCIAL_ROTATION_LOG || '/tmp/nightly-social-rotation.log';
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* noop */ }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseHHMM(s: string, fallback: [number, number]): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h >= 0 && h < 24 && mi >= 0 && mi < 60 ? [h, mi] : fallback;
}
const [START_H, START_M] = parseHHMM(process.env.SOCIAL_START || '', [8, 0]);
const START_LABEL = `${String(START_H).padStart(2, '0')}:${String(START_M).padStart(2, '0')} IST`;

/** Milliseconds until the next occurrence of hh:mm IST (tomorrow if it's already past today). */
function msUntilNextIst(h: number, m: number): number {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const next = new Date(nowIst);
  next.setUTCHours(h, m, 0, 0);
  if (next.getTime() <= nowIst.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - nowIst.getTime();
}

// ── Day plan ────────────────────────────────────────────────────────────────
const PLATFORMS = Object.keys(DAILY_TARGET);
const MAX_BATCHES = Math.max(0, ...Object.values(DAILY_TARGET));

/** Platforms still owed a post in batch k (1-based): those whose daily target is >= k. */
function batchPlatforms(k: number): string[] {
  return PLATFORMS.filter((p) => DAILY_TARGET[p] >= k);
}

/** Highest declared account count across every agent × social platform = number of passes today. */
function accountPassesToday(): number {
  let max = 1;
  for (const agent of AGENTS) {
    for (const p of PLATFORMS) max = Math.max(max, getAccountCount(agent, DECL_KEY[p]));
  }
  return max;
}

/** Counts for one step: 1 on each batch platform where this agent has declared an account #idx. */
function stepCounts(agent: string, batch: number, idx: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of batchPlatforms(batch)) {
    if (getAccountCount(agent, DECL_KEY[p]) >= idx) counts[p] = 1;
  }
  return counts;
}

interface Step { pass: number; batch: number; agent: string; counts: Record<string, number>; }

/** The whole day's step list, in run order — account pass → batch → agent. */
function buildDayPlan(): { passes: number; steps: Step[] } {
  const passes = accountPassesToday();
  const steps: Step[] = [];
  for (let idx = 1; idx <= passes; idx++) {
    for (let k = 1; k <= MAX_BATCHES; k++) {
      for (const agent of AGENTS) {
        const counts = stepCounts(agent, k, idx);
        if (Object.keys(counts).length) steps.push({ pass: idx, batch: k, agent, counts });
      }
    }
  }
  return { passes, steps };
}

function printPlan(): void {
  const { passes, steps } = buildDayPlan();
  const batchList = Array.from({ length: MAX_BATCHES }, (_, i) => `[${batchPlatforms(i + 1).join(' ')}]`).join(' ');
  console.log(`Agents: ${AGENTS.join(' → ')}`);
  console.log(`Daily target per account: ${JSON.stringify(DAILY_TARGET)} → ${MAX_BATCHES} batches: ${batchList}`);
  console.log(`Account passes today: ${passes} (from .accounts/account-counts.json)\n`);
  let lastKey = '';
  for (const s of steps) {
    const key = `${s.pass}:${s.batch}`;
    if (key !== lastKey) {
      console.log(`— pass ${s.pass} (account #${s.pass}) · batch ${s.batch} · ${batchPlatforms(s.batch).join(', ')}`);
      lastKey = key;
    }
    console.log(`    ${s.agent.padEnd(10)} ${Object.keys(s.counts).join(' ')}`);
  }
  console.log('\nPer-agent totals for today (must equal declared accounts × target):');
  for (const agent of AGENTS) {
    const totals: Record<string, number> = {};
    const expected: Record<string, number> = {};
    for (const p of PLATFORMS) {
      totals[p] = steps.filter((s) => s.agent === agent).reduce((n, s) => n + (s.counts[p] ?? 0), 0);
      expected[p] = getAccountCount(agent, DECL_KEY[p]) * DAILY_TARGET[p];
    }
    const ok = PLATFORMS.every((p) => totals[p] === expected[p]);
    console.log(`  ${agent.padEnd(10)} ${PLATFORMS.map((p) => `${p}:${totals[p]}`).join(' ')}   ${ok ? '✓' : `✗ expected ${JSON.stringify(expected)}`}`);
  }
  const posts = steps.reduce((n, s) => n + Object.keys(s.counts).length, 0);
  console.log(`\nTotal: ${steps.length} steps, ${posts} posts.`);
}

// ── Run ─────────────────────────────────────────────────────────────────────
async function runStep(s: Step): Promise<void> {
  log(`=== ${s.agent} · account #${s.pass} · batch ${s.batch}: ${Object.keys(s.counts).join(' ')} ===`);
  await runPostCycleToCompletion(s.agent, s.counts, { POST_ACCOUNT_INDEX: String(s.pass) }, {
    pollMs: POLL_MS,
    onWait: (why) => log(`⏸ ${s.agent}: ${why} — waiting for it to finish, then running this step.`),
  });
  log(`${s.agent} · account #${s.pass} · batch ${s.batch} complete.`);
}

async function runDay(): Promise<void> {
  const { passes, steps } = buildDayPlan();
  log(`Social day starting. Agents: ${AGENTS.join(' → ')} | target/account ${JSON.stringify(DAILY_TARGET)} | ${passes} account pass(es) | ${steps.length} steps`);
  for (let idx = 1; idx <= passes; idx++) {
    log(`--- Account pass ${idx} starting ---`);
    for (let k = 1; k <= MAX_BATCHES; k++) {
      const batchSteps = steps.filter((s) => s.pass === idx && s.batch === k);
      const who = batchSteps.map((s) => s.agent).join(' → ') || `nobody has an account #${idx} here`;
      log(`--- Pass ${idx} · batch ${k} (${batchPlatforms(k).join(', ')}): ${who} ---`);
      for (const agent of AGENTS) {
        const step = batchSteps.find((s) => s.agent === agent);
        if (!step) {
          if (idx > 1) log(`${agent}: no account #${idx} on ${batchPlatforms(k).join('/')} — skipping.`);
          continue;
        }
        await runStep(step);
        await sleep(PERSON_GAP_MS);
      }
      if (k < MAX_BATCHES) {
        log(`--- batch ${k} done — ${Math.round(BATCH_GAP_MS / 60000)} min break before batch ${k + 1} ---`);
        await sleep(BATCH_GAP_MS);
      }
    }
    log(`--- Account pass ${idx} complete ---`);
    if (idx < passes) {
      log(`--- ${Math.round(PASS_GAP_MS / 60000)} min break before account pass ${idx + 1} ---`);
      await sleep(PASS_GAP_MS);
    }
  }
  log(`Social day complete — ${steps.length} steps run.`);
}

async function main() {
  if (PLAN_ONLY) { printPlan(); return; }
  log(`Social rotation starting. Order: ${AGENTS.join(' → ')} | daily at ${START_LABEL} | target/account ${JSON.stringify(DAILY_TARGET)} | ${SKIP_WAIT ? '[--now: run once now]' : '[daily]'}`);
  for (;;) {
    if (!SKIP_WAIT) {
      const waitMs = msUntilNextIst(START_H, START_M);
      log(`Waiting ${Math.round(waitMs / 60000)} min for next ${START_LABEL}...`);
      await sleep(waitMs);
    }
    await runDay();
    // --now is a one-shot manual run; don't loop forever waiting for a "tomorrow" that isn't real.
    if (SKIP_WAIT) break;
  }
}

main().catch((e) => {
  log(`✗ fatal: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(1);
});
