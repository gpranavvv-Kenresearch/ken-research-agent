/**
 * run-post-cycle-once.ts — one-off manual "Post Now" run: the full 5-cycle
 * narrowing sequence (15 → 13 → 8 → 5 → 2 platforms, 30 min between each),
 * once through then stopping — completely independent of the
 * live `scheduler` pm2 process — separate Node process, separate status file,
 * so it never touches the live daemon's cycle position or timing.
 *
 * Usage:
 *   POST_CYCLE_LOG=/tmp/post-cycle-abhinav.log POST_CYCLE_STATUS=/tmp/post-cycle-status-abhinav.json \
 *     WORKER_NAME=abhinav npx tsx scripts/run-post-cycle-once.ts
 */
import fs from 'fs';
import { runCoordinatorOnce, runCountedPostCycle, writeStatus } from '../src/scheduler-new.js';
import { acquireJobSlot, estimateWaitMs } from '../src/utils/jobQueue.js';

// Mirror run-blog-generator.ts's pattern: stream progress into a shared log
// file so the dashboard status endpoint can show live output, not just a
// final result.
const LOG_FILE = process.env.POST_CYCLE_LOG;
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
function toFile(s: string): void {
  if (LOG_FILE) { try { fs.appendFileSync(LOG_FILE, s + '\n'); } catch { /* noop */ } }
}
console.log = (...a: unknown[]) => { const s = a.map(String).join(' '); _origLog(s); toFile(s); };
console.error = (...a: unknown[]) => { const s = a.map(String).join(' '); _origErr(s); toFile(s); };

const STATUS_FILE = process.env.POST_CYCLE_STATUS;
const WORKER_NAME = process.env.WORKER_NAME || '';

// POST_CYCLE_COUNTS, if set, switches to the counted round-based cycle
// (per-platform post counts from the dashboard form) instead of the fixed
// 5-stage sequence — see postCycle.ts's startPostCycle().
const countsJson = process.env.POST_CYCLE_COUNTS;

async function main() {
  // Box-wide posting queue — only one agent's cycle actually posts at a
  // time; everyone else waits their turn (no bypass — posting always
  // strictly serializes).
  const releaseQueue = await acquireJobSlot('post-cycle', WORKER_NAME, {
    onWaiting: (status, position) => {
      const waitingFor = status.running.map((r) => r.agent);
      const etaMs = estimateWaitMs('post-cycle', position);
      console.log(`⏳ Queued for a posting slot — you are #${position}, ${waitingFor.join(', ') || 'someone'} posting now (~${Math.round(etaMs / 60000)} min estimated wait)`);
      if (STATUS_FILE) writeStatus({ phase: 'queued', position, waitingFor, etaMs }, STATUS_FILE);
    },
  });
  try {
    await (countsJson
      ? runCountedPostCycle(JSON.parse(countsJson), STATUS_FILE)
      : runCoordinatorOnce(STATUS_FILE));
  } finally {
    releaseQueue();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(`Post cycle failed: ${err?.message || err}`); process.exit(1); });
