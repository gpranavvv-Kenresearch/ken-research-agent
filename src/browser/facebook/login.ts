import { chromium, BrowserContext, Page } from 'playwright';
import { humanDelay } from '../stagehand.js';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

const FACEBOOK_ACCOUNTS_FILE = '.accounts/facebook-accounts.json';

export interface FacebookAccount {
  email: string;
  password: string;
  sessionDir: string;
  nickname?: string;
  profileUrl?: string;
  active: boolean;
}

export function getFacebookAccounts(): FacebookAccount[] {
  if (!fs.existsSync(FACEBOOK_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(FACEBOOK_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveFacebookAccount(): FacebookAccount | null {
  return getFacebookAccounts().find(a => a.active) || null;
}

export function getFacebookAccountByNickname(nickname: string): FacebookAccount | null {
  return getFacebookAccounts().find(a => a.nickname?.toLowerCase() === nickname.toLowerCase()) || null;
}

let browserContext: BrowserContext;
let headlessBrowser: import('playwright').Browser | null = null;

export async function closeFacebookBrowser() {
  if (browserContext) { await browserContext.close().catch(() => {}); }
  if (headlessBrowser) { await headlessBrowser.close().catch(() => {}); headlessBrowser = null; }
  console.log('   Facebook browser closed.');
}

export async function loginToFacebook(options?: {
  email?: string;
  password?: string;
  sessionDir?: string;
  nickname?: string;
  manualLogin?: boolean;
}): Promise<Page> {
  // Load by nickname if provided, otherwise first active account
  const account = options?.nickname
    ? getFacebookAccountByNickname(options.nickname)
    : getActiveFacebookAccount();
  if (!account && options?.nickname) throw new Error(`Facebook account "${options.nickname}" not found in facebook-accounts.json`);
  const nickname  = (options?.nickname || account?.nickname || 'unknown').toLowerCase();
  const sessionDir = path.resolve(options?.sessionDir || account?.sessionDir || '.sessions/chrome-fb-profile');
  const email    = options?.email    || account?.email    || process.env.FB_EMAIL!;
  const password = options?.password || account?.password || process.env.FB_PASSWORD!;

  const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

  // ── Cookies-only path (GitHub Actions) ──────────────────────────────────────
  const cookiesFile = path.resolve(`.sessions-cookies/fb-${nickname}.json`);
  if (fs.existsSync(cookiesFile)) {
    console.log(`   Loading FB cookies: ${cookiesFile}`);
    headlessBrowser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      executablePath: chromePath && fs.existsSync(chromePath) ? chromePath : undefined,
      args: ['--start-minimized', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationControlled'],
    });
    browserContext = await headlessBrowser.newContext({
      storageState: cookiesFile,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await browserContext.newPage();
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    const url = page.url();
    if (!url.includes('/login') && !url.includes('login.php')) {
      console.log(`   ✅ FB cookies valid for ${nickname}`);
      return page;
    }
    console.warn(`   ⚠️ FB cookies expired for ${nickname}`);
    await closeFacebookBrowser();
    throw new Error(`FB_COOKIES_EXPIRED:${nickname} — re-run npm run extract-cookies`);
  }

  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome not found at ${chromePath}. Set CHROME_PATH env var.`);
  }

  console.log('   Launching Facebook browser (real Chrome)...');

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    headless: process.env.HEADLESS !== 'false',
    executablePath: chromePath,
    slowMo: 50,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--start-minimized',
      ...(process.platform !== 'win32' ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : []),
      '--disable-blink-features=AutomationControlled',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
    ],
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  await browserContext.grantPermissions(['clipboard-read', 'clipboard-write']);

  await browserContext.addInitScript(() => {
    Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => false });
  });

  const page = await browserContext.newPage();

  try {
    const cdp = await browserContext.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
  } catch { /* not critical */ }

  // Go directly to login page
  await page.goto('https://www.facebook.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await humanDelay(3000, 5000);

  console.log(`   Current URL: ${page.url()}`);

  // Already logged in — only trust feed/home redirects, not checkpoint/verification pages
  const currentUrl = page.url();
  if (currentUrl.includes('/home') || currentUrl.includes('/feed')) {
    console.log('   Already logged in to Facebook!');
    return page;
  }

  if (options?.manualLogin) {
    // Manual mode — browser is open, user types credentials themselves
    console.log('   ⌨️  Manual login mode — please log in with your credentials in the browser.');
    console.log('   ✅ Waiting for you to log in... (watching for /home or /feed)');
    // Wait until the user successfully logs in
    while (true) {
      await humanDelay(2000, 2000);
      try {
        const url = page.url();
        if (url.includes('/home') || url.includes('/feed') || (!url.includes('/login') && !url.includes('facebook.com') === false && url.includes('facebook.com'))) {
          console.log('   ✅ Login detected!');
          break;
        }
      } catch {
        break; // browser closed
      }
    }
    return page;
  }

  console.log('   Logging in to Facebook...');

  // Dismiss cookie consent if present
  const cookieBtn = await page.$('button[data-cookiebanner="accept_button"], [data-testid="cookie-policy-manage-dialog-accept-button"]').catch(() => null);
  if (cookieBtn) {
    await cookieBtn.click();
    await humanDelay(1000, 2000);
  }

  // Try multiple selectors for email field
  const emailSelector = 'input[name="email"], #email, input[type="email"]';
  await page.waitForSelector(emailSelector, { timeout: 30000 });
  await page.click(emailSelector);
  await humanDelay(400, 700);
  await page.keyboard.type(email, { delay: 110 });
  await humanDelay(600, 1000);

  const passSelector = 'input[name="pass"], #pass, input[type="password"]';
  await page.waitForSelector(passSelector, { timeout: 10000 });
  await page.click(passSelector);
  await humanDelay(400, 700);
  await page.keyboard.type(password, { delay: 110 });
  await humanDelay(800, 1200);

  await page.keyboard.press('Enter');
  await humanDelay(5000, 8000);

  console.log(`   URL after login: ${page.url()}`);

  if (page.url().includes('/login')) {
    console.log('   ⚠️  Still on /login page — auto-login incomplete (CAPTCHA / wrong credentials?).');
  }

  console.log('✅ Facebook login done!');
  return page;
}
