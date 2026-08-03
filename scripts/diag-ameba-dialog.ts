import 'dotenv/config';
import { loginToAmeba, closeAmebaBrowser } from '../src/browser/ameba/login.js';

async function main() {
  const nickname = process.argv[2] || 'abhinav 1';
  const page = await loginToAmeba({ nickname });

  // The login code launches with --start-minimized (by design, so it doesn't
  // disturb the shared screen during normal automated runs) — un-minimize it
  // just for this one watch-it-live diagnostic run.
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: 1280, height: 900 } });
    await cdp.detach().catch(() => {});
    console.log('Window un-minimized for viewing.');
  } catch (e: any) {
    console.log('Could not un-minimize window:', e.message);
  }

  page.on('dialog', async (dialog) => {
    console.log('!!! DIALOG APPEARED:', dialog.type(), '-', dialog.message());
    await dialog.accept();
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE CONSOLE ERROR:', msg.text());
  });
  page.on('requestfailed', (req) => {
    console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText);
  });

  await page.goto('https://blog.ameba.jp/ucs/entry/srventryinsertinput.do', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const restoreModal = page.locator('.p-restore-modal').first();
  if (await restoreModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator('button.js-restoreModal-cancel').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  await page.click('input[name="entry_title"]');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Diag dialog test', { delay: 50 });
  await page.waitForTimeout(500);

  // Fill body content via CKEditor iframe (matching the real poster's approach)
  try {
    let editorFrame = page.frames().find(f => f.name().includes('cke_') || f.url().includes('cke_')) || null;
    if (!editorFrame) {
      const frameHandle = await page.waitForSelector('iframe.cke_wysiwyg_frame, iframe[title*="editor"], iframe[id*="cke_"]', { timeout: 15000 }).catch(() => null);
      if (frameHandle) editorFrame = await frameHandle.contentFrame();
    }
    if (editorFrame) {
      await editorFrame.waitForSelector('body.cke_editable[contenteditable="true"]', { timeout: 10000 });
      await editorFrame.click('body.cke_editable[contenteditable="true"]');
      await page.keyboard.type('Test body content for diagnostic.', { delay: 20 });
      console.log('Body content typed.');
    } else {
      console.log('No editor iframe found!');
    }
  } catch (err: any) {
    console.log('Content fill error:', err.message);
  }

  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1000);

  console.log('Clicking Post button...');
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('button.js-submitButton[publishflg="0"]') as HTMLButtonElement | null;
    if (!btn) return 'NOT_FOUND';
    if (btn.disabled) return 'DISABLED';
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return 'CLICKED';
  });
  console.log('Click result:', clicked);

  await page.waitForTimeout(6000);
  console.log('URL after click + wait:', page.url());
  console.log('Number of open pages:', page.context().pages().length);
  await page.screenshot({ path: '/tmp/ameba-dialog-test.png', fullPage: true });

  console.log('Leaving window open for 25 more seconds so you can look at it...');
  await page.waitForTimeout(25000);

  await closeAmebaBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
