import { Page } from 'playwright';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';

const SMALL_DELAY = 500;

/**
 * Post to LinkedIn Pulse (LinkedIn Articles)
 * Expects already-logged-in page from loginToLinkedInPulse()
 * Content Format: HTML
 */
export async function postToLinkedinPulse(
  page: Page,
  title: string,
  htmlContent: string,
  seoTitle?: string,
  seoDescription?: string,
  shareCaption?: string
): Promise<{ success: true; postUrl: string; postedAt: Date }> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const randomDelay = async (min = 800, max = 2200) => {
    await sleep(Math.floor(Math.random() * (max - min + 1)) + min);
  };

  // Minimize browser at start — stays minimized throughout
  try {
    const cdpMain = await page.context().newCDPSession(page);
    const { windowId } = await cdpMain.send('Browser.getWindowForTarget');
    await cdpMain.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    await cdpMain.detach().catch(() => {});
  } catch { /* ignore */ }

  // UTM safety net — ensure correct UTMs before posting
  htmlContent = injectUTM(htmlContent, UTM_PARAMS.LinkedIn);

  try {
    console.log('   Navigating to LinkedIn article composer...');
    await page.goto('https://www.linkedin.com/article/new/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Fill Title
    console.log('   Filling article title...');
    await page.waitForSelector('#article-editor-headline__textarea', { timeout: 20000 }).catch(() => {});
    const titleField = page.locator('#article-editor-headline__textarea').first();

    if (await titleField.isVisible().catch(() => false)) {
      await titleField.click({ delay: 150 });
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Delete').catch(() => {});
      await randomDelay(200, 400);
      await page.keyboard.insertText(title);
      await randomDelay(600, 1000);
    }

    // Paste Body — render HTML in temp page → copy → paste into editor
    console.log('   Pasting article body...');
    try {
      const bodyField = page.locator('p.article-editor-paragraph[aria-label*="Write here"]').first();
      if (await bodyField.isVisible().catch(() => false)) {
        // Render HTML in a temp page and copy to clipboard
        const tempPage = await page.context().newPage();
        try {
          await tempPage.setContent(htmlContent, { waitUntil: 'networkidle', timeout: 20000 }).catch(() =>
            tempPage.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 10000 })
          );
          await tempPage.waitForTimeout(5000);
          await tempPage.keyboard.press('Control+A');
          await tempPage.waitForTimeout(300);
          await tempPage.keyboard.press('Control+C');
          await tempPage.waitForTimeout(500);
        } finally {
          await tempPage.close();
        }

        await bodyField.click({ delay: 200 }).catch(() => {});
        await randomDelay(400, 700);
        await page.keyboard.press('Control+V');
        await sleep(6000);
      }
    } catch (err) {
      console.warn(`   ⚠️ Could not paste body: ${(err as any).message}`);
    }

    // Fill SEO Fields via Manage > Settings
    if (seoTitle || seoDescription) {
      console.log('   Filling SEO fields...');
      try {
        const manageBtn = page.locator('button[aria-label="Manage menu"], button:has-text("Manage")').first();
        if (await manageBtn.isVisible().catch(() => false)) {
          await manageBtn.click({ delay: 180 }).catch(() => {});
          await randomDelay(1000, 1500);

          const settingsItem = page.locator('div[role="button"]:has-text("Settings")').first();
          if (await settingsItem.isVisible().catch(() => false)) {
            await settingsItem.click({ delay: 160 }).catch(() => {});
            await randomDelay(1500, 2000);

            // Fill SEO Title
            const seoTitleInput = page.locator('input[name="seoTitle"]').first();
            if (await seoTitleInput.isVisible().catch(() => false) && seoTitle) {
              await seoTitleInput.click({ delay: 120 });
              await page.keyboard.press('Control+A').catch(() => {});
              await page.keyboard.press('Delete').catch(() => {});
              await page.keyboard.insertText(seoTitle);
              await randomDelay(400, 600);
            }

            // Fill SEO Description
            const seoDescInput = page.locator('textarea[name="seoDescription"]').first();
            if (await seoDescInput.isVisible().catch(() => false) && seoDescription) {
              await seoDescInput.click({ delay: 120 });
              await page.keyboard.press('Control+A').catch(() => {});
              await page.keyboard.press('Delete').catch(() => {});
              await page.keyboard.insertText(seoDescription);
              await randomDelay(400, 600);
            }

            // Save SEO settings
            const saveBtn = page.locator('button.artdeco-button--primary:has-text("Save")').first();
            if (await saveBtn.isVisible().catch(() => false)) {
              await saveBtn.click({ delay: 150 }).catch(() => {});
              await randomDelay(1200, 1600);
            }
          }
        }
      } catch (err) {
        console.warn(`   ⚠️ Could not fill SEO fields: ${(err as any).message}`);
      }
    }

    // Minimize inline image if present (blocks Next button)
    console.log('   Checking for inline image to minimize...');
    try {
      const minimizeBtn = page.locator('button[data-test-resize-image-button="true"], button[aria-label="Minimize image"]').first();
      if (await minimizeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('   Detected inline image — minimizing...');
        await minimizeBtn.click({ delay: 150 }).catch(() => {});
        await randomDelay(800, 1200);
      }
    } catch { /* ignore */ }

    // Click NEXT
    console.log('   Clicking Next...');
    const nextBtn = page.locator('button:has-text("Next")').first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click({ delay: 150 }).catch(() => {});
      await randomDelay(1200, 1800);
    }

    // Wait for Share Box & Paste Description
    console.log('   Waiting for share box...');
    await page.waitForSelector('div[role="textbox"][data-placeholder*="Tell your network"]', { timeout: 15000 }).catch(() => {});

    const shareBox = page.locator('div[role="textbox"][data-placeholder*="Tell your network"]').first();
    const shareText = shareCaption || seoDescription;
    if (await shareBox.isVisible().catch(() => false) && shareText) {
      await shareBox.click({ delay: 120 }).catch(() => {});
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Delete').catch(() => {});
      await randomDelay(200, 400);

      await page.keyboard.insertText(shareText);
      await randomDelay(800, 1200);
    }

    // Debug capture — the failure mode we're chasing (session dies somewhere
    // in this sequence, final page ends up on /login) has no visible evidence
    // once it's happened; screenshot + URL at each checkpoint pins down WHEN
    // in the sequence it actually happens instead of guessing from the end
    // state. Never throws — diagnostics must not break the real flow.
    const debugId = `${Date.now()}`;
    async function snapshot(label: string): Promise<void> {
      try {
        const url = page.url();
        console.log(`   [debug:${label}] url=${url}`);
        await page.screenshot({ path: `/tmp/li-pulse-debug-${debugId}-${label}.png` }).catch(() => {});
      } catch { /* best-effort */ }
    }

    // Click PUBLISH Button
    console.log('   Clicking Publish...');
    await snapshot('before-publish-click');
    const publishBtn = page.locator('button.share-actions__primary-action.artdeco-button--primary, button:has-text("Publish")').first();
    if (await publishBtn.isVisible().catch(() => false)) {
      await publishBtn.click({ delay: 150 }).catch(() => {});
      await randomDelay(1500, 2200);
    } else {
      // Fallback: try pressing Enter
      try {
        await page.keyboard.press('Enter').catch(() => {});
      } catch (_) {
        /* ignore */
      }
    }
    await snapshot('right-after-publish-click');

    // Click "Get the link to this article" to capture the /pulse/ URL
    console.log('   Waiting for post-publish modal...');
    await page.waitForTimeout(5000);
    await snapshot('after-5s-wait');

    let finalUrl = '';
    try {
      const getLinkBtn = page.locator('button.post-publish-modal__get-link-button, button:has(span:has-text("Get the link to this article"))').first();
      const getLinkVisible = await getLinkBtn.isVisible({ timeout: 8000 }).catch(() => false);
      console.log(`   [debug] get-link-button visible: ${getLinkVisible}`);
      if (getLinkVisible) {
        await getLinkBtn.click({ delay: 150 }).catch(() => {});
        console.log('   Clicked Get the link to this article');
        await page.waitForTimeout(2000);

        // Click the Copy button in the link modal — this is the only source of truth for the /pulse/ URL
        const copyBtn = page.locator('button:has-text("Copy"), button[aria-label*="Copy"], button.share-box-send-link__copy-button').last();
        if (await copyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await copyBtn.click({ delay: 150 }).catch(() => {});
          console.log('   Clicked Copy button in link modal');
          await page.waitForTimeout(1000);
        }

        // Read URL from clipboard (populated by the Copy button above)
        finalUrl = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        console.log(`   Clipboard URL: ${finalUrl}`);
      }
    } catch (err) {
      console.warn(`   ⚠️ Could not get article link: ${(err as any).message}`);
    }
    await snapshot('after-get-link-attempt');

    // Fallback — read from page meta (never use address bar)
    if (!finalUrl || !finalUrl.includes('/pulse/')) {
      finalUrl = await page.$eval('link[rel="canonical"]', el => el.getAttribute('href') ?? '').catch(() => '');
    }
    if (!finalUrl || !finalUrl.includes('/pulse/')) {
      finalUrl = await page.$eval('meta[property="og:url"]', el => el.getAttribute('content') ?? '').catch(() => '');
    }

    // A garbage URL (login page, homepage, whatever the browser happened to
    // land on) is not a successful post — confirmed live: this returned
    // success:true with postUrl "linkedin.com/login" while the account's
    // session had actually been killed mid-flow. Never report success
    // without a real /pulse/ URL as proof.
    if (!finalUrl.includes('/pulse/')) {
      console.log(`   ❌ No real article URL captured (got: "${finalUrl}") — session likely died mid-publish, not a real success. Debug screenshots: /tmp/li-pulse-debug-${debugId}-*.png`);
      throw new Error(`LinkedIn Pulse did not return a real /pulse/ article URL (got "${finalUrl}" instead) — session was likely killed mid-publish`);
    }

    console.log(`   ✅ Article published. URL: ${finalUrl}`);

    return {
      success: true,
      postUrl: finalUrl,
      postedAt: new Date(),
    };
  } catch (err: any) {
    throw new Error(`LinkedIn Pulse posting failed: ${err.message}`);
  }
}
