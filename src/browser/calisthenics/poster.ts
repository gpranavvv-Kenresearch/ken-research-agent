/**
 * Calisthenics poster — automated article publishing on calisthenics.mn.co
 */

import { Page } from 'playwright';
import { loginCalisthenics, closeCaliBrowser } from './login.js';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';

export interface CalisthenicsPostParams {
  title: string;
  content: string;
  seedKeyword?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function attemptPost(page: Page, params: CalisthenicsPostParams): Promise<string> {
  // ── Step 1: Go straight to the article composer ────────────────────────────
  // The old flow (home → click Create → pick a space → click Article) relied on
  // selectors from an older Mighty Networks UI that no longer exist. A bare
  // `/posts/new` also doesn't work — it redirects to /feed with an "Articles
  // are not enabled" toast, because the real "Article" menu link's actual href
  // is the space's feed URL with a `?new_post=true` query param (confirmed live
  // by inspecting the real DOM: `a.mighty-menu-list-item[title="Article"]`
  // points at `/spaces/9350032/feed?new_post=true`, which the app then
  // client-side-routes to `/posts/new` with the Article editor actually open).
  // `9350032` is this community's fixed "Home" space id, not per-account.
  console.log('  1️⃣ Navigating directly to the article composer...');
  await page.goto('https://calisthenics.mn.co/spaces/9350032/feed?new_post=true', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);

  // Wait for the article editor to fully load (title + body editors must appear)
  await page.waitForSelector('p[data-placeholder="Title"]', { timeout: 30000 });

  // ── Step 4: Fill title ─────────────────────────────────────────────────────
  console.log('  5️⃣ Filling title...');
  try {
    const titleEditor = page.locator('p[data-placeholder="Title"]').first();
    await titleEditor.click({ delay: 150 }).catch(() => {});
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Delete').catch(() => {});
    await sleep(200);
    await page.keyboard.insertText(params.title);
  } catch (err) {
    console.warn(`   ⚠️ Could not fill title: ${(err as any).message}`);
  }

  // ── Step 5: Insert HTML body directly ──────────────────────────────────────
  console.log('  6️⃣ Inserting content...');
  try {
    const bodyEditor = page.locator('p[data-placeholder="Write, type \'/\' for commands…"]').first();
    if (await bodyEditor.isVisible({ timeout: 10000 }).catch(() => false)) {
      await bodyEditor.click({ delay: 150 }).catch(() => {});
      await sleep(300);
      await page.evaluate((html) => {
        document.execCommand('insertHTML', false, html);
      }, params.content);
      await sleep(1000);
    }
  } catch (err) {
    console.warn(`   ⚠️ Could not insert body: ${(err as any).message}`);
  }

  // ── Step 6: Publish ────────────────────────────────────────────────────────
  console.log('  7️⃣ Publishing...');
  try {
    const postBtn = page.locator('a#post-publish-submit-button:not(.disabled)').first();
    await postBtn.waitFor({ state: 'visible', timeout: 20000 });
    await postBtn.click({ delay: 150 }).catch(() => {});
    // Wait for navigation away from the editor (means publish succeeded)
    await page.waitForFunction(
      () => !window.location.href.includes('/posts/new'),
      { timeout: 15000 }
    ).catch(() => {});
  } catch (err) {
    console.warn(`   ⚠️ Could not click publish: ${(err as any).message}`);
  }

  return page.url().replace('?meta-config=general', '');
}

export async function postToCalisthenics(
  nickname: string,
  params: CalisthenicsPostParams
): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  const MAX_ATTEMPTS = 3;

  try {
    console.log(`📝 Posting to Calisthenics (${nickname})...`);
    params.content = injectUTM(params.content, UTM_PARAMS.Calisthenics);

    const page = await loginCalisthenics(nickname);

    let postUrl = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        console.warn(`  🔄 Retrying full post procedure (attempt ${attempt}/${MAX_ATTEMPTS})...`);
        await sleep(2000);
      }

      postUrl = await attemptPost(page, params);

      const failed = postUrl.includes('/posts/new') || postUrl.includes('/spaces/');
      if (!failed) break;
      console.warn(`  ⚠️ Attempt ${attempt} landed on bad URL: ${postUrl}`);
    }

    const stillFailed = postUrl.includes('/posts/new') || postUrl.includes('/spaces/');
    if (stillFailed) {
      throw new Error(`Post failed — bad URL after ${MAX_ATTEMPTS} attempts: ${postUrl}`);
    }

    console.log(`  ✅ Post URL: ${postUrl}`);
    await closeCaliBrowser();
    return { success: true, postUrl };

  } catch (err: any) {
    console.error(`  ❌ Calisthenics posting failed: ${err.message}`);
    await closeCaliBrowser();
    return { success: false, error: err.message };
  }
}
