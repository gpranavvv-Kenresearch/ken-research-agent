import 'dotenv/config';
import { postToCalisthenics } from '../src/browser/calisthenics/poster.js';

async function main() {
  const nickname = process.argv[2] || 'abhinav 1';
  const result = await postToCalisthenics(nickname, {
    title: 'TEST ARTICLE - please ignore/delete',
    content: '<p>Automated test verifying the real postToCalisthenics flow (navigates to /posts/new, waits 5s, fills title + content). Safe to delete.</p>',
  });
  console.log('RESULT:', JSON.stringify(result, null, 2));
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
