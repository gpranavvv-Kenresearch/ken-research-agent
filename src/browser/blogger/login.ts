import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { getChromeLaunchArgs } from '../../utils/chromeArgs.js';
import { killChromeForProfile } from '../../utils/killChrome.js';
import { blockHeavyResources } from '../../utils/blockResources.js';

const BLOGGER_ACCOUNTS_FILE = '.accounts/accounts-blogger.json';
const SESSION_ROOT = path.resolve('.sessions/blogger');

export interface BloggerAccount {
  email: string;
  password?: string;
  sessionDir?: string;
  nickname?: string;
  username?: string;
  blogUrl?: string;
  active: boolean;
}

export function getBloggerAccounts(): BloggerAccount[] {
  if (!fs.existsSync(BLOGGER_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(BLOGGER_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveBloggerAccount(): BloggerAccount | null {
  return getBloggerAccounts().find(a => a.active) || null;
}

export function getBloggerAccountByNickname(nickname: string): BloggerAccount | null {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const target = normalize(nickname);
  return getBloggerAccounts().find(a => a.nickname && normalize(a.nickname) === target) || null;
}

function sessionDirFor(username: string): string {
  const safe = String(username || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let browserContext: BrowserContext | null = null;

export async function closeBloggerBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
    console.log('   Blogger browser closed.');
  }
}

export async function loginToBlogger(options?: {
  email?: string;
  password?: string;
  nickname?: string;
}): Promise<Page> {
  const account = options?.nickname
    ? getBloggerAccountByNickname(options.nickname)
    : getActiveBloggerAccount();

  if (options?.nickname && !account) {
    throw new Error(`Blogger account "${options.nickname}" not found in ${BLOGGER_ACCOUNTS_FILE} — refusing to silently fall back to a different account`);
  }

  const email    = options?.email    || account?.email    || process.env.BLOGGER_EMAIL;
  const password = options?.password || account?.password || process.env.BLOGGER_PASSWORD;
  // Fleet accounts (from the login portal) are password-less and email-less by
  // design — they only carry a sessionDir from a real browser login. Only error
  // out if we have neither an email nor a session to fall back on.
  const label = email || account?.nickname || options?.nickname || 'unknown account';

  if (!email && !account?.sessionDir) {
    throw new Error(`Blogger email missing. Add account to .accounts/accounts-blogger.json or set BLOGGER_EMAIL env var.`);
  }

  const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const sessionDir = account?.sessionDir ? path.resolve(account.sessionDir) : sessionDirFor(email as string);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  console.log(`   Using session folder: ${sessionDir}`);
  console.log('   Launching Blogger browser...');
  killChromeForProfile(sessionDir);

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    headless: process.env.HEADLESS !== 'false',
    executablePath: chromePath,
    viewport: null,
    slowMo: 50,
    ignoreDefaultArgs: ['--enable-automation'],
    args: getChromeLaunchArgs(),
  });

  await blockHeavyResources(browserContext, 'blogger');
  await browserContext.grantPermissions(['clipboard-read', 'clipboard-write']);

  await browserContext.addInitScript(() => {
    Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => false });
    (globalThis as any).window.chrome = (globalThis as any).window.chrome || { runtime: {} };
  });

  const existingPages = browserContext.pages();
  let page: Page;
  // Minimize the window via CDP (--start-minimized flag is unreliable with navigation)
  const _minimizeWindow = async (p: Page) => {
    try {
      const cdp = await browserContext!.newCDPSession(p);
      const { windowId } = await (cdp as any).send('Browser.getWindowForTarget');
      await (cdp as any).send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await cdp.detach().catch(() => {});
    } catch { /* ignore if CDP unavailable */ }
  };
  if (existingPages.length > 0) {
    page = existingPages[0];
    for (const p of existingPages.slice(1)) await p.close().catch(() => {});
  } else {
    page = await browserContext.newPage();
  }

  await _minimizeWindow(page);

  console.log('   Navigating to Blogger...');
  await page.goto('https://www.blogger.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await _minimizeWindow(page);
  await sleep(800);
  await _minimizeWindow(page);

  console.log('   Waiting 5 seconds for session check...');
  await sleep(5000);

  // TODO: Update this check with the correct logged-in indicator
  const currentUrl = await page.url();
  const loggedIn = currentUrl.includes('/blog/') || currentUrl.includes('blogger.com/blog') || !currentUrl.includes('accounts.google.com');
  if (loggedIn && !currentUrl.includes('accounts.google.com')) {
    console.log(`   ✅ Already logged in to Blogger (session restored)`);
    return page;
  }

  // Auto-login via Google account
  if (email && password) {
    console.log(`   Attempting auto-login via Google...`);
    try {
      // TODO: Replace selectors with correct Google sign-in flow selectors
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.click('input[type="email"]');
      await page.keyboard.type(email, { delay: 80 });
      await page.keyboard.press('Enter');
      await sleep(2000);

      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await page.click('input[type="password"]');
      await page.keyboard.type(password, { delay: 80 });
      await page.keyboard.press('Enter');
      await sleep(5000);

      const afterLogin = await page.url();
      if (!afterLogin.includes('accounts.google.com')) {
        console.log(`   ✅ Auto-login successful`);
        return page;
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Auto-login failed: ${err.message}`);
    }
  }

  console.log(`   ⏳ Not logged in – waiting 20 seconds for manual login...`);
  await sleep(20000);

  const finalUrl = await page.url();
  if (finalUrl.includes('accounts.google.com')) {
    await closeBloggerBrowser();
    throw new Error(`Unable to log in to Blogger as ${label}.`);
  }

  console.log(`   ✅ Login successful`);
  return page;
}
