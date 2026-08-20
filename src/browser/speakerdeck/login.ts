import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { createInterface } from 'readline/promises';
import { killChromeForProfile } from '../../utils/killChrome.js';

// Confirmed against the real signin page DOM (2026-07-22):
// form action="/sessions", fields user[username]/user[password].
const SPEAKERDECK_SIGNIN_URL = 'https://speakerdeck.com/signin';
// /new (the upload page) redirects to /signin when logged out — used as the
// login-state probe, same trick as Naver's BlogHome redirect check.
const SPEAKERDECK_UPLOAD_URL = 'https://speakerdeck.com/new';

const SPEAKERDECK_ACCOUNTS_FILE = '.accounts/accounts-speakerdeck.json';
const SESSION_ROOT = path.resolve('.sessions/speakerdeck');

export interface SpeakerDeckAccount {
  email: string;
  password?: string;
  nickname?: string;
  sessionDir?: string;
  active: boolean;
}

export function getSpeakerDeckAccounts(): SpeakerDeckAccount[] {
  if (!fs.existsSync(SPEAKERDECK_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(SPEAKERDECK_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveSpeakerDeckAccount(): SpeakerDeckAccount | null {
  return getSpeakerDeckAccounts().find(a => a.active) || null;
}

export function getSpeakerDeckAccountByNickname(nickname: string): SpeakerDeckAccount | null {
  return getSpeakerDeckAccounts().find(a => a.nickname?.toLowerCase() === nickname.toLowerCase()) || null;
}

function sessionDirFor(nickname: string): string {
  const safe = String(nickname || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Session cookies can evaporate on process restart even inside a persistent
// context (confirmed the hard way on Naver — the real gatekeeper cookie is
// often set mid-session, not at login). Rewrite everything with a far-future
// expiry right before shutdown so nothing gets silently dropped.
async function persistSessionCookies(context: BrowserContext): Promise<void> {
  await sleep(2000);
  const cookies = await context.cookies();
  const relevant = cookies.filter(c => c.domain.includes('speakerdeck.com'));
  if (relevant.length === 0) return;
  const farFuture = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const rewritten = relevant.map(c => ({
    ...c,
    expires: c.expires && c.expires > 0 ? c.expires : farFuture,
  }));
  await context.addCookies(rewritten);
}

let browserContext: BrowserContext | null = null;

export async function closeSpeakerDeckBrowser(): Promise<void> {
  if (browserContext) {
    await persistSessionCookies(browserContext).catch(() => {});
    await browserContext.close().catch(() => {});
    browserContext = null;
    console.log('   Speaker Deck browser closed.');
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(SPEAKERDECK_UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1500);
    return !page.url().includes('/signin');
  } catch {
    return false;
  }
}

// Speaker Deck's upload page is a normal server-rendered page (unlike Naver's
// heavy SPA), so a short poll is enough — kept for consistency/safety anyway.
async function waitForLoggedInOnLoad(page: Page): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    if (await isLoggedIn(page)) return true;
    await sleep(1500);
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
  console.log(`   Using Speaker Deck session: ${sessionDir}`);

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

export async function loginToSpeakerDeck(options?: { nickname?: string }): Promise<Page> {
  const account = options?.nickname
    ? getSpeakerDeckAccountByNickname(options.nickname) ?? getActiveSpeakerDeckAccount()
    : getActiveSpeakerDeckAccount();

  if (!account) throw new Error('No Speaker Deck account found in .accounts/accounts-speakerdeck.json');

  const sessionDir = account.sessionDir ? path.resolve(account.sessionDir) : sessionDirFor(account.nickname || account.email || 'default');
  const page = await launchContext(sessionDir);

  console.log('   Checking Speaker Deck session...');
  if (await waitForLoggedInOnLoad(page)) {
    console.log(`   ✅ Already logged in to Speaker Deck (${account.nickname})`);
    return page;
  }

  console.log('   Not logged in — starting Speaker Deck login...');
  await page.goto(SPEAKERDECK_SIGNIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);

  if (account.email && account.password) {
    try {
      const userInput = page.locator('#user_username').first();
      await userInput.waitFor({ state: 'visible', timeout: 10000 });
      await userInput.click();
      await page.keyboard.type(account.email, { delay: 80 });
      await sleep(300);

      const pwInput = page.locator('#user_password').first();
      await pwInput.click();
      await page.keyboard.type(account.password, { delay: 80 });
      await sleep(300);

      await page.locator('input[type="submit"][name="commit"]').first().click({ timeout: 5000 });
      await sleep(2000);
    } catch (err: any) {
      console.warn(`   ⚠️ Could not auto-fill Speaker Deck login: ${err.message}`);
      console.log('   👉 Please log in manually in the browser window.\n');
    }
  } else {
    console.log('   👉 Please log in manually in the browser window.\n');
  }

  // Cloudflare's bot-challenge script is present on this domain — may need a
  // manual solve, so fall back to a press-Enter confirmation rather than
  // failing outright if the automated fill above didn't finish the job.
  if (!(await waitForLoggedInOnLoad(page))) {
    console.log('   ⏳ Not detected as logged in yet.');
    await waitForEnter('   If you need to finish logging in manually (captcha, etc.), do so now, then press Enter here... ');
  }

  if (!(await isLoggedIn(page))) {
    await closeSpeakerDeckBrowser();
    throw new Error('Speaker Deck login failed — still redirected to /signin after confirmation.');
  }

  console.log(`   ✅ Speaker Deck login confirmed (${account.nickname}).`);
  return page;
}

// Standalone: npx tsx src/browser/speakerdeck/login.ts --nickname aniket
async function main() {
  const args = process.argv.slice(2);
  const nickIdx = args.indexOf('--nickname');
  const nickname = nickIdx !== -1 ? args[nickIdx + 1] : undefined;
  console.log(`\n🔐 Speaker Deck Login${nickname ? ` (${nickname})` : ''}`);
  try {
    await loginToSpeakerDeck({ nickname });
    console.log('\n✅ Session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
  } catch (err: any) {
    console.error('Login failed:', err.message);
    process.exit(1);
  }
}

if (process.argv[1]?.includes('speakerdeck/login') || process.argv[1]?.includes('speakerdeck\\login')) main();
