/**
 * post-x.ts — Post a tweet using a saved Playwright session.
 *
 * Session lookup order:
 *   1. scripts/sessions/x_{nickname}.json  (storageState cookie file)
 *   2. scripts/sessions/chrome-x-{nickname}/  (persistent Chrome profile)
 *
 * Usage:
 *   npx tsx scripts/post-x.ts \
 *     --nickname pranav \
 *     --username Kenresearchh \
 *     --password Pranav@6096 \
 *     --handle kenresearchh \
 *     --tweet-file /tmp/x_post_row1.txt \
 *     --row 1 \
 *     --batch 2026-06-17-B1
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, BrowserContext } from 'playwright';
import { postTweet } from '../src/browser/twitter/poster.js';
import { writeResumeFile, saveArtifacts } from './base.js';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, '..');

function arg(flag: string): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? (process.argv[i + 1] ?? '') : '';
}

const nickname   = arg('--nickname')  || arg('--name');
const username   = arg('--username');
const password   = arg('--password');
const handle     = arg('--handle')   || username;
const tweetFile  = arg('--tweet-file');
const row        = parseInt(arg('--row') || '0', 10);
const batch      = arg('--batch')    || '';

if (!nickname || !username || !password || !tweetFile) {
  console.error('Usage: post-x.ts --nickname <name> --username <u> --password <p> --handle <h> --tweet-file <path> --row <n> --batch <b>');
  process.exit(1);
}

if (!fs.existsSync(tweetFile)) {
  console.error(`Tweet file not found: ${tweetFile}`);
  process.exit(1);
}

const tweetText = fs.readFileSync(tweetFile, 'utf-8').trim();
if (!tweetText) { console.error('Tweet file is empty'); process.exit(1); }

const SESSION_JSON = path.join(REPO_ROOT, 'scripts', 'sessions', `x_${nickname}.json`);
const SESSION_DIR  = path.join(REPO_ROOT, 'scripts', 'sessions', `chrome-x-${nickname}`);

function writeSheet(updates: Record<string, string>) {
  if (!row) return;
  try {
    const updatesJson = JSON.stringify(updates);
    execSync(
      `python "${path.join(REPO_ROOT, 'scripts', 'sheet_write.py')}" --sheet social --name ${nickname} --row ${row} --updates ${JSON.stringify(updatesJson)}`,
      { cwd: REPO_ROOT }
    );
  } catch (e: any) { console.error('[sheet_write] failed:', e.message); }
}

(async () => {
  console.log(`[post-x] Posting as @${handle} (${nickname}) — row ${row}`);
  console.log(`[post-x] Tweet: ${tweetText.slice(0, 80)}...`);

  const hasJson = fs.existsSync(SESSION_JSON);
  const hasDir  = fs.existsSync(SESSION_DIR);

  if (!hasJson && !hasDir) {
    const err = `No session found for ${nickname}. Expected ${SESSION_JSON} or ${SESSION_DIR}.`;
    console.error(err);
    writeSheet({ 'X Status': 'error', 'X Error': err });
    writeResumeFile('post-x.ts', 'open-browser', err, { nickname, username, row });
    process.exit(1);
  }

  let ctx: BrowserContext;
  let closeBrowser: () => Promise<void>;

  if (hasJson) {
    console.log(`[post-x] Using cookie session: ${SESSION_JSON}`);
    const browserInst = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    ctx = await browserInst.newContext({ storageState: SESSION_JSON });
    closeBrowser = () => browserInst.close();
  } else {
    console.log(`[post-x] Using persistent profile: ${SESSION_DIR}`);
    ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    closeBrowser = () => ctx.close();
  }

  const page = await ctx.newPage();

  try {
    const result = await postTweet(page, tweetText, handle);
    const postedUrl = result.tweetUrl || '';
    console.log(`POSTED_URL=${postedUrl}`);

    writeSheet({
      'X Status':    'posted',
      'X Post URL':  postedUrl,
      'xBatch':      batch,
      'lastPostedX': new Date().toISOString(),
    });

    console.log('[post-x] Done ✓');
    await closeBrowser();
    process.exit(0);

  } catch (err: any) {
    const msg = err.message || String(err);
    console.error(`[post-x] FAILED: ${msg}`);
    await saveArtifacts(page, 'post-tweet', err).catch(() => {});
    writeResumeFile('post-x.ts', 'post-tweet', msg, { nickname, username, handle, row, batch });
    writeSheet({ 'X Status': 'error', 'X Error': msg.slice(0, 200) });
    await closeBrowser().catch(() => {});
    process.exit(1);
  }
})();
