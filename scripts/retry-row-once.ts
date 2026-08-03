/**
 * retry-row-once.ts — one-off manual retry for a single sheet row + platform,
 * run in its own process so WORKER_NAME resolves to the right agent's sheet.
 *
 * login-api is one shared process pinned to a single WORKER_NAME (env) — calling
 * runRetryRow() in-process there always reads whichever agent that env points
 * at, regardless of which agent's row was actually requested (same reason
 * postCycle.ts/blogCycle.ts spawn a child instead of calling in-process).
 *
 * Usage:
 *   WORKER_NAME=sanya npx tsx scripts/retry-row-once.ts --row 2 --platform wordpress
 */
import fs from 'fs';
import { runRetryRow } from '../src/coordinator/masterCoordinator.js';
import { closeAllBrowsers } from '../src/tools/browserTools.js';
import { killPostingChrome } from '../src/utils/procKill.js';
import { acquireBrowserSlot } from '../src/utils/browserSlots.js';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const rowIndex = Number(arg('--row'));
const platform = arg('--platform') || '';

if (!Number.isFinite(rowIndex) || !platform) {
  console.error('Usage: retry-row-once.ts --row <n> --platform <key>');
  process.exit(1);
}

// Spawned detached with stdio:'ignore' by /api/retry-row (see server.ts) —
// nothing else captures this process's output, so write it to a file or a
// failure is undebuggable after the fact. One file per (agent, platform)
// call, overwritten each retry — WORKER_NAME is set by the spawning route.
const LOG_FILE = `/tmp/retry-row-${process.env.WORKER_NAME || 'unknown'}-${platform}.log`;
const _log = console.log.bind(console);
const _err = console.error.bind(console);
function toFile(s: string): void { try { fs.appendFileSync(LOG_FILE, s + '\n'); } catch { /* noop */ } }
console.log = (...a: unknown[]) => { const s = a.map(String).join(' '); _log(s); toFile(s); };
console.error = (...a: unknown[]) => { const s = a.map(String).join(' '); _err(s); toFile(s); };
fs.writeFileSync(LOG_FILE, `=== retry row ${rowIndex} on ${platform} for ${process.env.WORKER_NAME} @ ${new Date().toISOString()} ===\n`);

async function main() {
  // This process runs detached, spawned fire-and-forget by the /api/retry-row
  // route (posting can take longer than any sane HTTP timeout — nginx and
  // Vercel's own serverless function both cut off well under 5 min, so the
  // caller doesn't wait for this at all; the sheet write is the real result).
  // Slot acquisition therefore lives HERE, not in the route, since nothing
  // else is waiting on this process to hold the release open correctly.
  const releaseSlot = await acquireBrowserSlot(`retry-row:${platform}`);
  try {
    await runRetryRow(rowIndex, platform);
  } finally {
    // This process opened exactly one platform's browser — clean it up before
    // exiting rather than leaving it orphaned (same teardown runStage's
    // runOnePlatform does per platform, just single-shot here).
    await closeAllBrowsers().catch(() => {});
    killPostingChrome();
    releaseSlot();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(`Retry failed: ${err?.message || err}`); process.exit(1); });
