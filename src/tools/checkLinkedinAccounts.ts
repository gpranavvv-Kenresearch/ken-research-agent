/**
 * Usage:
 *   npx tsx src/tools/checkLinkedinAccounts.ts          # all accounts
 *   npx tsx src/tools/checkLinkedinAccounts.ts vishal    # one nickname
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const accounts = JSON.parse(fs.readFileSync('.accounts/linkedin-accounts.json', 'utf8'));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const CHROME_PATH = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

const filterName = (process.argv[2] || '').trim().toLowerCase();
const toCheck = filterName ? accounts.filter((a: any) => a.nickname?.toLowerCase() === filterName) : accounts;
if (filterName && toCheck.length === 0) {
  console.log(`No account found with nickname "${filterName}"`);
  process.exit(1);
}

(async () => {
  const results: { nickname: string; email: string; status: string }[] = [];

  for (const acc of toCheck) {
    const sessionDir = path.resolve(acc.sessionDir);
    const hasSession = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;

    if (!hasSession) {
      console.log(`${acc.nickname.padEnd(12)} ${acc.email.padEnd(35)} → ⚠️  No session saved`);
      results.push({ nickname: acc.nickname, email: acc.email, status: '⚠️ No session' });
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
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);

      const url = page.url();
      const text = await page.evaluate(() => document.body.innerText.slice(0, 600));

      let status = '';
      if (url.includes('/login') || url.includes('/authwall') || url.includes('/uas/login')) {
        status = '❌ Not logged in';
      } else if (/restricted|suspended|disabled|locked|unusual/i.test(text) || url.includes('checkpoint')) {
        status = '❌ Restricted/Disabled';
      } else if (/something went wrong|error/i.test(text) && !url.includes('/feed')) {
        status = '⚠️  Error page';
      } else {
        status = '✅ Active';
      }

      console.log(`${acc.nickname.padEnd(12)} ${acc.email.padEnd(35)} → ${status}  (${url.slice(0, 60)})`);
      results.push({ nickname: acc.nickname, email: acc.email, status });
    } catch (err: any) {
      console.log(`${acc.nickname.padEnd(12)} ${acc.email.padEnd(35)} → ⚠️  Error: ${err.message.slice(0, 50)}`);
      results.push({ nickname: acc.nickname, email: acc.email, status: '⚠️ Error' });
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
