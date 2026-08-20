import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { createInterface } from 'readline/promises';
import { killChromeForProfile } from '../../utils/killChrome.js';

// Confirmed against the real signin page DOM (2026-07-22):
// input#email (name="email"), input#password (name="password"),
// plus a Cookiebot consent overlay that must be dismissed first.
const ISSUU_SIGNIN_URL = 'https://issuu.com/home/login';
// /publish redirects to /signin when logged out — used as the login-state probe.
const ISSUU_PUBLISH_URL = 'https://issuu.com/publish';
const COOKIEBOT_ACCEPT_SEL = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';

const ISSUU_ACCOUNTS_FILE = '.accounts/accounts-issuu.json';
const SESSION_ROOT = path.resolve('.sessions/issuu');

export interface IssuuAccount {
  email: string;
  password?: string;
  nickname?: string;
  sessionDir?: string;
  active: boolean;
}

export function getIssuuAccounts(): IssuuAccount[] {
  if (!fs.existsSync(ISSUU_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ISSUU_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveIssuuAccount(): IssuuAccount | null {
  return getIssuuAccounts().find(a => a.active) || null;
}

export function getIssuuAccountByNickname(nickname: string): IssuuAccount | null {
  return getIssuuAccounts().find(a => a.nickname?.toLowerCase() === nickname.toLowerCase()) || null;
}

function sessionDirFor(nickname: string): string {
  const safe = String(nickname || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function persistSessionCookies(context: BrowserContext): Promise<void> {
  await sleep(2000);
  const cookies = await context.cookies();
  const relevant = cookies.filter(c => c.domain.includes('issuu.com'));
  if (relevant.length === 0) return;
  const farFuture = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const rewritten = relevant.map(c => ({
    ...c,
    expires: c.expires && c.expires > 0 ? c.expires : farFuture,
  }));
  await context.addCookies(rewritten);
}

let browserContext: BrowserContext | null = null;

export async function closeIssuuBrowser(): Promise<void> {
  if (browserContext) {
    await persistSessionCookies(browserContext).catch(() => {});
    await browserContext.close().catch(() => {});
    browserContext = null;
    console.log('   Issuu browser closed.');
  }
}

async function dismissCookieBanner(page: Page): Promise<void> {
  try {
    const btn = page.locator(COOKIEBOT_ACCEPT_SEL).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await sleep(500);
    }
  } catch { /* banner not present — fine */ }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(ISSUU_PUBLISH_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);
    return !page.url().includes('signin');
  } catch {
    return false;
  }
}

// Issuu's app shell is JS-heavy (431KB rendered HTML on the signin page
// alone) — poll rather than trust a single snapshot, same lesson as Naver.
async function waitForLoggedInOnLoad(page: Page): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    if (await isLoggedIn(page)) return true;
    await sleep(2000);
  }
  return false;
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
  console.log(`   Using Issuu session: ${sessionDir}`);

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    channel: fs.existsSync(chromePath) ? undefined : 'chrome',
    viewport: null,
    slowMo: 50,
    permissions: ['clipboard-read', 'clipboard-write'],
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

export async function loginToIssuu(options?: { nickname?: string }): Promise<Page> {
  const account = options?.nickname
    ? getIssuuAccountByNickname(options.nickname) ?? getActiveIssuuAccount()
    : getActiveIssuuAccount();

  if (!account) throw new Error('No Issuu account found in .accounts/accounts-issuu.json');

  const sessionDir = account.sessionDir ? path.resolve(account.sessionDir) : sessionDirFor(account.nickname || account.email || 'default');
  const page = await launchContext(sessionDir);

  console.log('   Checking Issuu session...');
  if (await waitForLoggedInOnLoad(page)) {
    console.log(`   ✅ Already logged in to Issuu (${account.nickname})`);
    return page;
  }

  console.log('   Not logged in — starting Issuu login...');
  await page.goto(ISSUU_SIGNIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await dismissCookieBanner(page);

  if (account.email && account.password) {
    try {
      const emailInput = page.locator('#email').first();
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.click();
      await page.keyboard.type(account.email, { delay: 80 });
      await sleep(300);

      const pwInput = page.locator('#password').first();
      await pwInput.click();
      await page.keyboard.type(account.password, { delay: 80 });
      await sleep(300);

      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await sleep(2500);
    } catch (err: any) {
      console.warn(`   ⚠️ Could not auto-fill Issuu login: ${err.message}`);
      console.log('   👉 Please log in manually in the browser window.\n');
    }
  } else {
    console.log('   👉 Please log in manually in the browser window.\n');
  }

  if (!(await waitForLoggedInOnLoad(page))) {
    console.log('   ⏳ Not detected as logged in yet.');
    await waitForEnter('   If you need to finish logging in manually (captcha, 2FA, etc.), do so now, then press Enter here... ');
  }

  if (!(await isLoggedIn(page))) {
    await closeIssuuBrowser();
    throw new Error('Issuu login failed — still redirected to signin after confirmation.');
  }

  console.log(`   ✅ Issuu login confirmed (${account.nickname}).`);
  return page;
}

// Standalone: npx tsx src/browser/issuu/login.ts --nickname aniket
async function main() {
  const args = process.argv.slice(2);
  const nickIdx = args.indexOf('--nickname');
  const nickname = nickIdx !== -1 ? args[nickIdx + 1] : undefined;
  console.log(`\n🔐 Issuu Login${nickname ? ` (${nickname})` : ''}`);
  try {
    await loginToIssuu({ nickname });
    console.log('\n✅ Session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
  } catch (err: any) {
    console.error('Login failed:', err.message);
    process.exit(1);
  }
}

if (process.argv[1]?.includes('issuu/login') || process.argv[1]?.includes('issuu\\login')) main();
