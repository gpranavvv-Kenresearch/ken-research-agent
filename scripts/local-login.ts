/**
 * local-login.ts — One-time login to save a browser session as cookies
 *
 * Run this ONCE per account per platform. After login the cookies are saved
 * to .sessions-cookies/ and reused by the posting scripts automatically.
 *
 * Social platforms:
 *   npx tsx scripts/local-login.ts --name aniket --platform x
 *   npx tsx scripts/local-login.ts --name aniket --platform fb
 *   npx tsx scripts/local-login.ts --name aniket --platform li
 *
 * Blog platforms (LinkedIn Pulse reuses --platform li):
 *   npx tsx scripts/local-login.ts --name aniket --platform medium
 *   npx tsx scripts/local-login.ts --name aniket --platform notion
 *   npx tsx scripts/local-login.ts --name aniket --platform devto
 *   npx tsx scripts/local-login.ts --name aniket --platform substack
 *   npx tsx scripts/local-login.ts --name aniket --platform hackmd
 *   npx tsx scripts/local-login.ts --name aniket --platform wordpress
 *   npx tsx scripts/local-login.ts --name aniket --platform blogger
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

const PLATFORMS: Record<string, { url: string; label: string; filePrefix: string }> = {
  // Social
  x:         { url: 'https://x.com/i/flow/login',               label: 'X (Twitter)',     filePrefix: 'x'         },
  fb:        { url: 'https://www.facebook.com/login',            label: 'Facebook',        filePrefix: 'fb'        },
  li:        { url: 'https://www.linkedin.com/login',            label: 'LinkedIn',        filePrefix: 'li'        },
  // Blog — LinkedIn Pulse reuses the li session (no separate login needed)
  medium:    { url: 'https://medium.com/m/signin',               label: 'Medium',          filePrefix: 'medium'    },
  notion:    { url: 'https://www.notion.so/login',               label: 'Notion',          filePrefix: 'notion'    },
  devto:     { url: 'https://dev.to/enter',                      label: 'Dev.to',          filePrefix: 'devto'     },
  substack:  { url: 'https://substack.com/sign-in',              label: 'Substack',        filePrefix: 'substack'  },
  hackmd:    { url: 'https://hackmd.io/login',                   label: 'HackMD',          filePrefix: 'hackmd'    },
  wordpress: { url: 'https://wordpress.com/log-in',              label: 'WordPress',       filePrefix: 'wordpress' },
  blogger:   { url: 'https://www.blogger.com/',                  label: 'Blogger',         filePrefix: 'blogger'   },
};

if (!PLATFORMS[platform]) {
  console.error(`--platform must be one of: ${Object.keys(PLATFORMS).join(', ')}`);
  process.exit(1);
}

const OUT_DIR = '.sessions-cookies';
fs.mkdirSync(OUT_DIR, { recursive: true });

const { url: loginUrl, label: platformLabel, filePrefix } = PLATFORMS[platform];

async function waitForEnter(prompt: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(resolve => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function main() {
  const outFile = path.join(OUT_DIR, `${filePrefix}-${name}.json`);

  console.log(`\n  Logging into ${platformLabel} as "${name}"`);
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
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  console.log(`    Browser opened. Log in to ${platformLabel} now.`);
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
