/**
 * nightly-post-rotation.ts — daily, sequential posting rotation across the 5
 * personal-sheet agents: Sanya → Meenakshi → Vansh → Sameeksha → Hritika → Vijay.
 *
 * Triggers at 8:00 AM IST every day. For each agent, runs the existing
 * counted post cycle (postCycle.ts's startPostCycle, same mechanism as the
 * dashboard's "Post Now" button) — 2 posts each on X/FB/LinkedIn per round.
 * Blog platforms mostly post once per round (2/day total): LinkedIn Pulse
 * and Medium are the exceptions, capped at 1/day total by only appearing in
 * ONE of the 2 rounds each (LinkedIn Pulse in round 1, Medium in round 2).
 * Waits for that agent's whole cycle to fully finish (polling
 * postCycleStatus) before starting the next agent — never two agents
 * posting at once.
 *
 * Once all 5 agents finish round 1, waits 1 hour and runs round 2 with its
 * own counts (fresh rows get picked automatically — already-posted rows are
 * skipped by the existing row-selection logic, no special handling needed
 * here). After round 2 finishes, stops and waits for the next day's 8 AM
 * IST trigger — exactly 2 rounds per day, not continuous like the blog
 * rotation.
 *
 * Usage:
 *   npx tsx scripts/nightly-post-rotation.ts          # waits for next 8 AM IST, then runs
 *   npx tsx scripts/nightly-post-rotation.ts --now     # skip the wait, start immediately (testing)
 */
import fs from 'fs';
import { startPostCycle, postCycleStatus } from '../src/login-portal/postCycle.js';

const AGENTS = ['sanya', 'meenakshi', 'vansh', 'sameeksha', 'hritika', 'vijay'];
const ROUNDS_PER_DAY = 2;
const ROUND_GAP_MS = 60 * 60 * 1000; // 1 hour between round 1 and round 2
const POLL_MS = 15000; // how often to check whether an agent's cycle has finished

// 2 posts/day each on X/Facebook/LinkedIn (1 per round × 2 rounds).
// Blog platforms: LinkedIn Pulse and Medium are 1 post/day total, so each
// appears in only ONE of the 2 rounds (never both) — everything else posts
// once per round × 2 rounds = 2/day, same as before.
const SOCIAL_COUNTS: Record<string, number> = { x: 2, fb: 2, lipost: 2 };
const TWICE_DAILY_BLOG_COUNTS: Record<string, number> = {
  wordpress: 1, blogger: 1, googlepost: 1, note: 1, hackmd: 1,
  linkmate: 1, calisthenics: 1, notion: 1, devto: 1, coda: 1,
};
const ROUND1_COUNTS: Record<string, number> = { ...SOCIAL_COUNTS, ...TWICE_DAILY_BLOG_COUNTS, lipulse: 1 };
const ROUND2_COUNTS: Record<string, number> = { ...SOCIAL_COUNTS, ...TWICE_DAILY_BLOG_COUNTS, medium: 1 };
const COUNTS_BY_ROUND: Record<number, Record<string, number>> = { 1: ROUND1_COUNTS, 2: ROUND2_COUNTS };

const SKIP_WAIT = process.argv.includes('--now');

const LOG_FILE = process.env.ROTATION_LOG || '/tmp/nightly-post-rotation.log';
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* noop */ }
}

/** Start (or wait out an already-running) post cycle for one agent, and block until it's done. */
async function runOneAgentPostCycle(agent: string, counts: Record<string, number>): Promise<void> {
  try {
    startPostCycle(agent, counts);
  } catch (e) {
    // Most likely a manual "Post Now" click is already mid-flight for this
    // agent — don't fight it, just wait for whatever's running to finish.
    log(`⚠ ${agent}: ${e instanceof Error ? e.message : String(e)} — waiting for it to finish instead of starting a new one.`);
  }
  while (postCycleStatus(agent).running) {
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function runRound(roundNum: number): Promise<void> {
  const counts = COUNTS_BY_ROUND[roundNum];
  log(`--- Round ${roundNum} starting: ${AGENTS.join(' → ')}, counts: ${JSON.stringify(counts)} ---`);
  for (const agent of AGENTS) {
    log(`=== Posting cycle starting for ${agent} ===`);
    await runOneAgentPostCycle(agent, counts);
    log(`${agent} posting cycle complete.`);
  }
  log(`--- Round ${roundNum} complete ---`);
}

async function waitUntilNext8AmIst(): Promise<void> {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const next8amIst = new Date(nowIst);
  next8amIst.setUTCHours(8, 0, 0, 0);
  if (next8amIst.getTime() <= nowIst.getTime()) next8amIst.setUTCDate(next8amIst.getUTCDate() + 1);
  const waitMs = next8amIst.getTime() - nowIst.getTime();
  log(`Waiting ${Math.round(waitMs / 60000)} min for next 8:00 AM IST...`);
  await new Promise((r) => setTimeout(r, waitMs));
}

async function main() {
  log(`Nightly post rotation starting. Order: ${AGENTS.join(' → ')}, round1: ${JSON.stringify(ROUND1_COUNTS)}, round2: ${JSON.stringify(ROUND2_COUNTS)}.`);
  for (;;) {
    if (!SKIP_WAIT) await waitUntilNext8AmIst();
    for (let round = 1; round <= ROUNDS_PER_DAY; round++) {
      await runRound(round);
      if (round < ROUNDS_PER_DAY) {
        log(`Waiting 1h before round ${round + 1}.`);
        await new Promise((r) => setTimeout(r, ROUND_GAP_MS));
      }
    }
    log(`Both rounds done for today — waiting for tomorrow's 8 AM IST.`);
    // --now is a one-shot manual test; don't loop forever waiting for a "tomorrow" that isn't real.
    if (SKIP_WAIT) break;
  }
}

main();
