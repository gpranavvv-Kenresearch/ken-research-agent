/**
 * scheduler-new.ts — Static Cron Scheduler (Asia/Kolkata)
 *
 * Rules:
 *   1. ALL batches fire between 10:30 and 18:30 IST (8-hour window).
 *   2. Uniform 15-min spacing between every batch — smooth load.
 *   3. LinkedIn (LI), LinkedIn Pulse, and Medium each get a 15-minute exclusive
 *      window (auto-satisfied by uniform spacing).
 *   4. Platforms: FB×5, LI×3, GS×3, Linkmate×3, Cali×3, HackMD×2, Blogger×2,
 *      Paragraph×2, Dev.to×2, Notion×2, WordPress×2,
 *      Ameba×2, LI Pulse×1, Medium×1 = 33 batches/day. (X paused; Note removed.)
 *
 * Full timeline (IST):
 *
 *   10:30 → FB-1
 *   10:45 → Notion-1
 *   11:00 → GS-1
 *   11:15 → Linkmate-1
 *   11:30 → LI-1            ← PROTECTED 11:30–11:45
 *   11:45 → HackMD-1
 *   12:00 → Blogger-1
 *   12:15 → FB-2
 *   12:30 → Calisthenics-1
 *   12:45 → Paragraph-1
 *   13:00 → Dev.to-1
 *   13:15 → WordPress-1
 *   13:30 → GS-2
 *   13:45 → Linkmate-2
 *   14:00 → FB-3
 *   14:15 → LI-2            ← PROTECTED 14:15–14:30
 *   14:30 → Notion-2
 *   14:45 → Blogger-2
 *   15:00 → Calisthenics-2
 *   15:15 → HackMD-2
 *   15:30 → Medium-1        ← PROTECTED 15:30–15:45
 *   15:45 → FB-4
 *   16:00 → GS-3
 *   16:15 → Linkmate-3
 *   16:30 → Paragraph-2
 *   16:45 → Dev.to-2
 *   17:00 → LI-3            ← PROTECTED 17:00–17:15
 *   17:15 → FB-5
 *   17:30 → LinkedIn Pulse-1 ← PROTECTED 17:30–17:45
 *   17:45 → Ameba-1
 *   18:00 → WordPress-2
 *   18:15 → Calisthenics-3
 *   18:30 → Ameba-2         ← last batch
 */

import cron from 'node-cron';
import {
  runXBatch, runFbBatch, runLiBatch,
  runMediumBatch, runLinkmateBatch, runGoogleSiteBatch,
  runDevtoBatch, runLinkedinPulseBatch, runCalisthenicsNBatch,
  runBloggerBatch, runWordpressBatch, runHackmdBatch,
  runNotionBatch, runParagraphBatch, runAmebaBatch,
  runWeeklySerpRecheck, runSundayExamination, resetBatchCounters,
} from './coordinator/masterCoordinator.js';
import { runMonitorCycle } from './monitor.js';

function nowIst(): string {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' IST';
}

function wrap(label: string, fn: () => Promise<void>) {
  return async () => {
    console.log(`\n[${nowIst()}] ▶ ${label}`);
    try {
      await fn();
    } catch (err: any) {
      console.error(`[${label}] Error: ${err.message}`);
    }
  };
}

export async function startCoordinatorDaemon(): Promise<void> {
  const tz = 'Asia/Kolkata';

  // ── 10:30 — FB-1 ─────────────────────────────────────────────────────────
  cron.schedule('30 10 * * *', wrap('FB Batch 1',           () => runFbBatch(1)),              { timezone: tz });

  // ── 10:45 — Notion-1 ─────────────────────────────────────────────────────
  cron.schedule('45 10 * * *', wrap('Notion Batch 1',       () => runNotionBatch(1)),          { timezone: tz });

  // ── 11:00 — Google Sites-1 ───────────────────────────────────────────────
  cron.schedule('0 11 * * *',  wrap('Google Sites Batch 1', () => runGoogleSiteBatch(1)),      { timezone: tz });

  // ── 11:15 — Linkmate-1 ───────────────────────────────────────────────────
  cron.schedule('15 11 * * *', wrap('Linkmate Batch 1',     () => runLinkmateBatch(1)),        { timezone: tz });

  // ── 11:30 — LI-1  [PROTECTED 11:30–11:45] ────────────────────────────────
  cron.schedule('30 11 * * *', wrap('LI Batch 1',           () => runLiBatch(undefined, 1)),   { timezone: tz });

  // ── 11:45 — HackMD-1 ─────────────────────────────────────────────────────
  cron.schedule('45 11 * * *', wrap('HackMD Batch 1',       () => runHackmdBatch(1)),          { timezone: tz });

  // ── 12:00 — Blogger-1 ────────────────────────────────────────────────────
  cron.schedule('0 12 * * *',  wrap('Blogger Batch 1',      () => runBloggerBatch(1)),         { timezone: tz });

  // ── 12:15 — FB-2 ─────────────────────────────────────────────────────────
  cron.schedule('15 12 * * *', wrap('FB Batch 2',           () => runFbBatch(2)),              { timezone: tz });

  // ── 12:30 — Calisthenics-1 ───────────────────────────────────────────────
  cron.schedule('30 12 * * *', wrap('Calisthenics Batch 1', () => runCalisthenicsNBatch(1)),   { timezone: tz });

  // ── 12:45 — Paragraph-1 ──────────────────────────────────────────────────
  cron.schedule('45 12 * * *', wrap('Paragraph Batch 1',    () => runParagraphBatch(1)),       { timezone: tz });

  // ── 13:00 — Dev.to-1 ─────────────────────────────────────────────────────
  cron.schedule('0 13 * * *',  wrap('Dev.to Batch 1',       () => runDevtoBatch(1)),           { timezone: tz });

  // ── 13:15 — WordPress-1 ──────────────────────────────────────────────────
  cron.schedule('15 13 * * *', wrap('WordPress Batch 1',    () => runWordpressBatch(1)),       { timezone: tz });

  // ── 13:30 — Google Sites-2 ───────────────────────────────────────────────
  cron.schedule('30 13 * * *', wrap('Google Sites Batch 2', () => runGoogleSiteBatch(2)),      { timezone: tz });

  // ── 13:45 — Linkmate-2 ───────────────────────────────────────────────────
  cron.schedule('45 13 * * *', wrap('Linkmate Batch 2',     () => runLinkmateBatch(2)),        { timezone: tz });

  // ── 14:00 — FB-3 ─────────────────────────────────────────────────────────
  cron.schedule('0 14 * * *',  wrap('FB Batch 3',           () => runFbBatch(3)),              { timezone: tz });

  // ── 14:15 — LI-2  [PROTECTED 14:15–14:30] ────────────────────────────────
  cron.schedule('15 14 * * *', wrap('LI Batch 2',           () => runLiBatch(undefined, 2)),   { timezone: tz });

  // ── 14:30 — Notion-2 ─────────────────────────────────────────────────────
  cron.schedule('30 14 * * *', wrap('Notion Batch 2',       () => runNotionBatch(2)),          { timezone: tz });

  // ── 14:45 — Blogger-2 ────────────────────────────────────────────────────
  cron.schedule('45 14 * * *', wrap('Blogger Batch 2',      () => runBloggerBatch(2)),         { timezone: tz });

  // ── 15:00 — Calisthenics-2 ───────────────────────────────────────────────
  cron.schedule('0 15 * * *',  wrap('Calisthenics Batch 2', () => runCalisthenicsNBatch(2)),   { timezone: tz });

  // ── 15:15 — HackMD-2 ─────────────────────────────────────────────────────
  cron.schedule('15 15 * * *', wrap('HackMD Batch 2',       () => runHackmdBatch(2)),          { timezone: tz });

  // ── 15:30 — Medium-1  [PROTECTED 15:30–15:45] ────────────────────────────
  cron.schedule('30 15 * * *', wrap('Medium Batch 1',       () => runMediumBatch(1)),          { timezone: tz });

  // ── 15:45 — FB-4 ─────────────────────────────────────────────────────────
  cron.schedule('45 15 * * *', wrap('FB Batch 4',           () => runFbBatch(4)),              { timezone: tz });

  // ── 16:00 — Google Sites-3 ───────────────────────────────────────────────
  cron.schedule('0 16 * * *',  wrap('Google Sites Batch 3', () => runGoogleSiteBatch(3)),      { timezone: tz });

  // ── 16:15 — Linkmate-3 ───────────────────────────────────────────────────
  cron.schedule('15 16 * * *', wrap('Linkmate Batch 3',     () => runLinkmateBatch(3)),        { timezone: tz });

  // ── 16:30 — Paragraph-2 ──────────────────────────────────────────────────
  cron.schedule('30 16 * * *', wrap('Paragraph Batch 2',    () => runParagraphBatch(2)),       { timezone: tz });

  // ── 16:45 — Dev.to-2 ─────────────────────────────────────────────────────
  cron.schedule('45 16 * * *', wrap('Dev.to Batch 2',       () => runDevtoBatch(2)),           { timezone: tz });

  // ── 17:00 — LI-3  [PROTECTED 17:00–17:15] ────────────────────────────────
  cron.schedule('0 17 * * *',  wrap('LI Batch 3',           () => runLiBatch(undefined, 3)),   { timezone: tz });

  // ── 17:15 — FB-5  (breaks LI ↔ LI Pulse sequence) ────────────────────────
  cron.schedule('15 17 * * *', wrap('FB Batch 5',           () => runFbBatch(5)),              { timezone: tz });

  // ── 17:30 — LinkedIn Pulse-1  [PROTECTED 17:30–17:45] ────────────────────
  cron.schedule('30 17 * * *', wrap('LinkedIn Pulse Batch', () => runLinkedinPulseBatch(1)),   { timezone: tz });

  // ── 17:45 — Ameba-1 ──────────────────────────────────────────────────────
  cron.schedule('45 17 * * *', wrap('Ameba Batch 1',        () => runAmebaBatch(1)),           { timezone: tz });

  // ── 18:00 — WordPress-2 ──────────────────────────────────────────────────
  cron.schedule('0 18 * * *',  wrap('WordPress Batch 2',    () => runWordpressBatch(2)),       { timezone: tz });

  // ── 18:15 — Calisthenics-3 ───────────────────────────────────────────────
  cron.schedule('15 18 * * *', wrap('Calisthenics Batch 3', () => runCalisthenicsNBatch(3)),   { timezone: tz });

  // ── 18:30 — Ameba-2  (last batch) ────────────────────────────────────────
  cron.schedule('30 18 * * *', wrap('Ameba Batch 2',        () => runAmebaBatch(2)),           { timezone: tz });

  // ── Error monitor: every 3 minutes ───────────────────────────────────────
  cron.schedule('*/3 * * * *', async () => {
    try {
      const result = await runMonitorCycle();
      if (result.newErrors > 0) {
        console.log(`\n[${nowIst()}] Monitor: ${result.newErrors} error(s) — fixed: ${result.autoFixed}, human alerts: ${result.humanAlerts}, unknown: ${result.unknownErrors}`);
        for (const line of result.summary) console.log(`   ${line}`);
      }
    } catch (err: any) {
      console.warn(`[Monitor] cycle failed: ${err.message}`);
    }
  });

  // ── Daily reset at midnight IST ───────────────────────────────────────────
  cron.schedule('0 0 * * *', () => {
    console.log(`\n[${nowIst()}] Midnight — resetting daily batch counters`);
    resetBatchCounters();
  }, { timezone: tz });

  // ── Weekly SERP recheck: Saturday 10 PM IST ───────────────────────────────
  cron.schedule('0 22 * * 6', wrap('Weekly SERP Recheck', runWeeklySerpRecheck), { timezone: tz });

  // ── Sunday Examination: Move failed posts to end of sheet ─────────────────
  cron.schedule('0 10 * * 0', wrap('Sunday Failed Posts Examination', runSundayExamination), { timezone: tz });

  // ── Print schedule ────────────────────────────────────────────────────────
  console.log('Coordinator Scheduler Started — 33 batches/day, 15-min spacing, 10:30–18:30 IST\n');
  console.log('  Time  │ Batch');
  console.log('  ──────┼─────────────────────────────────────────────────────');
  console.log('  10:30 │ FB-1');
  console.log('  10:45 │ Notion-1');
  console.log('  11:00 │ Google Sites-1');
  console.log('  11:15 │ Linkmate-1');
  console.log('  11:30 │ LI-1            [PROTECTED → next at 11:45]');
  console.log('  11:45 │ HackMD-1');
  console.log('  12:00 │ Blogger-1');
  console.log('  12:15 │ FB-2');
  console.log('  12:30 │ Calisthenics-1');
  console.log('  12:45 │ Paragraph-1');
  console.log('  13:00 │ Dev.to-1');
  console.log('  13:15 │ WordPress-1');
  console.log('  13:30 │ Google Sites-2');
  console.log('  13:45 │ Linkmate-2');
  console.log('  14:00 │ FB-3');
  console.log('  14:15 │ LI-2            [PROTECTED → next at 14:30]');
  console.log('  14:30 │ Notion-2');
  console.log('  14:45 │ Blogger-2');
  console.log('  15:00 │ Calisthenics-2');
  console.log('  15:15 │ HackMD-2');
  console.log('  15:30 │ Medium-1        [PROTECTED → next at 15:45]');
  console.log('  15:45 │ FB-4');
  console.log('  16:00 │ Google Sites-3');
  console.log('  16:15 │ Linkmate-3');
  console.log('  16:30 │ Paragraph-2');
  console.log('  16:45 │ Dev.to-2');
  console.log('  17:00 │ LI-3            [PROTECTED → next at 17:15]');
  console.log('  17:15 │ FB-5');
  console.log('  17:30 │ LinkedIn Pulse-1 [PROTECTED → next at 17:45]');
  console.log('  17:45 │ Ameba-1');
  console.log('  18:00 │ WordPress-2');
  console.log('  18:15 │ Calisthenics-3');
  console.log('  18:30 │ Ameba-2  ← last batch');
  console.log('  ──────┼─────────────────────────────────────────────────────');
  console.log('  Total: 33 batches/day. (X paused; Note/Patreon not in cron.)\n');

  const now = new Date();
  const istMin = parseInt(now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false }).replace(':', '')) || 0;
  // window: 10:30 (1030) → 18:30 (1830)
  if (istMin >= 1030 && istMin <= 1830) {
    console.log(`Now: ${nowIst()} — posting window OPEN`);
  } else {
    console.log(`Now: ${nowIst()} — posting window CLOSED (opens 10:30 IST)`);
  }
}

export async function runCoordinatorOnce(): Promise<void> {
  console.log('Running all batches once...\n');
  await runXBatch();
  await runFbBatch();
  await runLiBatch();
  console.log('\nDone.');
}
