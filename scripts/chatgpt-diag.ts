// Diagnostic: what does ChatGPT show the Playwright-driven browser on the VPS?
import { chromium } from 'playwright';
import fs from 'fs';

const DIR = '.sessions-cookies/chatgpt-profile';
const LOG = '/tmp/diag.log';
const log = (m: string) => fs.appendFileSync(LOG, m + '\n');

(async () => {
  fs.writeFileSync(LOG, '');
  const ctx = await chromium.launchPersistentContext(DIR, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    log('opening chatgpt...');
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 90000 });
    log('goto done, url=' + page.url());
    await page.waitForTimeout(7000);
    log('title=' + (await page.title().catch(() => '?')));
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 400) || '').catch(() => '');
    log('body=' + JSON.stringify(body));
    const composer = await page.locator('#prompt-textarea, div[contenteditable="true"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    log('has_composer=' + composer);
    fs.writeFileSync('/tmp/diag-page.html', await page.content().catch(() => ''));
    await page.screenshot({ path: '/tmp/diag.png' }).catch(() => {});
    log('DONE');
  } catch (e) {
    log('ERROR: ' + (e instanceof Error ? e.message : String(e)));
  }
  await ctx.close();
  process.exit(0);
})();
