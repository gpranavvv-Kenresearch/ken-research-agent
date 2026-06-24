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
import { fileURLToPath } from 'url';
import { writeResumeFile, saveArtifacts, findElement } from './base.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const SESSIONS_DIR  = path.join(__dirname, '..', 'scripts', 'sessions');
const SESSION_JSON  = path.join(SESSIONS_DIR, `li_${nickname}.json`);
const SESSION_DIR   = path.join(SESSIONS_DIR, `chrome-li-${nickname}`);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Read HTML content from file
  if (!fs.existsSync(htmlFile)) {
    console.error(`[pulse] HTML file not found: ${htmlFile}`);
    process.exit(1);
  }
  const htmlContent = fs.readFileSync(htmlFile, 'utf-8');

  // ── Launch with persistent Chrome profile (permanent session) ────────────────
  // chrome-li-{nickname}/ acts like a real Chrome user profile — survives restarts.
  // Falls back to JSON storageState, then bare launch with credential login.
  fs.mkdirSync(SESSION_DIR, { recursive: true });

  const hasPersistentProfile = fs.readdirSync(SESSION_DIR).length > 0;
  const hasJsonSession = fs.existsSync(SESSION_JSON);

  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
  let closeBrowser: () => Promise<void>;

  if (hasPersistentProfile || hasJsonSession) {
    if (hasPersistentProfile) {
      console.log(`[pulse] Loading persistent Chrome profile: ${SESSION_DIR}`);
      context = await chromium.launchPersistentContext(SESSION_DIR, {
        headless: false,
        channel: 'chrome',
        viewport: { width: 1280, height: 900 },
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
        ignoreDefaultArgs: ['--enable-automation'],
      });
      closeBrowser = () => context.close();
    } else {
      console.log(`[pulse] Loading JSON session: ${SESSION_JSON}`);
      const browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
        ignoreDefaultArgs: ['--enable-automation'],
      });
      context = await browser.newContext({
        storageState: SESSION_JSON,
        viewport: { width: 1280, height: 900 },
      }) as any;
      closeBrowser = () => browser.close();
    }
  } else {
    console.log('[pulse] No session found — will login and create persistent profile');
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1280, height: 900 },
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    closeBrowser = () => context.close();
  }

  const page = context.pages()[0] ?? await context.newPage();

  try {
    // Step 1: Check session validity, login with credentials if expired
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const isLoggedIn = !currentUrl.includes('/login') &&
                       !currentUrl.includes('/checkpoint') &&
                       !currentUrl.includes('/authwall');

    if (!isLoggedIn) {
      console.log('[pulse] Session invalid — logging in with credentials');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);

      const emailField = await findElement(page, ['#username', 'input[name="session_key"]', 'input[autocomplete="username"]']);
      if (!emailField) {
        writeResumeFile('post-linkedin-pulse.ts', 'login-email', 'Email field not found', { email, row, batch, htmlFile });
        await saveArtifacts(page, 'login-email', 'Email field not found');
        await closeBrowser();
        process.exit(1);
      }
      await emailField.fill(email);

      const passField = await findElement(page, ['#password', 'input[name="session_password"]', 'input[type="password"]']);
      if (!passField) {
        writeResumeFile('post-linkedin-pulse.ts', 'login-password', 'Password field not found', { email, row });
        await saveArtifacts(page, 'login-password', 'Password field not found');
        await closeBrowser();
        process.exit(1);
      }
      await passField.fill(password);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);

      const afterUrl = page.url();
      if (afterUrl.includes('/login') || afterUrl.includes('/checkpoint')) {
        writeResumeFile('post-linkedin-pulse.ts', 'login-verify', 'Login failed', { email, row });
        await saveArtifacts(page, 'login-verify', 'Still on login page after submit');
        await closeBrowser();
        process.exit(1);
      }
      console.log('[pulse] Login successful — persistent profile saved automatically');
    } else {
      console.log('[pulse] Session valid — skipping login');
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
      await closeBrowser();
      process.exit(1);
    }

    await titleField.click();
    await page.waitForTimeout(300);
    // Clear any existing title text and type new one
    await page.keyboard.press('Control+A');
    await page.keyboard.type(title, { delay: 20 });
    await page.waitForTimeout(500);

    // Step 4: Find article body editor
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
      await closeBrowser();
      process.exit(1);
    }

    // Step 4b: Render HTML in a separate tab so images load, then copy rendered content
    // This is the only way to get images into LinkedIn's editor — raw HTML tags don't work.
    console.log('[pulse] Opening HTML renderer tab (loading images)...');
    const base64Html = Buffer.from(htmlContent).toString('base64');
    const rendererPage = await context.newPage();
    await rendererPage.goto(`data:text/html;base64,${base64Html}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    // Wait for all <img> tags to finish loading
    await rendererPage.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.every(img => img.complete);
    }, { timeout: 30000 }).catch(() => console.warn('[pulse] Some images may not have loaded'));
    await rendererPage.waitForTimeout(1000);

    console.log('[pulse] Selecting and copying rendered content...');
    await rendererPage.keyboard.press('Control+a');
    await rendererPage.waitForTimeout(400);
    await rendererPage.keyboard.press('Control+c');
    await rendererPage.waitForTimeout(600);
    await rendererPage.close();
    console.log('[pulse] Rendered content (with images) copied to clipboard');

    // Paste rendered content into LinkedIn editor
    await editorArea.click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(3000);
    console.log('[pulse] Content pasted into editor');

    // Step 4c: Open Manage → Settings to fill SEO title + description
    if (seoTitle || seoDesc) {
      console.log('[pulse] Opening article settings for SEO metadata...');
      const manageBtn = await findElement(page, [
        'button:has-text("Manage")',
        '[aria-label="Manage"]',
        '[data-control-name="article_manage"]',
        '.article-editor-header button:has-text("Manage")',
        'button[aria-label*="manage" i]',
      ], 5000);

      if (manageBtn) {
        await manageBtn.click();
        await page.waitForTimeout(1000);

        const settingsOption = await findElement(page, [
          'button:has-text("Settings")',
          'a:has-text("Settings")',
          '[data-control-name="article_settings"]',
          'li:has-text("Settings")',
          '[role="menuitem"]:has-text("Settings")',
        ], 3000);

        if (settingsOption) {
          await settingsOption.click();
          await page.waitForTimeout(1500);

          if (seoTitle) {
            const seoTitleField = await findElement(page, [
              'input[name="seo-title"]',
              'input[placeholder*="SEO" i]',
              'input[placeholder*="title" i]',
              '[aria-label*="title" i]',
              '.article-settings input',
            ], 5000);
            if (seoTitleField) {
              await seoTitleField.triple_click?.() ?? await seoTitleField.click({ clickCount: 3 });
              await seoTitleField.fill(seoTitle);
              console.log('[pulse] SEO title set');
            }
          }

          if (seoDesc) {
            const descField = await findElement(page, [
              'textarea[name="description"]',
              'textarea[placeholder*="description" i]',
              '[aria-label*="description" i]',
              '.article-settings textarea',
            ], 5000);
            if (descField) {
              await descField.click({ clickCount: 3 });
              await descField.fill(seoDesc);
              console.log('[pulse] SEO description set');
            }
          }

          // Save settings
          const saveSettingsBtn = await findElement(page, [
            'button:has-text("Save")',
            'button:has-text("Done")',
            'button:has-text("Apply")',
          ], 3000);
          if (saveSettingsBtn) {
            await saveSettingsBtn.click();
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(1000);
        } else {
          console.log('[pulse] Settings option not found in Manage menu');
          await page.keyboard.press('Escape');
        }
      } else {
        console.log('[pulse] Manage button not found — skipping SEO settings');
      }
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
      await closeBrowser();
      process.exit(1);
    }

    await publishBtn.click();
    await page.waitForTimeout(2000);

    // Step 5b: Fill caption + confirm publish in dialog
    if (caption) {
      const captionField = await findElement(page, [
        'textarea[placeholder*="Tell" i]',
        'textarea[placeholder*="Write" i]',
        'textarea[placeholder*="caption" i]',
        '[contenteditable][placeholder*="Tell" i]',
        '.share-article__description textarea',
        '.publish-dialog textarea',
        '.artdeco-modal textarea',
      ], 5000);
      if (captionField) {
        await captionField.click();
        await captionField.fill(caption);
        console.log('[pulse] Caption filled');
        await page.waitForTimeout(500);
      } else {
        console.log('[pulse] Caption field not found in publish dialog — skipping');
      }
    }

    const confirmBtn = await findElement(page, [
      'button:has-text("Publish now")',
      'button:has-text("Publish")',
      '.artdeco-modal button.artdeco-button--primary',
      '[aria-label="Publish now"]',
      'button[data-control-name="publish"]',
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

    // Persistent profile auto-saves session on close — no explicit storageState needed
    await closeBrowser();

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
    await closeBrowser().catch(() => {});
    console.error('[pulse] Fatal error:', error.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[pulse] Unhandled error:', err?.message || err);
  process.exit(1);
});
