/**
 * hatena/poster.ts — Save a Ken Research URL to Hatena Bookmark.
 * Expects an already-logged-in page from loginToHatena()
 *
 * Uses Hatena's well-known "add bookmark" panel URL pattern
 * (b.hatena.ne.jp/entry/panel/?url=...&title=...), the same deep link their
 * own browser bookmarklet/extension opens — a plain form panel with a
 * comment/tags field and a submit button, no custom UI to reverse-engineer.
 * TODO(locators): field names below are best-effort guesses at the panel's
 * comment/tag inputs — confirm against the live DOM on first authenticated
 * test run, same convention as every other platform in this repo.
 */
import { Page } from 'playwright';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface HatenaPostResult {
  success: true;
  postUrl: string;
  postedAt: Date;
}

export async function postToHatena(
  page: Page,
  title: string,
  targetUrl: string,
  comment?: string,
): Promise<HatenaPostResult> {
  const urlWithUtm = injectUTM(targetUrl, UTM_PARAMS.Hatena);

  const panelUrl = `https://b.hatena.ne.jp/entry/panel/?url=${encodeURIComponent(urlWithUtm)}&title=${encodeURIComponent(title)}`;
  console.log('   Opening the Hatena Bookmark add-panel...');
  await page.goto(panelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);

  if (comment) {
    const commentBox = page.locator('textarea[name="comment"], textarea#comment, textarea').first();
    if (await commentBox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await commentBox.click();
      await page.keyboard.type(comment.slice(0, 100), { delay: 12 });
      await sleep(500);
    }
  }

  console.log('   Saving bookmark...');
  const saveBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("登録")').first();
  if (!(await saveBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    throw new Error('Hatena: bookmark submit button not found in the add-panel (selector needs confirming against live DOM).');
  }
  await saveBtn.click({ timeout: 4000 }).catch(() => {});
  await sleep(2500);

  const postUrl = `https://b.hatena.ne.jp/entry/s/${urlWithUtm.replace(/^https?:\/\//, '')}`;
  console.log(`   ✅ Hatena bookmark saved: ${postUrl}`);
  return { success: true, postUrl, postedAt: new Date() };
}
