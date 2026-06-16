/**
 * post-linkedin-pulse.ts — Publish a LinkedIn Pulse article via Playwright.
 *
 * Reads a saved LinkedIn session from .sessions-cookies/li-{nickname}.json
 * (created by: npx tsx scripts/local-login.ts --name {nickname} --platform li)
 *
 * Usage:
 *   npx tsx scripts/post-linkedin-pulse.ts \
 *     --email aniket@... --password ... --nickname aniket \
 *     --title "Article Title" --html-file /tmp/article.html \
 *     --caption "LinkedIn caption text" \
 *     --seo-title "SEO title" --seo-desc "SEO description" \
 *     --row 5 --batch BLOG-2026-06-16-B1
 *
 * Outputs on success:  POSTED_URL=https://www.linkedin.com/pulse/...
 * Exits 0 on success, 1 on failure (writes resume.json for MCP recovery).
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { writeResumeFile, saveArtifacts, findElement } from './base.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const get = (flag: string, fallback = '') => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const email    = get('--email');
const password = get('--password');
const nickname = get('--nickname');
const title    = get('--title');
const htmlFile = get('--html-file');
const caption  = get('--caption', '');
const seoTitle = get('--seo-title', '');
const seoDesc  = get('--seo-desc', '');
const row      = parseInt(get('--row', '0'));
const batch    = get('--batch', '');

if (!email || !password || !nickname || !title || !htmlFile) {
  console.error('[pulse] Missing required args: --email --password --nickname --title --html-file');
  process.exit(1);
}

// __dirname is scripts/ — sessions live in project root .sessions-cookies/
const SESSIONS_DIR = path.join(__dirname, '..', '.sessions-cookies');
const SESSION_FILE = path.join(SESSIONS_DIR, `li-${nickname}.json`);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Read HTML content from file
  if (!fs.existsSync(htmlFile)) {
    console.error(`[pulse] HTML file not found: ${htmlFile}`);
    process.exit(1);
  }
  const htmlContent = fs.readFileSync(htmlFile, 'utf-8');

  // Load saved session or start fresh
  const hasSession = fs.existsSync(SESSION_FILE);
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const ctxOptions = {
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    permissions: ['clipboard-read', 'clipboard-write'] as const,
  };

  const context = await (hasSession
    ? browser.newContext({ ...ctxOptions, storageState: SESSION_FILE })
    : browser.newContext(ctxOptions)
  );

  const page = await context.newPage();

  try {
    // Step 1: Navigate to LinkedIn and verify login
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const isLoggedIn = !currentUrl.includes('/login') && !currentUrl.includes('/checkpoint') && !currentUrl.includes('/authwall');

    if (!isLoggedIn) {
      console.log('[pulse] Not logged in — logging in with credentials');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);

      const emailField = await findElement(page, ['#username', 'input[name="session_key"]', 'input[autocomplete="username"]']);
      if (!emailField) {
        writeResumeFile('post-linkedin-pulse.ts', 'login-email', 'Email field not found', { email, row, batch, htmlFile });
        await saveArtifacts(page, 'login-email', 'Email field not found');
        await browser.close();
        process.exit(1);
      }
      await emailField.fill(email);

      const passField = await findElement(page, ['#password', 'input[name="session_password"]', 'input[type="password"]']);
      if (!passField) {
        writeResumeFile('post-linkedin-pulse.ts', 'login-password', 'Password field not found', { email, row });
        await saveArtifacts(page, 'login-password', 'Password field not found');
        await browser.close();
        process.exit(1);
      }
      await passField.fill(password);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);

      // Check login success
      const afterUrl = page.url();
      if (afterUrl.includes('/login') || afterUrl.includes('/checkpoint')) {
        writeResumeFile('post-linkedin-pulse.ts', 'login-verify', 'Login failed', { email, row });
        await saveArtifacts(page, 'login-verify', 'Still on login page after submit');
        await browser.close();
        process.exit(1);
      }

      // Save session for next time
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      await context.storageState({ path: SESSION_FILE });
      console.log(`[pulse] Session saved to ${SESSION_FILE}`);
    }

    // Step 2: Navigate to LinkedIn Article (Pulse) editor
    console.log('[pulse] Opening article editor...');
    await page.goto('https://www.linkedin.com/article/new/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Step 3: Fill in the article title
    const titleField = await findElement(page, [
      '[data-placeholder="Title"]',
      '[aria-label="Article title"]',
      '[placeholder="Title"]',
      '.article-editor-title',
      'h1.editor-title',
      '[class*="editor-title"]',
      '[contenteditable="true"]:first-of-type',
    ], 15000);

    if (!titleField) {
      writeResumeFile('post-linkedin-pulse.ts', 'title-field', 'Title field not found', { title, row });
      await saveArtifacts(page, 'title-field', 'Title input not found in LinkedIn article editor');
      await browser.close();
      process.exit(1);
    }

    await titleField.click();
    await page.waitForTimeout(300);
    // Clear any existing title text and type new one
    await page.keyboard.press('Control+A');
    await page.keyboard.type(title, { delay: 20 });
    await page.waitForTimeout(500);

    // Step 4: Click article body and paste HTML content
    const editorArea = await findElement(page, [
      '.ql-editor',
      '[contenteditable="true"]:not([aria-label="Article title"]):not([data-placeholder="Title"])',
      '[data-placeholder*="Write"]',
      '[data-placeholder*="write"]',
      '[class*="article-editor-content"]',
      '.article-editor-content [contenteditable]',
    ], 10000);

    if (!editorArea) {
      writeResumeFile('post-linkedin-pulse.ts', 'editor-body', 'Article body editor not found', { row });
      await saveArtifacts(page, 'editor-body', 'Content editor area not found');
      await browser.close();
      process.exit(1);
    }

    await editorArea.click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(200);

    // Inject HTML — try clipboard first, fall back to execCommand
    const injected = await page.evaluate((html: string) => {
      // Try 1: ClipboardItem API
      try {
        const blob = new Blob([html], { type: 'text/html' });
        const item = new ClipboardItem({ 'text/html': blob });
        return navigator.clipboard.write([item]).then(() => 'clipboard');
      } catch (_) {}

      // Try 2: execCommand (deprecated but works in Chromium)
      try {
        document.execCommand('selectAll');
        const ok = document.execCommand('insertHTML', false, html);
        if (ok) return Promise.resolve('execCommand');
      } catch (_) {}

      return Promise.resolve('failed');
    }, htmlContent);

    if (injected === 'clipboard') {
      await page.keyboard.press('Control+V');
      await page.waitForTimeout(3000);
    } else if (injected === 'execCommand') {
      // Already inserted by execCommand — no paste needed
      await page.waitForTimeout(1000);
    } else {
      // Last resort: type plain text (slow but always works)
      console.warn('[pulse] Clipboard injection failed — typing plain text');
      const plain = htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
      await page.keyboard.type(plain, { delay: 5 });
      await page.waitForTimeout(2000);
    }

    // Step 5: Click "Publish" or "Next" button
    const publishBtn = await findElement(page, [
      'button:has-text("Publish")',
      'button:has-text("Next")',
      '[data-control-name="article_publish"]',
      '[class*="publish-button"]',
      '.article-publish-button',
      'button[aria-label*="Publish"]',
    ], 10000);

    if (!publishBtn) {
      writeResumeFile('post-linkedin-pulse.ts', 'publish-button', 'Publish button not found', { row });
      await saveArtifacts(page, 'publish-button', 'Publish button not found after content paste');
      await browser.close();
      process.exit(1);
    }

    await publishBtn.click();
    await page.waitForTimeout(2000);

    // Step 5b: Confirm publish in dialog if it appears
    const confirmBtn = await findElement(page, [
      'button:has-text("Publish now")',
      'button:has-text("Publish")',
      '.artdeco-modal button.artdeco-button--primary',
      '[aria-label="Publish now"]',
    ], 6000);

    if (confirmBtn) {
      await confirmBtn.click();
      await page.waitForTimeout(4000);
    }

    // Step 6: Wait for redirect and get the article URL
    await page.waitForTimeout(3000);
    let postedUrl = page.url();

    // LinkedIn redirects to the article URL after publishing
    // Pulse URL pattern: https://www.linkedin.com/pulse/{slug-id}/
    if (!postedUrl.includes('/pulse/') && !postedUrl.includes('/article/')) {
      // Wait a bit more
      await page.waitForTimeout(4000);
      postedUrl = page.url();
    }

    // Update session state after successful post
    await context.storageState({ path: SESSION_FILE });

    await browser.close();

    console.log(`POSTED_URL=${postedUrl}`);
    console.log(`[pulse] Published: "${title}" → ${postedUrl}`);
    process.exit(0);

  } catch (err: unknown) {
    const error = err as Error;
    if (page) {
      writeResumeFile('post-linkedin-pulse.ts', 'unknown', error.message, {
        email, nickname, title, row, batch, htmlFile,
      });
      await saveArtifacts(page, 'unknown', error);
    }
    await browser.close().catch(() => {});
    console.error('[pulse] Fatal error:', error.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[pulse] Unhandled error:', err?.message || err);
  process.exit(1);
});
