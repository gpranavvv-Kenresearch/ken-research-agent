import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

const GOOGLESITE_ACCOUNTS_FILE = '.accounts/accounts-googlesite.json';
const SESSION_ROOT = path.resolve('.sessions/googlesite');

export interface GoogleSiteAccount {
  email: string;
  password: string;
  sessionDir?: string;
  nickname?: string;
  active: boolean;
}

export function getGoogleSiteAccounts(): GoogleSiteAccount[] {
  if (!fs.existsSync(GOOGLESITE_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(GOOGLESITE_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveGoogleSiteAccount(): GoogleSiteAccount | null {
  return getGoogleSiteAccounts().find(a => a.active) || null;
}

export function getGoogleSiteAccountByNickname(nickname: string): GoogleSiteAccount | null {
  return getGoogleSiteAccounts().find(a => a.nickname?.toLowerCase() === nickname.toLowerCase()) || null;
}

function sessionDirFor(email: string): string {
  const safe = String(email || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let browserContext: BrowserContext | null = null;

export async function closeGoogleSiteBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
    console.log('   Google Sites browser closed.');
  }
}

export async function loginToGoogleSite(options?: {
  email?: string;
  password?: string;
  nickname?: string;
  headless?: boolean;
  batchMode?: boolean;
}): Promise<Page> {
  const account = options?.nickname
    ? getGoogleSiteAccountByNickname(options.nickname) ?? getActiveGoogleSiteAccount()
    : getActiveGoogleSiteAccount();

  const email = options?.email || account?.email || process.env.GOOGLESITE_EMAIL || '';

  const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const sessionDir = account?.sessionDir
    ? path.resolve(account.sessionDir)
    : email
      ? sessionDirFor(email)
      : path.join(SESSION_ROOT, account?.nickname || 'default');

  fs.mkdirSync(sessionDir, { recursive: true });

  // Remove Chrome's singleton lock files that get left behind after crashes.
  // If these exist, Chrome opens about:blank and exits without creating a window.
  for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const lockPath = path.join(sessionDir, lockFile);
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); console.log(`   🧹 Removed stale lock: ${lockFile}`); } catch { /* ignore */ }
    }
  }

  console.log(`   Using session folder: ${sessionDir}`);
  console.log('   Launching Google Sites browser...');

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    headless: process.env.HEADLESS !== 'false',
    executablePath: chromePath,
    viewport: { width: 1366, height: 900 },
    slowMo: 50,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--start-minimized',
      ...(process.platform !== 'win32' ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : []),
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-blink-features=AutomationControlled',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
      '--simulate-outdated-no-au=Tue, 31 Dec 2099 00:00:00 GMT',
      '--disable-component-update',
      '--disable-features=ChromeWhatsNewUI',
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });

  await browserContext.addInitScript(() => {
    Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => false });
    (globalThis as any).window.chrome = (globalThis as any).window.chrome || { runtime: {} };
  });

  // Grant clipboard permissions so we can paste HTML content
  await browserContext.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Minimize window immediately so it doesn't disturb the screen
  if (!options?.manualLogin) {
    try {
      const tmpPage = browserContext.pages()[0] || await browserContext.newPage();
      const cdp = await browserContext.newCDPSession(tmpPage);
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await cdp.detach().catch(() => {});
    } catch { /* ignore — non-critical */ }
  }

  // Reuse the page the persistent context opened; close any extras
  const existingPages = browserContext.pages();
  let page: Page;
  if (existingPages.length > 0) {
    page = existingPages[0];
    for (const p of existingPages.slice(1)) await p.close().catch(() => {});
  } else {
    page = await browserContext.newPage();
  }

  // Let Chrome fully initialise before navigating
  await sleep(2000);

  // Go to Google Sites — retry up to 5 times if we land on about:blank
  console.log('   Navigating to Google Sites...');
  let navUrl = 'about:blank';
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await page.goto('https://sites.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (navErr: any) {
      console.log(`   ⚠️ goto error on attempt ${attempt}: ${navErr.message?.split('\n')[0]}`);
    }
    navUrl = page.url();
    if (navUrl !== 'about:blank' && navUrl !== '') break;
    console.log(`   ⚠️ Got about:blank on attempt ${attempt} — retrying in 5s...`);
    await sleep(5000);
  }
  if (navUrl === 'about:blank' || navUrl === '') {
    throw new Error('Google Sites failed to load after 5 attempts (about:blank)');
  }

  // Wait 5 seconds for session check
  console.log('   Waiting 5 seconds for session check...');
  await sleep(5000);

  // Check if already logged in — must be on sites.google.com, not accounts.google.com
  const currentUrl = page.url();
  const loggedIn = currentUrl.includes('sites.google.com') && !currentUrl.includes('accounts.google.com');
  if (loggedIn) {
    console.log(`   ✅ Already logged in to Google Sites`);
    return page;
  }

  // In batch mode, don't wait — fail fast so the batch moves to the next account
  if (options?.batchMode) {
    await closeGoogleSiteBrowser();
    throw new Error(`Google Sites session expired for ${email} — re-run save-googlesite-session`);
  }

  // If not logged in, wait indefinitely for manual login
  console.log(`   ⏳ Not logged in – waiting for manual login...`);
  console.log(`   💻 Close the browser when done logging in.`);

  // Keep checking until login succeeds or browser is closed
  let loginSucceeded = false;
  while (!loginSucceeded) {
    await sleep(2000);
    try {
      const currentUrl = await page.url();
      if (!currentUrl.includes('accounts.google.com')) {
        loginSucceeded = true;
        break;
      }
    } catch {
      throw new Error('Browser closed by user');
    }
  }

  console.log(`   ✅ Login successful`);
  return page;
}
