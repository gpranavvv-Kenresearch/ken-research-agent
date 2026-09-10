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
 * Batch k = every platform whose target is >= k, so the batches derive from
 * DAILY_TARGET; passes come from .accounts/account-counts.json (the "Accounts"
 * number each member sets per platform on their dashboard page), re-read at
 * the start of every day — declaring a new account or changing a quota needs
 * no code change. The pass/batch/step engine itself is shared with the
 * blog-platform rotation: src/rotation/accountPasses.ts.
 *
 * Blog-platform posting (Medium, WordPress, Notion, …) is a separate process —
 * scripts/nightly-blogpost-rotation.ts — with its own schedule. Their child
 * cycles serialize through the box-wide post-cycle job slot; a same-agent
 * collision makes the later step wait, then run (never skip).
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
import { buildDayPlan, formatDayPlan, msUntilNextIst, parseHHMM, runDay, type AccountPassConfig, type BatchSpec } from '../src/rotation/accountPasses.js';

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

const PLATFORMS = Object.keys(DAILY_TARGET);
const MAX_BATCHES = Math.max(0, ...Object.values(DAILY_TARGET));
/** Batch k = every platform still owed a post, i.e. whose daily target is >= k. */
const BATCHES: BatchSpec[] = Array.from({ length: MAX_BATCHES }, (_, i) => ({
  label: `batch ${i + 1}`,
  platforms: PLATFORMS.filter((p) => DAILY_TARGET[p] >= i + 1).map((key) => ({ key, declKey: DECL_KEY[key] })),
}));

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

const [START_H, START_M] = parseHHMM(process.env.SOCIAL_START || '', [8, 0]);
const START_LABEL = `${String(START_H).padStart(2, '0')}:${String(START_M).padStart(2, '0')} IST`;

const CONFIG: AccountPassConfig = {
  name: 'Social',
  agents: AGENTS,
  batches: BATCHES,
  personGapMs: PERSON_GAP_MS,
  batchGapMs: BATCH_GAP_MS,
  passGapMs: PASS_GAP_MS,
  pollMs: POLL_MS,
  log,
};

async function main() {
  if (PLAN_ONLY) {
    console.log(`Daily target per account: ${JSON.stringify(DAILY_TARGET)}`);
    console.log(formatDayPlan(CONFIG, buildDayPlan(CONFIG)));
    return;
  }
  log(`Social rotation starting. Order: ${AGENTS.join(' → ')} | daily at ${START_LABEL} | target/account ${JSON.stringify(DAILY_TARGET)} | ${SKIP_WAIT ? '[--now: run once now]' : '[daily]'}`);
  for (;;) {
    if (!SKIP_WAIT) {
      const waitMs = msUntilNextIst(START_H, START_M);
      log(`Waiting ${Math.round(waitMs / 60000)} min for next ${START_LABEL}...`);
      await sleep(waitMs);
    }
    await runDay(CONFIG);
    // --now is a one-shot manual run; don't loop forever waiting for a "tomorrow" that isn't real.
    if (SKIP_WAIT) break;
  }
}

main().catch((e) => {
  log(`✗ fatal: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(1);
});
