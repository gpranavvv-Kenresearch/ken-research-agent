import { Page } from 'playwright';
import { execSync } from 'child_process';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';

const SMALL_DELAY = 800;

/**
 * Remove image blocks before pasting. Medium re-fetches each pasted <img> src on
 * its own servers to re-host it; our imagekit URLs fail that fetch → blocking "Uh oh"
 * modal that derails publishing. Text-only keeps all links and posts reliably.
 */
function stripImagesFromHtml(html: string): string {
  return html
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, '')
    .replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, '')
    .replace(/<source\b[^>]*>/gi, '')
    .replace(/<img\b[^>]*>/gi, '');
}

/**
 * Dismiss Medium's "Uh oh! Something went wrong uploading the image" modal if
 * present. It blocks the Publish button; the text is already in the editor, so we
 * click OK and continue (publish without the failed image). No-op if absent.
 */
async function dismissMediumImageError(page: Page): Promise<void> {
  try {
    const dialog = page.locator('text=/went wrong uploading the image/i');
    if (await dialog.count() === 0) return;
    console.warn('   ⚠️ Medium image-upload error modal — dismissing (publishing without image)');
    const ok = page.getByRole('button', { name: /^ok$/i }).first();
    if (await ok.count()) { await ok.click({ timeout: 3000 }).catch(() => {}); }
    else { await page.keyboard.press('Enter').catch(() => {}); }
    await page.waitForTimeout(SMALL_DELAY);
  } catch { /* best-effort — never block publishing */ }
}

/**
 * Post to Medium (expects logged-in page)
 * Content Format: HTML
 */
export async function postToMedium(
  page: Page,
  title: string,
  htmlContent: string,
): Promise<{ success: true; postUrl: string; postText: string; postedAt: Date }> {
  // Minimize browser at start — stays minimized throughout
  try {
    const cdpMain = await page.context().newCDPSession(page);
    const { windowId } = await cdpMain.send('Browser.getWindowForTarget');
    await cdpMain.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    await cdpMain.detach().catch(() => {});
  } catch { /* ignore */ }

  // UTM safety net — ensure correct UTMs before posting
  htmlContent = injectUTM(htmlContent, UTM_PARAMS.Medium);
  // Medium re-fetches every pasted <img> src on ITS servers to re-host it; our
  // imagekit/cloudinary URLs fail that fetch, popping a blocking "Uh oh" modal that
  // derails the publish flow (proven: the modal fires even when images are fully
  // loaded locally). So drop images — text-only posts keep every Ken Research link
  // (the SEO goal) and publish reliably. Images on Medium need its own uploader (TODO).
  htmlContent = stripImagesFromHtml(htmlContent);

  console.log('   Navigating to Medium feed...');
  await page.goto('https://medium.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for feed. Generous + one reload retry: on a loaded/headless box the feed
  // sometimes needs >20s, which caused the intermittent "Write button not found".
  let feedReady = false;
  for (let attempt = 0; attempt < 2 && !feedReady; attempt++) {
    try {
      await page.waitForSelector('[data-testid="headerWriteButton"]', { timeout: 30000 });
      feedReady = true;
      console.log('   ✅ Feed loaded');
    } catch {
      console.warn(`   ⏳ Feed load timeout (attempt ${attempt + 1}) — reloading...`);
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }

  // Click "Write" button
  console.log('   Clicking Write button...');
  try {
    await page.waitForSelector('[data-testid="headerWriteButton"]', { timeout: 20000, state: 'visible' });
    await page.click('[data-testid="headerWriteButton"]');
  } catch {
    throw new Error('Write button not found');
  }

  // Wait for new story page
  try {
    await page.waitForURL('**/new-story**', { timeout: 15000 });
    console.log('   New story page opened');
  } catch {
    throw new Error('New story page did not load');
  }

  await page.waitForTimeout(SMALL_DELAY);

  // Fill title — type character by character (no paste)
  console.log('   Typing title...');
  try {
    await page.waitForSelector('[data-testid="editorTitleParagraph"]', { timeout: 25000, state: 'visible' });
    await page.click('[data-testid="editorTitleParagraph"]');
    await page.waitForTimeout(SMALL_DELAY);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(String(title).trim(), { delay: 50 });
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(SMALL_DELAY);
  } catch {
    throw new Error('Title field not found or not writable');
  }

  // Render HTML in temp page → copy to clipboard → paste into Medium editor
  console.log('   Rendering HTML in temp page...');
  try {
    const tempPage = await page.context().newPage();
    try {
      // 'load' waits for images; then explicitly confirm each <img> is done so the
      // clipboard carries loaded bitmaps (matches what makes a human's paste work).
      await tempPage.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await tempPage.waitForTimeout(1500);
      await tempPage.keyboard.press('Control+A');
      await tempPage.waitForTimeout(300);
      await tempPage.keyboard.press('Control+C');
      await tempPage.waitForTimeout(500);
      console.log('   ✅ HTML rendered (text, no images) and copied to clipboard');
    } finally {
      await tempPage.close();
    }
  } catch (err: any) {
    console.warn(`   ⚠️ Could not render/copy HTML: ${err.message}`);
  }

  // Click into the editor body and paste
  console.log('   Clicking paragraph field and pasting...');
  const editorSelectors = [
    '[data-testid="editorParagraphText"]',
    'div.public-DraftEditor-content',
    'div[role="textbox"]',
    '[contenteditable="true"]',
  ];
  let pasted = false;
  for (const selector of editorSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        await page.waitForTimeout(SMALL_DELAY);
        await page.keyboard.press('Control+V');
        await page.waitForTimeout(SMALL_DELAY * 3);
        pasted = true;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!pasted) {
    console.warn('   ⚠️ Could not paste content – continuing anyway');
  }

  // Medium tries to upload any images in the pasted HTML and often fails with a
  // blocking "Uh oh! Something went wrong uploading the image" modal that sits on
  // top of the Publish button. Dismiss it (click OK) — the text content is already
  // in the editor, so publishing without the image is far better than failing.
  await dismissMediumImageError(page);

  // Open the pre-publish flow. Clicking this button NAVIGATES to Medium's
  // /submission settings page (it is not an inline panel), so we wait for that
  // navigation rather than assume the panel appeared in place.
  console.log('   Waiting 2 seconds before clicking Publish...');
  await page.waitForTimeout(2000);
  await dismissMediumImageError(page);
  console.log('   Clicking pre-publish button...');
  try {
    await page.waitForSelector('button[data-action="show-prepublish"], button.js-publishButton', { timeout: 20000, state: 'visible' });
    await Promise.all([
      page.waitForURL('**/submission**', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
      page.click('button[data-action="show-prepublish"], button.js-publishButton'),
    ]);
  } catch {
    throw new Error('Publish button not found');
  }

  // The /submission page is a slow-hydrating SPA — its "Publish" button appears
  // ~6-12s AFTER the page loads (proven via diag on the VPS). Waiting a fixed 3s
  // and giving up was the real bug ("Final Publish button not found" / blank page).
  // Wait for the button to actually exist, generously, instead of a fixed sleep.
  console.log('   Waiting for submission page to hydrate...');
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  console.log('   Clicking final Publish button...');
  try {
    const publishBtn = page.locator('button:has-text("Publish")').first();
    await publishBtn.waitFor({ state: 'visible', timeout: 45000 });
    await page.waitForTimeout(600);
    await publishBtn.click();
  } catch {
    throw new Error('Final Publish button not found (submission page did not render Publish in time)');
  }

  // Wait for success and copy link
  console.log('   Waiting 3 seconds for publish success popup...');
  await page.waitForTimeout(3000);
  console.log('   Clicking Copy Link button...');
  try {
    await page.waitForSelector('[data-testid="publishSuccessCopyLinkButton"]', { timeout: 15000, state: 'visible' });
    await page.click('[data-testid="publishSuccessCopyLinkButton"]');
    await page.waitForTimeout(1000);
  } catch {
    throw new Error('Medium rate limit — cannot post for 24 hr');
  }

  // Read clipboard
  let postUrl = '';
  try {
    postUrl = await page.evaluate(() => navigator.clipboard.readText());
  } catch {
    try {
      postUrl = execSync('powershell -command Get-Clipboard').toString().trim();
    } catch {
      postUrl = page.url();
    }
  }

  console.log(`   ✅ Post published successfully. URL: ${postUrl}`);
  return {
    success: true,
    postUrl,
    postText: htmlContent,
    postedAt: new Date(),
  };
}
