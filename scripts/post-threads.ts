/**
 * post-threads.ts — Post to Threads (threads.net) using a saved Playwright session.
 *
 * Session lookup order:
 *   1. scripts/sessions/threads_{nickname}.json  (storageState)
 *   2. scripts/sessions/chrome-threads-{nickname}/  (persistent Chrome profile)
 *
 * Login uses Instagram credentials (Threads is a Meta product, same login).
 *
 * Usage:
 *   npx tsx scripts/post-threads.ts \
 *     --nickname pranav \
 *     --email example@gmail.com \
 *     --password MyPass@123 \
 *     --post-file /tmp/threads_post_row1.txt \
 *     --row 1 \
 *     --batch 2026-06-23-B1
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, BrowserContext, Page } from 'playwright';
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
  console.error('Usage: post-threads.ts --nickname <n> --email <e> --password <p> --post-file <path> --row <n> --batch <b>');
  process.exit(1);
}

if (!fs.existsSync(postFile)) {
  console.error(`Post file not found: ${postFile}`);
  process.exit(1);
}

const postText = fs.readFileSync(postFile, 'utf-8').trim();
if (!postText) { console.error('Post file is empty'); process.exit(1); }

const SESSION_JSON = path.join(REPO_ROOT, 'scripts', 'sessions', `threads_${nickname}.json`);
const SESSION_DIR  = path.join(REPO_ROOT, 'scripts', 'sessions', `chrome-threads-${nickname}`);

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

async function doLogin(page: Page): Promise<void> {
  console.log('[post-threads] Logging in via Instagram credentials...');
  await page.goto('https://www.threads.net/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Threads login page either shows its own form or redirects to instagram.com
  const currentUrl = page.url();

  if (currentUrl.includes('instagram.com')) {
    // Redirected to IG login
    await page.locator('input[name="username"], input[autocomplete="username"]').first().fill(email);
    await page.locator('input[name="password"], input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/threads\.net/, { timeout: 30000 });
  } else {
    // Threads native login form
    const usernameField = page.locator('input[name="username"], input[autocomplete="username"], input[placeholder*="username"], input[placeholder*="Username"]').first();
    await usernameField.waitFor({ timeout: 10000 });
    await usernameField.fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"], button:has-text("Log in"), div[role="button"]:has-text("Log in")').first().click();
    await page.waitForURL(/threads\.net(?!\/login)/, { timeout: 30000 });
  }

  // Handle "Save login info" or "Turn on notifications" popups
  await page.waitForTimeout(2000);
  for (const dismissText of ['Not now', 'Skip', 'Cancel', 'Not Now']) {
    const btn = page.locator(`button:has-text("${dismissText}"), div[role="button"]:has-text("${dismissText}")`).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1000);
    }
  }
  console.log('[post-threads] Login complete');
}

async function composeAndPost(page: Page, text: string): Promise<string> {
  await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Find compose button — Threads has several UI patterns
  const composeSelectors = [
    '[aria-label="New thread"]',
    '[aria-label="Create"]',
    'a[href*="/new"]',
    'svg[aria-label*="thread" i]',
    'div[role="button"]:has-text("Start a thread")',
  ];

  let clicked = false;
  for (const sel of composeSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.click();
      clicked = true;
      await page.waitForTimeout(1500);
      break;
    }
  }

  // Fallback: click directly on the "Start a thread..." placeholder if visible
  if (!clicked) {
    const placeholder = page.locator('[placeholder*="thread" i], [placeholder*="Start" i]').first();
    if (await placeholder.isVisible({ timeout: 3000 }).catch(() => false)) {
      await placeholder.click();
      clicked = true;
    }
  }

  if (!clicked) {
    throw new Error('Could not find Threads compose button. Screenshot saved for debugging.');
  }

  await page.waitForTimeout(1500);

  // Type post text into the compose area
  const textArea = page.locator(
    '[contenteditable="true"], textarea[placeholder*="thread" i], textarea[aria-label*="thread" i]'
  ).first();
  await textArea.waitFor({ timeout: 10000 });
  await textArea.click();
  await textArea.fill(text);
  await page.waitForTimeout(1000);

  // Click Post button
  const postBtn = page.locator(
    'button:has-text("Post"), div[role="button"]:has-text("Post")'
  ).last();
  await postBtn.waitFor({ timeout: 10000 });
  await postBtn.click();

  // Wait for post confirmation and capture URL
  await page.waitForTimeout(4000);

  // Look for the posted thread URL in page or via navigation
  const postUrl = page.url().includes('/post/') ? page.url() : '';
  if (!postUrl) {
    // Try to find the most recent post link on profile
    const profileLink = await page.locator(`a[href*="/${nickname}/post/"]`).first().getAttribute('href').catch(() => '');
    if (profileLink) return `https://www.threads.net${profileLink}`;
  }

  return postUrl || 'https://www.threads.net';
}

(async () => {
  console.log(`[post-threads] Posting as ${email} (${nickname}) — row ${row}`);
  console.log(`[post-threads] Text: ${postText.slice(0, 80)}...`);

  const hasJson = fs.existsSync(SESSION_JSON);
  const hasDir  = fs.existsSync(SESSION_DIR);

  if (!hasJson && !hasDir) {
    const err = `No session found for ${nickname}. Run login first: save a session to ${SESSION_JSON} or ${SESSION_DIR}.`;
    console.error(err);
    writeSheet({ 'Thread status': 'error', 'Thread Error': err });
    writeResumeFile('post-threads.ts', 'open-browser', err, { nickname, email, row });
    process.exit(1);
  }

  let ctx: BrowserContext;
  let closeBrowser: () => Promise<void>;

  if (hasJson) {
    console.log(`[post-threads] Using cookie session: ${SESSION_JSON}`);
    const browserInst = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    ctx = await browserInst.newContext({ storageState: SESSION_JSON });
    closeBrowser = () => browserInst.close();
  } else {
    console.log(`[post-threads] Using persistent profile: ${SESSION_DIR}`);
    ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    closeBrowser = () => ctx.close();
  }

  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();

  try {
    // Check if already logged in
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const loggedIn = await page.locator('[aria-label="New thread"], [aria-label="Create"], a[href*="/new"]').count() > 0
      || await page.locator('[placeholder*="thread" i]').count() > 0;

    if (!loggedIn) {
      await doLogin(page);
    }

    const postedUrl = await composeAndPost(page, postText);
    console.log(`POSTED_URL=${postedUrl}`);

    writeSheet({
      'Thread status':    'posted',
      'Thread Post URl':  postedUrl,
      'Thread Batch':     batch,
      'lastPostedThread': new Date().toISOString(),
    });

    console.log('[post-threads] Done ✓');
    await closeBrowser();
    process.exit(0);

  } catch (err: any) {
    const msg = err.message || String(err);
    console.error(`[post-threads] FAILED: ${msg}`);
    await saveArtifacts(page, 'post-threads', err).catch(() => {});
    writeResumeFile('post-threads.ts', 'compose', msg, { nickname, email, row, batch });
    writeSheet({ 'Thread status': 'error', 'Thread Error': msg.slice(0, 200) });
    await closeBrowser().catch(() => {});
    process.exit(1);
  }
})();
