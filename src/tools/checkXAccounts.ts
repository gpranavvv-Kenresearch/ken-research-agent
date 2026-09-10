/**
 * checkXAccounts.ts — verify each saved X session is actually still logged in.
 *
 * Was previously visiting the public x.com/{handle} profile page with a blank
 * `handle` field (accounts.json has handle/username/password all empty — real
 * creds live in CLAUDE.md) and no session at all, so every account silently
 * reported "Active" regardless of real login state. Fixed to reuse the same
 * saved persistent profile (acc.sessionDir) post-x.ts posts with, and the same
 * "redirected to /login or /i/flow/login" signal it uses to decide a session
 * is dead.
 *
 * Usage:
 *   npx tsx src/tools/checkXAccounts.ts              # all accounts
 *   npx tsx src/tools/checkXAccounts.ts vishal        # one nickname
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const accounts = JSON.parse(fs.readFileSync('.accounts/accounts.json', 'utf8'));
const CHROME_PATH = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

const filterName = (process.argv[2] || '').trim().toLowerCase();
const toCheck = filterName ? accounts.filter((a: any) => a.nickname?.toLowerCase() === filterName) : accounts;
if (filterName && toCheck.length === 0) {
  console.log(`No account found with nickname "${filterName}"`);
  process.exit(1);
}

(async () => {
  const results: { nickname: string; status: string }[] = [];

  for (const acc of toCheck) {
    const sessionDir = path.resolve(acc.sessionDir);
    const hasSession = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;
    if (!hasSession) {
      console.log(`${acc.nickname.padEnd(12)} → ⚠️  No session saved`);
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
      await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      const url = page.url();
      const status = (url.includes('/i/flow/login') || url.includes('/login')) ? '❌ Not logged in' : '✅ Active';
      console.log(`${acc.nickname.padEnd(12)} → ${status}  (${url.slice(0, 60)})`);
      results.push({ nickname: acc.nickname, status });
    } catch (err: any) {
      console.log(`${acc.nickname.padEnd(12)} → ⚠️  Error: ${err.message.slice(0, 50)}`);
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
