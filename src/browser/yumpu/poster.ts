/**
 * yumpu/poster.ts — Upload a PDF to Yumpu and publish
 * Expects an already-logged-in page from loginToYumpu()
 *
 * TODO(locators): the upload form requires an authenticated session and
 * couldn't be inspected live — selectors below are best-effort guesses.
 * Confirm against the real DOM on first authenticated test run and fix any
 * that miss, same convention as Issuu's were.
 */
import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';
import { pasteText } from '../stagehand.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Confirmed live (2026-08-12): /en/documents/upload silently redirects to
// the "my documents" library with no upload form — the real entry point is
// /en/account/create (also the target of the header's "Create ePaper" link).
const UPLOAD_URL = 'https://www.yumpu.com/en/account/create';

// Confirmed live: it's a Fine Uploader-style widget — the real input is
// input[name="qqfile"], not just any input[type="file"].
const FILE_INPUT_SELS = ['input[type="file"][name="qqfile"]', 'input[type="file"]'];
const TITLE_SELS = [
  'input[name="title"]',
  'input[placeholder*="title" i]',
];
const DESCRIPTION_SELS = [
  'textarea[name="description"]',
  'textarea[placeholder*="description" i]',
];
const PUBLISH_SELS = [
  'button:has-text("Publish")',
  'button:has-text("Save")',
  'button[type="submit"]',
];

export interface YumpuPostResult {
  success: true;
  postUrl: string;
  postedAt: Date;
}

export async function postToYumpu(
  page: Page,
  filePath: string,
  title: string,
  description: string,
  targetUrl: string,
): Promise<YumpuPostResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const utmDescription = `${description}\n\nFull report: ${injectUTM(targetUrl, UTM_PARAMS.Yumpu)}`;

  console.log('   Navigating to Yumpu upload page...');
  await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Confirmed live: a free account that's hit its upload quota shows an
  // upgrade paywall INSTEAD of the upload form (no file input at all) — a
  // distinct, actionable failure from "selector is wrong".
  const quotaBlocked = await page.locator('text=/don.?t let limits slow you down/i, text=/go unlimited/i').first().isVisible({ timeout: 2000 }).catch(() => false);
  if (quotaBlocked) {
    throw new Error('Yumpu: free-account upload quota reached — upgrade the account or wait for the quota to reset.');
  }

  console.log('   Uploading file...');
  let uploaded = false;
  for (const sel of FILE_INPUT_SELS) {
    try {
      await page.waitForSelector(sel, { timeout: 10000, state: 'attached' });
      await page.setInputFiles(sel, filePath);
      uploaded = true;
      console.log(`   File selected (${sel}): ${path.basename(filePath)}`);
      break;
    } catch { /* try next */ }
  }
  if (!uploaded) {
    throw new Error('Yumpu: file input not found on upload page');
  }

  console.log('   Waiting for upload/processing...');
  await waitForUploadComplete(page);

  console.log('   Filling title...');
  let titleFilled = false;
  for (const sel of TITLE_SELS) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 8000 });
      await el.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.keyboard.type(title, { delay: 40 });
      titleFilled = true;
      console.log(`   Title filled (${sel})`);
      break;
    } catch { /* try next */ }
  }
  if (!titleFilled) console.warn('   ⚠️ Title field not found');
  await sleep(500);

  console.log('   Filling description...');
  for (const sel of DESCRIPTION_SELS) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 5000 });
      await el.click();
      await pasteText(page, utmDescription.slice(0, 1000));
      console.log(`   Description filled (${sel})`);
      break;
    } catch { /* description optional */ }
  }
  await sleep(500);

  console.log('   Publishing...');
  let published = false;
  for (const sel of PUBLISH_SELS) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 8000 });
      await el.click();
      published = true;
      console.log(`   Publish clicked (${sel})`);
      break;
    } catch { /* try next */ }
  }
  if (!published) {
    throw new Error('Yumpu: publish button not found');
  }

  console.log('   Waiting for publish confirmation...');
  await page.waitForURL(url => url.href.includes('yumpu.com') && !url.href.includes('/upload'), { timeout: 90000 });
  await sleep(2000);

  const postUrl = page.url();
  console.log(`   ✅ Published: ${postUrl}`);
  return { success: true, postUrl, postedAt: new Date() };
}

async function waitForUploadComplete(page: Page): Promise<void> {
  const maxWait = 150_000;
  const interval = 3_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const titleVisible = await page.locator(TITLE_SELS.join(', ')).first().isVisible().catch(() => false);
    const errorVisible = await page.locator('text=/upload failed/i, text=/error/i').first().isVisible().catch(() => false);

    if (errorVisible) throw new Error('Yumpu upload failed — error shown on page');
    if (titleVisible) {
      console.log('   ✅ Upload processed — form ready');
      return;
    }
    console.log(`   ⏳ Still processing... (${Math.round((Date.now() - start) / 1000)}s)`);
    await sleep(interval);
  }
  console.warn('   ⚠️ Upload wait timed out — attempting to fill form anyway');
}
