import 'dotenv/config';
import { loginToLinkmate, closeLinkmeateBrowser } from '../src/browser/linkmate/login.js';
import { postToLinkmate } from '../src/browser/linkmate/poster.js';

async function main() {
  const nickname = process.argv[2] || 'abhinav 1';
  const page = await loginToLinkmate({ nickname });
  const result = await postToLinkmate(
    page,
    'TEST ARTICLE - please ignore/delete',
    '<p>Automated test verifying the real postToLinkmate flow. Safe to delete.</p>',
  );
  console.log('RESULT:', JSON.stringify(result, null, 2));
  await closeLinkmeateBrowser();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
