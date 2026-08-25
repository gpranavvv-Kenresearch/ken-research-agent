/**
 * nightly-blog-rotation.ts — CONTINUOUS blog-generation loop, N blogs per person.
 *
 * Round-robin, in order sanya → hritika → meenakshi → vijay → vansh → sameeksha
 * (each with their OWN ChatGPT account: .sessions-cookies/chatgpt-profile-{agent}).
 * Each person generates up to BLOGS_PER_PERSON blogs, then a BREAK_MIN (10 min)
 * break before the next person — except after the LAST person in a pass
 * (sameeksha), which gets the longer CYCLE_BREAK_MIN (1 hour) instead, before
 * the whole rotation loops back around to sanya. Loops forever, day and
 * night — no schedule window.
 *
 * Deliberately no "starts at midnight" gate: this process is meant to run
 * continuously 24/7 (see the self-healing watchdog below) — a hard start-time
 * gate would mean that if it ever got killed and restarted mid-day (a crash,
 * a manual sweep, a VPS reboot), it would sit completely idle for up to ~24h
 * waiting for the next midnight instead of resuming right away. In steady
 * state it's already running through every midnight anyway, so the practical
 * effect is the same without that failure mode.
 *
 *   for each agent, forever:
 *     - sweep any leftover generation/Chrome FIRST (NO OVERLAP — the previous
 *       person is fully killed before this one starts)
 *     - skip instantly if the agent has no fresh URLs (Blog Content empty)
 *     - else generate up to BLOGS_PER_PERSON blogs (each blog capped by
 *       run-blog-generator's own 20-min per-blog watchdog; whole run capped by
 *       PERSON_MAX_MIN as a safety net against a hang)
 *     - BREAK_MIN break, then the next person
 *   if a whole pass finds no fresh URLs anywhere, sleep DRY_SLEEP_MIN and recheck.
 *
 * NO 14h timeout, NO overnight pause. Kept alive / self-healed by a watchdog
 * cron: every 15 min a `flock -n` starts it only if not already running.
 *
 * Config (env):
 *   BLOG_LIMIT          blogs per person before the break (default 5)
 *   BLOG_BREAK_MIN      break between people (default 30)
 *   BLOG_PERSON_MAX_MIN safety cap: kill a person's run if it hangs beyond this (default 150)
 *
 * Usage:
 *   node --import=tsx scripts/nightly-blog-rotation.ts          # continuous loop (production)
 *   node --import=tsx scripts/nightly-blog-rotation.ts --now    # one person then exit (testing)
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const AGENTS = ['sanya', 'hritika', 'meenakshi', 'vijay', 'vansh', 'sameeksha'];
const BLOGS_PER_PERSON = Number(process.env.BLOG_LIMIT || 5);           // blogs each person generates before the break
const BREAK_MIN = Number(process.env.BLOG_BREAK_MIN || 10);             // break between one person finishing and the next starting
const CYCLE_BREAK_MIN = Number(process.env.BLOG_CYCLE_BREAK_MIN || 60); // longer break after the LAST person in a full pass, before looping back to the first
const PERSON_MAX_MIN = Number(process.env.BLOG_PERSON_MAX_MIN || 150);  // safety cap per person (hang guard)
const DRY_SLEEP_MIN = 30;                                               // whole pass found no work → wait, recheck

const SKIP_WAIT = process.argv.includes('--now'); // one person then exit (testing)

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
 * child.kill() only reaps run-blog-generator; the generate_blog_chatgpt /
 * generate_image it spawned, and the Chrome THOSE launched, are separate PIDs and
 * would otherwise keep running into the next person's turn. Matches ONLY blog-gen
 * ChatGPT profiles — never the posting sessions (.sessions-{agent}/{platform}). */
function sweepBlogGeneration(): void {
  const patterns = [
    'run-blog-generator.ts',
    'generate_blog_chatgpt.ts',
    'generate_image.ts',
    'chatgpt-profile-',        // any agent's blog-text Chrome
    'chatgpt-image-profile-',  // any agent's cover-image Chrome
  ];
  for (const p of patterns) {
    try { spawnSync('pkill', ['-9', '-f', p], { stdio: 'ignore' }); } catch { /* pkill absent off-Linux — noop */ }
  }
}

/** Generate up to BLOGS_PER_PERSON blogs for one agent; exits when done (5 blogs
 * or out of URLs) or when the safety cap trips. Sweeps every leftover
 * generation/Chrome PID on exit so the next person starts clean. */
function generateForPerson(agent: string, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    const blogLog = `/tmp/blog-gen-${agent}.log`;
    try { fs.appendFileSync(blogLog, `\n=== ${new Date().toISOString()} run start ===\n`); } catch { /* noop */ }
    const child = spawn(process.execPath, [
      '--import=tsx', 'scripts/run-blog-generator.ts',
      '--name', agent, '--limit', String(BLOGS_PER_PERSON), '--image-prompt', '1',
    ], {
      env: { ...process.env, WORKER_NAME: agent, DISPLAY: process.env.DISPLAY || ':99', BLOG_LOG: blogLog },
      stdio: 'ignore',
    });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(safety);
      sweepBlogGeneration();
      resolve();
    };
    const safety = setTimeout(() => {
      log(`⏱ ${agent}: run exceeded ${Math.round(maxMs / 60000)} min (hung?) — killing, moving on.`);
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      setTimeout(finish, 3000); // let the tree die, then hard-sweep + resolve
    }, maxMs);
    child.on('close', finish);
    child.on('error', (err) => { log(`✗ ${agent}: failed to start — ${err.message}`); finish(); });
  });
}

interface BlogRow { blogBatch?: string; 'Blog Content'?: string; 'Cover Image URL'?: string; [k: string]: unknown; }

/** Does this agent have any fresh (Blog-Content-empty) rows right now? -1 = read
 * failed (treated as "maybe has work" so a transient error never wrongly skips). */
function freshCount(agent: string): number {
  const r = spawnSync(PY, ['scripts/sheet_read.py', '--sheet', 'blog', '--name', agent, '--action', 'blog-unprocessed', '--limit', String(BLOGS_PER_PERSON)], { encoding: 'utf-8' });
  if (r.status !== 0) return -1;
  try { return Number(JSON.parse(r.stdout).count ?? 0); } catch { return -1; }
}

/** Re-read the sheet and report how many of this turn's rows got content. */
function verifyAndReport(agent: string, sinceBatchStamp: string): void {
  const r = spawnSync(PY, ['scripts/sheet_read.py', '--sheet', 'blog', '--name', agent, '--action', 'all'], { encoding: 'utf-8' });
  if (r.status !== 0) { log(`⚠ ${agent}: could not re-read sheet to verify (exit ${r.status})`); return; }
  let rows: BlogRow[] = [];
  try { rows = (JSON.parse(r.stdout).rows || []) as BlogRow[]; } catch { log(`⚠ ${agent}: sheet read returned unparseable JSON`); return; }
  const thisRun = rows.filter((row) => (row.blogBatch || '') >= `BLOG-${sinceBatchStamp}`);
  const withContent = thisRun.filter((row) => (row['Blog Content'] || '').trim());
  const withImage = withContent.filter((row) => (row['Cover Image URL'] || '').trim());
  const missing = withContent.length - withImage.length;
  log(`${agent}: ${withContent.length} generated this turn, ${withImage.length}/${withContent.length} with cover image${missing ? ` (${missing} missing an image)` : ''}`);
}

function istTimestamp(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const iso = ist.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 19)}`;
}

async function main() {
  log(`Blog loop starting. Order: ${AGENTS.join(' → ')} | ${BLOGS_PER_PERSON} blogs/person | ${BREAK_MIN} min between people | ${CYCLE_BREAK_MIN} min after a full cycle | ${SKIP_WAIT ? '[--now: one person]' : '[continuous]'}`);
  for (;;) {
    let anyWork = false;
    for (let i = 0; i < AGENTS.length; i++) {
      const agent = AGENTS[i];
      const isLastInCycle = i === AGENTS.length - 1;
      // NO OVERLAP: before this person starts, kill any leftover generation + Chrome.
      sweepBlogGeneration();
      await sleep(3000);
      const fresh = freshCount(agent);
      if (fresh === 0) { log(`${agent}: no fresh URLs — skipping.`); continue; }
      anyWork = true;
      const startStamp = istTimestamp();
      log(`=== ${agent}: generating up to ${BLOGS_PER_PERSON} blogs${fresh > 0 ? `, ${fresh} fresh` : ''} ===`);
      await generateForPerson(agent, PERSON_MAX_MIN * 60 * 1000);
      verifyAndReport(agent, startStamp);
      if (SKIP_WAIT) { log('--now: one person done, exiting.'); return; }
      // Every person in the middle of a pass gets the short BREAK_MIN gap;
      // the LAST person before the rotation loops back to the first gets the
      // longer CYCLE_BREAK_MIN instead — one full lap through everyone, then
      // a real rest, not another short gap immediately into round two.
      const breakMin = isLastInCycle ? CYCLE_BREAK_MIN : BREAK_MIN;
      log(`--- ${agent} done — ${breakMin} min break before ${isLastInCycle ? 'the cycle restarts from the first person' : 'next person'} ---`);
      await sleep(breakMin * 60 * 1000);
    }
    if (SKIP_WAIT) return;
    if (!anyWork) {
      log(`No fresh URLs for anyone — sleeping ${DRY_SLEEP_MIN} min before rechecking.`);
      await sleep(DRY_SLEEP_MIN * 60 * 1000);
    }
  }
}

main();
