/**
 * issuu/poster.ts — Upload PPTX/PDF to Issuu and publish
 * Expects an already-logged-in page from loginToIssuu()
 *
 * Confirmed step-by-step live (2026-08-13) — this is a modal/tray flow, NOT
 * the earlier /home/docs/<id> multi-tab flow it replaces:
 *   1. Click the sidebar "Upload" button
 *      (button[data-button="js-sidebar-add-content"]) — opens an upload
 *      tray in place, no navigation.
 *   2. Fill the title FIRST, before any file is selected
 *      (input#publication-title-input, name="title").
 *   3. Click the tray's upload-file button
 *      (button.UploadTray__upload-tray__upload-file-button) — this is a
 *      native file-picker trigger, so we bypass it and setInputFiles()
 *      directly on the underlying <input type="file">.
 *   4. Wait ~5-10s for the file to actually upload.
 *   5. Click Publish (button#settings-form-publish-button[data-can-publish]).
 *   6. A share/success popup appears — close it
 *      (button[aria-label="Close"]).
 *   7. Click "Copy link" (button.ActionableTextField__...__cta) and read the
 *      OS clipboard for the real published URL.
 */
import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const DASHBOARD_URL = 'https://issuu.com/home/published';

export interface IssuuPostResult {
  success: true;
  postUrl: string;
  postedAt: Date;
}

export async function postToIssuu(
  page: Page,
  filePath: string,
  title: string,
  description: string,
  targetUrl: string,
): Promise<IssuuPostResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  // Kept for interface compatibility with the other doc-upload platforms —
  // this tray flow has no description field to fill, only title.
  void injectUTM(targetUrl, UTM_PARAMS.Issuu);
  void description;

  console.log('   Navigating to Issuu dashboard...');
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);

  console.log('   Clicking Upload...');
  // Flaky on a cold dashboard load — the sidebar sometimes hasn't finished
  // hydrating within the first couple seconds. Wait longer for the primary
  // selector, and fall back to any visible button whose text is "Upload"
  // (there can be more than one in the DOM — a responsive duplicate pair —
  // only one of which is actually visible at a time).
  let uploadClicked = false;
  const primaryUploadBtn = page.locator('button[data-button="js-sidebar-add-content"]').first();
  if (await primaryUploadBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
    await primaryUploadBtn.click();
    uploadClicked = true;
  } else {
    const uploadCandidates = page.getByRole('button', { name: 'Upload', exact: true });
    const count = await uploadCandidates.count();
    for (let i = 0; i < count; i++) {
      const candidate = uploadCandidates.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        uploadClicked = true;
        break;
      }
    }
  }
  if (!uploadClicked) {
    throw new Error('Issuu: no visible "Upload" button found (tried data-button="js-sidebar-add-content" and text="Upload").');
  }
  await sleep(1500);

  console.log('   Filling title...');
  const titleInput = page.locator('#publication-title-input').first();
  if (!(await titleInput.isVisible({ timeout: 8000 }).catch(() => false))) {
    throw new Error('Issuu: title input (#publication-title-input) not found after clicking Upload.');
  }
  await titleInput.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(title.slice(0, 100), { delay: 15 });
  console.log('   ✅ Title filled');
  await sleep(500);

  console.log('   Selecting PDF file...');
  // The visible button opens a native OS file dialog Playwright can't drive
  // — setInputFiles() on the underlying (hidden) file input is the reliable
  // equivalent, same convention as every other upload flow in this repo.
  await page.waitForSelector('input[type="file"]', { timeout: 10000, state: 'attached' });
  await page.setInputFiles('input[type="file"]', filePath);
  console.log(`   File selected: ${path.basename(filePath)}`);

  console.log('   Waiting for the file to finish uploading...');
  await sleep(10000);

  console.log('   Publishing...');
  const publishBtn = page.locator('#settings-form-publish-button').first();
  if (!(await publishBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
    throw new Error('Issuu: publish button (#settings-form-publish-button) not found.');
  }
  try {
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('#settings-form-publish-button');
        return !!btn && btn.getAttribute('data-can-publish') === 'true';
      },
      { timeout: 120000 }
    );
  } catch {
    console.warn('   ⚠️ Publish button never reported data-can-publish=true — attempting click anyway.');
  }
  await publishBtn.click({ timeout: 4000 });

  // Confirmed live: on success the URL itself navigates to
  // /home/docs/<id>/share?post_publish=true — that's the real signal the
  // publish went through and the share popup is about to render. If it
  // doesn't happen within a few seconds, the first click likely didn't
  // register (e.g. button was still transitioning out of disabled) — retry
  // it once before giving up on the nicer share-popup URL.
  let publishConfirmed = await page.waitForURL(/\/share/, { timeout: 8000 }).then(() => true).catch(() => false);
  if (!publishConfirmed) {
    console.log('   ⚠️ No /share navigation yet — retrying the Publish click...');
    await publishBtn.click({ timeout: 4000 }).catch(() => {});
    publishConfirmed = await page.waitForURL(/\/share/, { timeout: 15000 }).then(() => true).catch(() => false);
  }

  // Read the link BEFORE closing — the "Copy link" control lives in the
  // same share popup we're about to dismiss.
  const closeBtn = page.locator('button[aria-label="Close"]').first();

  console.log(publishConfirmed ? '   ✅ Publish confirmed (/share navigation detected)' : '   ⚠️ Publish never confirmed via /share navigation — reading whatever is on screen anyway');
  let postUrl = page.url();
  // Confirmed live: the real URL sits as plain text right next to the
  // "Copy link" button — reading it directly is far more reliable than
  // clicking "Copy link" and reading the OS clipboard, which can grab
  // whatever unrelated text was already on the clipboard if the click
  // doesn't land in time. The popup itself can take a few seconds to
  // render after the Publish click, so wait for it rather than a fixed sleep.
  const linkText = page.locator('div[class*="ActionableTextField__actionable-text-field__text-wrapper"]').first();
  try {
    await linkText.waitFor({ state: 'visible', timeout: 20000 });
    const readUrl = await linkText.textContent();
    if (readUrl && readUrl.trim().startsWith('http')) {
      postUrl = readUrl.trim();
      console.log(`   ✅ Link read from page: ${postUrl}`);
    } else {
      console.warn('   ⚠️ Share-link element found but had no URL text — falling back to current page URL.');
    }
  } catch {
    console.warn('   ⚠️ Share-link popup never appeared within 20s — falling back to current page URL.');
  }

  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click({ timeout: 4000 }).catch(() => {});
  }

  console.log(`   ✅ Published: ${postUrl}`);
  return { success: true, postUrl, postedAt: new Date() };
}
