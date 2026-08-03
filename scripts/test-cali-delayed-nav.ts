import 'dotenv/config';
import { loginCalisthenics, closeCaliBrowser } from '../src/browser/calisthenics/login.js';

async function main() {
  const nickname = process.argv[2] || 'abhinav 1';
  const page = await loginCalisthenics(nickname);

  console.log('Opening with a blank/generic URL first...');
  await page.goto('https://calisthenics.mn.co/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('URL right after first load:', page.url());

  console.log('Waiting 2 seconds...');
  await page.waitForTimeout(2000);

  console.log('Now navigating to /posts/new...');
  await page.goto('https://calisthenics.mn.co/posts/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('URL after navigating to /posts/new:', page.url());

  await page.screenshot({ path: '/tmp/cali-delayed-nav.png', fullPage: true });
  const titleCount = await page.locator('p[data-placeholder="Title"]').count();
  console.log('Title field count:', titleCount);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('--- body text ---');
  console.log(bodyText);

  await closeCaliBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
