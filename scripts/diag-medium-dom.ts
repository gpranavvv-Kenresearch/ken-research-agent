/**
 * diag-medium-dom.ts — inspect Medium's LIVE editor DOM to find why the poster's
 * selectors time out. Logs in, walks the post flow, dumps what actually exists at
 * each step (Write button, title field, publish buttons). Read-only-ish: it may
 * create an empty draft but never publishes.
 *
 * Usage: npx tsx scripts/diag-medium-dom.ts "abhinav 3"
 */
import 'dotenv/config';
import { loginToMedium, closeMediumBrowser } from '../src/browser/medium/login.js';

const nick = process.argv[2] || 'abhinav 3';

function j(v: unknown) { return JSON.stringify(v); }

try {
  const page = await loginToMedium({ nickname: nick });
  console.log('LOGGED IN as', nick, '| url:', page.url());

  console.log('\n=== STEP 1: medium.com — Write button ===');
  await page.goto('https://medium.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('url after goto:', page.url());
  console.log('headerWriteButton count:', await page.locator('[data-testid="headerWriteButton"]').count());
  // dump every header/nav link+button that looks like "write"
  const writeCandidates = await page.evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll('a,button').forEach((el) => {
      const t = (el.textContent || '').trim().toLowerCase();
      const href = (el as HTMLAnchorElement).href || '';
      if (t === 'write' || href.includes('/new-story') || (el as HTMLElement).dataset?.testid?.toLowerCase().includes('write')) {
        out.push({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 30), testid: (el as HTMLElement).dataset?.testid || '', href: href.slice(0, 60), aria: el.getAttribute('aria-label') || '' });
      }
    });
    return out;
  });
  console.log('WRITE candidates:', j(writeCandidates));

  console.log('\n=== STEP 2: open new story ===');
  try {
    await page.goto('https://medium.com/new-story', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    console.log('new-story url:', page.url());
  } catch (e: any) { console.log('new-story goto failed:', e.message); }
  console.log('editorTitleParagraph count:', await page.locator('[data-testid="editorTitleParagraph"]').count());
  const fields = await page.evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll('[contenteditable="true"],[role="textbox"],h3,p').forEach((el) => {
      const testid = (el as HTMLElement).dataset?.testid || '';
      if (testid || el.getAttribute('role') === 'textbox' || (el as HTMLElement).isContentEditable) {
        out.push({ tag: el.tagName, testid, role: el.getAttribute('role') || '', editable: (el as HTMLElement).isContentEditable, ph: el.getAttribute('data-placeholder') || el.getAttribute('aria-label') || '' });
      }
    });
    return out.slice(0, 12);
  });
  console.log('EDITABLE fields:', j(fields));

  console.log('\n=== STEP 3: type title + look for pre-publish button ===');
  try {
    const titleSel = (await page.locator('[data-testid="editorTitleParagraph"]').count())
      ? '[data-testid="editorTitleParagraph"]' : '[role="textbox"]';
    await page.click(titleSel);
    await page.keyboard.type('DIAG TEST — do not publish', { delay: 30 });
    await page.waitForTimeout(1500);
  } catch (e: any) { console.log('title type failed:', e.message); }
  const buttons = await page.evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll('button,a[role="button"]').forEach((el) => {
      const text = (el.textContent || '').trim();
      if (!text && !(el as HTMLElement).dataset?.testid) return;
      out.push({ text: text.slice(0, 25), testid: (el as HTMLElement).dataset?.testid || '', dataAction: el.getAttribute('data-action') || '', cls: (el.className || '').toString().slice(0, 40), aria: el.getAttribute('aria-label') || '' });
    });
    return out;
  });
  console.log('ALL BUTTONS on editor page:', j(buttons));

  console.log('\n=== STEP 3b: paste body so the article is not empty ===');
  try {
    await page.keyboard.press('Enter');
    await page.keyboard.type('This is diagnostic body text for the Ken Research market report. It contains enough content to enable publishing.', { delay: 5 });
    await page.waitForTimeout(1500);
  } catch (e: any) { console.log('body type failed:', e.message); }

  console.log('\n=== STEP 4: click pre-publish, inspect the panel state ===');
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => console.log('  (no navigation event)')),
      page.click('button[data-action="show-prepublish"]'),
    ]);
    console.log('clicked show-prepublish; url now:', page.url());
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(4000);
    console.log('url after settle:', page.url());
    const info = await page.evaluate(() => ({
      title: document.title,
      bodyLen: (document.body?.innerText || '').length,
      bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
      totalEls: document.querySelectorAll('*').length,
      hasPublishWord: /publish/i.test(document.body?.innerText || ''),
      scripts: document.querySelectorAll('script').length,
    }));
    console.log('SUBMISSION PAGE:', j(info));
    // wait longer in case it hydrates late
    await page.waitForTimeout(6000);
    const after = await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="button"]')).map((e) => ({ tag: e.tagName, text: (e.textContent || '').trim().slice(0, 30), testid: (e as HTMLElement).dataset?.testid || '', dataAction: e.getAttribute('data-action') || '' })).filter((b) => b.text || b.testid));
    console.log('SUBMISSION BUTTONS after hydration:', j(after));
  } catch (e: any) { console.log('pre-publish step failed:', e.message); }
} catch (e: any) {
  console.log('DIAG FAILED:', e.message);
} finally {
  await closeMediumBrowser().catch(() => {});
}
