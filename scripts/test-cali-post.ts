import 'dotenv/config';
import { loginCalisthenics, closeCaliBrowser } from '../src/browser/calisthenics/login.js';

async function main() {
  const nickname = process.argv[2] || 'abhinav 1';
  const page = await loginCalisthenics(nickname);

  console.log('Step 1: going to Home space...');
  await page.goto('https://calisthenics.mn.co/spaces/9350032', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('Step 2: clicking Share a post box...');
  await page.locator('div.post-prompt-region').first().click();
  await page.waitForTimeout(2000);

  console.log('Step 3: typing content...');
  await page.locator('[contenteditable="true"]').first().click();
  await page.keyboard.insertText('Test post from automation - verifying the Post flow works. Safe to delete.');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/cali-before-post.png', fullPage: true });

  console.log('Step 4: clicking Post button...');
  await page.locator('button', { hasText: 'Post' }).last().click();
  await page.waitForTimeout(5000);

  console.log('Done. Current URL:', page.url());
  await page.screenshot({ path: '/tmp/cali-after-post.png', fullPage: true });
  await closeCaliBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
