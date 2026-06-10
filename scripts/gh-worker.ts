/**
 * gh-worker.ts — GitHub Actions per-worker posting script
 *
 * Called by .github/workflows/post.yml for each matrix worker.
 * Reads WORKER_NAME from env, filters sheet rows to that person only,
 * determines active platforms from current IST batch time, posts, exits.
 *
 * Usage:
 *   WORKER_NAME=vansh node --import=tsx scripts/gh-worker.ts
 */

import 'dotenv/config';
import {
  getRowsForContinuousXPosting,
  getRowsForContinuousFbPosting,
  getRowsForContinuousLiPosting,
  savePostingResult,
  SheetRow,
} from '../src/sheets/sheets.js';
import { runXAgent } from '../src/agents/xAgentNew.js';
import { generateTweet, generateFbPost, generateLiPost } from '../src/agents/contentAgentNew.js';
import { executeBrowserTool } from '../src/tools/browserTools.js';
import { saveUnifiedFbResult, saveUnifiedLinkedInResult } from '../src/sheets/sheets.js';

// ── Batch schedule ─────────────────────────────────────────────────────────────

interface BatchSlot {
  hour: number;   // IST hour
  minute: number; // IST minute
  x: boolean;
  fb: boolean;
  li: boolean;
}

const BATCH_SCHEDULE: BatchSlot[] = [
  { hour: 10, minute: 30, x: true,  fb: true,  li: true  }, // B1
  { hour: 11, minute: 15, x: true,  fb: false, li: false }, // B2
  { hour: 12, minute:  0, x: true,  fb: true,  li: false }, // B3
  { hour: 13, minute:  0, x: true,  fb: false, li: true  }, // B4
  { hour: 14, minute:  0, x: true,  fb: true,  li: false }, // B5
  { hour: 15, minute:  0, x: true,  fb: false, li: false }, // B6
  { hour: 16, minute:  0, x: true,  fb: true,  li: true  }, // B7
  { hour: 17, minute: 15, x: true,  fb: true,  li: false }, // B8
];

function getISTMinutes(): number {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + 5.5 * 3600000;
  const ist = new Date(istMs);
  return ist.getHours() * 60 + ist.getMinutes();
}

function getActivePlatforms(): { x: boolean; fb: boolean; li: boolean } {
  const nowMin = getISTMinutes();

  for (const slot of BATCH_SCHEDULE) {
    const slotMin = slot.hour * 60 + slot.minute;
    // Active if we're 0–14 minutes past the slot
    if (nowMin >= slotMin && nowMin < slotMin + 15) {
      return { x: slot.x, fb: slot.fb, li: slot.li };
    }
  }

  // Fallback: if triggered manually or outside windows, run all platforms
  console.log('[WORKER] Outside scheduled windows — running all platforms (manual trigger assumed)');
  return { x: true, fb: true, li: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function filterByWorker(rows: SheetRow[], workerName: string): SheetRow[] {
  return rows.filter(r => r.name?.toLowerCase() === workerName.toLowerCase());
}

/**
 * Returns true if this row's "platforms" cell allows the given platform.
 * Empty/missing platforms cell = post everywhere (no restriction).
 * Cell value examples: "x,fb,li" | "li" | "x" | "x,li"
 * Platform keys: 'x' | 'fb' | 'li'
 */
function rowAllowsPlatform(row: SheetRow, platform: 'x' | 'fb' | 'li'): boolean {
  const p = (row.platforms ?? '').toLowerCase().replace(/\s/g, '');
  if (!p) return true; // no restriction
  const parts = p.split(',');
  if (platform === 'x')  return parts.includes('x');
  if (platform === 'fb') return parts.includes('fb') || parts.includes('facebook');
  if (platform === 'li') return parts.includes('li') || parts.includes('linkedin');
  return true;
}

async function postToFb(accountName: string, postText: string) {
  try {
    const login = await executeBrowserTool('login_facebook', { nickname: accountName });
    if (!login.success) return { success: false, error: login.error || 'FB login failed' };
    const post = await executeBrowserTool('post_facebook', { postText });
    return { success: post.success ?? false, postUrl: post.postUrl, postText: post.postText, error: post.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function postToLi(accountName: string, postText: string) {
  try {
    const login = await executeBrowserTool('login_linkedin', { nickname: accountName });
    if (!login.success) return { success: false, error: login.error || 'LI login failed' };
    const post = await executeBrowserTool('post_linkedin', { postText });
    return { success: post.success ?? false, postUrl: post.postUrl, postText: post.postText, error: post.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Platform runners ──────────────────────────────────────────────────────────

async function runXForWorker(workerName: string, batchLabel: string): Promise<void> {
  const allRows = await getRowsForContinuousXPosting(50);
  const rows = filterByWorker(allRows, workerName);

  if (rows.length === 0) {
    console.log(`[X] No pending rows for ${workerName}`);
    return;
  }

  console.log(`[X] ${rows.length} rows for ${workerName}`);

  for (const row of rows) {
    if (!rowAllowsPlatform(row, 'x')) {
      console.log(`  ⏭ Row ${row.rowIndex} — platforms="${row.platforms}" skips X`);
      continue;
    }
    try {
      let tweet = row.xPost?.trim() || '';
      if (!tweet) {
        tweet = await generateTweet({ url: row.targetUrl, title: row.title, seoRanking: 999, priority: row.priority ?? 'P3', marketValue: row.marketValue });
        if (!tweet?.trim()) { console.log(`  ⏭ Skipping ${row.rowIndex} — empty tweet`); continue; }
      }

      const result = await runXAgent({ tweetText: tweet, accountHandle: row.name });

      await savePostingResult(row, {
        xPost: tweet,
        xPostUrl: result.success ? (result.tweetUrl || '') : '',
        xStatus: result.success ? 'Posted' : 'Failed',
        xError: result.success ? '' : (result.error || 'Unknown error'),
        xBatch: batchLabel,
      });

      console.log(result.success ? `  ✅ X posted → ${result.tweetUrl}` : `  ❌ X failed: ${result.error}`);
    } catch (err: any) {
      console.error(`  ❌ X row ${row.rowIndex} error: ${err.message}`);
      try {
        await savePostingResult(row, { xPost: '', xPostUrl: '', xStatus: 'Error', xError: err.message, xBatch: batchLabel });
      } catch {}
    }
  }
}

async function runFbForWorker(workerName: string, batchLabel: string): Promise<void> {
  const allRows = await getRowsForContinuousFbPosting(50);
  const rows = filterByWorker(allRows, workerName);

  if (rows.length === 0) {
    console.log(`[FB] No pending rows for ${workerName}`);
    return;
  }

  console.log(`[FB] ${rows.length} rows for ${workerName}`);

  for (const row of rows) {
    if (!rowAllowsPlatform(row, 'fb')) {
      console.log(`  ⏭ Row ${row.rowIndex} — platforms="${row.platforms}" skips FB`);
      continue;
    }
    try {
      let fbPost = row.fbPost?.trim() || '';
      if (!fbPost) {
        fbPost = await generateFbPost({ url: row.targetUrl, title: row.title, seoRanking: 999, priority: row.priority ?? 'P3' });
        if (!fbPost?.trim()) { console.log(`  ⏭ Skipping ${row.rowIndex} — empty FB post`); continue; }
      }

      const result = await postToFb(row.name, fbPost);
      const finalText = result.postText || fbPost;

      await saveUnifiedFbResult(row, {
        post: finalText,
        postUrl: result.success ? (result.postUrl || '') : '',
        status: result.success ? 'Posted' : 'Failed',
        batch: batchLabel,
        error: result.success ? '' : (result.error || 'Unknown error'),
      });

      console.log(result.success ? `  ✅ FB posted → ${result.postUrl}` : `  ❌ FB failed: ${result.error}`);
    } catch (err: any) {
      console.error(`  ❌ FB row ${row.rowIndex} error: ${err.message}`);
      try {
        await saveUnifiedFbResult(row, { post: '', postUrl: '', status: 'Error', batch: batchLabel, error: err.message });
      } catch {}
    }
  }
}

async function runLiForWorker(workerName: string, batchLabel: string): Promise<void> {
  const allRows = await getRowsForContinuousLiPosting(50);
  const rows = filterByWorker(allRows, workerName);

  if (rows.length === 0) {
    console.log(`[LI] No pending rows for ${workerName}`);
    return;
  }

  console.log(`[LI] ${rows.length} rows for ${workerName}`);

  for (const row of rows) {
    if (!rowAllowsPlatform(row, 'li')) {
      console.log(`  ⏭ Row ${row.rowIndex} — platforms="${row.platforms}" skips LI`);
      continue;
    }
    try {
      let liPost = row.linkedinPost?.trim() || '';
      if (!liPost) {
        liPost = await generateLiPost({ url: row.targetUrl, title: row.title, seoRanking: 999, priority: row.priority ?? 'P3' });
        if (!liPost?.trim()) { console.log(`  ⏭ Skipping ${row.rowIndex} — empty LI post`); continue; }
      }

      const result = await postToLi(row.name, liPost);
      const finalText = result.postText || liPost;

      await saveUnifiedLinkedInResult(row, {
        post: finalText,
        postUrl: result.success ? (result.postUrl || '') : '',
        status: result.success ? 'Posted' : 'Failed',
        batch: batchLabel,
        error: result.success ? '' : (result.error || 'Unknown error'),
      });

      console.log(result.success ? `  ✅ LI posted → ${result.postUrl}` : `  ❌ LI failed: ${result.error}`);
    } catch (err: any) {
      console.error(`  ❌ LI row ${row.rowIndex} error: ${err.message}`);
      try {
        await saveUnifiedLinkedInResult(row, { post: '', postUrl: '', status: 'Error', batch: batchLabel, error: err.message });
      } catch {}
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const workerName = process.env.WORKER_NAME?.trim();

  if (!workerName) {
    console.error('❌ WORKER_NAME env var is required');
    process.exit(1);
  }

  const platforms = getActivePlatforms();
  const nowMin = getISTMinutes();
  const istHour = Math.floor(nowMin / 60);
  const istMinute = nowMin % 60;
  const batchLabel = `GH-${workerName}-${istHour}:${String(istMinute).padStart(2, '0')}`;

  console.log(`\n[WORKER] ${workerName.toUpperCase()} starting at IST ${istHour}:${String(istMinute).padStart(2, '0')}`);
  console.log(`[WORKER] Active platforms: X=${platforms.x} FB=${platforms.fb} LI=${platforms.li}`);
  console.log(`[WORKER] Batch label: ${batchLabel}\n`);

  if (platforms.x) await runXForWorker(workerName, batchLabel);
  if (platforms.fb) await runFbForWorker(workerName, batchLabel);
  if (platforms.li) await runLiForWorker(workerName, batchLabel);

  console.log(`\n[WORKER] ${workerName.toUpperCase()} done.`);
  process.exit(0);
}

main().catch(err => {
  console.error(`[WORKER] Fatal error: ${err.message}`);
  process.exit(1);
});
