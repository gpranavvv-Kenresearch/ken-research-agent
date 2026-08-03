/**
 * manual-login.ts — bypass the automation entirely and open a real, visible
 * browser window on the account's real profile so YOU can log in by hand.
 *
 * open-login.ts routes through each platform's smart auto-login (which, on
 * LinkedIn/etc., minimizes the window and CLOSES it the moment it hits
 * something it can't solve, e.g. 2FA — correct for the unattended scheduler,
 * useless for manual login). This script skips all of that: launches the
 * exact same persistent Chrome profile, un-minimized, straight to the
 * platform's login page, and just waits for you.
 *
 * Usage:
 *   npx tsx scripts/manual-login.ts linkedin meenakshi
 *   npx tsx scripts/manual-login.ts facebook vansh
 *   npx tsx scripts/manual-login.ts x sameeksha
 *   npx tsx scripts/manual-login.ts hackmd abhinav
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { killChromeForProfile } from '../src/utils/killChrome.js';

const CHROME_PATH = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

const [platform, nickname] = process.argv.slice(2);

// url: where to land for a manual login.
// resolve: looks up the account's registered sessionDir via the same
// nickname resolver the real posting code uses, so it opens the identical
// profile the scheduler will post from.
const PLATFORMS: Record<string, { url: string; resolve: (nickname: string) => Promise<string | undefined> }> = {
  linkedin: {
    url: 'https://www.linkedin.com/login',
    resolve: async (n) => (await import('../src/browser/linkedin/login.js')).getLinkedInAccountByNickname(n)?.sessionDir,
  },
  facebook: {
    url: 'https://www.facebook.com/login',
    resolve: async (n) => (await import('../src/browser/facebook/login.js')).getFacebookAccountByNickname(n)?.sessionDir,
  },
  x: {
    url: 'https://x.com/i/flow/login',
    resolve: async (n) => (await import('../src/config/accounts.js')).getAccountByHandle(n)?.sessionDir,
  },
  medium: {
    url: 'https://medium.com/m/signin',
    resolve: async (n) => (await import('../src/browser/medium/login.js')).getMediumAccountByNickname(n)?.sessionDir,
  },
  notion: {
    url: 'https://www.notion.so/login',
    resolve: async (n) => (await import('../src/browser/notion/login.js')).getNotionAccountByNickname(n)?.sessionDir,
  },
  googlesite: {
    url: 'https://sites.google.com/',
    resolve: async (n) => (await import('../src/browser/googlesite/login.js')).getGoogleSiteAccountByNickname(n)?.sessionDir,
  },
  gmail: {
    url: 'https://accounts.google.com/',
    // No dedicated registry — every platform for this fleet shares one profile
    // per name (.sessions/chrome-<name>), so signing into Google here carries
    // over to Notion/Google Sites/Medium/etc. automatically.
    resolve: async (n) => `.sessions/chrome-${n}`,
  },
  linkmate: {
    url: 'https://linkmate.mn.co/',
    resolve: async (n) => (await import('../src/browser/linkmate/login.js')).getLinkmateAccountByNickname(n)?.sessionDir,
  },
  devto: {
    url: 'https://dev.to/enter',
    resolve: async (n) => (await import('../src/browser/devto/login.js')).getDevtoAccountByNickname(n)?.sessionDir,
  },
  calisthenics: {
    url: 'https://calisthenics.mn.co/',
    resolve: async (n) => (await import('../src/browser/calisthenics/login.js')).getCalisthenicsAccountByNickname(n)?.sessionDir,
  },
  substack: {
    url: 'https://substack.com/sign-in',
    resolve: async (n) => (await import('../src/browser/substack/login.js')).getSubstackAccountByNickname(n)?.sessionDir,
  },
  wordpress: {
    url: 'https://wordpress.com/log-in',
    resolve: async (n) => (await import('../src/browser/wordpress/login.js')).getWordpressAccountByNickname(n)?.sessionDir,
  },
  blogger: {
    url: 'https://www.blogger.com/',
    resolve: async (n) => (await import('../src/browser/blogger/login.js')).getBloggerAccountByNickname(n)?.sessionDir,
  },
  hackmd: {
    url: 'https://hackmd.io/login',
    resolve: async (n) => (await import('../src/browser/hackmd/login.js')).getHackMDAccountByNickname(n)?.sessionDir,
  },
  patreon: {
    url: 'https://www.patreon.com/login',
    resolve: async (n) => (await import('../src/browser/patreon/login.js')).getPatreonAccountByNickname(n)?.sessionDir,
  },
  note: {
    url: 'https://note.com/login',
    resolve: async (n) => (await import('../src/browser/note/login.js')).getNoteAccountByNickname(n)?.sessionDir,
  },
  ameba: {
    url: 'https://ameba.jp/login',
    resolve: async (n) => (await import('../src/browser/ameba/login.js')).getAmebaAccountByNickname(n)?.sessionDir,
  },
  paragraph: {
    url: 'https://paragraph.com/home',
    resolve: async (n) => (await import('../src/browser/paragraph/login.js')).getParagraphAccountByNickname(n)?.sessionDir,
  },
  chatgpt: {
    url: 'https://chatgpt.com/',
    // Fixed one-profile-per-agent convention (sessionResolver.ts's chatgptProfileDir),
    // no registry entry — "abhinav" keeps the original un-suffixed path.
    resolve: async (n) => `.sessions-cookies/${n.toLowerCase() === 'abhinav' ? 'chatgpt-profile' : `chatgpt-profile-${n.toLowerCase()}`}`,
  },
  'chatgpt-image': {
    url: 'https://chatgpt.com/',
    resolve: async (n) => `.sessions-cookies/${n.toLowerCase() === 'abhinav' ? 'chatgpt-image-profile' : `chatgpt-image-profile-${n.toLowerCase()}`}`,
  },
};

if (!platform || !nickname) {
  console.log(`Usage: npx tsx scripts/manual-login.ts <${Object.keys(PLATFORMS).join('|')}> <nickname>`);
  process.exit(1);
}

const entry = PLATFORMS[platform.toLowerCase()];
if (!entry) { console.log(`Unsupported platform "${platform}". Supported: ${Object.keys(PLATFORMS).join(', ')}`); process.exit(1); }

const rawDir = await entry.resolve(nickname);
if (!rawDir) throw new Error(`No ${platform} account "${nickname}" with a sessionDir registered`);
const sessionDir = path.resolve(rawDir);
fs.mkdirSync(sessionDir, { recursive: true });
killChromeForProfile(sessionDir);

const chromePath = CHROME_PATH && fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined;
console.log(`Opening ${platform} for "${nickname}" using profile: ${sessionDir}`);
if (!chromePath) console.log('  (real Google Chrome not found at the expected path — falling back to Playwright\'s bundled Chromium, which may not match this profile)');
const context = await chromium.launchPersistentContext(sessionDir, {
  headless: false,
  executablePath: chromePath,
  viewport: { width: 1366, height: 900 },
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
});
const page = context.pages()[0] || (await context.newPage());
await page.goto(entry.url, { waitUntil: 'domcontentloaded' });

console.log('Browser is open and visible. Log in by hand — it saves to this profile automatically.');
await new Promise<void>((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('\nPress Enter when done to close and exit... ', () => { rl.close(); resolve(); });
});
await context.close();
process.exit(0);
