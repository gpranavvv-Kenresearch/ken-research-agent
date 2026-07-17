import { Page } from 'playwright';
import { injectUTM, UTM_PARAMS } from '../../utils/utm.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function postToNotion(
  page: Page,
  title: string,
  htmlContent: string,
): Promise<{ success: true; postUrl: string; postedAt: Date }> {
  htmlContent = injectUTM(htmlContent, UTM_PARAMS.Notion);

  // Maximize window
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
    await cdp.detach().catch(() => {});
  } catch { /* ignore */ }

  // Steps 1–3: Navigate straight to the new-page URL and confirm we actually
  // landed on a page (URL contains /p/{id}), instead of clicking the sidebar
  // "New page" button/menu — the click flow was unreliable and could hang
  // the whole batch when Notion's UI didn't respond as expected.
  const NOTION_NEW_PAGE_URL = 'https://app.notion.com/new';
  const PAGE_SLUG_RE = /\/p\/[a-zA-Z0-9-]{6,}/;
  const MAX_NEW_PAGE_ATTEMPTS = 3;
  let newPageFlowDone = false;

  for (let attempt = 0; attempt < MAX_NEW_PAGE_ATTEMPTS; attempt++) {
    console.log(`   Navigating to ${NOTION_NEW_PAGE_URL} (attempt ${attempt + 1})...`);
    try {
      await page.goto(NOTION_NEW_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch { /* timeout ok, check URL below */ }

    if (page.url().includes('/login') || page.url().includes('/sign-in')) {
      throw new Error('Notion not logged in — manual login required');
    }

    // Wait up to 8s for the URL to settle on a real page slug (/p/{id})
    let slugConfirmed = PAGE_SLUG_RE.test(page.url());
    for (let tick = 0; !slugConfirmed && tick < 8; tick++) {
      await sleep(1000);
      slugConfirmed = PAGE_SLUG_RE.test(page.url());
    }

    if (slugConfirmed) {
      console.log(`   ✅ Landed on new page: ${page.url()}`);
      newPageFlowDone = true;
      break;
    }
    console.warn(`   ⚠️ Did not land on a /p/ page after attempt ${attempt + 1} (url: ${page.url()}) — redirecting back to ${NOTION_NEW_PAGE_URL}`);
  }

  if (!newPageFlowDone) {
    throw new Error(`Notion: could not create a new page after ${MAX_NEW_PAGE_ATTEMPTS} attempts at ${NOTION_NEW_PAGE_URL} — aborting instead of proceeding into a broken state`);
  }
  await sleep(2000);

  // Step 4: Wait for title field, then type
  console.log('   Waiting for title field...');
  const TITLE_SEL = 'h1[placeholder="New page"][contenteditable="true"]';
  const TITLE_SEL_ALT = '[role="textbox"][aria-roledescription="page title"]';
  let titleFilled = false;
  try {
    await page.waitForSelector(`${TITLE_SEL}, ${TITLE_SEL_ALT}`, { timeout: 10000 });
    const titleEl = page.locator(`${TITLE_SEL}, ${TITLE_SEL_ALT}`).first();
    await titleEl.click();
    await sleep(2000);
    await page.keyboard.insertText(String(title).trim());
    await sleep(5000);
    await page.keyboard.press('Enter');
    titleFilled = true;
    console.log('   ✅ Title typed');
  } catch {
    await page.evaluate((t: string) => {
      const tb = document.querySelector<HTMLElement>('[aria-roledescription="page title"], h1[contenteditable="true"]');
      if (tb) { tb.focus(); document.execCommand('selectAll', false, undefined); document.execCommand('insertText', false, t); }
    }, String(title).trim());
    await page.keyboard.press('Enter');
    console.warn('   ⚠️ Used JS execCommand for title');
  }
  await sleep(2000);

  // Step 5: Render HTML in temp page → copy to clipboard → paste into Notion body
  console.log('   Rendering HTML in temp page and copying...');
  try {
    const tempPage = await page.context().newPage();
    try {
      await tempPage.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await tempPage.waitForTimeout(2000);
      await tempPage.keyboard.press('Control+A');
      await tempPage.waitForTimeout(500);
      await tempPage.keyboard.press('Control+C');
      await tempPage.waitForTimeout(500);
      console.log('   ✅ HTML rendered and copied');
    } finally {
      await tempPage.close();
    }
  } catch (err: any) {
    console.warn(`   ⚠️ Could not render/copy HTML: ${err.message}`);
  }
  await sleep(2000);

  // Click body area and paste
  console.log('   Clicking body area...');
  const bodyEl = page.locator('div[data-content-editable-leaf="true"][contenteditable="true"]').last();
  await bodyEl.click({ timeout: 5000 }).catch(async () => {
    await page.mouse.click(640, 450);
    console.warn('   ⚠️ Used mouse click for body');
  });
  await sleep(2000);
  await page.keyboard.press('Control+V');
  console.log('   ✅ Content pasted');
  await sleep(2000);

  const draftUrl = page.url();

  // Step 6: Open Share panel
  console.log('   Opening Share panel...');
  let shareOpened = false;
  const shareSelectors = [
    'button:has-text("Share")',
    '[aria-label="Share"]',
    'button[data-testid="share-button"]',
  ];
  for (const sel of shareSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
      try {
        await el.click({ timeout: 8000 });
        shareOpened = true;
        console.log(`   ✅ Share panel opened (${sel})`);
      } catch {
        // isVisible() passed but the real click timed out — something is
        // covering the button (toast/overlay) or it isn't fully stable yet.
        // Fall back to a JS click, same pattern used below for Publish.
        shareOpened = await page.evaluate((s: string) => {
          const el = document.querySelector<HTMLElement>(s);
          if (el) { el.click(); return true; }
          return false;
        }, sel).catch(() => false);
        if (shareOpened) console.log(`   ✅ Share panel opened via JS click (${sel})`);
      }
      if (shareOpened) break;
    }
  }
  if (!shareOpened) {
    console.warn('   ⚠️ Share button not found — using draft URL');
    return { success: true, postUrl: draftUrl, postedAt: new Date() };
  }
  await sleep(2000);

  // Step 7: Set General access to "Anyone on the web with link"
  console.log('   Setting general access...');
  try {
    const accessDropdown = page.locator('[role="button"]:has-text("Only people invited"), [role="button"]:has-text("No access")').first();
    if (await accessDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accessDropdown.click({ force: true });
      await sleep(2000);
      const anyoneOpt = page.locator('div:has-text("Anyone on the web with link")').last();
      if (await anyoneOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
        await anyoneOpt.click({ force: true });
        console.log('   ✅ General access set to anyone with link');
        await sleep(2000);
      }
    }
  } catch { /* non-fatal */ }

  // Step 8: Click Publish tab
  console.log('   Clicking Publish tab...');
  let publishTabClicked = false;
  const publishTab = page.locator('[role="tab"]:has-text("Publish"), button:has-text("Publish to web")').first();
  if (await publishTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await publishTab.click({ force: true });
    publishTabClicked = true;
    console.log('   ✅ Publish tab clicked');
    await sleep(2000);
  }
  if (!publishTabClicked) {
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
      const t = tabs.find(t => t.textContent?.trim() === 'Publish');
      t?.click();
    });
    console.warn('   ⚠️ Used JS click for Publish tab');
    await sleep(2000);
  }

  // Step 9: Click blue Publish button
  console.log('   Clicking blue Publish button...');
  let published = false;
  try {
    published = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll<HTMLElement>('*'));
      const btn = all.find(el =>
        el.textContent?.trim() === 'Publish' &&
        (el as HTMLElement).offsetParent !== null &&
        el.closest('[role="tab"]') === null &&
        (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.closest('button') !== null)
      );
      const target = btn?.closest('button') || btn as HTMLElement;
      if (target) { target.click(); return true; }
      return false;
    });
    if (published) console.log('   ✅ Published to Notion web');
  } catch { /* non-fatal */ }
  await sleep(2000);

  // Step 9b: Click "Search engine indexing" row
  console.log('   Clicking Search engine indexing row...');
  let seiClicked = false;
  try {
    // Try text-based selector first (most reliable)
    const byText = page.locator('div[role="presentation"]:has-text("Search engine indexing")').first();
    if (await byText.isVisible({ timeout: 4000 }).catch(() => false)) {
      await byText.click({ force: true });
      seiClicked = true;
      console.log('   ✅ Clicked via text "Search engine indexing"');
    }
  } catch { /* try next */ }

  if (!seiClicked) {
    try {
      const byMenuitem = page.locator('div[role="menuitem"]').first();
      await byMenuitem.waitFor({ state: 'visible', timeout: 4000 });
      await byMenuitem.click({ force: true });
      seiClicked = true;
      console.log('   ✅ Clicked via role="menuitem"');
    } catch (err: any) {
      console.warn(`   ⚠️ Search engine indexing row not found: ${err.message}`);
    }
  }
  await sleep(2000);

  // Step 9c: Click the toggle switch
  console.log('   Clicking Search engine indexing toggle...');
  try {
    const toggle = page.locator('input[type="checkbox"][role="switch"]').first();
    await toggle.waitFor({ state: 'attached', timeout: 5000 });
    await toggle.click({ force: true });
    console.log('   ✅ Toggle switch clicked');
  } catch (err: any) {
    console.warn(`   ⚠️ Toggle switch not found: ${err.message}`);
  }
  await sleep(2000);

  // Step 10: Copy published link
  console.log('   Copying public link...');
  let publicUrl = draftUrl;
  try {
    const copyLinkSelectors = [
      '[aria-label="Copy link"]',
      'button[aria-label*="copy" i]',
      'button:has-text("Copy link")',
      'button:has-text("Copy web link")',
    ];
    let linkCopied = false;
    for (const sel of copyLinkSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click({ force: true });
        linkCopied = true;
        break;
      }
    }
    if (!linkCopied) {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll<HTMLElement>('button'));
        const btn = btns.find(b =>
          (b.getAttribute('aria-label') || '').toLowerCase().includes('copy') ||
          b.textContent?.toLowerCase().includes('copy link')
        );
        btn?.click();
      });
    }
    await sleep(2000);

    try {
      publicUrl = await page.evaluate(() => navigator.clipboard.readText());
    } catch {
      const { execSync } = await import('child_process');
      publicUrl = execSync('powershell -command Get-Clipboard').toString().trim();
    }
    if (publicUrl && publicUrl.includes('notion')) {
      console.log(`   ✅ Public URL from clipboard: ${publicUrl}`);
    } else {
      publicUrl = draftUrl;
    }
  } catch (err: any) {
    console.warn(`   ⚠️ Copy link failed: ${err.message}`);
    publicUrl = draftUrl;
  }

  await page.keyboard.press('Escape').catch(() => {});
  console.log(`   ✅ Notion page URL: ${publicUrl}`);
  return { success: true, postUrl: publicUrl, postedAt: new Date() };
}
