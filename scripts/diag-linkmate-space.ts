import 'dotenv/config';
import { loginToLinkmate, closeLinkmeateBrowser } from '../src/browser/linkmate/login.js';

async function main() {
  const nickname = process.argv[2] || 'abhinav 1';
  const page = await loginToLinkmate({ nickname });

  console.log('Navigating to home...');
  await page.goto('https://linkmate.mn.co/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('Clicking Create...');
  await page.locator('a[title="Create"]').first().click({ force: true, timeout: 10000 }).catch((e) => console.log('create click err', e.message));
  await page.waitForTimeout(1500);

  console.log('Clicking the space in the search list...');
  await page.locator('.search-result-list-items li.search-result-list-item').first().click({ force: true, timeout: 10000 }).catch((e) => console.log('space click err', e.message));
  await page.waitForTimeout(1500);

  const articleHref = await page.evaluate(() => {
    const el = document.querySelector('a.mighty-menu-list-item[title="Article"]');
    return el ? el.getAttribute('href') : null;
  });
  console.log('Article link href:', articleHref);

  await page.screenshot({ path: '/tmp/linkmate-create-menu.png', fullPage: true });
  await closeLinkmeateBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
