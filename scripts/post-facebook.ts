/**
 * post-facebook.ts — Post to Facebook using a saved Playwright session.
 *
 * Session lookup order:
 *   1. scripts/sessions/fb_{nickname}.json  (storageState cookie file)
 *   2. scripts/sessions/chrome-fb-{nickname}/  (persistent Chrome profile)
 *
 * Usage:
 *   npx tsx scripts/post-facebook.ts \
 *     --nickname pranav \
 *     --email Pranavgupta.ken@gmail.com \
 *     --password Pranav@6096 \
 *     --post-file /tmp/fb_post_row1.txt \
 *     --row 1 \
 *     --batch 2026-06-17-B1
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, BrowserContext } from 'playwright';
import { postToFacebook } from '../src/browser/facebook/poster.js';
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

const nickname = arg('--nickname') || arg('--name');
const email    = arg('--email');
const password = arg('--password');
const postFile = arg('--post-file');
const row      = parseInt(arg('--row') || '0', 10);
const batch    = arg('--batch') || '';

if (!nickname || !email || !password || !postFile) {
  console.error('Usage: post-facebook.ts --nickname <name> --email <e> --password <p> --post-file <path> --row <n> --batch <b>');
  process.exit(1);
}

if (!fs.existsSync(postFile)) {
  console.error(`Post file not found: ${postFile}`);
  process.exit(1);
}

const postText = fs.readFileSync(postFile, 'utf-8').trim();
if (!postText) { console.error('Post file is empty'); process.exit(1); }

const SESSION_JSON = path.join(REPO_ROOT, 'scripts', 'sessions', `fb_${nickname}.json`);
const SESSION_DIR  = path.join(REPO_ROOT, 'scripts', 'sessions', `chrome-fb-${nickname}`);

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
  console.log(`[post-fb] Posting as ${email} (${nickname}) — row ${row}`);

  const hasJson = fs.existsSync(SESSION_JSON);
  const hasDir  = fs.existsSync(SESSION_DIR);

  if (!hasJson && !hasDir) {
    const err = `No session found for ${nickname}. Expected ${SESSION_JSON} or ${SESSION_DIR}.`;
    console.error(err);
    writeSheet({ 'FB Status': 'error', 'FB Error': err });
    writeResumeFile('post-facebook.ts', 'open-browser', err, { nickname, email, row });
    process.exit(1);
  }

  let ctx: BrowserContext;
  let closeBrowser: () => Promise<void>;

  if (hasJson) {
    console.log(`[post-fb] Using cookie session: ${SESSION_JSON}`);
    const browserInst = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    ctx = await browserInst.newContext({ storageState: SESSION_JSON });
    closeBrowser = () => browserInst.close();
  } else {
    console.log(`[post-fb] Using persistent profile: ${SESSION_DIR}`);
    ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    closeBrowser = () => ctx.close();
  }

  const page = await ctx.newPage();

  try {
    const result = await postToFacebook(page, postText);
    const postedUrl = result.postUrl || '';
    console.log(`POSTED_URL=${postedUrl}`);

    writeSheet({
      'FB Status':    'posted',
      'FB Post URL':  postedUrl,
      'fbBatch':      batch,
      'lastPostedFb': new Date().toISOString(),
    });

    console.log('[post-fb] Done ✓');
    await closeBrowser();
    process.exit(0);

  } catch (err: any) {
    const msg = err.message || String(err);
    console.error(`[post-fb] FAILED: ${msg}`);
    await saveArtifacts(page, 'post-facebook', err).catch(() => {});
    writeResumeFile('post-facebook.ts', 'post-facebook', msg, { nickname, email, row, batch });
    writeSheet({ 'FB Status': 'error', 'FB Error': msg.slice(0, 200) });
    await closeBrowser().catch(() => {});
    process.exit(1);
  }
})();
