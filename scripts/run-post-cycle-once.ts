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
import { runCoordinatorOnce } from '../src/scheduler-new.js';

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

runCoordinatorOnce(STATUS_FILE)
  .then(() => process.exit(0))
  .catch((err) => { console.error(`Post cycle failed: ${err?.message || err}`); process.exit(1); });
