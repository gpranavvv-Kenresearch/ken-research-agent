/**
 * scheduler-new.ts — 5-Stage Narrowing Coordinator (Asia/Kolkata)
 *
 * Posting runs TWICE a day, starting fresh at Stage 1 (all platforms) at
 * 11:00 AM and 11:00 PM IST, narrowing down through 5 stages (1 hour between
 * each), then STOPPING after Stage 5 — no wraparound back to Stage 1 anymore.
 *
 * Two start modes (see `npm run schedule` vs `npm run schedule:now`):
 *   - Cron-only  (default): registers the 11:00 AM/PM triggers and waits —
 *     nothing posts until the next trigger fires.
 *   - Immediate: registers the same triggers AND starts a posting session
 *     right away, for a manual/on-demand restart.
 *
 * Stage 1 (14 platforms): everything
 * Stage 2 (12): drop LinkedIn Pulse, Medium
 * Stage 3 (8):  drop Note, Blogger, WordPress
 * Stage 4 (5):  drop LinkedIn (post), Linkmate, Calisthenics
 * Stage 5 (3):  drop HackMD, Notion  →  X + Facebook + Google Sites
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
 * Ameba and Paragraph removed 2026-07-29 — being replaced, kept out of the
 * rotation entirely until new accounts/platforms are ready.
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
  runNotionBatch, runNoteBatch, runCodaBatch,
  runWeeklySerpRecheck, runSundayExamination, resetBatchCounters,
  runRetryRow,
} from './coordinator/masterCoordinator.js';
import { startCycle, stopCycle } from './login-portal/blogCycle.js';
import { rebalanceFleetNames, getFailedSocialRows, assignPendingRowsToLiveAccounts, pinSessionDate } from './sheets/sheets.js';
import { canPost } from './health/accountHealth.js';
import { closeAllBrowsers } from './tools/browserTools.js';
import { killPostingChrome } from './utils/procKill.js';
import { acquireBrowserSlot } from './utils/browserSlots.js';

// Which agent's blog-generation session runs during the posting gaps.
const BLOG_GEN_AGENT = process.env.WORKER_NAME || 'abhinav';

const STAGE_GAP_MS = 60 * 60 * 1000; // 1 hour between every stage
const ROUND_GAP_MS = 30 * 60 * 1000; // 30 min between rounds — runCountedPostCycle only
const PLATFORM_TIMEOUT_MS = 5 * 60 * 1000; // one stuck platform must never block the rest of a stage

interface PlatformDef { label: string; run: (batchNum: number, limit?: number) => Promise<void>; }

const DEVTO:         PlatformDef = { label: 'Dev.to',         run: runDevtoBatch };
const X:            PlatformDef = { label: 'X',              run: runXBatch };
const FB:           PlatformDef = { label: 'Facebook',       run: runFbBatch };
const LI:           PlatformDef = { label: 'LinkedIn',       run: (n, limit) => runLiBatch(undefined, n, limit) };
const LI_PULSE:     PlatformDef = { label: 'LinkedIn Pulse', run: runLinkedinPulseBatch };
const MEDIUM:       PlatformDef = { label: 'Medium',         run: runMediumBatch };
const WORDPRESS:    PlatformDef = { label: 'WordPress',      run: runWordpressBatch };
const BLOGGER:      PlatformDef = { label: 'Blogger',        run: runBloggerBatch };
const GOOGLESITE:   PlatformDef = { label: 'Google Sites',   run: runGoogleSiteBatch };
const NOTE:         PlatformDef = { label: 'Note',           run: runNoteBatch };
const HACKMD:       PlatformDef = { label: 'HackMD',         run: runHackmdBatch };
const LINKMATE:     PlatformDef = { label: 'Linkmate',       run: runLinkmateBatch };
const CALISTHENICS: PlatformDef = { label: 'Calisthenics',   run: runCalisthenicsNBatch };
const NOTION:       PlatformDef = { label: 'Notion',         run: runNotionBatch };
const CODA:         PlatformDef = { label: 'Coda',           run: runCodaBatch };

// Key map for the counted, round-based "Post Now" cycle (runCountedPostCycle) —
// the dashboard form's platform keys to the PlatformDef objects above.
const COUNTED_PLATFORMS: Record<string, PlatformDef> = {
  x: X, fb: FB, lipost: LI, lipulse: LI_PULSE, medium: MEDIUM,
  wordpress: WORDPRESS, blogger: BLOGGER, googlepost: GOOGLESITE, note: NOTE,
  hackmd: HACKMD, linkmate: LINKMATE, calisthenics: CALISTHENICS, notion: NOTION, devto: DEVTO,
  coda: CODA,
};

// ── The 5 stages, exactly as agreed ────────────────────────────────────────────
const STAGES: PlatformDef[][] = [
  // Stage 1 — all 16 (Dev.to included)
  [X, FB, LI, LI_PULSE, MEDIUM, WORDPRESS, BLOGGER, GOOGLESITE, NOTE, HACKMD, LINKMATE, CALISTHENICS, NOTION, DEVTO],
  // Stage 2 — drop LinkedIn Pulse, Medium (14 left, Dev.to still included)
  [X, FB, LI, WORDPRESS, BLOGGER, GOOGLESITE, NOTE, HACKMD, LINKMATE, CALISTHENICS, NOTION, DEVTO],
  // Stage 3 — drop Note, Blogger, WordPress, Paragraph, Ameba, Dev.to (8 left)
  [X, FB, LI, GOOGLESITE, HACKMD, LINKMATE, CALISTHENICS, NOTION],
  // Stage 4 — drop LinkedIn (post), Linkmate, Calisthenics (5 left)
  [X, FB, GOOGLESITE, HACKMD, NOTION],
  // Stage 5 — drop HackMD, Notion (3 left, Google Sites kept to the end)
  [X, FB, GOOGLESITE],
];

function nowIst(): string {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' IST';
}

/** IST calendar date "YYYY-MM-DD" — used to pin a session to its start day. */
function todayIst(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

export function writeStatus(status: Record<string, unknown>, statusFile: string = STATUS_FILE): void {
  try {
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2));
  } catch { /* non-critical */ }
}

let lapNum = 0;

/**
 * Run one platform's batch, fully torn down afterward — the shared body both
 * `runStage` (fixed 5-stage sequence) and `runCountedPostCycle` (user-specified
 * per-platform counts) use. Acquires the cross-process browser slot, runs with
 * a timeout, then unconditionally closes browsers + sweep-kills any leftover
 * Chrome + releases the slot, success/error/timeout alike — this is what stops
 * the zombie pileup between platforms.
 */
async function runOnePlatform(platform: PlatformDef, batchNum: number, limit: number | undefined, errorLabel: string): Promise<void> {
  const releaseSlot = await acquireBrowserSlot(platform.label, { agent: BLOG_GEN_AGENT });
  try {
    await withTimeout(platform.run(batchNum, limit), PLATFORM_TIMEOUT_MS, platform.label);
  } catch (err: any) {
    console.error(`[${errorLabel}] ${platform.label} error: ${err.message}`);
  } finally {
    try {
      await withTimeout(closeAllBrowsers(), 30_000, 'closeAllBrowsers');
    } catch (e: any) {
      console.error(`[${errorLabel}] closeAllBrowsers after ${platform.label}: ${e.message}`);
    }
    killPostingChrome();
    releaseSlot(); // free the slot only after the browser is actually dead
  }
}

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
    await runOnePlatform(platform, lapNum, undefined, `Stage ${stageIndex + 1}`);
  }
  console.log(`[${nowIst()}] ◀ Stage ${stageIndex + 1}/5 complete.`);
}

/**
 * Counted, round-based "Post Now" cycle — the dashboard's alternative to the
 * fixed 5-stage sequence. `counts` maps a COUNTED_PLATFORMS key to how many
 * posts the user wants from that platform this cycle (0 or omitted = skip it
 * entirely). Each round attempts exactly 1 post on every platform still > 0,
 * decrementing that platform's count afterward UNCONDITIONALLY — success or
 * failure — so one broken platform can never keep the whole cycle looping
 * forever. A platform drops out of the round the moment it hits 0. Stops when
 * every count is 0, waiting STAGE_GAP_MS between rounds (skipped after the
 * final round).
 */
export async function runCountedPostCycle(counts: Record<string, number>, statusFile?: string): Promise<void> {
  const remaining: Record<string, number> = {};
  for (const [key, count] of Object.entries(counts)) {
    if (COUNTED_PLATFORMS[key] && count > 0) remaining[key] = Math.floor(count);
  }

  let round = 1;
  while (Object.values(remaining).some((c) => c > 0)) {
    const activeKeys = Object.keys(remaining).filter((k) => remaining[k] > 0);
    const activeLabels = activeKeys.map((k) => COUNTED_PLATFORMS[k].label);
    console.log(`\n[${nowIst()}] ▶ Round ${round} — ${activeLabels.join(', ')}`);
    writeStatus({ phase: 'running', round, remainingCounts: { ...remaining }, platforms: activeLabels }, statusFile);

    for (const key of activeKeys) {
      const platform = COUNTED_PLATFORMS[key];
      writeStatus({ phase: 'running', round, remainingCounts: { ...remaining }, platforms: activeLabels, currentPlatform: platform.label }, statusFile);
      await runOnePlatform(platform, round, 1, `Round ${round}`);
      remaining[key] -= 1;
    }

    console.log(`[${nowIst()}] ◀ Round ${round} complete.`);
    round++;
    if (Object.values(remaining).some((c) => c > 0)) {
      writeStatus({ phase: 'waiting', round, remainingCounts: { ...remaining }, nextRound: round }, statusFile);
      await new Promise((r) => setTimeout(r, ROUND_GAP_MS));
    }
  }
  writeStatus({ phase: 'done', round: round - 1, remainingCounts: remaining }, statusFile);
  console.log(`[${nowIst()}] ═══ Counted post cycle complete after ${round - 1} round(s) ═══`);
}

// ── Retry sweep: repost failed SOCIAL rows during the inter-stage gap ─────────
// Blogs already self-retry (their pickers key off a posted URL, so a failed row
// with no URL is re-picked next cycle). X/FB/LI do NOT — their pickers treat any
// non-empty status ("Failed"/"Error") as done, so social failures never come back.
// So we use the 30-min gaps to repost failed social rows via runRetryRow (which
// reuses the already-generated content). Bounded per platform + a wall-clock budget
// so it never eats into the next stage. A dead/quarantined/cap-reached account is
// skipped so retries can't trigger bans or exceed daily caps.
const RETRY_PER_PLATFORM = 8;
const RETRY_SWEEP: Array<{ key: 'x' | 'facebook' | 'linkedin'; short: 'X' | 'FB' | 'LI'; health: string }> = [
  { key: 'x',        short: 'X',  health: 'X' },
  { key: 'facebook', short: 'FB', health: 'Facebook' },
  { key: 'linkedin', short: 'LI', health: 'LinkedIn' },
];

async function runRetrySweep(myToken: number, budgetMs: number): Promise<void> {
  const start = Date.now();
  let reposted = 0;
  for (const p of RETRY_SWEEP) {
    if (myToken !== currentRunToken || Date.now() - start > budgetMs) break;
    let rows;
    try { rows = await getFailedSocialRows(p.short, RETRY_PER_PLATFORM); }
    catch (err: any) { console.error(`[${nowIst()}] [retry] ${p.short} lookup failed: ${err.message}`); continue; }
    for (const row of rows) {
      if (myToken !== currentRunToken || Date.now() - start > budgetMs) break;
      let ok = true;
      try { ok = canPost(p.health, row.name).ok; } catch { /* fail-open */ }
      if (!ok) continue; // dead / quarantined / at daily cap → don't repost
      const releaseSlot = await acquireBrowserSlot(`retry:${p.short}`, { agent: BLOG_GEN_AGENT });
      try {
        await withTimeout(runRetryRow(row.rowIndex, p.key), PLATFORM_TIMEOUT_MS, `retry ${p.short}`);
        reposted++;
      } catch (err: any) {
        console.error(`[${nowIst()}] [retry] ${p.short} row ${row.rowIndex}: ${err.message}`);
      } finally {
        try { await withTimeout(closeAllBrowsers(), 30_000, 'closeAllBrowsers'); } catch { /* noop */ }
        killPostingChrome();
        releaseSlot();
      }
    }
  }
  console.log(`[${nowIst()}] [retry] sweep done — attempted ${reposted} repost(s) in ${Math.round((Date.now() - start) / 60000)} min`);
}

// A fresh 11:00 AM/PM trigger bumps this token so any still-running loop from
// the previous session (or a stale earlier lap) recognizes it's superseded
// and stops itself instead of continuing to run alongside the new one.
let currentRunToken = 0;

// Whether a posting cycle (Stage 1 → 5) is currently in progress. With only two
// 12h-apart triggers (11:00/23:00), a cycle should always finish well before the
// next one fires — but if it somehow doesn't, the next trigger must NOT cut it
// off mid-stage. startDailyLoop() checks this and skips the new trigger entirely
// (letting the running cycle finish) instead of superseding it. Reset both on
// natural completion AND on the (now normally-unreachable, kept as a defensive
// belt-and-suspenders) superseded-mid-stage paths, so this can never get stuck
// `true` forever and permanently block every future trigger.
let sessionActive = false;

async function runLoopFrom(stageIndex: number, myToken: number): Promise<void> {
  while (myToken === currentRunToken) {
    if (stageIndex === 0) lapNum++;
    await runStage(stageIndex);
    if (myToken !== currentRunToken) { sessionActive = false; pinSessionDate(null); return; } // superseded mid-stage (defensive — see note above) — stop here

    if (stageIndex === STAGES.length - 1) {
      // Stage 5 done — this posting session is complete. Hand off to
      // continuous blog generation for the rest of the gap; the next 11:00
      // AM/PM cron trigger will stop it and start a fresh posting session.
      console.log(`[${nowIst()}] ═══ Posting session complete — starting continuous blog generation until the next session ═══`);
      writeStatus({ phase: 'generating-blogs', lap: lapNum, justFinishedStage: stageIndex + 1 });
      sessionActive = false;
      pinSessionDate(null);
      try {
        startCycle(BLOG_GEN_AGENT);
      } catch (err: any) {
        console.error(`[${nowIst()}] Could not start blog generation: ${err.message}`);
      }
      return;
    }

    const nextStage = stageIndex + 1;
    const resumesAt = new Date(Date.now() + STAGE_GAP_MS).toISOString();
    console.log(`[${nowIst()}] Stage gap — reposting failed social rows, then waiting until Stage ${nextStage + 1}... (safe to deploy/restart now)`);
    writeStatus({ phase: 'waiting', lap: lapNum, justFinishedStage: stageIndex + 1, nextStage: nextStage + 1, resumesAt });
    // Use the gap to repost failed X/FB/LI rows (up to ~60% of the gap), then wait
    // out the remainder so the overall stage cadence stays ~30 min.
    const gapStart = Date.now();
    await runRetrySweep(myToken, Math.floor(STAGE_GAP_MS * 0.6));
    if (myToken !== currentRunToken) { sessionActive = false; pinSessionDate(null); return; } // superseded during the sweep (defensive)
    const remaining = Math.max(0, STAGE_GAP_MS - (Date.now() - gapStart));
    await new Promise((r) => setTimeout(r, remaining));
    stageIndex = nextStage;
  }
}

function startDailyLoop(): void {
  // Never cut off a cycle that's still running — skip this trigger entirely and
  // let the in-progress cycle finish on its own. With only two 12h-apart
  // triggers a cycle should always be done well before the next one fires; this
  // is what makes that a guarantee instead of a hope.
  if (sessionActive) {
    console.log(`[${nowIst()}] ⏭ Skipping this trigger — a posting cycle is still running (started this lap: ${lapNum}). It will run to completion; the next trigger after this one will pick up normally.`);
    return;
  }
  sessionActive = true;
  currentRunToken++;
  const myToken = currentRunToken;
  lapNum = 0;
  // Pin every post this session makes to TODAY's date, even if the session
  // runs past midnight IST — an 11 PM lap that finishes at 12:30 AM must still
  // stamp as the day it started, not the day it happened to finish.
  pinSessionDate(todayIst());
  console.log(`\n[${nowIst()}] ═══ Posting session starting — Stage 1 ═══`);
  try {
    const stopped = stopCycle(BLOG_GEN_AGENT);
    if (stopped.stopped) console.log(`[${nowIst()}] Stopped blog generation (was running for ${stopped.agent}) to begin posting.`);
  } catch (err: any) {
    console.error(`[${nowIst()}] Could not stop blog generation before posting: ${err.message}`);
  }
  // Distribute untouched rows across all fleet agents (abhinav/krishi/...) so every
  // logged-in fleet account gets a share of this session. Non-fatal on error.
  void rebalanceFleetNames()
    .catch((err: any) => console.warn(`[${nowIst()}] Fleet rebalance failed (non-fatal): ${err.message}`))
    .then(() => runLoopFrom(0, myToken));
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
  // Skip the reset if an 11 PM session is still running past midnight — resetting
  // its daily caps mid-lap would both break cap enforcement for the rest of that
  // lap and mix two calendar days' counts together. The reset just runs at the
  // next midnight that finds no session active instead of being skipped forever.
  cron.schedule('0 0 * * *', () => {
    if (sessionActive) {
      console.log(`\n[${nowIst()}] Midnight — a posting session is still running from yesterday; skipping the counter reset until it finishes.`);
      return;
    }
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

  // ── Posting: fresh Stage 1 start TWICE a day — 11:00 and 23:00 IST (12h
  // apart). A full 5-stage lap (4×30-min gaps + posting) is ~3-4h, so each
  // session finishes well inside its 12h window before the next fires — and
  // even if it somehow doesn't, startDailyLoop()'s sessionActive guard skips
  // the new trigger rather than cutting the running one off. ────────────────
  cron.schedule('0 11 * * *', () => startDailyLoop(), { timezone: tz });
  cron.schedule('0 23 * * *', () => startDailyLoop(), { timezone: tz });

  // ── Safety-net buffer: stop blog generation 30 min before EACH of the two
  // posting sessions (10:30, 22:30), so a session never has to fight the
  // blog-gen ChatGPT browser for the box. ────────────────────────────────────
  const stopBlogGenBuffer = (label: string) => {
    const result = stopCycle(BLOG_GEN_AGENT);
    if (result.stopped) console.log(`[${nowIst()}] ${label} — stopped blog generation (30 min buffer before next posting session).`);
  };
  cron.schedule('30 10 * * *', () => stopBlogGenBuffer('10:30'), { timezone: tz });
  cron.schedule('30 22 * * *', () => stopBlogGenBuffer('22:30'), { timezone: tz });

  console.log(`Coordinator Scheduler Started — 5-stage narrowing posting sessions at 11:00 and 23:00 IST, 30 min between stages, continuous blog generation fills the gaps.\n`);

  if (immediate) {
    console.log(`[${nowIst()}] Immediate run requested — starting a posting session now instead of waiting for the next 11:00/23:00 trigger.`);
    startDailyLoop();
  } else {
    console.log(`[${nowIst()}] Cron-only start — waiting for the next 11:00/23:00 trigger. No posting session started now.`);
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
  try { await rebalanceFleetNames(); } catch (err: any) { console.warn(`Fleet rebalance failed (non-fatal): ${err.message}`); }
  // Per-agent "Post Now" only (this function is never called by the main
  // scheduler daemon) — spread any row this agent can't otherwise resolve
  // (bare name, or a number pointing at a dead/deleted account) across
  // whatever accounts this agent has ACTUALLY logged in right now. Built for
  // agents like vansh/sanya with a small, evolving account count — no fixed
  // cap assumed, unlike the strict fixed-slot rules kept for the main fleet.
  try { await assignPendingRowsToLiveAccounts(process.env.WORKER_NAME || 'abhinav'); }
  catch (err: any) { console.warn(`Live-account assignment failed (non-fatal): ${err.message}`); }
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
