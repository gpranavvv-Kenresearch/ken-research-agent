import { Page } from 'playwright';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function postToAmeba(
  page: Page,
  title: string,
  htmlContent: string,
): Promise<{ success: boolean; postUrl?: string; error?: string; postedAt?: Date }> {
  // Minimize browser
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    await cdp.detach().catch(() => {});
  } catch { /* ignore */ }

  htmlContent = injectUTM(htmlContent, UTM_PARAMS.Ameba);

  // Step 1: Navigate directly to composer
  console.log('   Navigating to Ameba composer...');
  await page.goto('https://blog.ameba.jp/ucs/entry/srventryinsertinput.do', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);

  // If a previous session left an unsaved draft (e.g. a prior run that didn't
  // finish cleanly), Ameba shows a "restore draft?" modal that blocks every
  // click on the page underneath it, including the title field — confirmed
  // live as the actual cause of a hang here. Always start a fresh post rather
  // than restoring whatever was left over.
  const restoreModal = page.locator('.p-restore-modal').first();
  if (await restoreModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('   Dismissing "restore draft?" modal...');
    await page.locator('button.js-restoreModal-cancel').first().click({ timeout: 5000 }).catch(() => {});
    await sleep(1000);
  }

  // Step 2: Fill title
  console.log('   Filling title...');
  // The most common failure here (39x on a single recent day) is a generic
  // "Timeout 15000ms exceeded waiting for locator('input[name=\"entry_title\"]')"
  // with no further context. login.ts's "already logged in" check is a bare URL
  // substring test (it even has a `// TODO: Update logged-in check with correct
  // selector` left in it) that can't detect a session that LOOKS like ameba.jp
  // but isn't actually authenticated any more — so a dead session sails past
  // login and only fails here, silently, once we're on the composer page that
  // never loads because we got bounced to a login/signin page instead. Detect
  // that redirect explicitly so the error says "dead session" instead of a bare
  // Playwright timeout that's indistinguishable from a real DOM/selector change.
  if (/\/(login|signin)(\/|$|\?)/i.test(page.url())) {
    throw new Error(`Ameba session appears dead — composer navigation redirected to ${page.url()} instead of the entry editor. Re-login required.`);
  }
  await page.waitForSelector('input[name="entry_title"]', { timeout: 15000 });
  await page.click('input[name="entry_title"]');
  await sleep(2000);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(title.slice(0, 48), { delay: 60 });
  await sleep(500);

  // Step 3: Inject content directly into CKEditor body (lives inside an iframe)
  console.log('   Injecting content into editor...');
  try {
    // Locate the CKEditor iframe
    let editorFrame =
      page.frames().find(f => f.name().includes('cke_') || f.url().includes('cke_')) || null;
    if (!editorFrame) {
      const frameHandle = await page.waitForSelector(
        'iframe.cke_wysiwyg_frame, iframe[title*="editor"], iframe[id*="cke_"]',
        { timeout: 15000 }
      ).catch(() => null);
      if (frameHandle) editorFrame = await frameHandle.contentFrame();
    }

    if (!editorFrame) throw new Error('CKEditor iframe not found');

    await editorFrame.waitForSelector('body.cke_editable[contenteditable="true"]', { timeout: 10000 });
    await editorFrame.click('body.cke_editable[contenteditable="true"]');
    await sleep(800);

    // Set HTML directly on the contenteditable body and fire input event so CKEditor syncs
    await editorFrame.evaluate((html) => {
      const body = document.querySelector<HTMLBodyElement>('body.cke_editable[contenteditable="true"]');
      if (!body) return;
      body.innerHTML = html;
      body.dispatchEvent(new Event('input',  { bubbles: true }));
      body.dispatchEvent(new Event('change', { bubbles: true }));
      body.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }, htmlContent);

    await sleep(2000);

    // Verify
    const filled = await editorFrame.evaluate(() => {
      const body = document.querySelector('body.cke_editable[contenteditable="true"]');
      return !!body && (body.innerHTML || '').replace(/<p><br><\/p>/g, '').trim().length > 0;
    });
    if (!filled) {
      console.warn('   ⚠️ innerHTML inject reported empty — falling back to clipboard paste...');
      const tempPage = await page.context().newPage();
      try {
        await tempPage.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await tempPage.waitForTimeout(1500);
        await tempPage.keyboard.press('Control+A');
        await tempPage.waitForTimeout(200);
        await tempPage.keyboard.press('Control+C');
        await tempPage.waitForTimeout(500);
      } finally {
        await tempPage.close();
      }
      await editorFrame.click('body.cke_editable[contenteditable="true"]');
      await sleep(800);
      await editorFrame.evaluate(() => {
        const sel = window.getSelection();
        const body = document.querySelector('body.cke_editable[contenteditable="true"]');
        if (sel && body) {
          const range = document.createRange();
          range.selectNodeContents(body);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
      await page.keyboard.press('Control+V');
      await sleep(2000);
    }

    console.log('   ✅ Content injected into editor');
  } catch (err: any) {
    console.warn(`   ⚠️ Could not inject content: ${err.message}`);
  }

  // Step 4: Fill SEO title if available
  console.log('   Filling SEO title...');
  await page.evaluate(() => window.scrollBy(0, 600));
  await sleep(1000);
  try {
    const seoTitle = page.locator('#meta_title').first();
    if (await seoTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await seoTitle.click({ delay: 100 });
      await sleep(2000);
      await page.keyboard.press('Control+A');
      await page.keyboard.type(title.slice(0, 48), { delay: 60 });
      await sleep(500);
    }
  } catch (err: any) {
    console.warn(`   ⚠️ Could not fill SEO title: ${err.message}`);
  }

  // Helper: click Publish on the editor page
  const clickPublish = async () => {
    const ok = await page.evaluate(() => {
      // Prefer the exact publish button: js-submitButton with publishflg="0"
      const exact =
        document.querySelector<HTMLElement>('button.js-submitButton[publishflg="0"]') ||
        document.querySelector<HTMLElement>('button.p-submit__button.js-submitButton') ||
        document.querySelector<HTMLElement>('button.js-submitButton');
      if (exact) { exact.scrollIntoView({ block: 'center' }); exact.click(); return true; }
      const fallback =
        document.querySelector<HTMLElement>('input[name="submit"][type="submit"]') ||
        document.querySelector<HTMLElement>('button[type="submit"]') ||
        (Array.from(document.querySelectorAll('button, input[type="submit"]')) as HTMLElement[])
          .find(el => /公開|投稿|post|publish|submit/i.test(el.textContent || (el as HTMLInputElement).value || ''));
      if (fallback) { fallback.scrollIntoView({ block: 'center' }); fallback.click(); return true; }
      return false;
    }).catch(() => false);
    if (!ok) {
      await page.locator(
        'button.js-submitButton[publishflg="0"], button.js-submitButton, button[type="submit"], input[type="submit"]'
      ).first().click({ force: true, delay: 150 }).catch(() => {});
    }
  };

  // Step 5: Publish click — opens the success tab with copy-link button
  console.log('   Clicking Publish...');
  const popupPromise = page.context().waitForEvent('page', { timeout: 20000 }).catch(() => null);
  await clickPublish();

  // Ameba shows a "CoverConfirmModal" ("Let's try setting the cover") after the
  // Post click whenever no cover image was set — the actual publish request never
  // fires until "Post without cover" is clicked. Confirmed live: without this, the
  // Post button click is a no-op from the server's perspective (no request ever
  // reaches srventryinsertend.do), which is why publish silently produced nothing.
  let dismissedCoverModal = false;
  for (let attempt = 0; attempt < 8 && !dismissedCoverModal; attempt++) {
    await sleep(1000);
    dismissedCoverModal = await page.evaluate(() => {
      const modal = document.querySelector('[class*="CoverConfirmModal"]');
      if (!modal) return false;
      const root = modal.closest('[class*="ucsCommonModal"]') || modal;
      const btn = Array.from(root.querySelectorAll('button')).find(
        b => /post without cover/i.test((b.textContent || '').trim())
      ) as HTMLButtonElement | undefined;
      if (!btn) return false;
      btn.click();
      return true;
    }).catch(() => false);
  }
  console.log(`   Cover-modal dismissal attempted — dismissed: ${dismissedCoverModal}`);

  const successPopup = await popupPromise;
  if (successPopup) {
    await successPopup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    console.log('   Success popup opened — looking for copy-link button');
  } else {
    console.warn('   ⚠️ No popup opened after publish click');
  }
  await sleep(3000);

  // Step 7: Find the "copy link" button on the success popup (fallback to any live page)
  let postUrl = '';
  const candidates: Page[] = [
    ...(successPopup ? [successPopup] : []),
    ...page.context().pages(),
  ];
  for (const p of candidates) {
    try {
      if (p.isClosed()) continue;
      const btn = p.locator('button.entryComplete__shareLink--copy').first();
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        const onclick = await btn.getAttribute('onclick');
        const m = onclick?.match(/['"](https?:\/\/[^'"]+)['"]/);
        if (m) { postUrl = m[1]; break; }
      }
    } catch { /* try next */ }
  }

  // Fallbacks — try canonical / URL on any live page. Both of these still
  // require a URL that actually looks like a specific blog entry — a bare
  // domain (e.g. the Ameba homepage) is not evidence a post was created.
  if (!postUrl) {
    for (const p of page.context().pages()) {
      if (p.isClosed()) continue;
      const canonical = await p.$eval('link[rel="canonical"]', el => el.getAttribute('href') ?? '').catch(() => '');
      if (canonical && /entry-\d+/.test(canonical)) { postUrl = canonical; break; }
      const u = p.url();
      if (u && u.includes('ameblo.jp/') && /entry-\d+/.test(u)) { postUrl = u; break; }
    }
  }

  // No real entry URL found anywhere (no popup, no canonical, no matching page
  // URL) — this is NOT a success. Returning `success: true` with a placeholder
  // like the bare homepage was a false positive: the sheet would mark the row
  // "Posted" with nothing actually published. Report failure instead so the
  // row gets retried.
  if (!postUrl) {
    const msg = 'Could not confirm a real post URL after publishing (no success popup, no matching canonical/page URL)';
    console.warn(`   ❌ Ameba post not confirmed: ${msg}`);
    return { success: false, error: msg };
  }

  console.log(`   ✅ Posted to Ameba: ${postUrl}`);
  return { success: true, postUrl, postedAt: new Date() };
}
