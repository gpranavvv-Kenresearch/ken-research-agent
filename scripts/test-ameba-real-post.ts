import 'dotenv/config';
import { loginToAmeba, closeAmebaBrowser } from '../src/browser/ameba/login.js';
import { postToAmeba } from '../src/browser/ameba/poster.js';

async function main() {
  const nickname = process.argv[2] || 'abhinav 1';
  const page = await loginToAmeba({ nickname });
  try {
    const result = await postToAmeba(
      page,
      'TEST POST - please ignore/delete',
      '<p>Automated test verifying the real postToAmeba flow. Safe to delete.</p>',
    );
    console.log('RESULT:', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('FAILED:', err.message);
  } finally {
    await closeAmebaBrowser();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
