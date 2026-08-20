/**
 * slideshare/login.ts — SlideShare login via LinkedIn OAuth
 * SlideShare (LinkedIn-owned) uses LinkedIn credentials for auth.
 * Persistent Chrome sessions stored under .sessions/slideshare-<nickname>
 */

import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { killChromeForProfile } from '../../utils/killChrome.js';

const SLIDESHARE_ACCOUNTS_FILE = '.accounts/accounts-slideshare.json';
const SESSION_ROOT = path.resolve('.sessions/slideshare');
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

fs.mkdirSync(SESSION_ROOT, { recursive: true });

export interface SlideShareAccount {
  email: string;
  password: string;
  sessionDir?: string;
  nickname?: string;
  active: boolean;
}

export function getSlideShareAccounts(): SlideShareAccount[] {
  if (!fs.existsSync(SLIDESHARE_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(SLIDESHARE_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveSlideShareAccount(): SlideShareAccount | null {
  return getSlideShareAccounts().find(a => a.active) || null;
}

export function getSlideShareAccountByNickname(nickname: string): SlideShareAccount | null {
  return getSlideShareAccounts().find(a => a.nickname?.toLowerCase() === nickname.toLowerCase()) || null;
}

function sessionDirFor(nickname: string): string {
  const safe = String(nickname || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min = 500, max = 1500) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);

let browserContext: BrowserContext | null = null;

export async function closeSlideShareBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
    console.log('   SlideShare browser closed.');
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto('https://www.slideshare.net/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);
    const url = page.url();
    // Check for user dashboard indicators
    const hasAvatar = await page.locator('img[class*="avatar"], [data-testid="user-avatar"], img[alt*="profile"]').first().isVisible().catch(() => false);
    const hasUpload = await page.locator('a[href*="upload"], button:has-text("Upload")').first().isVisible().catch(() => false);
    const notOnLogin = !url.includes('/login') && !url.includes('/signup');
    return (hasAvatar || hasUpload) && notOnLogin;
  } catch {
    return false;
  }
}

async function doLinkedInOAuth(page: Page, email: string, password: string): Promise<boolean> {
  try {
    console.log('   Navigating to SlideShare login...');
    await page.goto('https://www.slideshare.net/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1500, 2500);

    // Click "Continue with LinkedIn"
    const liButtonSelectors = [
      'a[href*="linkedin"][href*="oauth"]',
      'a[href*="linkedin"][href*="auth"]',
      'button:has-text("LinkedIn")',
      'a:has-text("LinkedIn")',
      '[class*="linkedin"]',
    ];

    let clicked = false;
    for (const sel of liButtonSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        await page.click(sel);
        clicked = true;
        console.log(`   Clicked LinkedIn button: ${sel}`);
        break;
      } catch { /* try next */ }
    }

    if (!clicked) {
      console.error('   ❌ Could not find "Continue with LinkedIn" button');
      return false;
    }

    await randomDelay(2000, 3000);

    // Check if we landed on LinkedIn OAuth
    const currentUrl = page.url();
    if (!currentUrl.includes('linkedin.com')) {
      console.error(`   ❌ Expected LinkedIn OAuth page, got: ${currentUrl}`);
      return false;
    }

    console.log('   On LinkedIn OAuth — filling credentials...');

    // Fill email
    await page.waitForSelector('#username, input[name="session_key"], input[type="email"]', { timeout: 15000 });
    const emailSel = '#username, input[name="session_key"], input[type="email"]';
    await page.click(emailSel);
    await page.keyboard.type(email, { delay: 80 });
    await randomDelay(500, 900);

    // Fill password
    await page.waitForSelector('#password, input[name="session_password"], input[type="password"]', { timeout: 10000 });
    const pwSel = '#password, input[name="session_password"], input[type="password"]';
    await page.click(pwSel);
    await page.keyboard.type(password, { delay: 80 });
    await randomDelay(500, 900);

    // Submit
    const submitSel = 'button[type="submit"], button:has-text("Sign in"), button:has-text("Allow")';
    await page.waitForSelector(submitSel, { timeout: 10000 });
    await page.click(submitSel);

    await randomDelay(3000, 5000);

    // Handle "Allow access" consent screen if it appears
    const allowBtn = page.locator('button:has-text("Allow"), button:has-text("Authorize")').first();
    if (await allowBtn.isVisible().catch(() => false)) {
      await allowBtn.click();
      await randomDelay(2000, 3000);
    }

    // Verify we're back on SlideShare
    const finalUrl = page.url();
    if (finalUrl.includes('slideshare.net') && !finalUrl.includes('/login')) {
      console.log('   ✅ LinkedIn OAuth completed — logged into SlideShare');
      return true;
    }

    console.error(`   ❌ OAuth did not complete — final URL: ${finalUrl}`);
    return false;
  } catch (err: any) {
    console.error(`   ❌ LinkedIn OAuth failed: ${err.message}`);
    return false;
  }
}

export async function loginToSlideShare(options?: {
  email?: string;
  password?: string;
  nickname?: string;
}): Promise<{ context: BrowserContext; page: Page }> {
  await closeSlideShareBrowser();

  let account: SlideShareAccount | null = null;
  if (options?.nickname) {
    account = getSlideShareAccountByNickname(options.nickname);
  }

  const email    = options?.email    || account?.email    || process.env.LINKEDIN_EMAIL!;
  const password = options?.password || account?.password || process.env.LINKEDIN_PASSWORD!;
  const nickname = options?.nickname || account?.nickname || email.split('@')[0];

  const chromePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : chromium.executablePath();
  const sessionDir = account?.sessionDir ? path.resolve(account.sessionDir) : sessionDirFor(nickname);
  fs.mkdirSync(sessionDir, { recursive: true });
  await killChromeForProfile(sessionDir);

  console.log(`   Using SlideShare session: ${sessionDir}`);

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    headless: true,
    executablePath: chromePath,
    viewport: { width: 1366, height: 900 },
    slowMo: 50,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--start-minimized',
      '--disable-blink-features=AutomationControlled',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = browserContext.pages()[0] || await browserContext.newPage();

  // Check existing session
  if (await isLoggedIn(page)) {
    console.log(`   ✅ SlideShare session valid for ${nickname}`);
    return { context: browserContext, page };
  }

  console.log(`   Session expired — performing LinkedIn OAuth for ${nickname}...`);
  const success = await doLinkedInOAuth(page, email, password);

  if (!success) {
    throw new Error(`SlideShare login failed for ${nickname}`);
  }

  return { context: browserContext, page };
}
