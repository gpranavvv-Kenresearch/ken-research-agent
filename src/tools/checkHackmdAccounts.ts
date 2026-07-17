/**
 * checkHackmdAccounts.ts — verify every HackMD account's saved session is
 * actually still logged in (not just "cookie file exists").
 *
 * Usage:
 *   npx tsx src/tools/checkHackmdAccounts.ts              # check all accounts
 *   npx tsx src/tools/checkHackmdAccounts.ts abhinav 1     # check one nickname
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const accounts = JSON.parse(fs.readFileSync('.accounts/accounts-hackmd.json', 'utf8'));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const CHROME_PATH = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome');

const filterName = process.argv.slice(2).join(' ').trim().toLowerCase();

(async () => {
  const results: { nickname: string; status: string }[] = [];
  const toCheck = filterName ? accounts.filter((a: any) => a.nickname?.toLowerCase() === filterName) : accounts;

  if (filterName && toCheck.length === 0) {
    console.log(`No account found with nickname "${filterName}"`);
    process.exit(1);
  }

  for (const acc of toCheck) {
    const sessionDir = path.resolve(acc.sessionDir);
    const hasSession = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;

    if (!hasSession) {
      console.log(`${acc.nickname.padEnd(15)} → ⚠️  No session saved`);
      results.push({ nickname: acc.nickname, status: '⚠️ No session' });
      continue;
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
      // Same URL poster.ts actually navigates to when posting — real-world check.
      await page.goto('https://hackmd.io/new', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);

      const url = page.url();
      const hasEditor = await page.locator('.CodeMirror, .ui-note-meta-title').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasLoginForm = await page.locator('input[placeholder*="email" i], input[type="email"]').first().isVisible({ timeout: 2000 }).catch(() => false);

      let status = '';
      if (hasLoginForm || url.includes('login') || url.includes('signin')) {
        status = '❌ Not logged in';
      } else if (hasEditor) {
        status = '✅ Active';
      } else {
        status = '⚠️  Unclear (no editor, no login form)';
      }

      const apiNote = acc.apiKey ? ' [has API key — posting won\'t need this session]' : '';
      console.log(`${acc.nickname.padEnd(15)} → ${status}  (${url.slice(0, 60)})${apiNote}`);
      results.push({ nickname: acc.nickname, status });
    } catch (err: any) {
      console.log(`${acc.nickname.padEnd(15)} → ⚠️  Error: ${err.message.slice(0, 60)}`);
      results.push({ nickname: acc.nickname, status: '⚠️ Error' });
    } finally {
      await ctx?.close().catch(() => {});
    }
  }

  if (!filterName) {
    console.log('\n--- SUMMARY ---');
    const active = results.filter(r => r.status.includes('Active'));
    const bad = results.filter(r => !r.status.includes('Active'));
    console.log(`✅ Active (${active.length}): ${active.map(r => r.nickname).join(', ')}`);
    console.log(`❌ Issues (${bad.length}): ${bad.map(r => `${r.nickname}(${r.status.trim()})`).join(', ')}`);
  }
})();
