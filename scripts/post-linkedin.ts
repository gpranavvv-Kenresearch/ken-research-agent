/**
 * post-linkedin.ts — Post to LinkedIn using a saved Playwright session.
 *
 * Session lookup order:
 *   1. scripts/sessions/li_{nickname}.json  (storageState cookie file)
 *   2. scripts/sessions/chrome-li-{nickname}/  (persistent Chrome profile)
 *
 * Usage:
 *   npx tsx scripts/post-linkedin.ts \
 *     --nickname pranav \
 *     --email tanishakp3210@gmail.com \
 *     --password Tanishasharma@123456789 \
 *     --post-file /tmp/li_post_row1.txt \
 *     --row 1 \
 *     --batch 2026-06-17-B1
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, BrowserContext } from 'playwright';
import { postToLinkedIn } from '../src/browser/linkedin/poster.js';
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
  console.error('Usage: post-linkedin.ts --nickname <name> --email <e> --password <p> --post-file <path> --row <n> --batch <b>');
  process.exit(1);
}

if (!fs.existsSync(postFile)) {
  console.error(`Post file not found: ${postFile}`);
  process.exit(1);
}

const postText = fs.readFileSync(postFile, 'utf-8').trim();
if (!postText) { console.error('Post file is empty'); process.exit(1); }

const SESSION_JSON = path.join(REPO_ROOT, 'scripts', 'sessions', `li_${nickname}.json`);
const SESSION_DIR  = path.join(REPO_ROOT, 'scripts', 'sessions', `chrome-li-${nickname}`);

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
  console.log(`[post-li] Posting as ${email} (${nickname}) — row ${row}`);

  // Persistent profile is primary. Falls back to JSON session, then credential login.
  // NOTE: chrome-li-{nickname}/ is shared with post-linkedin-pulse.ts
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const hasPersistentProfile = fs.readdirSync(SESSION_DIR).length > 0;
  const hasJsonSession = fs.existsSync(SESSION_JSON);

  let ctx: BrowserContext;
  let closeBrowser: () => Promise<void>;

  if (hasPersistentProfile) {
    console.log(`[post-li] Using persistent profile: ${SESSION_DIR}`);
    ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    closeBrowser = () => ctx.close();
  } else if (hasJsonSession) {
    console.log(`[post-li] Using JSON session: ${SESSION_JSON}`);
    const browserInst = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    ctx = await browserInst.newContext({ storageState: SESSION_JSON });
    closeBrowser = () => browserInst.close();
  } else {
    console.log(`[post-li] No session found — logging in with credentials to create profile`);
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
    // Check login state; do credential login if session expired or missing
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const liUrl = page.url();
    const liLoggedIn = !liUrl.includes('/login') && !liUrl.includes('/checkpoint') && !liUrl.includes('/authwall');

    if (!liLoggedIn) {
      console.log('[post-li] Session invalid — logging in with credentials');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const emailField = page.locator('#username, input[name="session_key"]').first();
      await emailField.waitFor({ timeout: 10000 });
      await emailField.fill(email);
      await page.locator('#password, input[name="session_password"]').first().fill(password);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);
      const afterUrl = page.url();
      if (afterUrl.includes('/login') || afterUrl.includes('/checkpoint')) {
        const err = 'LinkedIn login failed — wrong credentials or verification required';
        writeSheet({ 'LinkedIn Status': 'error', 'LinkedIn Error': err });
        writeResumeFile('post-linkedin.ts', 'login', err, { nickname, email, row });
        await closeBrowser();
        process.exit(1);
      }
      console.log('[post-li] Login successful — profile saved');
    } else {
      console.log('[post-li] Session valid');
    }

    const result = await postToLinkedIn(page, postText);
    const postedUrl = result.postUrl || '';
    console.log(`POSTED_URL=${postedUrl}`);

    writeSheet({
      'LinkedIn Status':   'posted',
      'LinkedIn Post URL': postedUrl,
      'liBatch':           batch,
      'lastPostedLi':      new Date().toISOString(),
    });

    console.log('[post-li] Done ✓');
    await closeBrowser();
    process.exit(0);

  } catch (err: any) {
    const msg = err.message || String(err);
    console.error(`[post-li] FAILED: ${msg}`);
    await saveArtifacts(page, 'post-linkedin', err).catch(() => {});
    writeResumeFile('post-linkedin.ts', 'post-linkedin', msg, { nickname, email, row, batch });
    writeSheet({ 'LinkedIn Status': 'error', 'LinkedIn Error': msg.slice(0, 200) });
    await closeBrowser().catch(() => {});
    process.exit(1);
  }
})();
