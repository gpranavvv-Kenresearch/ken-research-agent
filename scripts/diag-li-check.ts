import 'dotenv/config';
import { chromium } from 'playwright';
import path from 'path';

const sessionDir = path.resolve('.sessions/chrome-vishal');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const context = await chromium.launchPersistentContext(sessionDir, {
  headless: false,
  executablePath: chromePath,
  viewport: { width: 1366, height: 900 },
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = context.pages()[0] || (await context.newPage());
await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
console.log('URL:', page.url());
const selectors = [
  'a[href*="/mynetwork/"]', 'img.global-nav__me-photo', '.global-nav__me',
  '[data-control-name="identity_welcome_message"]', 'button[aria-label*="settings" i]',
];
for (const sel of selectors) {
  const visible = await page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false);
  console.log(sel, '->', visible);
}
await page.screenshot({ path: 'diag-vishal-li.png', fullPage: false });
console.log('Screenshot saved.');
await context.close();
process.exit(0);
