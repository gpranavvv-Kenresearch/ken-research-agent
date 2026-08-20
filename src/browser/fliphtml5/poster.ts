/**
 * fliphtml5/poster.ts — Upload a PDF to FlipHTML5 and get the shareable flipbook link.
 * Expects an already-logged-in page from loginToFlipHtml5()
 *
 * TODO(locators): the /quick-upload/ flow below (file input -> processing ->
 * "View" / share link) is a best-effort guess based on the product's public
 * marketing flow — confirm against the live authenticated DOM on first test
 * run, same convention as PdfHost/Yumpu/Issuu before this.
 */
import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const UPLOAD_URL = 'https://fliphtml5.com/quick-upload/';
const FILE_INPUT_SEL = 'input[type="file"]';

export interface FlipHtml5PostResult {
  success: true;
  postUrl: string;
  postedAt: Date;
}

export async function postToFlipHtml5(
  page: Page,
  filePath: string,
  title: string,
  targetUrl: string,
): Promise<FlipHtml5PostResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  void injectUTM(targetUrl, UTM_PARAMS.FlipHTML5);

  console.log('   Navigating to FlipHTML5 upload page...');
  await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  console.log('   Selecting PDF file...');
  await page.waitForSelector(FILE_INPUT_SEL, { timeout: 10000, state: 'attached' });
  await page.setInputFiles(FILE_INPUT_SEL, filePath);
  console.log(`   File selected: ${path.basename(filePath)}`);

  console.log('   Waiting for conversion to finish (can take a while for larger PDFs)...');
  try {
    await page.waitForURL(/\/app\/|\/publication\/|\/showcase\//, { timeout: 180000 });
  } catch {
    console.warn('   ⚠️ No redirect to a publication/app URL detected within 180s — reading whatever is on screen anyway.');
  }
  await sleep(3000);

  if (title) {
    const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]').first();
    if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await titleInput.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.keyboard.type(title.slice(0, 150), { delay: 15 });
      console.log('   ✅ Title filled');
      await sleep(500);
    }
  }

  console.log('   Reading the published flipbook link...');
  let postUrl = page.url();
  const shareLink = page.locator('a[href*="fliphtml5.com"][href*="/"]', { hasText: /view|share|read/i }).first();
  if (await shareLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    const href = await shareLink.getAttribute('href').catch(() => null);
    if (href) postUrl = href.startsWith('http') ? href : `https://fliphtml5.com${href}`;
  }

  console.log(`   ✅ FlipHTML5 flipbook: ${postUrl}`);
  return { success: true, postUrl, postedAt: new Date() };
}
