/**
 * Calisthenics login — persistent browser session (calisthenics.mn.co)
 */

import { chromium, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { STEALTH_ARGS, STEALTH_USER_AGENT, applyStealth } from '../../utils/stealth.js';

interface CalisthenicsAccount {
  username: string;
  nickname: string;
  sessionDir: string;
  utm: string;
}

const ACCOUNTS_FILE = path.join(process.cwd(), '.accounts', 'accounts-calisthenics.json');
const CHROME_PATH = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let browserContext: BrowserContext | null = null;
let currentNickname: string | null = null;

export function getCalisthenicsAccounts(): CalisthenicsAccount[] {
  if (!fs.existsSync(ACCOUNTS_FILE)) return [];
  // Registry file is a plain array (same format every other platform's account
  // registry uses, and what registerFleetAccount() writes) — not { accounts: [...] }.
  const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  return Array.isArray(data) ? data : (data.accounts || []);
}

export function getCalisthenicsAccountByNickname(nickname: string): CalisthenicsAccount | null {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const target = normalize(nickname);
  return getCalisthenicsAccounts().find(a => a.nickname && normalize(a.nickname) === target) || null;
}

export async function closeCaliBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
    currentNickname = null;
    console.log('   Calisthenics browser closed.');
  }
}

export async function loginCalisthenics(nickname: string, manualLogin = false): Promise<Page> {
  const account = getCalisthenicsAccountByNickname(nickname);
  if (!account) throw new Error(`Calisthenics account not found: ${nickname}`);

  // Close previous context if switching accounts
  if (browserContext && currentNickname !== nickname) {
    await closeCaliBrowser();
  }

  const sessionDir = path.resolve(account.sessionDir);
  fs.mkdirSync(sessionDir, { recursive: true });

  console.log(`   Using session folder: ${sessionDir}`);
  console.log('   Launching Calisthenics browser...');

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    // Calisthenics (Mighty Networks) sits behind Cloudflare, which challenges
    // headless Chrome outright — confirmed live via the dashboard's remote-view
    // (a Turnstile "Verify you are human" screen instead of the real site).
    // Runs headed regardless of the HEADLESS toggle, plus the full stealth
    // patch set below (STEALTH_ARGS/applyStealth) to remove the static
    // JS-level automation signals Cloudflare's check looks for.
    headless: false,
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
    permissions: ['clipboard-read', 'clipboard-write'],
    executablePath: CHROME_PATH,
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
    ],
  });

  await applyStealth(browserContext);

  // Minimize immediately unless manual login
  if (!manualLogin) {
    try {
      const tmpPage = browserContext.pages()[0] || await browserContext.newPage();
      const cdp = await browserContext.newCDPSession(tmpPage);
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await cdp.detach().catch(() => {});
    } catch { /* ignore */ }
  }

  const existingPages = browserContext.pages();
  let page: Page;
  if (existingPages.length > 0) {
    page = existingPages[0];
    for (const p of existingPages.slice(1)) await p.close().catch(() => {});
  } else {
    page = await browserContext.newPage();
  }

  console.log('   Navigating to Calisthenics...');
  await page.goto('https://calisthenics.mn.co/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for either the Create button (logged in) or sign-in link (not logged in)
  await page.waitForSelector('button[aria-label="Create content"], a[title="Create"], a[href*="/sign_in"]', { timeout: 30000 }).catch(() => {});

  // Check if already logged in
  const loggedIn = !page.url().includes('/sign_in') && !page.url().includes('/login');
  if (loggedIn) {
    console.log(`   ✅ Already logged in to Calisthenics (${nickname})`);
    currentNickname = nickname;
    return page;
  }

  if (!manualLogin) {
    // Wait up to 60s for session to load
    console.log('   ⏳ Session not active — waiting for login...');
    let attempts = 0;
    while (attempts < 30) {
      await sleep(2000);
      const url = page.url();
      if (!url.includes('/sign_in') && !url.includes('/login')) {
        console.log(`   ✅ Logged in to Calisthenics (${nickname})`);
        currentNickname = nickname;
        return page;
      }
      attempts++;
    }
    throw new Error(`Calisthenics session not valid for ${nickname}. Run: npm run dev -- save-calisthenics-session ${nickname}`);
  }

  // Manual login mode — wait indefinitely until user logs in
  console.log(`   💻 Please log in manually in the browser window.`);
  while (true) {
    await sleep(2000);
    try {
      const url = page.url();
      if (!url.includes('/sign_in') && !url.includes('/login')) {
        console.log(`   ✅ Login detected for ${nickname}`);
        currentNickname = nickname;
        return page;
      }
    } catch {
      throw new Error('Browser closed by user');
    }
  }
}
