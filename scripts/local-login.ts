/**
 * local-login.ts — One-time login to save a browser session as cookies
 *
 * Run this ONCE per account per platform. After login the cookies are saved
 * to .sessions-cookies/ and reused by the posting scripts automatically.
 *
 * Usage:
 *   npx tsx scripts/local-login.ts --name aniket --platform x
 *   npx tsx scripts/local-login.ts --name aniket --platform fb
 *   npx tsx scripts/local-login.ts --name aniket --platform li
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const name     = get('--name')?.toLowerCase();
const platform = get('--platform')?.toLowerCase();

if (!name || !platform) {
  console.error('Usage: npx tsx scripts/local-login.ts --name <nickname> --platform <x|fb|li>');
  process.exit(1);
}

if (!['x', 'fb', 'li'].includes(platform)) {
  console.error('--platform must be one of: x, fb, li');
  process.exit(1);
}

const OUT_DIR = '.sessions-cookies';
fs.mkdirSync(OUT_DIR, { recursive: true });

const URLS: Record<string, string> = {
  x:   'https://x.com/i/flow/login',
  fb:  'https://www.facebook.com/login',
  li:  'https://www.linkedin.com/login',
};

const NAMES: Record<string, string> = { x: 'X (Twitter)', fb: 'Facebook', li: 'LinkedIn' };

async function waitForEnter(prompt: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(resolve => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function main() {
  const outFile = path.join(OUT_DIR, `${platform}-${name}.json`);

  console.log(`\n🔐  Logging into ${NAMES[platform]} as "${name}"`);
  console.log(`    Output: ${outFile}\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  await page.goto(URLS[platform], { waitUntil: 'domcontentloaded' });

  console.log(`    Browser opened. Log in to ${NAMES[platform]} now.`);
  console.log(`    When you are fully logged in (home page visible), come back here and press Enter.\n`);

  await waitForEnter('    Press Enter once you are logged in → ');

  // Save full storage state (cookies + localStorage)
  const state = await context.storageState();
  fs.writeFileSync(outFile, JSON.stringify(state));

  console.log(`\n    ✅ Session saved → ${outFile}`);
  console.log(`    You won't need to log in again unless cookies expire.\n`);

  await browser.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
