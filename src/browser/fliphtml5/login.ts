import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { createInterface } from 'readline/promises';
import { killChromeForProfile } from '../../utils/killChrome.js';

// TODO(locators): FlipHTML5's login form (/login.php) is best-effort —
// confirm field names against the live DOM on first authenticated test run,
// same convention as every other platform in this repo.
const FLIPHTML5_LOGIN_URL = 'https://fliphtml5.com/login.php';
const FLIPHTML5_DASHBOARD_URL = 'https://fliphtml5.com/app/';

const FLIPHTML5_ACCOUNTS_FILE = '.accounts/accounts-fliphtml5.json';
const SESSION_ROOT = path.resolve('.sessions/fliphtml5');

export interface FlipHtml5Account {
  email: string;
  password?: string;
  nickname?: string;
  sessionDir?: string;
  active: boolean;
}

export function getFlipHtml5Accounts(): FlipHtml5Account[] {
  if (!fs.existsSync(FLIPHTML5_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(FLIPHTML5_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveFlipHtml5Account(): FlipHtml5Account | null {
  return getFlipHtml5Accounts().find(a => a.active) || null;
}

export function getFlipHtml5AccountByNickname(nickname: string): FlipHtml5Account | null {
  return getFlipHtml5Accounts().find(a => a.nickname?.toLowerCase() === nickname.toLowerCase()) || null;
}

function sessionDirFor(nickname: string): string {
  const safe = String(nickname || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let browserContext: BrowserContext | null = null;

export async function closeFlipHtml5Browser(): Promise<void> {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
    console.log('   FlipHTML5 browser closed.');
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(FLIPHTML5_DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1500);
    return !page.url().includes('login.php');
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
  console.log(`   Using FlipHTML5 session: ${sessionDir}`);

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

export async function loginToFlipHtml5(options?: { nickname?: string }): Promise<Page> {
  const account = options?.nickname
    ? getFlipHtml5AccountByNickname(options.nickname) ?? getActiveFlipHtml5Account()
    : getActiveFlipHtml5Account();

  if (!account) throw new Error('No FlipHTML5 account found in .accounts/accounts-fliphtml5.json');

  const sessionDir = account.sessionDir ? path.resolve(account.sessionDir) : sessionDirFor(account.nickname || account.email || 'default');
  const page = await launchContext(sessionDir);

  console.log('   Checking FlipHTML5 session...');
  if (await isLoggedIn(page)) {
    console.log(`   ✅ Already logged in to FlipHTML5 (${account.nickname})`);
    return page;
  }

  console.log('   Not logged in — starting FlipHTML5 login...');
  await page.goto(FLIPHTML5_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  if (account.email && account.password) {
    try {
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.click();
      await page.keyboard.type(account.email, { delay: 80 });
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
      await sleep(2500);
    } catch (err: any) {
      console.warn(`   ⚠️ Could not auto-fill FlipHTML5 login: ${err.message}`);
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
    await closeFlipHtml5Browser();
    throw new Error('FlipHTML5 login failed — still redirected to login after confirmation.');
  }

  console.log(`   ✅ FlipHTML5 login confirmed (${account.nickname}).`);
  return page;
}

// Standalone: npx tsx src/browser/fliphtml5/login.ts --nickname aniket
async function main() {
  const args = process.argv.slice(2);
  const nickIdx = args.indexOf('--nickname');
  const nickname = nickIdx !== -1 ? args[nickIdx + 1] : undefined;
  console.log(`\n🔐 FlipHTML5 Login${nickname ? ` (${nickname})` : ''}`);
  try {
    await loginToFlipHtml5({ nickname });
    console.log('\n✅ Session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
  } catch (err: any) {
    console.error('Login failed:', err.message);
    process.exit(1);
  }
}

if (process.argv[1]?.includes('fliphtml5/login') || process.argv[1]?.includes('fliphtml5\\login')) main();
