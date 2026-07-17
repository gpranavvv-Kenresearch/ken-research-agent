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

  // Persistent profile is primary. Falls back to JSON session, then credential login.
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const hasPersistentProfile = fs.readdirSync(SESSION_DIR).length > 0;
  const hasJsonSession = fs.existsSync(SESSION_JSON);

  let ctx: BrowserContext;
  let closeBrowser: () => Promise<void>;

  if (hasPersistentProfile) {
    console.log(`[post-fb] Using persistent profile: ${SESSION_DIR}`);
    ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    closeBrowser = () => ctx.close();
  } else if (hasJsonSession) {
    console.log(`[post-fb] Using JSON session: ${SESSION_JSON}`);
    const browserInst = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    ctx = await browserInst.newContext({ storageState: SESSION_JSON });
    closeBrowser = () => browserInst.close();
  } else {
    console.log(`[post-fb] No session found — logging in with credentials to create profile`);
    ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    closeBrowser = () => ctx.close();
  }

  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = ctx.pages()[0] ?? await ctx.newPage();

  try {
    // Check login state; do credential login if session expired or missing
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const fbUrl = page.url();
    const fbLoggedIn = !fbUrl.includes('/login') && !fbUrl.includes('checkpoint');

    if (!fbLoggedIn) {
      console.log('[post-fb] Session invalid — logging in with credentials');
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.locator('#email, input[name="email"]').first().fill(email);
      await page.locator('#pass, input[name="pass"]').first().fill(password);
      await page.locator('button[name="login"], button[type="submit"]').first().click();
      await page.waitForTimeout(4000);
      const afterUrl = page.url();
      if (afterUrl.includes('/login') || afterUrl.includes('checkpoint')) {
        const err = 'Facebook login failed — wrong credentials or verification required';
        writeSheet({ 'FB Status': 'error', 'FB Error': err });
        writeResumeFile('post-facebook.ts', 'login', err, { nickname, email, row });
        await closeBrowser();
        process.exit(1);
      }
      console.log('[post-fb] Login successful — profile saved');
    } else {
      console.log('[post-fb] Session valid');
    }

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
