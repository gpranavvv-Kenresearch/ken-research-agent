/**
 * nightly-blogpost-rotation.ts — daily BLOG-PLATFORM posting rotation across
 * the 6 personal-sheet agents (vijay → hritika → sanya → meenakshi → vansh →
 * sameeksha), run in per-ACCOUNT passes exactly like the social rotation —
 * every blog account a member has gets the same daily quota:
 *
 *   2 posts per account per day on every blog platform,
 *   except Medium and LinkedIn Pulse: 1 post per account per day.
 *
 * Blog platforms: Medium, LinkedIn Pulse, Google Sites, Linkmate,
 * Calisthenics, Note, Notion, Dev.to, Coda, Velog, Blogger, HackMD, WordPress.
 *
 * How one day runs:
 *
 *   Account pass 1  — everyone's account #1
 *     batch 1 (Medium lead):         each agent, in order, posts 1 on
 *                                    medium, googlepost, then the 5 rotated pairs
 *     batch 2 (LinkedIn Pulse lead): each agent posts 1 on
 *                                    lipulse, googlepost, then the 5 rotated pairs
 *   Account pass 2  — account #2, ONLY for agents who declared one on that
 *                     platform; anyone without an account #2 is skipped (no post)
 *     batches 1–2 exactly as above
 *   Account pass 3, …  as far as the highest declared count goes
 *   → "Blog-platform day complete", then wait for tomorrow's BLOGPOST_START.
 *
 * Every platform except Medium/Pulse appears in both batches → 2/account/day;
 * Medium only leads batch 1 and Pulse only batch 2 → 1/account/day each. That
 * split is not just the quota — it is required by the 2-slot claim model (see
 * sheets.ts claimNextBlogSlot): whichever 2 blog platforms run back-to-back on
 * a cycle claim that row's 2 slots together, so PAIR order matters, and Medium
 * and Pulse must never sit in the same batch or they would pair with each
 * other instead of with Google Sites. Fixed pairs, as specified:
 * (Medium|LinkedIn Pulse) + Google Sites, Linkmate + Calisthenics,
 * Note + Notion, Dev.to + Coda, Velog + Blogger, HackMD + WordPress.
 *
 * A fixed run order starves every pair after the first when only 1-2 fresh
 * rows exist that day — the leading pair always wins both slots on the only
 * available row, and everything after it sees "no open slot" forever, every
 * single day. So which pair leads is ROTATED and persisted across runs
 * (.cache/blog-pair-rotation.json) — advances by 1 every batch so each pair
 * gets a turn to go first before the cycle repeats.
 *
 * Passes come from .accounts/account-counts.json (the "Accounts" number each
 * member sets per platform on their dashboard page), re-read at the start of
 * every day. The pass/batch/step engine is shared with the social rotation:
 * src/rotation/accountPasses.ts. Each step pins the account with
 * POST_ACCOUNT_INDEX (accountRotation.ts explicit mode).
 *
 * Social posting (X / FB / LinkedIn post / Tumblr / Mastodon) is a separate
 * process — scripts/nightly-social-rotation.ts — with its own schedule. Their
 * child cycles serialize through the box-wide post-cycle job slot; a
 * same-agent collision makes the later step wait, then run (never skip).
 *
 * Config (env):
 *   BLOGPOST_START            "HH:MM" IST (default 08:30 — offset from social's 08:00)
 *   BLOGPOST_AGENTS           comma-separated agent subset (testing), e.g. "vijay"
 *   BLOGPOST_PERSON_GAP_MIN   pause after each step (default 2)
 *   BLOGPOST_BATCH_GAP_MIN    pause between the two batches (default 30)
 *   BLOGPOST_PASS_GAP_MIN     pause between account passes (default 15)
 *   BLOGPOST_ROTATION_LOG     log file (default /tmp/nightly-blogpost-rotation.log)
 *
 * Usage:
 *   npx tsx scripts/nightly-blogpost-rotation.ts          # waits for the next BLOGPOST_START, then runs daily (production)
 *   npx tsx scripts/nightly-blogpost-rotation.ts --now    # skip the wait, run today's passes immediately, then exit (testing)
 *   npx tsx scripts/nightly-blogpost-rotation.ts --plan   # print today's full step list + per-agent totals; posts nothing
 */
import fs from 'fs';
import path from 'path';
import { buildDayPlan, formatDayPlan, msUntilNextIst, parseHHMM, runDay, type AccountPassConfig, type BatchSpec } from '../src/rotation/accountPasses.js';

const DEFAULT_AGENTS = ['vijay', 'hritika', 'sanya', 'meenakshi', 'vansh', 'sameeksha'];
const AGENTS: string[] = (() => {
  const custom = (process.env.BLOGPOST_AGENTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return custom.length ? custom : DEFAULT_AGENTS;
})();

// Posting-cycle key (scheduler-new.ts COUNTED_PLATFORMS) → the key the account
// count is declared under (.accounts/account-counts.json, i.e.
// selectAccountForPlatform's platformKey, as called in masterCoordinator.ts).
const DECL_KEY: Record<string, string> = {
  medium: 'medium', lipulse: 'li', googlepost: 'googlesite',
  linkmate: 'linkmate', calisthenics: 'calisthenics', note: 'note', notion: 'notion',
  devto: 'devto', coda: 'coda', velog: 'velog', blogger: 'blogger', hackmd: 'hackmd', wordpress: 'wordpress',
};

const PAIR_GROUPS: [string, string][] = [
  ['linkmate', 'calisthenics'],
  ['note', 'notion'],
  ['devto', 'coda'],
  ['velog', 'blogger'],
  ['hackmd', 'wordpress'],
];
const ROTATION_FILE = path.join(process.cwd(), '.cache', 'blog-pair-rotation.json');

/** Which pair leads this batch. `advance` = also move the pointer for next time (a --plan dry run does not). */
function rotatedPairs(advance: boolean): string[] {
  let pointer = 0;
  try { pointer = JSON.parse(fs.readFileSync(ROTATION_FILE, 'utf-8')).pointer ?? 0; } catch { /* first run */ }
  pointer = ((pointer % PAIR_GROUPS.length) + PAIR_GROUPS.length) % PAIR_GROUPS.length;
  if (advance) {
    try {
      fs.mkdirSync(path.dirname(ROTATION_FILE), { recursive: true });
      fs.writeFileSync(ROTATION_FILE, JSON.stringify({ pointer: (pointer + 1) % PAIR_GROUPS.length }));
    } catch { /* a lost rotation tick just repeats today's order tomorrow — not fatal */ }
  }
  return [...PAIR_GROUPS.slice(pointer), ...PAIR_GROUPS.slice(0, pointer)].flat();
}

/** The two batches of one pass. Built once per day (pointer advances once per batch, as before). */
function blogBatches(advance: boolean): BatchSpec[] {
  const mk = (label: string, lead: string): BatchSpec => ({
    label,
    platforms: [lead, 'googlepost', ...rotatedPairs(advance)].map((key) => ({ key, declKey: DECL_KEY[key] })),
  });
  return [mk('batch 1 (Medium lead)', 'medium'), mk('batch 2 (LinkedIn Pulse lead)', 'lipulse')];
}

const PERSON_GAP_MS = Number(process.env.BLOGPOST_PERSON_GAP_MIN || 2) * 60 * 1000;
const BATCH_GAP_MS = Number(process.env.BLOGPOST_BATCH_GAP_MIN || 30) * 60 * 1000;
const PASS_GAP_MS = Number(process.env.BLOGPOST_PASS_GAP_MIN || 15) * 60 * 1000;
const POLL_MS = 15_000;

const SKIP_WAIT = process.argv.includes('--now');
const PLAN_ONLY = process.argv.includes('--plan');

const LOG_FILE = process.env.BLOGPOST_ROTATION_LOG || process.env.ROTATION_LOG || '/tmp/nightly-blogpost-rotation.log';
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* noop */ }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const [START_H, START_M] = parseHHMM(process.env.BLOGPOST_START || '', [8, 30]);
const START_LABEL = `${String(START_H).padStart(2, '0')}:${String(START_M).padStart(2, '0')} IST`;

function configFor(batches: BatchSpec[]): AccountPassConfig {
  return {
    name: 'Blog-platform',
    agents: AGENTS,
    batches,
    personGapMs: PERSON_GAP_MS,
    batchGapMs: BATCH_GAP_MS,
    passGapMs: PASS_GAP_MS,
    pollMs: POLL_MS,
    log,
  };
}

async function main() {
  if (PLAN_ONLY) {
    const cfg = configFor(blogBatches(false));
    console.log(formatDayPlan(cfg, buildDayPlan(cfg)));
    return;
  }
  log(`Blog-platform post rotation starting. Order: ${AGENTS.join(' → ')} | daily at ${START_LABEL} | 2 batches/pass (Medium lead, then LinkedIn Pulse lead). Pair lead rotates each batch (see ${ROTATION_FILE}).`);
  for (;;) {
    if (!SKIP_WAIT) {
      const waitMs = msUntilNextIst(START_H, START_M);
      log(`Waiting ${Math.round(waitMs / 60000)} min for next ${START_LABEL}...`);
      await sleep(waitMs);
    }
    // Batches (and so the pair order) are fixed for the day; the pointer
    // advances once per batch here, same cadence as the old 2-round design.
    await runDay(configFor(blogBatches(true)));
    // --now is a one-shot manual run; don't loop forever waiting for a "tomorrow" that isn't real.
    if (SKIP_WAIT) break;
  }
}

main().catch((e) => {
  log(`✗ fatal: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(1);
});
