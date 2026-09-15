/**
 * nightly-blogpost-rotation.ts — daily BLOG-PLATFORM posting rotation across
 * the 6 personal-sheet agents (vijay → hritika → sanya → meenakshi → vansh →
 * sameeksha), run in per-ACCOUNT passes exactly like the social rotation —
 * every blog account a member has gets the same daily quota:
 *
 *   2 posts per account per day, uniformly, on all 14 blog platforms —
 *   no platform gets special lead/partner treatment, including Medium,
 *   LinkedIn Pulse and Google Sites.
 *
 * Blog platforms, fixed 7/7 split by which slot they're allowed to claim
 * (see sheets.ts claimNextBlogSlot — a platform's slot is a property of the
 * platform, not "whichever slot happens to be open"):
 *   Blog Platform 1 / Blog URL 1: Medium, PdfHost, Linkmate, Note, Dev.to, Velog, HackMD
 *   Blog Platform 2 / Blog URL 2: LinkedIn Pulse, Google Sites, Calisthenics, Notion, Coda, Blogger, WordPress
 *
 * How one day runs:
 *
 *   Account pass 1  — everyone's account #1
 *     run 1: each agent, in order, posts 1 on all 14 platforms
 *     run 2: each agent posts 1 on all 14 platforms again
 *   Account pass 2  — account #2, ONLY for agents who declared one on that
 *                     platform; anyone without an account #2 is skipped (no post)
 *     runs 1–2 exactly as above
 *   Account pass 3, …  as far as the highest declared count goes
 *   → "Blog-platform day complete", then wait for tomorrow's BLOGPOST_START.
 *
 * Every platform appears in both runs → 2/account/day, uniformly. No pair
 * rotation needed any more: since each platform's slot is fixed by which
 * group it's in (not by run order), any Group-1 platform can land on any row
 * whose slot 1 is open, independent of which Group-2 platform ends up on
 * that row's slot 2 — no more "starves every pair after the first" problem
 * the old lead-rotation design had to work around.
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
 *   BLOGPOST_BATCH_GAP_MIN    pause between the two runs (default 30)
 *   BLOGPOST_PASS_GAP_MIN     pause between account passes (default 15)
 *   BLOGPOST_ROTATION_LOG     log file (default /tmp/nightly-blogpost-rotation.log)
 *
 * Usage:
 *   npx tsx scripts/nightly-blogpost-rotation.ts          # waits for the next BLOGPOST_START, then runs daily (production)
 *   npx tsx scripts/nightly-blogpost-rotation.ts --now    # skip the wait, run today's passes immediately, then exit (testing)
 *   npx tsx scripts/nightly-blogpost-rotation.ts --plan   # print today's full step list + per-agent totals; posts nothing
 */
import fs from 'fs';
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
  pdfhost: 'pdfhost',
};

// All 14 platforms, run flat in both daily runs — order doesn't matter any
// more (each platform's slot is fixed by its own group, not by run order).
const ALL_BLOG_PLATFORMS = Object.keys(DECL_KEY);

/** The two runs of one pass — identical platform list, just posts a 2nd time. */
function blogBatches(): BatchSpec[] {
  const mk = (label: string): BatchSpec => ({
    label,
    platforms: ALL_BLOG_PLATFORMS.map((key) => ({ key, declKey: DECL_KEY[key] })),
  });
  return [mk('run 1'), mk('run 2')];
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
    const cfg = configFor(blogBatches());
    console.log(formatDayPlan(cfg, buildDayPlan(cfg)));
    return;
  }
  log(`Blog-platform post rotation starting. Order: ${AGENTS.join(' → ')} | daily at ${START_LABEL} | 2 runs/pass, all 14 platforms each run (fixed 7/7 slot split, no lead rotation) | weekends off (Sat/Sun no posting).`);
  for (;;) {
    if (!SKIP_WAIT) {
      const waitMs = msUntilNextIst(START_H, START_M);
      log(`Waiting ${Math.round(waitMs / 60000)} min for next ${START_LABEL}...`);
      await sleep(waitMs);
    }
    if (isWeekendIst()) {
      log('Today is a weekend (Sat/Sun) — blog-platform posting is off, skipping today.');
    } else {
      await runDay(configFor(blogBatches()));
    }
    // --now is a one-shot manual run; don't loop forever waiting for a "tomorrow" that isn't real.
    if (SKIP_WAIT) break;
  }
}

/** IST calendar day is Saturday or Sunday — no blog-platform posting those days. */
function isWeekendIst(): boolean {
  const istDay = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCDay(); // 0=Sun … 6=Sat
  return istDay === 0 || istDay === 6;
}

main().catch((e) => {
  log(`✗ fatal: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(1);
});
