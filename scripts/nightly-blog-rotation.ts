/**
 * nightly-blog-rotation.ts — CONTINUOUS, TIME-SLOTTED blog-generation loop.
 *
 * Round-robin across the 6 personal-sheet agents (each with their OWN ChatGPT
 * account: .sessions-cookies/chatgpt-profile-{agent}). Every person gets a fixed
 * time SLOT to generate blogs; when their slot is up, generation is stopped, a
 * short break follows, and the next person's slot begins. Loops forever.
 *
 *   for each agent, forever:
 *     - skip instantly if the agent has no fresh URLs
 *     - else generate blogs for up to SLOT_MIN minutes (each blog capped by
 *       run-blog-generator's own 20-min per-blog watchdog)
 *     - at slot end, KILL the run (even mid-blog) so nobody overruns their slot
 *     - BREAK_MIN break, then the next agent's slot
 *   if a whole pass finds no fresh URLs anywhere, sleep DRY_SLEEP_MIN and recheck.
 *
 * Giving each account its own slot (with the others idle) is what keeps ChatGPT
 * from rate-limiting: only one account is ever active at a time, and each rests
 * while the other five cycle through.
 *
 * NO 14h `timeout` wrapper. Kept alive / self-healed by a watchdog cron: every
 * 15 min a `flock -n` starts it ONLY if not already running.
 *
 * Config (env):
 *   BLOG_SLOT_MIN   minutes each person generates before being stopped (default 180 = 3h)
 *   BLOG_BREAK_MIN  break between people (default 10)
 *   BLOG_SLOT_LIMIT max blogs attempted per slot; exits early if the person runs out (default 100)
 *
 * Usage:
 *   node --import=tsx scripts/nightly-blog-rotation.ts             # continuous loop (production)
 *   node --import=tsx scripts/nightly-blog-rotation.ts --now       # run ONE agent slot then exit (testing)
 *   BLOG_SLOT_MIN=2 node --import=tsx scripts/nightly-blog-rotation.ts --now   # 2-min slot smoke test
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const AGENTS = ['sanya', 'meenakshi', 'vansh', 'sameeksha', 'hritika', 'vijay'];
const SLOT_MIN = Number(process.env.BLOG_SLOT_MIN || 180);     // minutes per person's generation slot
const BREAK_MIN = Number(process.env.BLOG_BREAK_MIN || 30);     // break between people
const SLOT_LIMIT = Number(process.env.BLOG_SLOT_LIMIT || 100);  // max blogs per slot (exits early if URLs run out)
const DRY_SLEEP_MIN = 30;                                       // whole pass found no work → wait this long, recheck

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const SKIP_WAIT = process.argv.includes('--now'); // one agent slot then exit (testing)

const PY = process.env.PYTHON
  || (fs.existsSync(path.resolve('venv/bin/python3')) ? path.resolve('venv/bin/python3')
    : process.platform === 'win32' ? 'python' : 'python3');

const LOG_FILE = process.env.ROTATION_LOG || '/tmp/nightly-blog-rotation.log';
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* noop */ }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hard-kill EVERY blog-generation subprocess + its ChatGPT Chrome (all agents).
 * child.kill() only reaps run-blog-generator itself; the generate_blog_chatgpt /
 * generate_image it spawned, and the Chrome THOSE launched, are separate PIDs and
 * would otherwise keep running into the next person's slot. Matches ONLY blog-gen
 * ChatGPT profiles — never the posting sessions (.sessions-{agent}/{platform}). */
function sweepBlogGeneration(): void {
  const patterns = [
    'run-blog-generator.ts',
    'generate_blog_chatgpt.ts',
    'generate_image.ts',
    'chatgpt-profile-',        // any agent's blog-text Chrome (--user-data-dir …/chatgpt-profile-<agent>)
    'chatgpt-image-profile-',  // any agent's cover-image Chrome
  ];
  for (const p of patterns) {
    try { spawnSync('pkill', ['-9', '-f', p], { stdio: 'ignore' }); } catch { /* pkill absent off-Linux — noop */ }
  }
}

/** Generate blogs for one agent for up to `slotMs`, then stop cleanly. Returns
 * early if the agent runs out of fresh URLs first. On exit it sweeps every
 * leftover generation/Chrome PID so the next slot starts with a clean slate. */
function generateForSlot(agent: string, slotMs: number): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      '--import=tsx', 'scripts/run-blog-generator.ts',
      '--name', agent, '--limit', String(SLOT_LIMIT), '--image-prompt', '1',
    ], {
      env: { ...process.env, WORKER_NAME: agent, DISPLAY: process.env.DISPLAY || ':99' },
      stdio: 'ignore',
    });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(slotTimer);
      sweepBlogGeneration(); // reap orphaned generate_blog_chatgpt / generate_image / Chrome
      resolve();
    };
    const slotTimer = setTimeout(() => {
      log(`⏱ ${agent}: slot time up (${Math.round(slotMs / 60000)} min) — stopping generation.`);
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      setTimeout(finish, 3000); // let the tree die, then hard-sweep + resolve
    }, slotMs);
    child.on('close', finish);
    child.on('error', (err) => { log(`✗ ${agent}: failed to start — ${err.message}`); finish(); });
  });
}

interface BlogRow { blogBatch?: string; 'Blog Content'?: string; 'Cover Image URL'?: string; [k: string]: unknown; }

/** Fresh (generation-ready) row count for an agent. -1 = read failed (treat as "maybe has work"). */
function freshCount(agent: string): number {
  const r = spawnSync(PY, ['scripts/sheet_read.py', '--sheet', 'blog', '--name', agent, '--action', 'blog-unprocessed'], { encoding: 'utf-8' });
  if (r.status !== 0) return -1;
  try { return Number(JSON.parse(r.stdout).count ?? 0); } catch { return -1; }
}

/** Re-read the sheet and report how many of this slot's rows got content. */
function verifyAndReport(agent: string, sinceBatchStamp: string): void {
  const r = spawnSync(PY, ['scripts/sheet_read.py', '--sheet', 'blog', '--name', agent, '--action', 'all'], { encoding: 'utf-8' });
  if (r.status !== 0) { log(`⚠ ${agent}: could not re-read sheet to verify (exit ${r.status})`); return; }
  let rows: BlogRow[] = [];
  try { rows = (JSON.parse(r.stdout).rows || []) as BlogRow[]; } catch { log(`⚠ ${agent}: sheet read returned unparseable JSON`); return; }
  const thisRun = rows.filter((row) => (row.blogBatch || '') >= `BLOG-${sinceBatchStamp}`);
  const withContent = thisRun.filter((row) => (row['Blog Content'] || '').trim());
  const withImage = withContent.filter((row) => (row['Cover Image URL'] || '').trim());
  const missing = withContent.length - withImage.length;
  log(`${agent}: ${withContent.length} generated this slot, ${withImage.length}/${withContent.length} with cover image${missing ? ` (${missing} missing an image)` : ''}`);
}

function istTimestamp(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const iso = ist.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 19)}`;
}

function istMinutesOfDay(): number {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

const START_HOUR_MIN = 8 * 60; // generation window opens at 08:00 IST

/** Generation runs from 08:00 IST onward; between 00:00 and 08:00 IST it sleeps
 * until 8 AM. So a slot never starts in the small hours, it always (re)starts at
 * 8 AM, and a crash/restart after 8 AM just resumes immediately. */
async function waitForStartWindow(): Promise<void> {
  if (SKIP_WAIT) return;
  const now = istMinutesOfDay();
  if (now < START_HOUR_MIN) {
    const waitMin = START_HOUR_MIN - now;
    log(`Before 08:00 IST — sleeping ${waitMin} min until the generation window opens.`);
    await sleep(waitMin * 60 * 1000);
  }
}

async function main() {
  log(`Blog slot loop starting. Order: ${AGENTS.join(' → ')} | slot ${SLOT_MIN} min/person | ${BREAK_MIN} min break | ${SKIP_WAIT ? '[--now: one slot then exit]' : '[continuous]'}`);
  for (;;) {
    let anyWork = false;
    for (const agent of AGENTS) {
      await waitForStartWindow(); // hold before each slot until 08:00 IST if we're in the overnight pause
      // NO OVERLAP: before this person starts, guarantee the previous person's
      // generation + Chrome is completely gone (sweep, then a short settle).
      sweepBlogGeneration();
      await sleep(3000);
      const fresh = freshCount(agent);
      if (fresh === 0) { log(`${agent}: no fresh URLs — skipping slot.`); continue; }
      anyWork = true;
      const startStamp = istTimestamp();
      log(`=== ${agent}'s slot starting — up to ${SLOT_MIN} min${fresh > 0 ? `, ${fresh} fresh URLs` : ''} ===`);
      await generateForSlot(agent, SLOT_MIN * 60 * 1000);
      verifyAndReport(agent, startStamp);
      if (SKIP_WAIT) { log('--now: one slot done, exiting.'); return; }
      log(`--- ${agent}'s slot ended — ${BREAK_MIN} min break before next person ---`);
      await sleep(BREAK_MIN * 60 * 1000);
    }
    if (SKIP_WAIT) return; // (all agents were dry in a --now run)
    if (!anyWork) {
      log(`No fresh URLs for anyone — sleeping ${DRY_SLEEP_MIN} min before rechecking.`);
      await sleep(DRY_SLEEP_MIN * 60 * 1000);
    }
  }
}

main();
