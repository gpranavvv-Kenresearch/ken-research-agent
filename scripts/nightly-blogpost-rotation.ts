/**
 * nightly-blogpost-rotation.ts — daily BLOG-PLATFORM posting rotation across
 * the 6 personal-sheet agents: vijay → hritika → sanya → meenakshi → vansh → sameeksha.
 *
 * Blog platforms ONLY: Medium, LinkedIn Pulse, Google Sites, Linkmate,
 * Calisthenics, Note, Notion, Dev.to, Coda, Velog, Blogger, HackMD, WordPress.
 * Social platforms (X / Facebook / LinkedIn post / Tumblr / Mastodon) are a
 * completely separate process — scripts/nightly-social-rotation.ts (pm2
 * `social-rotation`) — with its own schedule and per-account passes. The two
 * share no state; their child post cycles serialize through the box-wide
 * `post-cycle` job slot (run-post-cycle-once.ts), and a same-agent collision
 * is handled by runPostCycleToCompletion (wait for the other one, then run
 * ours — never skip).
 *
 * Triggers at BLOGPOST_START (default 08:30 IST — offset from the social
 * rotation's 08:00 so the two don't both open on the first agent at the same
 * instant) every day. For each agent, runs the existing counted post cycle
 * (postCycle.ts's startPostCycle, same mechanism as the dashboard's "Post Now"
 * button) — 1 post per blog platform per round.
 * Blog platforms post in fixed pairs sharing one row each (2-slot claim model
 * — see sheets.ts): (Medium|LinkedIn Pulse)+GoogleSites, Linkmate+Calisthenics,
 * Note+Notion, Dev.to+Coda, Velog+Blogger, HackMD+WordPress. Medium/LinkedIn
 * Pulse are capped at 1/day total by only appearing in ONE of the 2 rounds
 * each (Medium in round 1, LinkedIn Pulse in round 2) — everything else runs
 * both rounds.
 * Waits for that agent's whole cycle to fully finish before starting the next
 * agent, then a 5-minute break before the next agent starts.
 *
 * Once all 6 agents finish round 1, waits 1 hour and runs round 2 with its
 * own counts (fresh rows get picked automatically — already-posted rows are
 * skipped by the existing row-selection logic, no special handling needed
 * here). After round 2 finishes, stops and waits for the next day's start —
 * exactly 2 rounds per day, not continuous like the blog-generation rotation.
 *
 * Config (env):
 *   BLOGPOST_START          "HH:MM" IST (default 08:30)
 *   BLOGPOST_ROTATION_LOG   log file (default /tmp/nightly-blogpost-rotation.log)
 *
 * Usage:
 *   npx tsx scripts/nightly-blogpost-rotation.ts          # waits for the next BLOGPOST_START, then runs
 *   npx tsx scripts/nightly-blogpost-rotation.ts --now    # skip the wait, start immediately (testing)
 */
import fs from 'fs';
import path from 'path';
import { runPostCycleToCompletion } from '../src/login-portal/postCycle.js';

const AGENTS = ['vijay', 'hritika', 'sanya', 'meenakshi', 'vansh', 'sameeksha'];
const ROUNDS_PER_DAY = 2;
const ROUND_GAP_MS = 60 * 60 * 1000; // 1 hour between round 1 and round 2
const PERSON_GAP_MS = 5 * 60 * 1000; // 5 min between one agent finishing and the next starting
const POLL_MS = 15000; // how often to check whether an agent's cycle has finished

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
  return { [leadKey]: 1, ...rotatedBlogCounts() };
}
const COUNTS_BY_ROUND: Record<number, () => Record<string, number>> = {
  1: () => buildRoundCounts('medium'),
  2: () => buildRoundCounts('lipulse'),
};

const SKIP_WAIT = process.argv.includes('--now');

const LOG_FILE = process.env.BLOGPOST_ROTATION_LOG || process.env.ROTATION_LOG || '/tmp/nightly-blogpost-rotation.log';
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
const [START_H, START_M] = parseHHMM(process.env.BLOGPOST_START || '', [8, 30]);
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

async function runRound(roundNum: number): Promise<void> {
  const counts = COUNTS_BY_ROUND[roundNum]();
  log(`--- Round ${roundNum} starting: ${AGENTS.join(' → ')}, counts: ${JSON.stringify(counts)} ---`);
  for (let i = 0; i < AGENTS.length; i++) {
    const agent = AGENTS[i];
    log(`=== Blog-platform posting cycle starting for ${agent} ===`);
    await runPostCycleToCompletion(agent, counts, undefined, {
      pollMs: POLL_MS,
      onWait: (why) => log(`⏸ ${agent}: ${why} — waiting for it to finish, then running this agent's blog-platform cycle.`),
    });
    log(`${agent} blog-platform posting cycle complete.`);
    if (i < AGENTS.length - 1) {
      log(`--- 5 min break before ${AGENTS[i + 1]} ---`);
      await sleep(PERSON_GAP_MS);
    }
  }
  log(`--- Round ${roundNum} complete ---`);
}

async function main() {
  log(`Blog-platform post rotation starting. Order: ${AGENTS.join(' → ')} | daily at ${START_LABEL} | ${ROUNDS_PER_DAY} rounds. Blog pair lead rotates each round (see ${ROTATION_FILE}).`);
  for (;;) {
    if (!SKIP_WAIT) {
      const waitMs = msUntilNextIst(START_H, START_M);
      log(`Waiting ${Math.round(waitMs / 60000)} min for next ${START_LABEL}...`);
      await sleep(waitMs);
    }
    for (let round = 1; round <= ROUNDS_PER_DAY; round++) {
      await runRound(round);
      if (round < ROUNDS_PER_DAY) {
        log(`Waiting 1h before round ${round + 1}.`);
        await sleep(ROUND_GAP_MS);
      }
    }
    log(`Both rounds done for today — waiting for tomorrow's ${START_LABEL}.`);
    // --now is a one-shot manual test; don't loop forever waiting for a "tomorrow" that isn't real.
    if (SKIP_WAIT) break;
  }
}

main().catch((e) => {
  log(`✗ fatal: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(1);
});
