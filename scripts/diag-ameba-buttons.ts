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

  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1000);

  const allButtons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button.js-submitButton, [class*="submit"]'));
    return btns.map((b) => ({
      tag: b.tagName,
      text: (b.textContent || '').trim().slice(0, 40),
      cls: b.className,
      publishflg: b.getAttribute('publishflg'),
      visible: (b as HTMLElement).offsetParent !== null,
    }));
  });
  console.log('All submit-related buttons:', JSON.stringify(allButtons, null, 2));

  // Also check for a dropdown/arrow toggle near the submit button
  const dropdownInfo = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[class*="dropdown"], [class*="arrow"], [class*="toggle"]'));
    return els.slice(0, 15).map((el) => ({ tag: el.tagName, cls: el.className, text: (el.textContent || '').trim().slice(0, 30) }));
  });
  console.log('Dropdown/arrow candidates:', JSON.stringify(dropdownInfo, null, 2));

  await closeAmebaBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
