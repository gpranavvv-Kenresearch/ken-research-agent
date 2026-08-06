/**
 * nightly-post-rotation.ts — daily, sequential posting rotation across the 5
 * personal-sheet agents: Sanya → Meenakshi → Vansh → Sameeksha → Hritika.
 *
 * Triggers at 8:00 AM IST every day. For each agent, runs the existing
 * counted post cycle (postCycle.ts's startPostCycle, same mechanism as the
 * dashboard's "Post Now" button) with a fixed count: 2 posts each on X/FB/
 * LinkedIn, 1 post on every blog platform. Waits for that agent's whole
 * cycle to fully finish (polling postCycleStatus) before starting the next
 * agent — never two agents posting at once.
 *
 * Once all 5 agents finish, waits 1 hour and runs the SAME round again
 * (fresh rows get picked automatically — already-posted rows are skipped by
 * the existing row-selection logic, no special handling needed here). After
 * that second round finishes, stops and waits for the next day's 8 AM IST
 * trigger — exactly 2 rounds per day, not continuous like the blog rotation.
 *
 * Usage:
 *   npx tsx scripts/nightly-post-rotation.ts          # waits for next 8 AM IST, then runs
 *   npx tsx scripts/nightly-post-rotation.ts --now     # skip the wait, start immediately (testing)
 */
import fs from 'fs';
import { startPostCycle, postCycleStatus } from '../src/login-portal/postCycle.js';

const AGENTS = ['sanya', 'meenakshi', 'vansh', 'sameeksha', 'hritika'];
const ROUNDS_PER_DAY = 2;
const ROUND_GAP_MS = 60 * 60 * 1000; // 1 hour between round 1 and round 2
const POLL_MS = 15000; // how often to check whether an agent's cycle has finished

// 2 posts each on X/Facebook/LinkedIn, 1 post on every blog platform.
const COUNTS: Record<string, number> = {
  x: 2, fb: 2, lipost: 2,
  lipulse: 1, medium: 1, wordpress: 1, blogger: 1, googlepost: 1,
  note: 1, hackmd: 1, linkmate: 1, calisthenics: 1, notion: 1, devto: 1,
};

const SKIP_WAIT = process.argv.includes('--now');

const LOG_FILE = process.env.ROTATION_LOG || '/tmp/nightly-post-rotation.log';
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* noop */ }
}

/** Start (or wait out an already-running) post cycle for one agent, and block until it's done. */
async function runOneAgentPostCycle(agent: string): Promise<void> {
  try {
    startPostCycle(agent, COUNTS);
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
  log(`--- Round ${roundNum} starting: ${AGENTS.join(' → ')} ---`);
  for (const agent of AGENTS) {
    log(`=== Posting cycle starting for ${agent} ===`);
    await runOneAgentPostCycle(agent);
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
  log(`Nightly post rotation starting. Order: ${AGENTS.join(' → ')}, counts: ${JSON.stringify(COUNTS)}, ${ROUNDS_PER_DAY} rounds/day.`);
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
