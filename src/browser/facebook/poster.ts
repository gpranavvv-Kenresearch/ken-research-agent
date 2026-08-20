import { Page } from 'playwright';
import { humanDelay } from '../stagehand.js';
import { preparePlainSocialPost } from '../../utils/socialText.js';
import 'dotenv/config';

/**
 * Clear an initial FB popup/modal that lands on top of the feed on load
 * (save-login prompt, cookie banner, notification nag) before we try to open the
 * composer. Clicks known dismiss buttons, then Escapes any leftover dialog. Must
 * only be called BEFORE the composer is opened, so Escape can't close our editor.
 */
async function dismissBlockingPopup(page: Page): Promise<void> {
  const dismissLabels = [/^not now$/i, /^cancel$/i, /decline optional cookies/i, /only allow essential/i, /^close$/i];
  for (const re of dismissLabels) {
    try {
      const btn = page.getByRole('button', { name: re }).first();
      if (await btn.isVisible({ timeout: 1200 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await humanDelay(500, 900);
      }
    } catch { /* try next */ }
  }
  // Any dialog still covering the feed (composer not open yet) → Escape it.
  try {
    if (await page.locator('[role="dialog"]').first().isVisible({ timeout: 800 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await humanDelay(400, 700);
    }
  } catch { /* ignore */ }
}

export async function postToFacebook(
  page: Page,
  postText: string,
): Promise<{ success: true; postUrl: string; postText: string; postedAt: Date }> {
  const cleanPostText = preparePlainSocialPost(postText);
  if (cleanPostText !== postText.trim()) {
    console.log('   Removed markdown bold markers before posting to Facebook');
  }

  console.log('   Navigating to Facebook home...');
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
  await humanDelay(2000, 3000);

  // Detect a Facebook security checkpoint (identity/video-selfie verification,
  // "confirm you're a real person", account-locked review) FIRST. These wall the
  // whole account behind a redirect — the composer never renders, so the old code
  // reported a misleading "page may have changed". A checkpoint is NOT a selector
  // problem and NOT retryable by automation: it needs a human. Fail with a distinct,
  // greppable FB_CHECKPOINT error so the rotation can skip + flag the account.
  if (/\/checkpoint\//.test(page.url())) {
    throw new Error('FB_CHECKPOINT: account is on a Facebook security checkpoint (identity/selfie verification) — needs manual clearing, cannot auto-post.');
  }

  // Wait for the feed itself to actually render before hunting for the composer —
  // the SPA navigation resolves before anything paints, so an immediate selector
  // hunt times out on a still-loading shell. Gate on a stable home landmark first.
  await page.waitForSelector('div[role="feed"], div[role="main"]', { timeout: 15000 }).catch(() => {});

  // Dismiss any initial popup landing on top of the feed BEFORE opening the
  // composer — FB routinely throws a "Save your login info?" / cookie / "turn on
  // notifications" dialog on load that intercepts the composer click, which is the
  // other half of today's failures (the composer element is there but a modal sits
  // over it). Safe to Escape here: the composer dialog isn't open yet, so this can
  // only close an intruding popup, never our own editor.
  await dismissBlockingPopup(page);

  // Open the composer. Facebook moved the trigger: the "What's on your mind, {Name}?"
  // text is now VISIBLE TEXT inside an aria-label="Create a post" region, NOT an
  // aria-label/placeholder attribute (verified live 2026-08-20). The old attribute
  // selectors matched nothing. Match on ROLE/TEXT instead, and — critically — use a
  // regex with an apostrophe wildcard (what.?s) so a curly ’ vs straight ' can't
  // break the match. Region/text fallbacks cover future minor re-labels.
  console.log('   Opening post composer...');
  const composerCandidates = [
    page.getByRole('button',  { name: /what.?s on your mind/i }),
    page.getByRole('textbox', { name: /what.?s on your mind/i }),
    page.getByText(/what.?s on your mind/i).first(),
    page.locator('div[role="region"][aria-label*="Create a post" i]').getByRole('button').first(),
    page.locator('div[aria-label*="Create a post" i]').first(),
  ];

  let opened = false;
  for (const cand of composerCandidates) {
    try {
      await cand.waitFor({ state: 'visible', timeout: 5000 });
      await cand.click();
      opened = true;
      console.log('   Composer opened.');
      break;
    } catch {
      // try next candidate
    }
  }
  if (!opened) throw new Error('Could not find Facebook post composer. Page may have changed.');
  await humanDelay(1500, 2500);

  // The actual editable area in the post dialog
  const textAreaSelector = '[contenteditable="true"][role="textbox"]';
  await page.waitForSelector(textAreaSelector, { timeout: 15000 });
  await page.click(textAreaSelector);
  await humanDelay(800, 1200);

  console.log('   Pasting post...');
  await page.keyboard.insertText(cleanPostText);
  await humanDelay(1500, 2500);

  await page.keyboard.press('Enter');
  await humanDelay(800, 1200);

  // Click the Post button inside the dialog — try multiple selectors
  console.log('   Clicking Post...');
  const postBtnSelectors = [
    page.getByRole('button', { name: /^post$/i }),
    page.getByRole('button', { name: /^share now$/i }),
    page.getByRole('button', { name: /^share$/i }),
  ];

  let posted = false;
  for (const btn of postBtnSelectors) {
    try {
      await btn.waitFor({ timeout: 5000 });
      await btn.click();
      posted = true;
      break;
    } catch { /* try next */ }
  }
  if (!posted) throw new Error('Could not find Post/Share button in Facebook composer dialog.');

  // Wait 8 seconds for post to publish
  console.log('   Waiting 8s for post to publish...');
  await humanDelay(8000, 8000);

  let postUrl = '';

  // Strategy 1: find permalink from feed — timestamp <a> links to the post
  console.log('   Extracting post URL from feed...');
  try {
    postUrl = await page.evaluate((): string => {
      // Facebook post timestamps are <a> tags whose href is the post permalink
      const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      for (const a of links) {
        const href = a.href || '';
        if (
          (href.includes('/posts/') || href.includes('story_fbid') || href.includes('/permalink/')) &&
          href.includes('facebook.com')
        ) {
          return href.split('?')[0]; // strip query params
        }
      }
      return '';
    });
    if (postUrl) console.log(`   ✅ Permalink found in DOM: ${postUrl}`);
  } catch { /* fall through */ }

  // Strategy 2: Share button → Copy link (clipboard)
  if (!postUrl) {
    const getShareUrl = async (): Promise<string> => {
      // Intercept clipboard.writeText before clicking — works headless on Linux
      await page.evaluate(() => {
        (window as any).__clipboardWritten = '';
        const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = async (text: string) => {
          (window as any).__clipboardWritten = text;
          return orig(text).catch(() => {});
        };
      });

      const shareSelectors = [
        'div[aria-label="Send this to friends or post it on your profile."][role="button"]',
        'div[aria-label*="Share"][role="button"]',
        'span[aria-label*="Share"]',
      ];
      for (const sel of shareSelectors) {
        try {
          await page.locator(sel).first().click({ timeout: 3000 });
          break;
        } catch { /* try next */ }
      }
      await humanDelay(1000, 1500);
      await page.locator('span:has-text("Copy link")').first().click({ timeout: 5000 });
      await humanDelay(800, 1000);

      const intercepted = await page.evaluate(() => (window as any).__clipboardWritten || '').catch(() => '');
      if (intercepted) return intercepted;
      return await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`   Trying Share → Copy link (attempt ${attempt}/3)...`);
        const copied = await getShareUrl();
        if (copied && (copied.includes('/posts/') || copied.includes('story_fbid') || copied.includes('facebook.com'))) {
          postUrl = copied;
          console.log(`   ✅ URL from clipboard: ${postUrl}`);
          break;
        }
        await humanDelay(2000, 3000);
      } catch (err: any) {
        console.log(`   ⚠️ Attempt ${attempt} failed: ${err.message?.slice(0, 80)}`);
        await humanDelay(2000, 3000);
      }
    }
  }

  console.log(`   Post URL: ${postUrl || '(not captured)'}`);

  // Post was published even if URL capture failed — return success with whatever URL we have
  return {
    success: true,
    postUrl: postUrl || 'https://www.facebook.com/',
    postText: cleanPostText,
    postedAt: new Date(),
  };
}
