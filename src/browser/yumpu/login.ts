import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { createInterface } from 'readline/promises';
import { killChromeForProfile } from '../../utils/killChrome.js';

// Confirmed against the real DOM (2026-08-12). /dashboard renders without
// redirecting even when logged out, so it can't be used to verify auth
// state — /account/create is the actual page the poster needs (it's the
// real upload entry point) and reliably bounces to /en/user/login when not
// authenticated, so that's what login verification checks against instead.
const YUMPU_LOGIN_URL = 'https://www.yumpu.com/en/user/login';
const YUMPU_DASHBOARD_URL = 'https://www.yumpu.com/en/account/create';

const YUMPU_ACCOUNTS_FILE = '.accounts/accounts-yumpu.json';
const SESSION_ROOT = path.resolve('.sessions/yumpu');

export interface YumpuAccount {
  email: string;
  password?: string;
  nickname?: string;
  sessionDir?: string;
  active: boolean;
}

export function getYumpuAccounts(): YumpuAccount[] {
  if (!fs.existsSync(YUMPU_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(YUMPU_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveYumpuAccount(): YumpuAccount | null {
  return getYumpuAccounts().find(a => a.active) || null;
}

export function getYumpuAccountByNickname(nickname: string): YumpuAccount | null {
  return getYumpuAccounts().find(a => a.nickname?.toLowerCase() === nickname.toLowerCase()) || null;
}

function sessionDirFor(nickname: string): string {
  const safe = String(nickname || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let browserContext: BrowserContext | null = null;

export async function closeYumpuBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
    console.log('   Yumpu browser closed.');
  }
}

// URL alone is unreliable — /dashboard can render without redirecting even
// when logged out, so a URL-only check reported a false "already logged in"
// on a session that wasn't actually authenticated (confirmed live: the
// account/create page it should protect bounced straight to /user/login).
// Verify against the DOM instead — the login form's email input is the
// reliable signal of a logged-out state.
async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(YUMPU_DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);
    if (page.url().includes('/login')) return false;
    const loginField = page.locator('#yp-input-user-login-email-username').first();
    const stillLoggedOut = await loginField.isVisible({ timeout: 2000 }).catch(() => false);
    return !stillLoggedOut;
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
  console.log(`   Using Yumpu session: ${sessionDir}`);

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    channel: fs.existsSync(chromePath) ? undefined : 'chrome',
    permissions: ['clipboard-read', 'clipboard-write'],
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

export async function loginToYumpu(options?: { nickname?: string }): Promise<Page> {
  const account = options?.nickname
    ? getYumpuAccountByNickname(options.nickname) ?? getActiveYumpuAccount()
    : getActiveYumpuAccount();

  if (!account) throw new Error('No Yumpu account found in .accounts/accounts-yumpu.json');

  const sessionDir = account.sessionDir ? path.resolve(account.sessionDir) : sessionDirFor(account.nickname || account.email || 'default');
  const page = await launchContext(sessionDir);

  console.log('   Checking Yumpu session...');
  if (await isLoggedIn(page)) {
    console.log(`   ✅ Already logged in to Yumpu (${account.nickname})`);
    return page;
  }

  console.log('   Not logged in — starting Yumpu login...');
  await page.goto(YUMPU_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  if (account.email && account.password) {
    try {
      const emailInput = page.locator('#yp-input-user-login-email-username, input[type="email"]').first();
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.click();
      await page.keyboard.type(account.email, { delay: 80 });
      await sleep(300);

      const pwInput = page.locator('#yp-input-user-login-password, input[type="password"]').first();
      await pwInput.click();
      await page.keyboard.type(account.password, { delay: 80 });
      await sleep(300);

      const submitBtn = page.locator('#yp-btn-user-login, button[type="submit"]').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await sleep(2500);
    } catch (err: any) {
      console.warn(`   ⚠️ Could not auto-fill Yumpu login: ${err.message}`);
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
    await closeYumpuBrowser();
    throw new Error('Yumpu login failed — still redirected to login after confirmation.');
  }

  console.log(`   ✅ Yumpu login confirmed (${account.nickname}).`);
  return page;
}

// Standalone: npx tsx src/browser/yumpu/login.ts --nickname aniket
async function main() {
  const args = process.argv.slice(2);
  const nickIdx = args.indexOf('--nickname');
  const nickname = nickIdx !== -1 ? args[nickIdx + 1] : undefined;
  console.log(`\n🔐 Yumpu Login${nickname ? ` (${nickname})` : ''}`);
  try {
    await loginToYumpu({ nickname });
    console.log('\n✅ Session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
  } catch (err: any) {
    console.error('Login failed:', err.message);
    process.exit(1);
  }
}

if (process.argv[1]?.includes('yumpu/login') || process.argv[1]?.includes('yumpu\\login')) main();
