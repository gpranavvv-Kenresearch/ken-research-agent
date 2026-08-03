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

  await page.click('input[name="entry_title"]');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Diag test title', { delay: 50 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/ameba-before-publish.png', fullPage: true });

  const btnInfo = await page.evaluate(() => {
    const btn = document.querySelector('button.js-submitButton') as HTMLButtonElement | null;
    if (!btn) return null;
    return {
      text: btn.textContent?.trim(),
      disabled: btn.disabled,
      cls: btn.className,
      publishflg: btn.getAttribute('publishflg'),
    };
  });
  console.log('publish button:', JSON.stringify(btnInfo, null, 2));

  console.log('Clicking publish...');
  await page.locator('button.js-submitButton').first().click({ timeout: 10000 }).catch((e) => console.log('click err:', e.message));
  await page.waitForTimeout(4000);
  console.log('URL after click:', page.url());
  await page.screenshot({ path: '/tmp/ameba-after-publish.png', fullPage: true });

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('--- body text after click ---');
  console.log(bodyText);

  await closeAmebaBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
