/**
 * slideshare/poster.ts — Upload PPTX to SlideShare and publish
 * Expects an already-logged-in page from loginToSlideShare()
 */

import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min = 800, max = 2200) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);

export interface SlideSharePostResult {
  success: true;
  postUrl: string;
  postedAt: Date;
}

export async function postToSlideShare(
  page: Page,
  pptxFilePath: string,
  title: string,
  description: string,
  tags: string[],
): Promise<SlideSharePostResult> {
  if (!fs.existsSync(pptxFilePath)) {
    throw new Error(`PPTX file not found: ${pptxFilePath}`);
  }

  console.log('   Navigating to SlideShare upload page...');
  await page.goto('https://www.slideshare.net/upload', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await randomDelay(1500, 2500);

  // ── File upload ─────────────────────────────────────────────────────────────
  console.log('   Uploading PPTX file...');

  // SlideShare uses a hidden file input
  const fileInputSel = 'input[type="file"]';
  await page.waitForSelector(fileInputSel, { timeout: 20000 });
  await page.setInputFiles(fileInputSel, pptxFilePath);
  console.log(`   File selected: ${path.basename(pptxFilePath)}`);

  // Wait for upload to process (SlideShare converts slides server-side)
  console.log('   Waiting for upload to process (this can take 30–90s)...');
  await waitForUploadComplete(page);

  // ── Fill title ──────────────────────────────────────────────────────────────
  console.log('   Filling title...');
  const titleSelectors = [
    'input[name="title"]',
    'input[placeholder*="title" i]',
    '#slideshow-title',
    'input[id*="title"]',
  ];
  for (const sel of titleSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 8000 });
      await page.click(sel);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await randomDelay(300, 500);
      await page.keyboard.type(title, { delay: 60 });
      console.log(`   Title filled (${sel})`);
      break;
    } catch { /* try next */ }
  }

  await randomDelay(600, 1000);

  // ── Fill description ────────────────────────────────────────────────────────
  console.log('   Filling description...');
  const descSelectors = [
    'textarea[name="description"]',
    'textarea[placeholder*="description" i]',
    '#slideshow-description',
    'textarea[id*="description"]',
  ];
  for (const sel of descSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 8000 });
      await page.click(sel);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await randomDelay(300, 500);
      await page.keyboard.type(description.slice(0, 500), { delay: 40 });
      console.log(`   Description filled (${sel})`);
      break;
    } catch { /* try next */ }
  }

  await randomDelay(600, 1000);

  // ── Fill tags ───────────────────────────────────────────────────────────────
  if (tags.length > 0) {
    console.log('   Adding tags...');
    const tagSelectors = [
      'input[name="tags"]',
      'input[placeholder*="tag" i]',
      '#slideshow-tags',
      'input[id*="tag"]',
    ];
    for (const sel of tagSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        for (const tag of tags.slice(0, 5)) {
          await page.click(sel);
          await page.keyboard.type(tag, { delay: 60 });
          await page.keyboard.press('Enter');
          await randomDelay(400, 700);
        }
        console.log(`   Tags added (${sel})`);
        break;
      } catch { /* tags optional */ }
    }
  }

  await randomDelay(800, 1200);

  // ── Set category to Business & Management ──────────────────────────────────
  try {
    const catSel = 'select[name="category"], select[id*="category"]';
    await page.waitForSelector(catSel, { timeout: 5000 });
    await page.selectOption(catSel, { label: 'Business & Management' });
    console.log('   Category set: Business & Management');
  } catch { /* optional */ }

  await randomDelay(800, 1200);

  // ── Publish ─────────────────────────────────────────────────────────────────
  console.log('   Publishing slideshow...');
  const publishSelectors = [
    'button:has-text("Publish")',
    'button:has-text("Save & Publish")',
    'button[type="submit"]:has-text("Publish")',
    'input[type="submit"][value*="Publish"]',
    '[data-testid="publish-button"]',
  ];

  let published = false;
  for (const sel of publishSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 8000 });
      await page.click(sel);
      published = true;
      console.log(`   Publish clicked (${sel})`);
      break;
    } catch { /* try next */ }
  }

  if (!published) {
    throw new Error('Could not find Publish button on SlideShare');
  }

  // ── Wait for redirect to the published slideshow ────────────────────────────
  console.log('   Waiting for publish confirmation...');
  await page.waitForURL(url => url.href.includes('slideshare.net') && !url.href.includes('/upload'), { timeout: 60000 });
  await randomDelay(2000, 3000);

  const postUrl = page.url();
  if (!postUrl || postUrl.includes('/upload')) {
    throw new Error(`Unexpected URL after publish: ${postUrl}`);
  }

  console.log(`   ✅ Published: ${postUrl}`);
  return { success: true, postUrl, postedAt: new Date() };
}

async function waitForUploadComplete(page: Page): Promise<void> {
  // Poll for the title input or a "processing complete" indicator
  const maxWait = 120_000;
  const interval = 3_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    // Success indicators: title field appears, or a "details" / "metadata" section is visible
    const titleVisible = await page.locator('input[name="title"], input[placeholder*="title" i], #slideshow-title').first().isVisible().catch(() => false);
    const processingDone = await page.locator('text=/processing complete/i, text=/upload complete/i, text=/ready to publish/i').first().isVisible().catch(() => false);
    const errorVisible = await page.locator('text=/upload failed/i, text=/error/i').first().isVisible().catch(() => false);

    if (errorVisible) throw new Error('SlideShare upload failed — error shown on page');
    if (titleVisible || processingDone) {
      console.log('   ✅ Upload processed — form ready');
      return;
    }

    console.log(`   ⏳ Still processing... (${Math.round((Date.now() - start) / 1000)}s)`);
    await sleep(interval);
  }

  // Proceed anyway — title might still be fillable
  console.warn('   ⚠️ Upload wait timed out — attempting to fill form anyway');
}
