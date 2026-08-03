import 'dotenv/config';
import { loginToLinkedIn, closeLinkedInBrowser } from '../src/browser/linkedin/login.js';
import { postToLinkedIn } from '../src/browser/linkedin/poster.js';

async function postOne(nickname: string, text: string) {
  console.log(`\n=== Posting as "${nickname}" ===`);
  try {
    const page = await loginToLinkedIn({ nickname });
    const result = await postToLinkedIn(page, text);
    console.log(`RESULT for ${nickname}:`, JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error(`FAILED for ${nickname}:`, err.message);
  } finally {
    await closeLinkedInBrowser();
  }
}

async function main() {
  const nick1 = process.argv[2] || 'abhinav 1';
  const nick2 = process.argv[3] || 'abhinav 2';

  await postOne(nick1, 'Test LinkedIn post #1 from automation - verifying the posting flow. Safe to delete.');
  await postOne(nick2, 'Test LinkedIn post #2 from automation - verifying the posting flow. Safe to delete.');
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
