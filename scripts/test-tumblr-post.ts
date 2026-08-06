import 'dotenv/config';
import { loginToTumblr, closeTumblrBrowser } from '../src/browser/tumblr/login.js';
import { postToTumblr } from '../src/browser/tumblr/poster.js';

// Usage: npx tsx scripts/test-tumblr-post.ts [nickname]
async function main() {
  const nickname = process.argv[2] || 'sanya';
  const testUrl = 'https://www.kenresearch.com/';
  const testText = 'Test post from automation — verifying the Tumblr Link-post flow works. Safe to delete. #MarketResearch #Automation #Testing';

  console.log(`Logging in to Tumblr as "${nickname}"...`);
  const page = await loginToTumblr({ nickname });

  console.log('Posting...');
  const result = await postToTumblr(page, testText, testUrl);
  console.log('Result:', result);

  await page.screenshot({ path: '/tmp/tumblr-after-post.png', fullPage: true }).catch(() => {});
  await closeTumblrBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
