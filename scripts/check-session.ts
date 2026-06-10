/**
 * check-session.ts — Open browser with saved session to visually verify login
 * Usage:
 *   npx ts-node scripts/check-session.ts --platform li --nickname aniket
 *   npx ts-node scripts/check-session.ts --platform fb --nickname krishi
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

function getArg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : '';
}

const PLATFORM = getArg('--platform'); // li or fb
const NICKNAME = getArg('--nickname');

if (!PLATFORM || !NICKNAME) {
  console.error('Usage: npx ts-node scripts/check-session.ts --platform <li|fb> --nickname <nickname>');
  process.exit(1);
}

const SESSION_FILE = path.join(__dirname, 'sessions', `${PLATFORM}_${NICKNAME}.json`);

if (!fs.existsSync(SESSION_FILE)) {
  console.error(`No session found: ${SESSION_FILE}`);
  console.error('Run login script first.');
  process.exit(1);
}

const URLS: Record<string, string> = {
  li: 'https://www.linkedin.com/feed/',
  fb: 'https://www.facebook.com/',
  x:  'https://x.com/home',
};

(async () => {
  console.log(`Loading session: ${SESSION_FILE}`);
  console.log(`Opening ${PLATFORM === 'li' ? 'LinkedIn' : 'Facebook'} for ${NICKNAME}...`);
  console.log('Browser will stay open — close it manually when done.\n');

  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({
    storageState: SESSION_FILE,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(URLS[PLATFORM], { waitUntil: 'domcontentloaded', timeout: 30000 });

  const url = page.url();
  const title = await page.title();
  console.log(`URL:   ${url}`);
  console.log(`Title: ${title}`);

  if (PLATFORM === 'li') {
    const loggedIn = await page.$('[aria-label="Start a post"], button:has-text("Start a post"), .share-box-feed-entry__trigger');
    console.log(loggedIn ? '✓ LinkedIn: LOGGED IN' : '✗ LinkedIn: NOT LOGGED IN (session expired)');
  } else if (PLATFORM === 'fb') {
    const loggedIn = await page.$('[aria-label="Create a post"], div[role="feed"], [aria-placeholder]');
    console.log(loggedIn ? '✓ Facebook: LOGGED IN' : '✗ Facebook: NOT LOGGED IN (session expired)');
  } else if (PLATFORM === 'x') {
    const loggedIn = await page.$('[data-testid="SideNav_NewTweet_Button"], [data-testid="tweetButtonInline"], [aria-label="Post"]');
    console.log(loggedIn ? '✓ X: LOGGED IN' : '✗ X: NOT LOGGED IN (session expired)');
  }

  // Keep browser open
  await new Promise(() => {});
})();
