/**
 * nightly-blog-rotation.ts — daily, sequential blog-generation rotation across
 * the 6 personal-sheet agents: Sanya → Meenakshi → Vansh → Sameeksha →
 * Hritika → Vijay, 5 blogs each. One agent's run-blog-generator.ts fully exits before
 * the next agent starts (never concurrent).
 *
 * 2 cycles/day, matching nightly-post-rotation.ts's shape exactly: Cycle 1
 * (all 5 agents) → wait 1 hour → Cycle 2 (all 5 agents) → wait until next
 * 12:00 AM IST, then repeat. No longer loops continuously all day/night.
 *
 * First cycle starts at the next 12:00 AM IST after this process boots.
 * Runs as its own long-lived pm2 process (not the old scheduler-new.ts
 * daemon, which is unrelated and currently stopped).
 *
 * Usage:
 *   npx tsx scripts/nightly-blog-rotation.ts             # waits for next midnight IST, then runs both cycles
 *   npx tsx scripts/nightly-blog-rotation.ts --now        # skip the wait, run both cycles now, then exit (testing)
 *   npx tsx scripts/nightly-blog-rotation.ts --now --limit 1   # small test run
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const AGENTS = ['sanya', 'meenakshi', 'vansh', 'sameeksha', 'hritika', 'vijay'];
const CYCLE_GAP_MS = 60 * 60 * 1000; // 1 hour between cycles
const CYCLES_PER_DAY = 2; // matches nightly-post-rotation.ts's 2 rounds/day

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const SKIP_WAIT = process.argv.includes('--now');
const BLOGS_PER_AGENT = Number(arg('--limit') || 5);

const PY = process.env.PYTHON
  || (fs.existsSync(path.resolve('venv/bin/python3')) ? path.resolve('venv/bin/python3')
    : process.platform === 'win32' ? 'python' : 'python3');

const LOG_FILE = process.env.ROTATION_LOG || '/tmp/nightly-blog-rotation.log';
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* noop */ }
}

// Same node+tsx spawn pattern run-blog-generator.ts uses — avoids npx's
// .cmd-shim ENOENT/EINVAL issues on Windows, and needs no shell either way.
function spawnGenerator(agent: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      '--import=tsx', 'scripts/run-blog-generator.ts',
      '--name', agent, '--limit', String(BLOGS_PER_AGENT), '--image-prompt', '1',
    ], {
      env: { ...process.env, WORKER_NAME: agent, DISPLAY: process.env.DISPLAY || ':99' },
      stdio: 'ignore',
    });
    child.on('close', () => resolve());
    child.on('error', (err) => { log(`✗ ${agent}: failed to start run-blog-generator.ts — ${err.message}`); resolve(); });
  });
}

interface BlogRow { blogBatch?: string; 'Blog Content'?: string; 'Cover Image URL'?: string; [k: string]: unknown; }

/** Re-read the sheet and report how many of this run's rows have both content and a cover image — a report, not a gate. */
function verifyAndReport(agent: string, sinceBatchStamp: string): void {
  const r = spawnSync(PY, ['scripts/sheet_read.py', '--sheet', 'blog', '--name', agent, '--action', 'all'], { encoding: 'utf-8' });
  if (r.status !== 0) { log(`⚠ ${agent}: could not re-read sheet to verify (${(r.stderr || '').slice(0, 150)})`); return; }
  let rows: BlogRow[] = [];
  try { rows = (JSON.parse(r.stdout).rows || []) as BlogRow[]; } catch { log(`⚠ ${agent}: sheet read returned unparseable JSON`); return; }

  // blogBatch is "BLOG-YYYY-MM-DD-HH:MM:SS-CG" — lexically sortable, so a
  // plain string comparison against this run's start stamp finds "generated
  // during/after this run" without needing a separate timestamp column.
  const thisRun = rows.filter((row) => (row.blogBatch || '') >= `BLOG-${sinceBatchStamp}`);
  const withContent = thisRun.filter((row) => (row['Blog Content'] || '').trim());
  const withImage = withContent.filter((row) => (row['Cover Image URL'] || '').trim());
  const missing = withContent.length - withImage.length;
  log(`${agent}: ${withContent.length}/${BLOGS_PER_AGENT} generated, ${withImage.length}/${withContent.length} with cover image${missing ? ` (${missing} missing an image)` : ''}`);
}

function istTimestamp(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const iso = ist.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 19)}`;
}

async function waitUntilNextMidnightIst(): Promise<void> {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const nextMidnightIst = new Date(nowIst);
  nextMidnightIst.setUTCHours(24, 0, 0, 0); // next day, 00:00:00, in the IST-shifted clock
  const waitMs = nextMidnightIst.getTime() - nowIst.getTime();
  log(`Waiting ${Math.round(waitMs / 60000)} min for next 12:00 AM IST before the first cycle...`);
  await new Promise((r) => setTimeout(r, waitMs));
}

async function runCycle(): Promise<void> {
  for (const agent of AGENTS) {
    const startStamp = istTimestamp();
    log(`=== Starting ${agent} (${BLOGS_PER_AGENT} blogs) ===`);
    await spawnGenerator(agent);
    verifyAndReport(agent, startStamp);
  }
}

async function main() {
  log(`Nightly blog rotation starting. Order: ${AGENTS.join(' → ')}, ${BLOGS_PER_AGENT} blogs each, ${CYCLES_PER_DAY} cycles/day.`);
  for (;;) {
    if (!SKIP_WAIT) await waitUntilNextMidnightIst();
    for (let cycle = 1; cycle <= CYCLES_PER_DAY; cycle++) {
      log(`--- Cycle ${cycle} starting ---`);
      await runCycle();
      log(`--- Cycle ${cycle} complete ---`);
      if (cycle < CYCLES_PER_DAY) {
        log(`Waiting 1h before cycle ${cycle + 1}.`);
        await new Promise((r) => setTimeout(r, CYCLE_GAP_MS));
      }
    }
    log(`Both cycles done for today — waiting for tomorrow's 12:00 AM IST.`);
    // --now is a one-shot manual test; don't loop forever waiting for a "tomorrow" that isn't real.
    if (SKIP_WAIT) break;
  }
}

main();
