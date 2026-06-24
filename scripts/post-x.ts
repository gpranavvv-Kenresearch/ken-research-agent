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

  // Persistent profile is primary. Falls back to JSON session, then credential login.
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const hasPersistentProfile = fs.readdirSync(SESSION_DIR).length > 0;
  const hasJsonSession = fs.existsSync(SESSION_JSON);

  let ctx: BrowserContext;
  let closeBrowser: () => Promise<void>;

  if (hasPersistentProfile) {
    console.log(`[post-x] Using persistent profile: ${SESSION_DIR}`);
    ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    closeBrowser = () => ctx.close();
  } else if (hasJsonSession) {
    console.log(`[post-x] Using JSON session: ${SESSION_JSON}`);
    const browserInst = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    ctx = await browserInst.newContext({ storageState: SESSION_JSON });
    closeBrowser = () => browserInst.close();
  } else {
    console.log(`[post-x] No session found — logging in with credentials to create profile`);
    ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    closeBrowser = () => ctx.close();
  }

  const page = ctx.pages()[0] ?? await ctx.newPage();

  try {
    // Check login state; do credential login if session is expired or missing
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const xUrl = page.url();
    const xLoggedIn = !xUrl.includes('/i/flow/login') && !xUrl.includes('/login');

    if (!xLoggedIn) {
      console.log('[post-x] Session invalid — logging in with credentials');
      await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const usernameField = page.locator('input[autocomplete="username"], input[name="text"]').first();
      await usernameField.waitFor({ timeout: 10000 });
      await usernameField.fill(username);
      await page.locator('button:has-text("Next"), [data-testid="LoginForm_Forward_Button"]').first().click();
      await page.waitForTimeout(2000);
      const passField = page.locator('input[type="password"], input[name="password"]').first();
      await passField.waitFor({ timeout: 10000 });
      await passField.fill(password);
      await page.locator('[data-testid="LoginForm_Login_Button"], button:has-text("Log in")').first().click();
      await page.waitForTimeout(4000);
      const afterUrl = page.url();
      if (afterUrl.includes('/i/flow/login')) {
        const err = 'X login failed — wrong credentials or verification required';
        writeSheet({ 'X Status': 'error', 'X Error': err });
        writeResumeFile('post-x.ts', 'login', err, { nickname, username, row });
        await closeBrowser();
        process.exit(1);
      }
      console.log('[post-x] Login successful — profile saved');
    } else {
      console.log('[post-x] Session valid');
    }

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
