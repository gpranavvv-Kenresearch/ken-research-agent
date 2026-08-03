/**
 * diag-calisthenics.ts — one-off diagnostic: log in, click Create, capture the DOM
 * around the space-selection step to find why `span.text-color-title-link.space-name.result-item`
 * no longer matches (per confirmed log evidence: this selector silently fails, and the
 * post lands on a "feed" URL instead of the Article composer).
 *
 * Usage: DISPLAY=:99 npx tsx scripts/diag-calisthenics.ts <nickname>
 */
import 'dotenv/config';
import { loginCalisthenics, closeCaliBrowser } from '../src/browser/calisthenics/login.js';

async function main() {
  const nickname = process.argv[2] || 'abhinav 1';
  const page = await loginCalisthenics(nickname);

  console.log('Logged in. Navigating to home...');
  await page.goto('https://calisthenics.mn.co/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('Clicking Create...');
  await page.waitForSelector('button[aria-label="Create content"], a[title="Create"]', { timeout: 30000 });
  await page.click('button[aria-label="Create content"], a[title="Create"]');
  await page.waitForTimeout(1500);

  await page.screenshot({ path: '/tmp/cali-after-create.png', fullPage: true });
  console.log('Screenshot saved: /tmp/cali-after-create.png');

  // Dump the Create panel's structure precisely (the "Home"/space list item).
  const spaceListInfo = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div, li, a, button')).filter(
      (el) => (el.textContent || '').trim() === 'Home' && el.children.length <= 2
    );
    return els.slice(0, 5).map((el) => ({
      tag: el.tagName, cls: (el as HTMLElement).className,
      outerHTML: el.outerHTML.slice(0, 300),
      parentCls: el.parentElement?.className,
    }));
  });
  console.log('--- "Home" space-list candidates ---');
  console.log(JSON.stringify(spaceListInfo, null, 2));

  // Click the space entry via the stable title="Space Home" attribute (not the
  // hashed CSS-module class, which is what broke last time).
  // Click the outer menuitem CONTAINER (role="menuitem", data-id="FlexSpace_...")
  // instead of the inner <a href="..."> — the inner link's href causes a real page
  // navigation away from the Create flow instead of just "selecting this space".
  const containerCount = await page.locator('[role="menuitem"][data-id^="FlexSpace_"]').count();
  console.log('[role="menuitem"][data-id^="FlexSpace_"] count:', containerCount);
  await page.locator('[role="menuitem"][data-id^="FlexSpace_"]').first().click({ force: true, timeout: 10000 });
  const clicked = true;
  console.log('Clicked Home space entry (container):', clicked);
  console.log('URL right after space click:', page.url());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/cali-after-space.png', fullPage: true });
  console.log('Screenshot saved: /tmp/cali-after-space.png');

  const articleInfo = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('li, a, button, div, [role="menuitem"]'));
    const match = items.find((el) => (el.textContent || '').trim() === 'Article' && el.children.length <= 2);
    if (!match) return null;
    return {
      tag: match.tagName, cls: match.className,
      outerHTML: match.outerHTML.slice(0, 400),
      parentCls: match.parentElement?.className,
      parentOuterHTML: match.parentElement?.outerHTML.slice(0, 400),
    };
  });
  console.log('--- ARTICLE ITEM (after space click) ---');
  console.log(JSON.stringify(articleInfo, null, 2));

  // We landed on the space's /feed page (matches the production "bad URL" bug
  // exactly). Try clicking Create AGAIN now that we're inside the space's context.
  console.log('Now on space feed. Clicking Create again from within the space...');
  await page.locator('button[aria-label="Create content"], a[title="Create"]').first().click({ force: true, timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/cali-space-create.png', fullPage: true });
  const articleInfo2 = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('li, a, button, div, [role="menuitem"]'));
    const match = items.find((el) => (el.textContent || '').trim() === 'Article' && el.children.length <= 2);
    if (!match) return null;
    return { tag: match.tagName, cls: match.className, outerHTML: match.outerHTML.slice(0, 400) };
  });
  console.log('--- ARTICLE ITEM (after 2nd Create click, in-space) ---');
  console.log(JSON.stringify(articleInfo2, null, 2));

  const titleFieldCount = await page.locator('p[data-placeholder="Title"]').count();
  const bodyFieldCount = await page.locator('p[data-placeholder="Write, type \'/\' for commands…"]').count();
  const publishBtnCount = await page.locator('a#post-publish-submit-button').count();
  console.log('Title field found:', titleFieldCount, '| Body field found:', bodyFieldCount, '| Publish button found:', publishBtnCount);

  await closeCaliBrowser();
}

main().catch((e) => { console.error('DIAG ERROR:', e.message); process.exit(1); });
