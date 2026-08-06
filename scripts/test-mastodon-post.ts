import 'dotenv/config';
import { loginToMastodon, closeMastodonBrowser } from '../src/browser/mastodon/login.js';
import { postToMastodon } from '../src/browser/mastodon/poster.js';
import { generateMastodonPost } from '../src/agents/contentAgentNew.js';

// Usage: npx tsx scripts/test-mastodon-post.ts [nickname]
async function main() {
  const nickname = process.argv[2] || 'sanya';
  const testUrl = 'https://www.kenresearch.com/';

  console.log('Generating post text...');
  const postText = await generateMastodonPost({
    url: testUrl,
    title: 'test automation market',
    seoRanking: 999,
    priority: 'P3',
  });
  console.log(`Generated (${postText.length} chars):\n${postText}\n`);

  console.log(`Logging in to Mastodon as "${nickname}"...`);
  const page = await loginToMastodon({ nickname });

  console.log('Posting...');
  const result = await postToMastodon(page, postText);
  console.log('Result:', result);

  await page.screenshot({ path: '/tmp/mastodon-after-post.png', fullPage: true }).catch(() => {});
  await closeMastodonBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
