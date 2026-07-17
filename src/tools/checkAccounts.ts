/**
 * checkAccounts.ts — verify saved sessions are actually still logged in, for
 * any of: blogger, googlesite, linkmate, calisthenics. Same idea as
 * checkHackmdAccounts.ts — navigates the real URL each poster actually uses
 * and checks real page state, not just "does a session file exist."
 *
 * Usage:
 *   npx tsx src/tools/checkAccounts.ts blogger              # check all Blogger accounts
 *   npx tsx src/tools/checkAccounts.ts linkmate abhinav 1    # check one nickname
 *   npx tsx src/tools/checkAccounts.ts calisthenics
 *   npx tsx src/tools/checkAccounts.ts googlesite
 */
import { chromium, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface PlatformConfig {
  accountsFile: string;
  checkUrl: string;
  /** Returns true if genuinely logged in, based on the same signals the real poster uses. */
  isLoggedIn: (page: Page) => Promise<boolean>;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  blogger: {
    accountsFile: '.accounts/accounts-blogger.json',
    checkUrl: 'https://www.blogger.com/',
    isLoggedIn: async (page) => {
      await sleep(3000);
      const url = page.url();
      // Blogger redirects a logged-in account straight into a specific blog's
      // post list (blogger.com/blog/posts/{id}), not always a generic
      // dashboard — that's still a genuinely logged-in state, confirmed by
      // manually checking. Only /about (marketing page) and Google's own
      // sign-in page mean actually logged out.
      if (url.includes('/about') || url.includes('accounts.google.com')) return false;
      if (url.includes('blogger.com')) return true;
      return page.locator('[aria-label="Create new post"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    },
  },
  googlesite: {
    accountsFile: '.accounts/accounts-googlesite.json',
    checkUrl: 'https://sites.google.com/',
    isLoggedIn: async (page) => {
      await sleep(5000);
      const url = page.url();
      return url.includes('sites.google.com') && !url.includes('accounts.google.com');
    },
  },
  notion: {
    accountsFile: '.accounts/accounts-notion.json',
    checkUrl: 'https://app.notion.com/',
    isLoggedIn: async (page) => {
      await sleep(4000);
      const url = page.url();
      if (url.includes('/login')) return false;
      const selectors = ['[data-testid="sidebar"]', '.notion-sidebar', '[class*="sidebar"]', 'div[role="navigation"]'];
      for (const sel of selectors) {
        if (await page.locator(sel).first().isVisible({ timeout: 1000 }).catch(() => false)) return true;
      }
      const loginForm = await page.locator('input[placeholder*="email" i]').first().isVisible({ timeout: 800 }).catch(() => false);
      return !loginForm && (url.includes('notion.so') || url.includes('notion.com')) && !url.includes('login');
    },
  },
  linkmate: {
    accountsFile: '.accounts/accounts-linkmate.json',
    checkUrl: 'https://linkmate.mn.co/',
    isLoggedIn: async (page) => {
      await page.waitForSelector('button[aria-label="Create content"], a[title="Create"], a[href*="/sign_in"]', { timeout: 15000 }).catch(() => {});
      const url = page.url();
      return !url.includes('/sign_in') && !url.includes('/login');
    },
  },
  calisthenics: {
    accountsFile: '.accounts/accounts-calisthenics.json',
    checkUrl: 'https://calisthenics.mn.co/',
    isLoggedIn: async (page) => {
      await page.waitForSelector('button[aria-label="Create content"], a[title="Create"], a[href*="/sign_in"]', { timeout: 15000 }).catch(() => {});
      const url = page.url();
      return !url.includes('/sign_in') && !url.includes('/login');
    },
  },
};

const [platformArg, ...rest] = process.argv.slice(2);
const filterName = rest.join(' ').trim().toLowerCase();

if (!platformArg || !PLATFORMS[platformArg]) {
  console.log(`Usage: npx tsx src/tools/checkAccounts.ts <${Object.keys(PLATFORMS).join('|')}> [nickname...]`);
  process.exit(1);
}

const cfg = PLATFORMS[platformArg];

(async () => {
  if (!fs.existsSync(cfg.accountsFile)) {
    console.log(`No accounts file found at ${cfg.accountsFile}`);
    process.exit(1);
  }
  const rawAccounts = JSON.parse(fs.readFileSync(cfg.accountsFile, 'utf8'));
  const accounts = Array.isArray(rawAccounts) ? rawAccounts : (rawAccounts.accounts || []);
  const toCheck = filterName ? accounts.filter((a: any) => a.nickname?.toLowerCase() === filterName) : accounts;

  if (filterName && toCheck.length === 0) {
    console.log(`No account found with nickname "${filterName}"`);
    process.exit(1);
  }

  const results: { nickname: string; status: string }[] = [];

  async function checkOne(acc: any): Promise<{ nickname: string; status: string }> {
    if (!acc.sessionDir) {
      const line = `${(acc.nickname || '?').padEnd(15)} → ⚠️  No sessionDir configured`;
      console.log(line);
      return { nickname: acc.nickname || '?', status: '⚠️ No sessionDir' };
    }
    const sessionDir = path.resolve(acc.sessionDir);
    const hasSession = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;
    if (!hasSession) {
      console.log(`${acc.nickname.padEnd(15)} → ⚠️  No session saved`);
      return { nickname: acc.nickname, status: '⚠️ No session' };
    }

    let ctx: any;
    try {
      ctx = await chromium.launchPersistentContext(sessionDir, {
        headless: true,
        executablePath: CHROME_PATH,
        ignoreDefaultArgs: ['--enable-automation'],
        args: ['--disable-blink-features=AutomationControlled'],
      });
      const page = ctx.pages()[0] || await ctx.newPage();
      await page.goto(cfg.checkUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const loggedIn = await cfg.isLoggedIn(page);
      const status = loggedIn ? '✅ Active' : '❌ Not logged in';
      console.log(`${acc.nickname.padEnd(15)} → ${status}  (${page.url().slice(0, 60)})`);
      return { nickname: acc.nickname, status };
    } catch (err: any) {
      console.log(`${acc.nickname.padEnd(15)} → ⚠️  Error: ${err.message.slice(0, 60)}`);
      return { nickname: acc.nickname, status: '⚠️ Error' };
    } finally {
      await ctx?.close().catch(() => {});
    }
  }

  // Check several accounts concurrently instead of one at a time — with 20-40
  // accounts per platform, sequential checks take many minutes; a small pool
  // (4 at once) cuts that dramatically without overloading the VPS.
  const CONCURRENCY = Number(process.env.CHECK_CONCURRENCY || 4);
  const queue = [...toCheck];
  async function worker() {
    while (queue.length) {
      const acc = queue.shift();
      if (!acc) break;
      results.push(await checkOne(acc));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toCheck.length) }, () => worker()));

  if (!filterName) {
    console.log('\n--- SUMMARY ---');
    const active = results.filter(r => r.status.includes('Active'));
    const bad = results.filter(r => !r.status.includes('Active'));
    console.log(`✅ Active (${active.length}): ${active.map(r => r.nickname).join(', ')}`);
    console.log(`❌ Issues (${bad.length}): ${bad.map(r => `${r.nickname}(${r.status.trim()})`).join(', ')}`);
  }
})();
