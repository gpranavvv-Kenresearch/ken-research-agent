import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { killChromeForProfile } from '../../utils/killChrome.js';
import { identityLaunchOverrides } from '../../health/proxyPool.js';
import { applyStealth } from '../../utils/stealth.js';

const LINKEDIN_ACCOUNTS_FILE = '.accounts/linkedin-accounts.json';
const SESSION_ROOT = path.resolve('li-sessions');
const CHROME_PATH = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
const MANUAL_LOGIN_TIMEOUT_MS = 30_000;

fs.mkdirSync(SESSION_ROOT, { recursive: true });

export interface LinkedInAccount {
  email: string;
  password: string;
  sessionDir?: string;
  nickname?: string;
  profileUrl?: string;
  active: boolean;
}

export function getLinkedInAccounts(): LinkedInAccount[] {
  if (!fs.existsSync(LINKEDIN_ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LINKEDIN_ACCOUNTS_FILE, 'utf8'));
}

export function getActiveLinkedInAccount(): LinkedInAccount | null {
  return getLinkedInAccounts().find(a => a.active) || null;
}

export function getLinkedInAccountByNickname(nickname: string): LinkedInAccount | null {
  // Sheet "Name" column entries are inconsistently spaced ("abhinav 7" vs "abhinav7") —
  // match ignoring whitespace so both resolve to the same account instead of
  // silently failing to find a real, existing session.
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const target = normalize(nickname);
  const accounts = getLinkedInAccounts();
  const exact = accounts.find(a => a.nickname && normalize(a.nickname) === target);
  if (exact) return exact;

  // No account substitution: a row asking for an account that isn't registered
  // (e.g. "abhinav 12" when only 1-8 exist) must fail with a clear error, never
  // silently reuse a different account's session. The old wrap-around fallback
  // was doing exactly that — repeatedly re-launching the SAME session dir under
  // multiple different requested nicknames within one batch, which is what was
  // producing the "Credentials missing" / rapid back-to-back-launch failures.
  return null;
}

function sessionDirFor(username: string): string {
  const safe = String(username || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SESSION_ROOT, safe || 'default');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min = 500, max = 1400) =>
  sleep(Math.floor(Math.random() * (max - min + 1)) + min);

// ── 2FA detection ───────────────────────────────────────────────────────────

async function detectTwoFactorBlock(page: Page, username: string): Promise<boolean> {
  try {
    const url = (page.url() || '').toLowerCase();
    if (
      url.includes('two_step_verification') ||
      url.includes('two-step-verification') ||
      url.includes('checkpoint/challenge')
    ) {
      console.log(`   ⚠️  ${username}: 2FA verification required — cannot log in automatically`);
      return true;
    }
    const indicators = [
      'text=/two[-\\s]?step verification/i',
      'text=/verification code/i',
      'input[name="pin"]',
      'input[name="verification_code"]',
      '#input__phone_verification_pin',
    ];
    for (const sel of indicators) {
      const visible = await page.locator(sel).first().isVisible().catch(() => false);
      if (visible) {
        console.log(`   ⚠️  ${username}: 2FA indicator found (${sel}) — cannot log in automatically`);
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

// ── Login helper ────────────────────────────────────────────────────────────

async function ensureLoggedIn(page: Page, email: string, password: string): Promise<boolean> {
  try {
    // A profile with a valid long-lived "remember me" token but an EXPIRED li_at
    // lands here mid-navigation, not on /feed/ directly — LinkedIn silently
    // re-authenticates it through a server-side redirect chain
    // (/ssr-login/remember-me-auto-login?midToken=...) before finally landing on
    // /feed/. The default 30s goto timeout was too short for that chain on a slow
    // run, throwing a navigation-timeout that got treated as "not logged in" —
    // discarding a session that would have recovered on its own. Give it real room.
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (await detectTwoFactorBlock(page, email)) return false;

    // Still mid-redirect (auto-relogin in progress) — wait for it to land instead
    // of judging "logged in?" on an intermediate URL.
    if (/\/ssr-login\/|remember-me-auto-login|session_mid_token/.test(page.url().toLowerCase())) {
      console.log(`   ⏳ ${email || 'session account'}: LinkedIn auto-relogin redirect in progress, waiting...`);
      await page.waitForURL(/linkedin\.com\/feed\/?($|\?)/, { timeout: 20_000 }).catch(() => {});
    }

    // Robust logged-in detection. The old check did an INSTANT .isVisible() on one
    // nav link with no wait, so a still-rendering feed read as "logged out" → the
    // code then demanded email/password these session-only accounts don't have →
    // "Credentials missing" on accounts the dashboard correctly shows as logged in.
    // Fix: give the nav time to render, check several signals, and treat staying on
    // /feed (not redirected to login/authwall/checkpoint) as logged in.
    const checkLoggedIn = async (): Promise<boolean> => {
      const url = (page.url() || '').toLowerCase();
      const kickedOut = /\/login|\/checkpoint|\/authwall|\/signup|\/uas\/|\/ssr-login\//.test(url);
      const navVisible = await page.locator(
        'a[href*="/mynetwork/"], img.global-nav__me-photo, .global-nav__me, [data-control-name="identity_welcome_message"], button[aria-label*="settings" i]'
      ).first().isVisible({ timeout: 8000 }).catch(() => false);
      // Require the real nav UI, not just a /feed URL — the URL can read /feed while
      // the page is still a loading shell (slow network, an A/B interstitial, a
      // restricted-account notice), and that false "logged in" verdict was the thing
      // sending the poster on to a page with no "Start a post" button to find —
      // surfacing downstream as "composer textbox never appeared", not as a login
      // failure. A bare url.includes('/feed') fallback (no nav check at all) is kept
      // only as a last resort, since some legitimately-logged-in narrow viewports
      // don't render every nav selector above.
      return !kickedOut && (navVisible || (url.includes('/feed') && await page.locator('div.feed-shared-update-v2, main#main').first().isVisible({ timeout: 5000 }).catch(() => false)));
    };

    await page.waitForTimeout(2500);
    let alreadyLoggedIn = await checkLoggedIn();

    // Real polling patience before concluding "not logged in" — a single retry
    // still wasn't enough: confirmed live on a real, verified-valid session
    // (li_at cookie present, expires a year out) failing under load anyway.
    // Session-only fleet accounts have NO password fallback, so a false "not
    // logged in" here is not recoverable — it's thrown away outright. Worth
    // being patient. Headed/visual runs (DISPLAY set for a human to watch) are
    // slower than normal headless production, and multiple Chrome instances
    // launching back-to-back on this box compounds it — so poll for real,
    // don't just look twice on a clock.
    if (!alreadyLoggedIn && !email && !password) {
      for (let attempt = 1; attempt <= 4 && !alreadyLoggedIn; attempt++) {
        console.log(`   ⏳ ${email || 'session account'}: not confirmed logged in yet — waiting (poll ${attempt}/4)...`);
        await page.waitForTimeout(2500);
        alreadyLoggedIn = await checkLoggedIn();
      }
      // Last resort: a full reload in case the page itself got stuck, not just slow.
      if (!alreadyLoggedIn) {
        console.log(`   ⏳ ${email || 'session account'}: still not confirmed — reloading for one final look...`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(4000);
        alreadyLoggedIn = await checkLoggedIn();
      }

      // Final fallback: the nav-render check above is a UI guess and can still
      // false-negative on a genuinely valid session (confirmed live — a session
      // with li_at valid a year out failed every poll above on real hardware).
      // li_at is LinkedIn's actual active-session cookie; its mere presence is a
      // stronger signal than any UI element rendering in time. Trust it over the
      // render check rather than throwing away a working session-only account.
      if (!alreadyLoggedIn) {
        const cookies = await page.context().cookies('https://www.linkedin.com').catch(() => []);
        if (cookies.some((c) => c.name === 'li_at')) {
          console.log(`   ✅ ${email || 'session account'}: li_at cookie present — trusting it over the UI render check`);
          alreadyLoggedIn = true;
        }
      }
    }

    if (alreadyLoggedIn) {
      console.log(`   ✅ ${email || 'session account'}: already logged in`);
      return true;
    }

    if (!email || !password) {
      console.error(`   ❌ Credentials missing for ${email || 'unknown account'}`);
      return false;
    }

    // ── Auto-login attempt ──────────────────────────────────────────────────
    console.log(`   🔐 ${email}: session missing, attempting auto-login...`);
    const onLoginPage = (page.url() || '').toLowerCase().includes('login');
    if (!onLoginPage) {
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
    }
    if (await detectTwoFactorBlock(page, email)) return false;

    const userField = page.locator('input#username, input[name="session_key"]');
    if (await userField.isVisible().catch(() => false)) {
      await userField.fill(email);
      await randomDelay();
    }

    const passField = page.locator('input#password, input[name="session_password"]');
    if (await passField.isVisible().catch(() => false)) {
      await passField.fill(password);
      await randomDelay();
      await page.keyboard.press('Enter').catch(() => {});
    }

    await page.waitForTimeout(4000);
    if (await detectTwoFactorBlock(page, email)) return false;

    const loggedIn = await page.locator('a[href*="/mynetwork/"]').first().isVisible().catch(() => false);
    if (loggedIn) {
      console.log(`   ✅ ${email}: login successful`);
      return true;
    }

    // ── Manual login fallback ───────────────────────────────────────────────
    console.log(`   ⚠️  ${email}: auto-login failed — waiting for manual login (${MANUAL_LOGIN_TIMEOUT_MS / 1000}s)...`);
    try {
      await page.locator('a[href*="/mynetwork/"]').first().waitFor({ state: 'visible', timeout: MANUAL_LOGIN_TIMEOUT_MS });
      console.log(`   ✅ ${email}: manual login detected`);
      return true;
    } catch {
      console.error(`   ❌ ${email}: manual login not detected within ${MANUAL_LOGIN_TIMEOUT_MS / 1000}s`);
      return false;
    }
  } catch (err: any) {
    console.error(`   ❌ Login error for ${email}: ${err.message}`);
    return false;
  }
}

// ── Browser context management ──────────────────────────────────────────────

let browserContext: BrowserContext | null = null;
let headlessBrowser: import('playwright').Browser | null = null;

export async function closeLinkedInBrowser(): Promise<void> {
  if (browserContext) { await browserContext.close().catch(() => {}); browserContext = null; }
  if (headlessBrowser) { await headlessBrowser.close().catch(() => {}); headlessBrowser = null; }
  console.log('   LinkedIn browser closed.');
}

export async function loginToLinkedIn(options?: {
  email?: string;
  password?: string;
  nickname?: string;
}): Promise<Page> {
  // A nickname argument that is present but blank means the sheet "Name" column was
  // empty for this row. The old code treated "" as falsy and silently fell through to
  // getActiveLinkedInAccount() — which either posted every nameless row to the SAME
  // wrong profile, or (with no active account) left `email` undefined and threw the
  // infamous "Unable to log in to LinkedIn as undefined". Fail clearly instead.
  const requestedNickname = options?.nickname?.trim();
  if (options && 'nickname' in options && !requestedNickname) {
    throw new Error('LinkedIn login skipped: row has no account name (empty "Name" column in sheet) — assign an account before posting');
  }

  const account = requestedNickname
    ? getLinkedInAccountByNickname(requestedNickname)
    : getActiveLinkedInAccount();

  if (requestedNickname && !account) {
    throw new Error(`LinkedIn account "${requestedNickname}" not found in ${LINKEDIN_ACCOUNTS_FILE} — refusing to silently fall back to a different account`);
  }

  const nickname  = (requestedNickname || account?.nickname || 'unknown').toLowerCase();
  const email    = options?.email    || account?.email    || process.env.LINKEDIN_EMAIL!;
  const password = options?.password || account?.password || process.env.LINKEDIN_PASSWORD!;

  // ── Cookies-only path (GitHub Actions) ──────────────────────────────────────
  const cookiesFile = path.resolve(`.sessions-cookies/li-${nickname}.json`);
  if (fs.existsSync(cookiesFile)) {
    console.log(`   Loading LI cookies: ${cookiesFile}`);
    const chromePath = CHROME_PATH && fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined;
    headlessBrowser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      executablePath: chromePath,
      args: ['--start-minimized', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationControlled'],
    });
    browserContext = await headlessBrowser.newContext({
      storageState: cookiesFile,
      viewport: { width: 1366, height: 900 },
    });
    // FB and X both patch navigator.webdriver/window.chrome before the first
    // navigation; LinkedIn never did, on either its cookies path or its
    // persistent-profile path below — the one concrete hardening gap versus the
    // other two platforms (see applyStealth in ../../utils/stealth.ts).
    await applyStealth(browserContext);
    await browserContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await browserContext.newPage();
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    const url = page.url();
    if (url.includes('/feed') || url.includes('/in/')) {
      console.log(`   ✅ LI cookies valid for ${nickname}`);
      return page;
    }
    console.warn(`   ⚠️ LI cookies expired for ${nickname}`);
    await closeLinkedInBrowser();
    throw new Error(`LI_COOKIES_EXPIRED:${nickname} — re-run npm run extract-cookies`);
  }

  const chromePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : chromium.executablePath();
  const sessionDir = account?.sessionDir ? path.resolve(account.sessionDir) : sessionDirFor(email);
  fs.mkdirSync(sessionDir, { recursive: true });
  killChromeForProfile(sessionDir);

  console.log(`   Using session folder: ${sessionDir}`);
  console.log('   Launching LinkedIn browser...');

  browserContext = await chromium.launchPersistentContext(sessionDir, {
    headless: process.env.HEADLESS !== 'false',
    executablePath: chromePath,
    viewport: { width: 1366, height: 900 },
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
    // New accounts only: stable per-account fingerprint (+ proxy once configured).
    // Established sessions are untouched (returns {}) to avoid device-change checkpoints.
    ...identityLaunchOverrides(sessionDir, nickname, 'linkedin'),
  });

  // Same gap as the cookies path above — FB (inline) and X (via
  // launchPersistentChrome) both apply this before the login flow starts.
  await applyStealth(browserContext);
  await browserContext.grantPermissions(['clipboard-read', 'clipboard-write']);

  const page = await browserContext.newPage();

  try {
    const cdp = await browserContext.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    await cdp.detach().catch(() => {});
  } catch { /* not critical */ }

  const loggedIn = await ensureLoggedIn(page, email, password);
  if (!loggedIn) {
    await closeLinkedInBrowser();
    throw new Error(`Unable to log in to LinkedIn as ${email}`);
  }

  return page;
}
