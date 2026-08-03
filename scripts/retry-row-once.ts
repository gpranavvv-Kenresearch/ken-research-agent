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
import { runRetryRow } from '../src/coordinator/masterCoordinator.js';
import { closeAllBrowsers } from '../src/tools/browserTools.js';
import { killPostingChrome } from '../src/utils/procKill.js';

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

async function main() {
  try {
    await runRetryRow(rowIndex, platform);
  } finally {
    // This process opened exactly one platform's browser — clean it up before
    // exiting rather than leaving it orphaned (same teardown runStage's
    // runOnePlatform does per platform, just single-shot here).
    await closeAllBrowsers().catch(() => {});
    killPostingChrome();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(`Retry failed: ${err?.message || err}`); process.exit(1); });
