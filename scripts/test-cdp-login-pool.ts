/**
 * test-cdp-login-pool.ts — exercises cdpLoginPool.ts exactly the way
 * server.ts's /login and /login/:token/finish routes do, end to end:
 * startLogin() -> interactive viewer -> (you type/click) -> teardown().
 *
 * Usage:
 *   npx tsx scripts/test-cdp-login-pool.ts
 *   Open the printed viewer URL, interact with the fake login form, then
 *   press Enter in this terminal to simulate clicking "finish" on the
 *   dashboard. Verifies the Chrome process actually exits and the profile
 *   dir has real data on disk afterward — the same checks the real
 *   finish route relies on before reporting "ready".
 */

import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { startLogin, teardown, poolStatus } from '../src/login-portal/cdpLoginPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function main() {
  const sessionDir = path.join(__dirname, '..', '.test-session-cdp-pool');
  const formPath = path.join(__dirname, 'test-login-form.html');

  console.log('  Pool status before:', poolStatus());
  console.log('  Starting a login exactly like the dashboard "Add Account" button would...\n');

  const started = await startLogin({
    agent: 'test',
    platform: 'fake',
    index: 1,
    sessionDir,
    loginUrl: `file://${formPath}`,
  });

  console.log(`  ✅ Login started: ${started.viewerUrl}`);
  console.log('  Pool status during:', poolStatus());
  console.log('\n  Open that URL, type into the fields, click "Log In" — same as a real account login.\n');

  await waitForEnter('  Press Enter here to simulate clicking "finish" on the dashboard → ');

  // Find the chrome PID before teardown so we can verify it actually exits after.
  const loginRecordBefore = (await import('../src/login-portal/cdpLoginPool.js')).getLogin(started.token);
  const chromePid = loginRecordBefore?.chromePid;

  console.log('\n  Tearing down (same call the real /finish route makes)...');
  const ok = await teardown(started.token);
  console.log(`  teardown() returned: ${ok}`);

  if (chromePid) {
    console.log(`  Chrome pid ${chromePid} alive after teardown? ${isAlive(chromePid) ? '❌ STILL ALIVE (bug)' : '✅ exited cleanly'}`);
  }

  console.log('  Pool status after:', poolStatus());

  const cookiesPath = path.join(sessionDir, 'Default', 'Cookies');
  console.log(`  Profile dir on disk: ${fs.existsSync(sessionDir) ? '✅ exists' : '❌ missing'}`);
  console.log(`  Cookies file written: ${fs.existsSync(cookiesPath) ? '✅ exists' : '(none — expected, the fake form sets no real cookies)'}`);

  console.log('\n  Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
