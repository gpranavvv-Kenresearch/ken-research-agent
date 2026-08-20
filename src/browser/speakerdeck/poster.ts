/**
 * speakerdeck/poster.ts — Upload a PDF deck to Speaker Deck and publish
 * Expects an already-logged-in page from loginToSpeakerDeck()
 *
 * Locators confirmed against the real /new page DOM (2026-07-22, logged in
 * as aniket): the upload input only accepts application/pdf (a separate
 * js-upload-form posts directly to S3), and the metadata is a distinct
 * #new_talk form with talk[name]/talk[description] fields and a
 * "Save this deck" button — not "Publish" as originally guessed.
 */
import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';
import { pasteText } from '../stagehand.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const UPLOAD_URL = 'https://speakerdeck.com/new';

const FILE_INPUT_SELS = ['#upload-field', 'input[type="file"][name="file"]'];
const TITLE_SELS = [
  '#talk_name',
  'input[name="talk[name]"]',
];
const DESCRIPTION_SELS = [
  '#talk_description',
  'textarea[name="talk[description]"]',
];
const PUBLISH_SELS = [
  'button:has-text("Save this deck")',
  'button[type="submit"]',
];

export interface SpeakerDeckPostResult {
  success: true;
  postUrl: string;
  postedAt: Date;
}

export async function postToSpeakerDeck(
  page: Page,
  filePath: string,
  title: string,
  description: string,
  targetUrl: string,
): Promise<SpeakerDeckPostResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const utmDescription = `${description}\n\nFull report: ${injectUTM(targetUrl, UTM_PARAMS.SpeakerDeck)}`;

  console.log('   Navigating to Speaker Deck upload page...');
  await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  console.log('   Uploading file...');
  let uploaded = false;
  for (const sel of FILE_INPUT_SELS) {
    try {
      // The real <input type="file"> is visually hidden behind a styled
      // drag-and-drop label — wait for it to be attached, not visible.
      await page.waitForSelector(sel, { timeout: 10000, state: 'attached' });
      await page.setInputFiles(sel, filePath);
      uploaded = true;
      console.log(`   File selected (${sel}): ${path.basename(filePath)}`);
      break;
    } catch { /* try next */ }
  }
  if (!uploaded) {
    throw new Error('Speaker Deck: file input not found on upload page');
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

  // talk[view_policy] defaults to "private" — a deck saved without setting
  // this explicitly exists and is fully reachable by the owner's own session
  // (which is why testing via an authenticated session looked fine) but
  // shows "Deck Not Found" to everyone else. Must be forced to "public".
  console.log('   Setting visibility to public...');
  try {
    await page.selectOption('select[name="talk[view_policy]"]', 'public', { timeout: 5000 });
    console.log('   ✅ Visibility set to public');
  } catch (err: any) {
    console.warn(`   ⚠️ Could not set visibility to public: ${err.message}`);
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
    throw new Error('Speaker Deck: publish button not found');
  }

  console.log('   Waiting for publish confirmation...');
  await page.waitForURL(url => url.href.includes('speakerdeck.com') && !url.href.includes('/new'), { timeout: 60000 });
  await sleep(2000);

  const postUrl = page.url();
  console.log(`   ✅ Published: ${postUrl}`);
  return { success: true, postUrl, postedAt: new Date() };
}

async function waitForUploadComplete(page: Page): Promise<void> {
  // The talk[name]/talk[description] fields are present in the DOM from
  // page load (their talk[uuid] is pre-generated server-side) — they do NOT
  // indicate upload completion. The real signal is the
  // .js-upload-processed block losing its d-none class ("Your deck has been
  // processed"); errors surface in .js-upload-pdf-error.
  const maxWait = 120_000;
  const interval = 3_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const processed = await page.locator('.js-upload-processed').first().isVisible().catch(() => false);
    const errorText = await page.locator('.js-upload-pdf-error').first().innerText().catch(() => '');

    if (errorText.trim()) throw new Error(`Speaker Deck upload failed: ${errorText.trim()}`);
    if (processed) {
      console.log('   ✅ Upload processed — deck ready');
      return;
    }
    console.log(`   ⏳ Still processing... (${Math.round((Date.now() - start) / 1000)}s)`);
    await sleep(interval);
  }
  console.warn('   ⚠️ Upload wait timed out — attempting to save anyway');
}
