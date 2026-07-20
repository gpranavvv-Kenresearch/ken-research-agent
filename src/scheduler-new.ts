/**
 * scheduler-new.ts — 5-Stage Narrowing Coordinator (Asia/Kolkata)
 *
 * Posting runs TWICE a day, starting fresh at Stage 1 (all platforms) at
 * 11:00 AM and 11:00 PM IST, narrowing down through 5 stages (30 min between
 * each), then STOPPING after Stage 5 — no wraparound back to Stage 1 anymore.
 *
 * Two start modes (see `npm run schedule` vs `npm run schedule:now`):
 *   - Cron-only  (default): registers the 11:00 AM/PM triggers and waits —
 *     nothing posts until the next trigger fires.
 *   - Immediate: registers the same triggers AND starts a posting session
 *     right away, for a manual/on-demand restart.
 *
 * Stage 1 (15 platforms): everything
 * Stage 2 (13): drop LinkedIn Pulse, Medium
 * Stage 3 (8):  drop Note, Blogger, WordPress, Paragraph, Ameba
 * Stage 4 (5):  drop LinkedIn (post), Linkmate, Calisthenics
 * Stage 5 (2):  drop Google Sites, HackMD, Notion  →  X + Facebook only
 *
 * The moment a posting session finishes (Stage 5 done), continuous blog
 * generation starts automatically (the same "Blog Cycle" loop the dashboard's
 * button controls — 5 blogs, 30 min pause, repeat) and fills the rest of the
 * gap until 10:30 (AM or PM, whichever is next) — a fixed 30-min buffer
 * before the next posting session starts at 11:00. So the system never sits
 * fully idle: it's always either posting or generating.
 *
 * Each platform batch call still pulls its row-limit set inside each
 * platform's own row-picker in masterCoordinator.ts.
 *
 * Patreon and Substack are intentionally excluded from this rotation.
 *
 * Unrelated maintenance jobs (midnight counter reset, weekly SERP recheck,
 * Sunday failed-post sweep) keep their own cron schedules, unaffected by this.
 */

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import {
  runXBatch, runFbBatch, runLiBatch,
  runMediumBatch, runLinkmateBatch, runGoogleSiteBatch,
  runDevtoBatch, runLinkedinPulseBatch, runCalisthenicsNBatch,
  runWordpressBatch, runBloggerBatch, runHackmdBatch,
  runNotionBatch, runNoteBatch, runParagraphBatch, runAmebaBatch,
  runWeeklySerpRecheck, runSundayExamination, resetBatchCounters,
} from './coordinator/masterCoordinator.js';
import { startCycle, stopCycle } from './login-portal/blogCycle.js';

// Which agent's blog-generation session runs during the posting gaps.
const BLOG_GEN_AGENT = process.env.WORKER_NAME || 'abhinav';

const STAGE_GAP_MS = 30 * 60 * 1000; // 30 minutes between every stage
const PLATFORM_TIMEOUT_MS = 5 * 60 * 1000; // one stuck platform must never block the rest of a stage

interface PlatformDef { label: string; run: (batchNum: number) => Promise<void>; }

const DEVTO:         PlatformDef = { label: 'Dev.to',         run: runDevtoBatch };
const X:            PlatformDef = { label: 'X',              run: runXBatch };
const FB:           PlatformDef = { label: 'Facebook',       run: runFbBatch };
const LI:           PlatformDef = { label: 'LinkedIn',       run: (n) => runLiBatch(undefined, n) };
const LI_PULSE:     PlatformDef = { label: 'LinkedIn Pulse', run: runLinkedinPulseBatch };
const MEDIUM:       PlatformDef = { label: 'Medium',         run: runMediumBatch };
const WORDPRESS:    PlatformDef = { label: 'WordPress',      run: runWordpressBatch };
const BLOGGER:      PlatformDef = { label: 'Blogger',        run: runBloggerBatch };
const GOOGLESITE:   PlatformDef = { label: 'Google Sites',   run: runGoogleSiteBatch };
const AMEBA:        PlatformDef = { label: 'Ameba',          run: runAmebaBatch };
const NOTE:         PlatformDef = { label: 'Note',           run: runNoteBatch };
const PARAGRAPH:    PlatformDef = { label: 'Paragraph',      run: runParagraphBatch };
const HACKMD:       PlatformDef = { label: 'HackMD',         run: runHackmdBatch };
const LINKMATE:     PlatformDef = { label: 'Linkmate',       run: runLinkmateBatch };
const CALISTHENICS: PlatformDef = { label: 'Calisthenics',   run: runCalisthenicsNBatch };
const NOTION:       PlatformDef = { label: 'Notion',         run: runNotionBatch };

// ── The 5 stages, exactly as agreed ────────────────────────────────────────────
const STAGES: PlatformDef[][] = [
  // Stage 1 — all 16 (Dev.to included)
  [X, FB, LI, LI_PULSE, MEDIUM, WORDPRESS, BLOGGER, GOOGLESITE, AMEBA, NOTE, PARAGRAPH, HACKMD, LINKMATE, CALISTHENICS, NOTION, DEVTO],
  // Stage 2 — drop LinkedIn Pulse, Medium (14 left, Dev.to still included)
  [X, FB, LI, WORDPRESS, BLOGGER, GOOGLESITE, AMEBA, NOTE, PARAGRAPH, HACKMD, LINKMATE, CALISTHENICS, NOTION, DEVTO],
  // Stage 3 — drop Note, Blogger, WordPress, Paragraph, Ameba, Dev.to (8 left)
  [X, FB, LI, GOOGLESITE, HACKMD, LINKMATE, CALISTHENICS, NOTION],
  // Stage 4 — drop LinkedIn (post), Linkmate, Calisthenics (5 left)
  [X, FB, GOOGLESITE, HACKMD, NOTION],
  // Stage 5 — drop Google Sites, HackMD, Notion (2 left)
  [X, FB],
];

function nowIst(): string {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' IST';
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s — likely stuck browser automation`)), ms)
    ),
  ]);
}

// ── Live status file — check this before pushing a deploy/restart, so you're
// not restarting mid-post. `phase: "waiting"` = safe window; `phase: "running"`
// = a stage is actively posting right now (with the specific platform live).
const STATUS_FILE = path.resolve('.sessions/scheduler-status.json');

function writeStatus(status: Record<string, unknown>, statusFile: string = STATUS_FILE): void {
  try {
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2));
  } catch { /* non-critical */ }
}

let lapNum = 0;

/**
 * @param statusFile Defaults to the live daemon's shared status file. A manual
 * one-off run (e.g. the dashboard's "Post Now" button) passes its own path so
 * it doesn't clobber the live scheduler's status while both run independently.
 */
async function runStage(stageIndex: number, statusFile: string = STATUS_FILE): Promise<void> {
  const stage = STAGES[stageIndex];
  console.log(`\n[${nowIst()}] ▶ Stage ${stageIndex + 1}/5 (lap ${lapNum}) — ${stage.length} platform${stage.length === 1 ? '' : 's'}: ${stage.map(p => p.label).join(', ')}`);
  for (const platform of stage) {
    writeStatus({
      phase: 'running', lap: lapNum, stage: stageIndex + 1,
      platforms: stage.map(p => p.label), currentPlatform: platform.label,
    }, statusFile);
    try {
      await withTimeout(platform.run(lapNum), PLATFORM_TIMEOUT_MS, platform.label);
    } catch (err: any) {
      console.error(`[Stage ${stageIndex + 1}] ${platform.label} error: ${err.message}`);
    }
  }
  console.log(`[${nowIst()}] ◀ Stage ${stageIndex + 1}/5 complete.`);
}

// A fresh 11:00 AM/PM trigger bumps this token so any still-running loop from
// the previous session (or a stale earlier lap) recognizes it's superseded
// and stops itself instead of continuing to run alongside the new one.
let currentRunToken = 0;

async function runLoopFrom(stageIndex: number, myToken: number): Promise<void> {
  while (myToken === currentRunToken) {
    if (stageIndex === 0) lapNum++;
    await runStage(stageIndex);
    if (myToken !== currentRunToken) return; // superseded mid-stage — stop here, don't schedule the next one

    if (stageIndex === STAGES.length - 1) {
      // Stage 5 done — this posting session is complete. Hand off to
      // continuous blog generation for the rest of the gap; the next 11:00
      // AM/PM cron trigger will stop it and start a fresh posting session.
      console.log(`[${nowIst()}] ═══ Posting session complete — starting continuous blog generation until the next session ═══`);
      writeStatus({ phase: 'generating-blogs', lap: lapNum, justFinishedStage: stageIndex + 1 });
      try {
        startCycle(BLOG_GEN_AGENT);
      } catch (err: any) {
        console.error(`[${nowIst()}] Could not start blog generation: ${err.message}`);
      }
      return;
    }

    const nextStage = stageIndex + 1;
    const resumesAt = new Date(Date.now() + STAGE_GAP_MS).toISOString();
    console.log(`[${nowIst()}] Waiting 30 min before Stage ${nextStage + 1}... (safe to deploy/restart now)`);
    writeStatus({ phase: 'waiting', lap: lapNum, justFinishedStage: stageIndex + 1, nextStage: nextStage + 1, resumesAt });
    await new Promise((r) => setTimeout(r, STAGE_GAP_MS));
    stageIndex = nextStage;
  }
}

function startDailyLoop(): void {
  currentRunToken++;
  const myToken = currentRunToken;
  lapNum = 0;
  console.log(`\n[${nowIst()}] ═══ Posting session starting — Stage 1 ═══`);
  try {
    const stopped = stopCycle();
    if (stopped.stopped) console.log(`[${nowIst()}] Stopped blog generation (was running for ${stopped.agent}) to begin posting.`);
  } catch (err: any) {
    console.error(`[${nowIst()}] Could not stop blog generation before posting: ${err.message}`);
  }
  void runLoopFrom(0, myToken);
}

/**
 * @param immediate If true, also starts a posting session right away instead
 * of only registering the 11:00 AM/PM cron triggers and waiting. Used to tell
 * apart a plain "just live it, run on cron" start from an explicit "run right
 * now too" start.
 */
export async function startCoordinatorDaemon(immediate: boolean = false): Promise<void> {
  const tz = 'Asia/Kolkata';

  // ── Daily reset at midnight IST ───────────────────────────────────────────
  cron.schedule('0 0 * * *', () => {
    console.log(`\n[${nowIst()}] Midnight — resetting daily batch counters`);
    resetBatchCounters();
  }, { timezone: tz });

  // ── Weekly SERP recheck: Saturday 10 PM IST ───────────────────────────────
  cron.schedule('0 22 * * 6', async () => {
    console.log(`\n[${nowIst()}] ▶ Weekly SERP Recheck`);
    try { await runWeeklySerpRecheck(); } catch (err: any) { console.error(`[Weekly SERP Recheck] Error: ${err.message}`); }
  }, { timezone: tz });

  // ── Sunday Examination: Move failed posts to end of sheet ─────────────────
  cron.schedule('0 10 * * 0', async () => {
    console.log(`\n[${nowIst()}] ▶ Sunday Failed Posts Examination`);
    try { await runSundayExamination(); } catch (err: any) { console.error(`[Sunday Failed Posts Examination] Error: ${err.message}`); }
  }, { timezone: tz });

  // ── Posting: fresh Stage 1 start at 11:00 AM AND 11:00 PM IST ─────────────
  cron.schedule('0 11 * * *', () => startDailyLoop(), { timezone: tz });
  cron.schedule('0 23 * * *', () => startDailyLoop(), { timezone: tz });

  // ── Safety-net buffer: stop blog generation at 10:30 (AM/PM) even if a
  // posting session somehow finished late and is still generating past the
  // 30-min buffer before the next 11:00 session. ─────────────────────────
  const stopBlogGenBuffer = (label: string) => {
    const result = stopCycle();
    if (result.stopped) console.log(`[${nowIst()}] ${label} — stopped blog generation (30 min buffer before next posting session).`);
  };
  cron.schedule('30 10 * * *', () => stopBlogGenBuffer('10:30 AM'), { timezone: tz });
  cron.schedule('30 22 * * *', () => stopBlogGenBuffer('10:30 PM'), { timezone: tz });

  console.log(`Coordinator Scheduler Started — 5-stage narrowing posting sessions at 11:00 AM and 11:00 PM IST, 30 min between stages, continuous blog generation fills the gaps until 10:30.\n`);

  if (immediate) {
    console.log(`[${nowIst()}] Immediate run requested — starting a posting session now instead of waiting for the next 11:00 AM/PM trigger.`);
    startDailyLoop();
  } else {
    console.log(`[${nowIst()}] Cron-only start — waiting for the next 11:00 AM/PM trigger. No posting session started now.`);
  }
}

/**
 * Runs the full 5-cycle narrowing sequence exactly once (Cycle 1 → 5, 30 min
 * between each), then stops — no wraparound back to Cycle 1. Used by the
 * dashboard's "Post Now" one-off run, independent of the live scheduler daemon.
 * @param statusFile Optional override so this writes its own status instead of
 * the live daemon's shared file.
 */
export async function runCoordinatorOnce(statusFile?: string): Promise<void> {
  console.log(`Running the full ${STAGES.length}-cycle sequence once (30 min between each, then stopping)...\n`);
  lapNum = 1;
  for (let i = 0; i < STAGES.length; i++) {
    await runStage(i, statusFile);
    if (i < STAGES.length - 1) {
      console.log(`Waiting 30 min before Cycle ${i + 2}...`);
      await new Promise((r) => setTimeout(r, STAGE_GAP_MS));
    }
  }
  console.log('\nFull sequence done.');
}
