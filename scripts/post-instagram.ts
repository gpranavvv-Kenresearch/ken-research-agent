/**
 * post-instagram.ts — Post to Instagram (instagram.com) via Playwright.
 *
 * Posts an image + caption. The image is downloaded from a URL to a temp file
 * before upload. If no image URL is given, falls back to a plain-text "story"
 * upload using the first cover image found in the temp dir.
 *
 * Session lookup order:
 *   1. scripts/sessions/instagram_{nickname}.json  (storageState)
 *   2. scripts/sessions/chrome-instagram-{nickname}/  (persistent Chrome profile)
 *
 * Usage:
 *   npx tsx scripts/post-instagram.ts \
 *     --nickname pranav \
 *     --email example@gmail.com \
 *     --password MyPass@123 \
 *     --post-file /tmp/ig_post_row1.txt \
 *     --image-url https://res.cloudinary.com/.../cover.jpg \
 *     --row 1 \
 *     --batch 2026-06-23-B1
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { chromium, BrowserContext, Page } from 'playwright';
import { writeResumeFile, saveArtifacts } from './base.js';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import * as https from 'https';
import * as http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, '..');

function arg(flag: string): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? (process.argv[i + 1] ?? '') : '';
}

const nickname  = arg('--nickname') || arg('--name');
const email     = arg('--email');
const password  = arg('--password');
const postFile  = arg('--post-file');
const imageUrl  = arg('--image-url');
const row       = parseInt(arg('--row') || '0', 10);
const batch     = arg('--batch') || '';

if (!nickname || !email || !password || !postFile) {
  console.error('Usage: post-instagram.ts --nickname <n> --email <e> --password <p> --post-file <path> [--image-url <url>] --row <n> --batch <b>');
  process.exit(1);
}

if (!fs.existsSync(postFile)) {
  console.error(`Post file not found: ${postFile}`);
  process.exit(1);
}

const postText = fs.readFileSync(postFile, 'utf-8').trim();
if (!postText) { console.error('Post file is empty'); process.exit(1); }

const SESSION_JSON = path.join(REPO_ROOT, 'scripts', 'sessions', `instagram_${nickname}.json`);
const SESSION_DIR  = path.join(REPO_ROOT, 'scripts', 'sessions', `chrome-instagram-${nickname}`);

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

async function downloadImage(url: string): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `ig_image_${nickname}_${row}_${Date.now()}.jpg`);
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(tmpFile);
    client.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(tmpFile); });
    }).on('error', (e) => { fs.unlink(tmpFile, () => {}); reject(e); });
  });
}

async function doLogin(page: Page): Promise<void> {
  console.log('[post-instagram] Logging in...');
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.locator('input[name="username"], input[autocomplete="username"]').first().fill(email);
  await page.locator('input[name="password"], input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/instagram\.com(?!\/accounts\/login)/, { timeout: 30000 });

  // Dismiss popups
  await page.waitForTimeout(2000);
  for (const dismissText of ['Not now', 'Not Now', 'Skip', 'Cancel', 'Later']) {
    const btn = page.locator(`button:has-text("${dismissText}"), div[role="button"]:has-text("${dismissText}")`).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1000);
    }
  }
  console.log('[post-instagram] Login complete');
}

async function postImageWithCaption(page: Page, imagePath: string, caption: string): Promise<string> {
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Find "Create" / "+" new post button
  const createSelectors = [
    '[aria-label="New post"]',
    '[aria-label="Create"]',
    'svg[aria-label*="Create" i]',
    'a[href*="/create"]',
  ];

  let clicked = false;
  for (const sel of createSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.click();
      clicked = true;
      await page.waitForTimeout(1500);
      break;
    }
  }

  if (!clicked) {
    throw new Error('Could not find Instagram create/post button. UI may have changed.');
  }

  await page.waitForTimeout(1000);

  // Wait for file input to appear (hidden input[type="file"])
  const fileInput = page.locator('input[type="file"][accept*="image"]').first();
  await fileInput.waitFor({ timeout: 15000 });
  await fileInput.setInputFiles(imagePath);
  console.log('[post-instagram] Image uploaded, waiting for crop step...');

  // Proceed through crop step
  await page.waitForTimeout(3000);
  for (const nextText of ['Next', 'Continue', 'Crop']) {
    const btn = page.locator(`button:has-text("${nextText}"), div[role="button"]:has-text("${nextText}")`).last();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(2000);
      break;
    }
  }

  // Filters/adjustments step — skip to next
  await page.waitForTimeout(1000);
  for (const nextText of ['Next', 'Share']) {
    const btn = page.locator(`button:has-text("${nextText}"), div[role="button"]:has-text("${nextText}")`).last();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(2000);
      break;
    }
  }

  // Caption step
  await page.waitForTimeout(1000);
  const captionArea = page.locator(
    '[contenteditable="true"][aria-label*="caption" i], textarea[aria-label*="caption" i], div[role="textbox"]'
  ).first();
  if (await captionArea.isVisible({ timeout: 5000 }).catch(() => false)) {
    await captionArea.click();
    await captionArea.fill(caption);
    console.log('[post-instagram] Caption filled');
  }

  // Final "Share" button
  const shareBtn = page.locator('button:has-text("Share"), div[role="button"]:has-text("Share")').last();
  await shareBtn.waitFor({ timeout: 10000 });
  await shareBtn.click();
  console.log('[post-instagram] Share clicked, waiting for confirmation...');

  // Wait for post to complete
  await page.waitForTimeout(5000);

  // Try to grab the post URL from the confirmation dialog or navigate to profile
  const confirmLink = await page.locator('a[href*="/p/"]').first().getAttribute('href').catch(() => '');
  if (confirmLink) return `https://www.instagram.com${confirmLink}`;

  // Fallback: navigate to profile and get most recent post
  await page.goto(`https://www.instagram.com/${nickname}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  const recentPost = await page.locator('a[href*="/p/"]').first().getAttribute('href').catch(() => '');
  if (recentPost) return `https://www.instagram.com${recentPost}`;

  return `https://www.instagram.com/${nickname}/`;
}

(async () => {
  console.log(`[post-instagram] Posting as ${email} (${nickname}) — row ${row}`);
  console.log(`[post-instagram] Caption: ${postText.slice(0, 80)}...`);
  if (imageUrl) console.log(`[post-instagram] Image: ${imageUrl}`);

  const hasJson = fs.existsSync(SESSION_JSON);
  const hasDir  = fs.existsSync(SESSION_DIR);

  if (!hasJson && !hasDir) {
    const err = `No session found for ${nickname}. Save a session to ${SESSION_JSON} or ${SESSION_DIR}.`;
    console.error(err);
    writeSheet({ 'Instagram Status': 'error', 'Instagram Error': err });
    writeResumeFile('post-instagram.ts', 'open-browser', err, { nickname, email, row });
    process.exit(1);
  }

  if (!imageUrl) {
    const err = 'No --image-url provided. Instagram requires an image to post.';
    console.error(err);
    writeSheet({ 'Instagram Status': 'error', 'Instagram Error':  err });
    process.exit(1);
  }

  let imagePath = '';
  try {
    console.log('[post-instagram] Downloading image...');
    imagePath = await downloadImage(imageUrl);
    console.log(`[post-instagram] Image saved to: ${imagePath}`);
  } catch (e: any) {
    const err = `Image download failed: ${e.message}`;
    console.error(err);
    writeSheet({ 'Instagram Status': 'error', 'Instagram Error': err });
    process.exit(1);
  }

  let ctx: BrowserContext;
  let closeBrowser: () => Promise<void>;

  if (hasJson) {
    console.log(`[post-instagram] Using cookie session: ${SESSION_JSON}`);
    const browserInst = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    ctx = await browserInst.newContext({ storageState: SESSION_JSON });
    closeBrowser = () => browserInst.close();
  } else {
    console.log(`[post-instagram] Using persistent profile: ${SESSION_DIR}`);
    ctx = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    closeBrowser = () => ctx.close();
  }

  const page = await ctx.newPage();

  try {
    // Check if already logged in
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const loggedIn = await page.locator('[aria-label="New post"], [aria-label="Create"], a[href*="/create"]').count() > 0
      || await page.locator('svg[aria-label*="Home" i]').count() > 0;

    if (!loggedIn) {
      await doLogin(page);
    }

    const postedUrl = await postImageWithCaption(page, imagePath, postText);
    console.log(`POSTED_URL=${postedUrl}`);

    writeSheet({
      'Instagram Status':    'posted',
      'Instagram Post URl':  postedUrl,
      'instagram Batch':     batch,
      'lastPostedinstagram': new Date().toISOString(),
    });

    console.log('[post-instagram] Done ✓');
    await closeBrowser();
    fs.unlink(imagePath, () => {});
    process.exit(0);

  } catch (err: any) {
    const msg = err.message || String(err);
    console.error(`[post-instagram] FAILED: ${msg}`);
    await saveArtifacts(page, 'post-instagram', err).catch(() => {});
    writeResumeFile('post-instagram.ts', 'compose', msg, { nickname, email, row, batch });
    writeSheet({ 'Instagram Status': 'error', 'Instagram Error':  msg.slice(0, 200) });
    await closeBrowser().catch(() => {});
    if (imagePath) fs.unlink(imagePath, () => {});
    process.exit(1);
  }
})();
