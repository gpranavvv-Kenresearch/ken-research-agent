/**
 * nightly-post-rotation.ts — daily, sequential posting rotation across the 5
 * personal-sheet agents: Sanya → Meenakshi → Vansh → Sameeksha → Hritika → Vijay.
 *
 * Triggers at 8:00 AM IST every day. For each agent, runs the existing
 * counted post cycle (postCycle.ts's startPostCycle, same mechanism as the
 * dashboard's "Post Now" button) — 2 posts each on X/FB/LinkedIn/Tumblr/Mastodon
 * per round.
 * Blog platforms post in fixed pairs sharing one row each (2-slot claim model
 * — see sheets.ts): (Medium|LinkedIn Pulse)+GoogleSites, Linkmate+Calisthenics,
 * Note+Notion, Dev.to+Coda, Velog+Blogger, HackMD+WordPress. Medium/LinkedIn
 * Pulse are capped at 1/day total by only appearing in ONE of the 2 rounds
 * each (Medium in round 1, LinkedIn Pulse in round 2) — everything else runs
 * both rounds.
 * Waits for that agent's whole cycle to fully finish (polling
 * postCycleStatus) before starting the next agent — never two agents
 * posting at once — then a 5-minute break before the next agent starts.
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
import path from 'path';
import { startPostCycle, postCycleStatus } from '../src/login-portal/postCycle.js';

const AGENTS = ['sanya', 'meenakshi', 'vansh', 'sameeksha', 'hritika', 'vijay'];
const ROUNDS_PER_DAY = 2;
const ROUND_GAP_MS = 60 * 60 * 1000; // 1 hour between round 1 and round 2
const PERSON_GAP_MS = 5 * 60 * 1000; // 5 min between one agent finishing and the next starting
const POLL_MS = 15000; // how often to check whether an agent's cycle has finished

// 2 posts/day each on X/Facebook/LinkedIn (1 per round × 2 rounds).
//
// Blog platforms use the shared 2-slot claim model (see sheets.ts
// claimNextBlogSlot): whichever 2 platforms run back-to-back on a round claim
// that row's 2 slots together, so PAIR order matters. Fixed pairs, as
// specified: (Medium|LinkedIn Pulse) + Google Sites, Linkmate + Calisthenics,
// Note + Notion, Dev.to + Coda, Velog + Blogger, HackMD + WordPress.
//
// A fixed run order starves every pair after the first when only 1-2 fresh
// rows exist that day — the leading pair always wins both slots on the only
// available row, and everything after it sees "no open slot" forever, every
// single day. So which pair leads is ROTATED and persisted across runs
// (blog-pair-rotation.json) — advances by 1 every round so each pair gets a
// turn to go first before the cycle repeats.
const SOCIAL_COUNTS: Record<string, number> = { x: 2, fb: 2, lipost: 2, tumblr: 2, mastodon: 2 };
const PAIR_GROUPS: [string, string][] = [
  ['linkmate', 'calisthenics'],
  ['note', 'notion'],
  ['devto', 'coda'],
  ['velog', 'blogger'],
  ['hackmd', 'wordpress'],
];
const ROTATION_FILE = path.join(process.cwd(), '.cache', 'blog-pair-rotation.json');
function nextRotationPointer(): number {
  let pointer = 0;
  try { pointer = JSON.parse(fs.readFileSync(ROTATION_FILE, 'utf-8')).pointer ?? 0; } catch { /* first run */ }
  try {
    fs.mkdirSync(path.dirname(ROTATION_FILE), { recursive: true });
    fs.writeFileSync(ROTATION_FILE, JSON.stringify({ pointer: (pointer + 1) % PAIR_GROUPS.length }));
  } catch { /* a lost rotation tick just repeats today's order tomorrow — not fatal */ }
  return pointer;
}
function rotatedBlogCounts(): Record<string, number> {
  const pointer = nextRotationPointer();
  const rotatedPairs = [...PAIR_GROUPS.slice(pointer), ...PAIR_GROUPS.slice(0, pointer)];
  const counts: Record<string, number> = { googlepost: 1 };
  for (const [a, b] of rotatedPairs) { counts[a] = 1; counts[b] = 1; }
  return counts;
}
function buildRoundCounts(leadKey: string): Record<string, number> {
  return { ...SOCIAL_COUNTS, [leadKey]: 1, ...rotatedBlogCounts() };
}
const COUNTS_BY_ROUND: Record<number, () => Record<string, number>> = {
  1: () => buildRoundCounts('medium'),
  2: () => buildRoundCounts('lipulse'),
};

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
  const counts = COUNTS_BY_ROUND[roundNum]();
  log(`--- Round ${roundNum} starting: ${AGENTS.join(' → ')}, counts: ${JSON.stringify(counts)} ---`);
  for (let i = 0; i < AGENTS.length; i++) {
    const agent = AGENTS[i];
    log(`=== Posting cycle starting for ${agent} ===`);
    await runOneAgentPostCycle(agent, counts);
    log(`${agent} posting cycle complete.`);
    if (i < AGENTS.length - 1) {
      log(`--- 5 min break before ${AGENTS[i + 1]} ---`);
      await new Promise((r) => setTimeout(r, PERSON_GAP_MS));
    }
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
  log(`Nightly post rotation starting. Order: ${AGENTS.join(' → ')}. Blog pair lead rotates each round (see ${ROTATION_FILE}).`);
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
