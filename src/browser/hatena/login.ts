import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { createInterface } from 'readline/promises';
import { killChromeForProfile } from '../../utils/killChrome.js';

// TODO(locators): Hatena's login form (hatena.ne.jp/login) is best-effort —
// confirm field names against the live DOM on first authenticated test run,
// same convention as Naver/Issuu. b.hatena.ne.jp (Hatena Bookmark) shares the
// same account system as the rest of Hatena's products.
const HATENA_LOGIN_URL = 'https://www.hatena.ne.jp/login?location=https%3A%2F%2Fb.hatena.ne.jp%2F';
const HATENA_BOOKMARK_HOME_URL = 'https://b.hatena.ne.jp/';

const HATENA_ACCOUNTS_FILE = '.accounts/accounts-hatena.json';
const SESSION_ROOT = path.resolve('.sessions/hatena');

export interface HatenaAccount {
  email: string;
  username?: string;
  password?: string;
  nickname?: string;
  sessionDir?: string;
  active: boolean;
}

export function getHatenaAccounts(): HatenaAccount[] {
  if (!fs.existsSync(HATENA_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(HATENA_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveHatenaAccount(): HatenaAccount | null {
  return getHatenaAccounts().find(a => a.active) || null;
}

export function getHatenaAccountByNickname(nickname: string): HatenaAccount | null {
  return getHatenaAccounts().find(a => a.nickname?.toLowerCase() === nickname.toLowerCase()) || null;
}

function sessionDirFor(nickname: string): string {
  const safe = String(nickname || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let browserContext: BrowserContext | null = null;

export async function closeHatenaBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
    console.log('   Hatena browser closed.');
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(HATENA_BOOKMARK_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1500);
    // Logged-out header shows a "ユーザー登録" (register) / "ログイン" (login)
    // link pair; logged-in header replaces these with the user's own menu.
    const loginLinkVisible = await page.locator('a[href*="hatena.ne.jp/login"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    return !loginLinkVisible;
  } catch {
    return false;
  }
}

async function waitForEnter(promptText: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(promptText);
  rl.close();
}

async function launchContext(sessionDir: string): Promise<Page> {
  fs.mkdirSync(sessionDir, { recursive: true });
  await killChromeForProfile(sessionDir);

  const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  console.log(`   Using Hatena session: ${sessionDir}`);

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    channel: fs.existsSync(chromePath) ? undefined : 'chrome',
    viewport: null,
    slowMo: 50,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });

  await browserContext.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    (window as any).chrome = (window as any).chrome || { runtime: {} };
  });

  const existingPages = browserContext.pages();
  let page: Page;
  if (existingPages.length > 0) {
    page = existingPages[0];
    for (const p of existingPages.slice(1)) await p.close().catch(() => {});
  } else {
    page = await browserContext.newPage();
  }
  return page;
}

export async function loginToHatena(options?: { nickname?: string }): Promise<Page> {
  const account = options?.nickname
    ? getHatenaAccountByNickname(options.nickname) ?? getActiveHatenaAccount()
    : getActiveHatenaAccount();

  if (!account) throw new Error('No Hatena account found in .accounts/accounts-hatena.json');

  const sessionDir = account.sessionDir ? path.resolve(account.sessionDir) : sessionDirFor(account.nickname || account.email || 'default');
  const page = await launchContext(sessionDir);

  console.log('   Checking Hatena session...');
  if (await isLoggedIn(page)) {
    console.log(`   ✅ Already logged in to Hatena (${account.nickname})`);
    return page;
  }

  console.log('   Not logged in — starting Hatena login...');
  await page.goto(HATENA_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);

  if ((account.username || account.email) && account.password) {
    try {
      const userInput = page.locator('input[name="name"], input[name="email"], input[type="email"], input[type="text"]').first();
      await userInput.waitFor({ state: 'visible', timeout: 10000 });
      await userInput.click();
      await page.keyboard.type(account.username || account.email, { delay: 80 });
      await sleep(300);

      const pwInput = page.locator('input[name="password"], input[type="password"]').first();
      await pwInput.click();
      await page.keyboard.type(account.password, { delay: 80 });
      await sleep(300);

      const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await sleep(3000);
    } catch (err: any) {
      console.warn(`   ⚠️ Could not auto-fill Hatena login: ${err.message}`);
      console.log('   👉 Please log in manually in the browser window.\n');
    }
  } else {
    console.log('   👉 Please log in manually in the browser window.\n');
  }

  if (!(await isLoggedIn(page))) {
    console.log('   ⏳ Not detected as logged in yet.');
    await waitForEnter('   If you need to finish logging in manually (captcha, 2FA, etc.), do so now, then press Enter here... ');
  }

  if (!(await isLoggedIn(page))) {
    await closeHatenaBrowser();
    throw new Error('Hatena login failed — still detected as logged out after confirmation.');
  }

  console.log(`   ✅ Hatena login confirmed (${account.nickname}).`);
  return page;
}

// Standalone: npx tsx src/browser/hatena/login.ts --nickname aniket
async function main() {
  const args = process.argv.slice(2);
  const nickIdx = args.indexOf('--nickname');
  const nickname = nickIdx !== -1 ? args[nickIdx + 1] : undefined;
  console.log(`\n🔐 Hatena Login${nickname ? ` (${nickname})` : ''}`);
  try {
    await loginToHatena({ nickname });
    console.log('\n✅ Session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
  } catch (err: any) {
    console.error('Login failed:', err.message);
    process.exit(1);
  }
}

if (process.argv[1]?.includes('hatena/login') || process.argv[1]?.includes('hatena\\login')) main();
