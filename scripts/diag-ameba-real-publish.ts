import 'dotenv/config';
import { loginToAmeba, closeAmebaBrowser } from '../src/browser/ameba/login.js';

async function main() {
  const nickname = process.argv[2] || 'abhinav 1';
  const page = await loginToAmeba({ nickname });

  await page.goto('https://blog.ameba.jp/ucs/entry/srventryinsertinput.do', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const restoreModal = page.locator('.p-restore-modal').first();
  if (await restoreModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator('button.js-restoreModal-cancel').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  page.on('dialog', async (dialog) => {
    console.log('!!! DIALOG APPEARED:', dialog.type(), '-', dialog.message());
    await dialog.accept();
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE CONSOLE ERROR:', msg.text());
  });

  await page.click('input[name="entry_title"]');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Diag real publish test', { delay: 50 });
  await page.waitForTimeout(500);

  console.log('Filling body content via CKEditor iframe...');
  try {
    let editorFrame = page.frames().find(f => f.name().includes('cke_') || f.url().includes('cke_')) || null;
    if (!editorFrame) {
      const frameHandle = await page.waitForSelector('iframe.cke_wysiwyg_frame, iframe[title*="editor"], iframe[id*="cke_"]', { timeout: 15000 }).catch(() => null);
      if (frameHandle) editorFrame = await frameHandle.contentFrame();
    }
    if (editorFrame) {
      await editorFrame.waitForSelector('body.cke_editable[contenteditable="true"]', { timeout: 10000 });
      await editorFrame.click('body.cke_editable[contenteditable="true"]');
      await page.keyboard.type('Test body content for diagnostic run.', { delay: 20 });
      await page.waitForTimeout(1000);
      const filled = await editorFrame.evaluate(() => {
        const body = document.querySelector('body.cke_editable[contenteditable="true"]');
        return !!body && (body.innerHTML || '').replace(/<p><br><\/p>/g, '').trim().length > 0;
      });
      console.log('Body content filled:', filled);
    } else {
      console.log('No editor iframe found!');
    }
  } catch (err: any) {
    console.log('Body fill error:', err.message);
  }

  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1000);

  page.on('request', (req) => {
    if (/entryinsert|srventry/i.test(req.url())) {
      console.log('>>> REQUEST:', req.method(), req.url());
      const pd = req.postData();
      if (pd) console.log('    postData:', pd.slice(0, 500));
    }
  });
  page.on('response', (res) => {
    if (/entryinsert|srventry/i.test(res.url())) {
      console.log('<<< RESPONSE:', res.status(), res.url());
    }
  });
  page.on('requestfailed', (req) => {
    console.log('!!! REQUEST FAILED:', req.url(), req.failure()?.errorText);
  });

  console.log('Setting up popup listener BEFORE clicking...');
  const popupPromise = page.context().waitForEvent('page', { timeout: 20000 }).catch((e) => { console.log('popup wait error:', e.message); return null; });

  const btnInfo = await page.evaluate(() => {
    const btn = document.querySelector('button.js-submitButton[publishflg="0"]') as HTMLButtonElement | null;
    if (!btn) return null;
    return { disabled: btn.disabled, cls: btn.className, text: btn.textContent?.trim() };
  });
  console.log('Button state before click:', JSON.stringify(btnInfo));

  // Check for a required category — Ameba often blocks publish silently if no category is selected
  const categoryInfo = await page.evaluate(() => {
    const catEls = Array.from(document.querySelectorAll('[class*="categor"], [name*="categor"], [id*="categor"]'));
    return catEls.slice(0, 10).map(el => ({
      tag: el.tagName,
      cls: el.className,
      checked: (el as HTMLInputElement).checked,
      value: (el as HTMLInputElement).value,
    }));
  });
  console.log('Category-related elements:', JSON.stringify(categoryInfo));

  console.log('Clicking the real Post button via TRUSTED Playwright click (not JS .click())...');
  const publishBtn = page.locator('button.js-submitButton[publishflg="0"]').first();
  await publishBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await publishBtn.click({ delay: 100, timeout: 10000 });
  console.log('Click result: TRUSTED_CLICK_SENT');

  await page.waitForTimeout(1500);
  const modalInfo = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('[class*="modal" i], [class*="popup" i], [class*="appeal" i], [class*="dialog" i], [role="dialog"]'));
    return candidates.map(el => {
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        cls: el.className,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && (el as HTMLElement).offsetParent !== null,
        zIndex: style.zIndex,
        text: (el.textContent || '').trim().slice(0, 100),
      };
    }).filter(x => x.visible);
  });
  console.log('Visible modal/popup elements after click:', JSON.stringify(modalInfo, null, 2));
  await page.screenshot({ path: '/tmp/ameba-after-click-modal-check.png', fullPage: true }).catch(() => {});

  // The CoverConfirmModal appeared — dump every button inside it so we can find the
  // "publish anyway / without cover" action (as opposed to the close/cancel button).
  const coverModalButtons = await page.evaluate(() => {
    const modal = document.querySelector('.CoverConfirmModal__body, [class*="CoverConfirmModal"]');
    if (!modal) return 'NO_MODAL_FOUND';
    const root = modal.closest('[class*="ucsCommonModal"]') || modal;
    const btns = Array.from(root.querySelectorAll('button, a[role="button"], [class*="Button"]'));
    return btns.map(b => ({
      tag: b.tagName,
      cls: b.className,
      text: (b.textContent || '').trim().slice(0, 60),
    }));
  });
  console.log('CoverConfirmModal buttons:', JSON.stringify(coverModalButtons, null, 2));

  if (coverModalButtons !== 'NO_MODAL_FOUND') {
    // Try clicking whichever button looks like "continue/post without cover" (not the close X)
    const clickedContinue = await page.evaluate(() => {
      const modal = document.querySelector('.CoverConfirmModal__body, [class*="CoverConfirmModal"]');
      if (!modal) return 'NO_MODAL';
      const root = modal.closest('[class*="ucsCommonModal"]') || modal;
      const btns = Array.from(root.querySelectorAll('button')) as HTMLElement[];
      const target = btns.find(b => /post without cover/i.test((b.textContent || '').trim()));
      if (target) { target.click(); return 'CLICKED:' + (target.textContent || '').trim(); }
      return 'NO_MATCHING_BUTTON:' + JSON.stringify(btns.map(b => (b.textContent || '').trim()));
    });
    console.log('Cover modal continue-click result:', clickedContinue);
  }

  const popup = await popupPromise;
  console.log('Popup opened:', !!popup);

  await page.waitForTimeout(6000);
  console.log('Main page URL:', page.url());
  await page.screenshot({ path: '/tmp/ameba-after-real-publish.png', fullPage: true });

  if (popup) {
    console.log('Popup URL:', popup.url());
    await popup.screenshot({ path: '/tmp/ameba-popup.png', fullPage: true }).catch((e) => console.log('popup screenshot err:', e.message));
  }

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('--- main page body text ---');
  console.log(bodyText);

  await closeAmebaBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
