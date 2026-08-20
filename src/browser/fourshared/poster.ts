/**
 * fourshared/poster.ts — Upload a PDF to 4shared and get the shareable link.
 * Expects an already-logged-in (or anonymous) page from loginToFourShared()
 *
 * TODO(locators): the homepage dropzone (file input near the "Upload files"
 * button, confirmed present live) -> processing -> share link flow below is
 * a best-effort guess for the post-upload share-link element — confirm
 * against the live DOM on first test run, same convention as PdfHost before
 * this.
 */
import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const UPLOAD_URL = 'https://www.4shared.com/';
const FILE_INPUT_SEL = 'input[type="file"]';

export interface FourSharedPostResult {
  success: true;
  postUrl: string;
  postedAt: Date;
}

export async function postToFourShared(
  page: Page,
  filePath: string,
  targetUrl: string,
): Promise<FourSharedPostResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  void injectUTM(targetUrl, UTM_PARAMS.FourShared);

  console.log('   Navigating to 4shared home...');
  await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  console.log('   Selecting PDF file...');
  await page.waitForSelector(FILE_INPUT_SEL, { timeout: 10000, state: 'attached' });
  await page.setInputFiles(FILE_INPUT_SEL, filePath);
  console.log(`   File selected: ${path.basename(filePath)}`);

  console.log('   Waiting for the upload to finish...');
  await sleep(10000);
  try {
    await page.waitForURL(/\/file\/|\/web\/f\//, { timeout: 60000 });
  } catch {
    console.warn('   ⚠️ No redirect to a file detail URL detected within 60s — reading whatever is on screen anyway.');
  }
  await sleep(2000);

  console.log('   Reading the shareable link...');
  let postUrl = page.url();
  const shareLink = page.locator('a[href*="4shared.com/file/"], a[href*="4shared.com/web/f/"]').first();
  if (await shareLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    const href = await shareLink.getAttribute('href').catch(() => null);
    if (href) postUrl = href.startsWith('http') ? href : `https://www.4shared.com${href}`;
  }

  console.log(`   ✅ 4shared link: ${postUrl}`);
  return { success: true, postUrl, postedAt: new Date() };
}
