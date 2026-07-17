// Validate blog extraction against the most recent ChatGPT chat (no regeneration).
import { chromium } from 'playwright';
import fs from 'fs';

const DIR = '.sessions-cookies/chatgpt-profile';
const log = (m: string) => fs.appendFileSync('/tmp/extract-test.log', m + '\n');

(async () => {
  fs.writeFileSync('/tmp/extract-test.log', '');
  const ctx = await chromium.launchPersistentContext(DIR, {
    headless: false, channel: 'chrome', viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(6000);
    const firstChat = page.locator('a[href^="/c/"]').first();
    if (await firstChat.isVisible({ timeout: 8000 }).catch(() => false)) { await firstChat.click(); await page.waitForTimeout(6000); }
    log('url=' + page.url());
    const res = await page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      let text = msgs.length ? ((msgs[msgs.length - 1] as HTMLElement).innerText || '') : '';
      const assistantLen = text.length;
      if (text.replace(/\s/g, '').length < 100) {
        const body = (document.body as HTMLElement).innerText || '';
        const idx = body.lastIndexOf('Title:');
        if (idx >= 0) text = body.slice(idx);
      }
      return { assistantLen, textLen: text.length, head: text.slice(0, 300) };
    });
    log('assistant-selector len = ' + res.assistantLen);
    log('resolved text len     = ' + res.textLen);
    log('HEAD: ' + JSON.stringify(res.head));
    log('DONE');
  } catch (e: any) { log('ERR: ' + (e?.message || e)); }
  await ctx.close();
  process.exit(0);
})();
