import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { STEALTH_ARGS, STEALTH_USER_AGENT, applyStealth } from '../../utils/stealth.js';
import { hasAuthCookie } from '../../utils/authCookieCheck.js';

const LINKMATE_ACCOUNTS_FILE = '.accounts/accounts-linkmate.json';
const SESSION_ROOT = path.resolve('.sessions/linkmate');

export interface LinkmateAccount {
  email: string;
  password?: string;
  sessionDir?: string;
  nickname?: string;
  utm?: string;
  active: boolean;
}

export function getLinkmateAccounts(): LinkmateAccount[] {
  if (!fs.existsSync(LINKMATE_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LINKMATE_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveLinkmateAccount(): LinkmateAccount | null {
  return getLinkmateAccounts().find(a => a.active) || null;
}

export function getLinkmateAccountByNickname(nickname: string): LinkmateAccount | null {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const target = normalize(nickname);
  return getLinkmateAccounts().find(a => a.nickname && normalize(a.nickname) === target) || null;
}

function sessionDirFor(email: string): string {
  const safe = String(email || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let browserContext: BrowserContext | null = null;

export async function closeLinkmeateBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
    console.log('   Linkmate browser closed.');
  }
}

export async function loginToLinkmate(options?: {
  email?: string;
  password?: string;
  nickname?: string;
}): Promise<Page> {
  const account = options?.nickname
    ? getLinkmateAccountByNickname(options.nickname)
    : getActiveLinkmateAccount();

  if (options?.nickname && !account) {
    throw new Error(`Linkmate account "${options.nickname}" not found in ${LINKMATE_ACCOUNTS_FILE} — refusing to silently fall back to a different account`);
  }

  const email    = options?.email    || account?.email    || process.env.LINKMATE_EMAIL;
  const password = options?.password || account?.password || process.env.LINKMATE_PASSWORD;

  // Fleet accounts (from the login portal) are password-less and email-less by
  // design — they only carry a sessionDir from a real browser login. Only error
  // out if we have neither an email nor a session to fall back on.
  if (!email && !account?.sessionDir) {
    throw new Error(`Linkmate email missing. Add account to .accounts/accounts-linkmate.json or set LINKMATE_EMAIL env var.`);
  }

  const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const sessionDir = account?.sessionDir ? path.resolve(account.sessionDir) : sessionDirFor(email as string);

  // Don't create if it doesn't exist - use existing saved session
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  console.log(`   Using session folder: ${sessionDir}`);
  console.log('   Launching Linkmate browser...');

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    // Linkmate (Mighty Networks) sits behind Cloudflare, which challenges
    // headless Chrome outright — confirmed live via the dashboard's remote-view
    // (a Turnstile "Verify you are human" screen instead of the real site).
    // Runs headed regardless of the HEADLESS toggle, plus the full stealth
    // patch set below (STEALTH_ARGS/applyStealth) to remove the static
    // JS-level automation signals Cloudflare's check looks for.
    headless: false,
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
    permissions: ['clipboard-read', 'clipboard-write'],
    executablePath: chromePath,
    userAgent: STEALTH_USER_AGENT,
    viewport: { width: 1366, height: 900 },
    slowMo: 50,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--start-minimized',
      ...(process.platform !== 'win32' ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : []),
      ...STEALTH_ARGS,
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--simulate-outdated-no-au=Tue, 31 Dec 2099 00:00:00 GMT',
      '--disable-component-update',
      '--disable-features=ChromeWhatsNewUI',
    ],
  });

  await applyStealth(browserContext);

  // Minimize window immediately so it doesn't disturb the screen
  try {
    const tmpPage = browserContext.pages()[0] || await browserContext.newPage();
    const cdp = await browserContext.newCDPSession(tmpPage);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    await cdp.detach().catch(() => {});
  } catch { /* ignore — non-critical */ }

  // Reuse the page the persistent context opened; close any extras
  const existingPages = browserContext.pages();
  let page: Page;
  if (existingPages.length > 0) {
    page = existingPages[0];
    for (const p of existingPages.slice(1)) await p.close().catch(() => {});
  } else {
    page = await browserContext.newPage();
  }

  console.log('   Navigating to Linkmate...');
  await page.goto('https://linkmate.mn.co/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for either the Create button (logged in) or sign-in link (not logged in)
  await page.waitForSelector('button[aria-label="Create content"], a[title="Create"], a[href*="/sign_in"]', { timeout: 30000 }).catch(() => {});

  const url = page.url();
  if ((url.includes('/sign_in') || url.includes('/login')) && !(browserContext && await hasAuthCookie(browserContext, 'linkmate'))) {
    await closeLinkmeateBrowser();
    throw new Error(`No active Linkmate session for "${options?.nickname}". Run: npm run dev -- save-linkmate-session ${options?.nickname}`);
  }

  console.log(`   ✅ Session loaded for Linkmate (${options?.nickname ?? email})`);
  return page;
}
