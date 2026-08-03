/**
 * index.ts — Entry Point
 *
 * NEW ARCHITECTURE: Cron-Driven Platform-Specific Batch Scheduling
 *
 * Modes:
 *   npm run dev                             → start cron scheduler daemon
 *   npm run schedule                        → cron-only: arm 11AM/11PM triggers, wait (no immediate run)
 *   npm run schedule:now                    → cron-armed AND start a posting session immediately
 *   npm run dev -- run-x-batch              → run X batch once now
 *   npm run dev -- run-fb-batch             → run FB batch once now
 *   npm run dev -- run-li-batch             → run LI batch once now
 *   npm run dev -- run-medium-batch         → run Medium batch once now
 *   npm run dev -- run-linkmate-batch       → run Linkmate batch once now
 *   npm run dev -- run-devto-batch          → run Dev.to batch once now
 *   npm run dev -- run-googlesite-batch     → run Google Sites batch once now
 *   npm run dev -- run-linkedin-pulse-batch → run LinkedIn Pulse batch once now
 *   npm run dev -- run-calisthenics-batch   → run Calisthenics batch once now
 *   npm run dev -- run-substack-batch       → run Substack batch once now
 *   npm run dev -- run-hackmd-batch         → run HackMD batch once now
 *   npm run dev -- save-medium-session <nickname> → login & save Medium cookies
 *   npm run dev -- save-linkmate-session <nickname> → login & save Linkmate cookies
 *   npm run dev -- save-googlesite-session <nickname> → login & save Google Sites session
 *   npm run dev -- save-calisthenics-session <nickname> → login & save Calisthenics session
 *   npm run dev -- save-substack-session <nickname> → login & save Substack session
 *   npm run dev -- save-hackmd-session <nickname>     → login & save HackMD session
 *   npm run dev -- save-x-session <nickname>          → login & save X session
 *   npm run dev -- save-fb-session <nickname>         → login & save Facebook session
 *   npm run dev -- save-li-session <nickname>         → login & save LinkedIn session
 *   npm run dev -- save-patreon-session <nickname>    → login & save Patreon session
 *   npm run dev -- save-notion-session <nickname>     → login & save Notion session
 *   npm run dev -- save-paragraph-session <nickname> → login & save Paragraph session
 *   npm run dev -- run-paragraph-batch               → run Paragraph batch once now
 *   npm run dev -- run-patreon-batch                  → run Patreon batch once now
 *   npm run dev -- run-notion-batch                   → run Notion batch once now
 *   npm run dev -- tracker                  → daily posting tracker (posted/failed/pending per platform)
 *   npm run dev -- status                   → show current sheet stats
 *   npm run dev -- monitor                  → run one monitor cycle (for Claude CLI /loop)
 */

import 'dotenv/config';
import { initErrorInterceptor } from './errorInterceptor.js';
import { startCoordinatorDaemon } from './scheduler-new.js';
import { acquireBrowserSlot } from './utils/browserSlots.js';

// Patch console.error/warn to stream to logs/runtime.log for monitor
initErrorInterceptor();

const mode = process.argv[2];

async function main() {
  console.log('🔐 X Posting Agent v2.0 — Cron-Driven Batch Scheduling\n');

  if (mode === 'monitor') {
    const { runMonitorCycle } = await import('./monitor.js');
    const result = await runMonitorCycle();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (mode === 'run-x-batch') {
    console.log('▶ Running X batch now...\n');
    const { runXBatch } = await import('./coordinator/masterCoordinator.js');
    await runXBatch();
    console.log('\n✅ X batch complete');
    return;
  }

  if (mode === 'run-fb-batch') {
    console.log('▶ Running FB batch now...\n');
    const { runFbBatch } = await import('./coordinator/masterCoordinator.js');
    await runFbBatch();
    console.log('\n✅ FB batch complete');
    return;
  }

  if (mode === 'run-li-batch') {
    console.log('▶ Running LI batch now...\n');
    const { runLiBatch } = await import('./coordinator/masterCoordinator.js');
    await runLiBatch({ manual: true }, 1);
    console.log('\n✅ LI batch complete');
    return;
  }

  if (mode === 'run-medium-batch') {
    console.log('▶ Running Medium batch now...\n');
    const { runMediumBatch } = await import('./coordinator/masterCoordinator.js');
    await runMediumBatch();
    console.log('\n✅ Medium batch complete');
    return;
  }

  if (mode === 'run-linkmate-batch') {
    console.log('▶ Running Linkmate batch now...\n');
    const { runLinkmateBatch } = await import('./coordinator/masterCoordinator.js');
    await runLinkmateBatch();
    console.log('\n✅ Linkmate batch complete');
    return;
  }

  if (mode === 'run-devto-batch') {
    console.log('▶ Running Dev.to batch now...\n');
    const { runDevtoBatch } = await import('./coordinator/masterCoordinator.js');
    await runDevtoBatch();
    console.log('\n✅ Dev.to batch complete');
    return;
  }

  if (mode === 'run-wordpress-batch') {
    console.log('▶ Running WordPress batch now...\n');
    const { runWordpressBatch } = await import('./coordinator/masterCoordinator.js');
    await runWordpressBatch();
    console.log('\n✅ WordPress batch complete');
    return;
  }

  if (mode === 'run-blogger-batch') {
    console.log('▶ Running Blogger batch now...\n');
    const { runBloggerBatch } = await import('./coordinator/masterCoordinator.js');
    await runBloggerBatch();
    console.log('\n✅ Blogger batch complete');
    return;
  }

  if (mode === 'run-note-batch') {
    console.log('▶ Running Note batch now...\n');
    const { runNoteBatch } = await import('./coordinator/masterCoordinator.js');
    await runNoteBatch(1);
    return;
  }

  if (mode === 'run-googlesite-batch') {
    console.log('▶ Running Google Sites batch now...\n');
    const { runGoogleSiteBatch } = await import('./coordinator/masterCoordinator.js');
    await runGoogleSiteBatch();
    console.log('\n✅ Google Sites batch complete');
    return;
  }

  if (mode === 'run-linkedin-pulse-batch') {
    console.log('▶ Running LinkedIn Pulse batch now...\n');
    const { runLinkedinPulseBatch } = await import('./coordinator/masterCoordinator.js');
    await runLinkedinPulseBatch();
    console.log('\n✅ LinkedIn Pulse batch complete');
    return;
  }

  if (mode === 'run-calisthenics-batch') {
    console.log('▶ Running Calisthenics batch now...\n');
    const { runCalisthenicsNBatch } = await import('./coordinator/masterCoordinator.js');
    await runCalisthenicsNBatch();
    console.log('\n✅ Calisthenics batch complete');
    return;
  }

  if (mode === 'run-substack-batch') {
    console.log('▶ Running Substack batch now...\n');
    const { runSubstackBatch } = await import('./coordinator/masterCoordinator.js');
    await runSubstackBatch();
    console.log('\n✅ Substack batch complete');
    return;
  }

  if (mode === 'run-hackmd-batch') {
    console.log('▶ Running HackMD batch now...\n');
    const { runHackmdBatch } = await import('./coordinator/masterCoordinator.js');
    await runHackmdBatch();
    console.log('\n✅ HackMD batch complete');
    return;
  }

  if (mode === 'run-patreon-batch') {
    console.log('▶ Running Patreon batch now...\n');
    const { runPatreonBatch } = await import('./coordinator/masterCoordinator.js');
    await runPatreonBatch();
    console.log('\n✅ Patreon batch complete');
    return;
  }

  if (mode === 'run-notion-batch') {
    console.log('▶ Running Notion batch now...\n');
    const { runNotionBatch } = await import('./coordinator/masterCoordinator.js');
    await runNotionBatch();
    console.log('\n✅ Notion batch complete');
    return;
  }

  if (mode === 'run-paragraph-batch') {
    console.log('▶ Running Paragraph batch now...\n');
    const { runParagraphBatch } = await import('./coordinator/masterCoordinator.js');
    await runParagraphBatch();
    console.log('\n✅ Paragraph batch complete');
    return;
  }

  if (mode === 'run-ameba-batch') {
    console.log('▶ Running Ameba batch now...\n');
    const { runAmebaBatch } = await import('./coordinator/masterCoordinator.js');
    await runAmebaBatch();
    console.log('\n✅ Ameba batch complete');
    return;
  }

  if (mode === 'save-x-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-x-session <nickname>');
      process.exit(1);
    }
    const { getAccountByHandle } = await import('./config/accounts.js');
    const { loginToX } = await import('./browser/twitter/login.js');
    const account = getAccountByHandle(nickname);
    if (!account) { console.error(`❌ No X account found for: ${nickname}`); process.exit(1); }
    console.log(`\n🌐 Opening browser for X login — @${nickname}`);
    await loginToX(account);
    console.log('\n✅ X session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
    return;
  }

  if (mode === 'save-fb-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-fb-session <nickname>');
      process.exit(1);
    }
    const { loginToFacebook } = await import('./browser/facebook/login.js');
    console.log(`\n🌐 Opening browser for Facebook login — ${nickname}`);
    await loginToFacebook({ nickname });
    console.log('\n✅ Facebook session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
    return;
  }

  if (mode === 'save-fb-session-manual') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-fb-session-manual <nickname>');
      process.exit(1);
    }
    const { loginToFacebook } = await import('./browser/facebook/login.js');
    console.log(`\n🌐 Opening browser for MANUAL Facebook login — ${nickname}`);
    console.log('   Browser will open at facebook.com/login — type your credentials yourself.');
    await loginToFacebook({ nickname, manualLogin: true });
    console.log('\n✅ Facebook session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
    return;
  }

  if (mode === 'save-li-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-li-session <nickname>');
      process.exit(1);
    }
    const { loginToLinkedIn } = await import('./browser/linkedin/login.js');
    console.log(`\n🌐 Opening browser for LinkedIn login — ${nickname}`);
    await loginToLinkedIn({ nickname });
    console.log('\n✅ LinkedIn session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
    return;
  }

  if (mode === 'save-patreon-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-patreon-session <nickname>');
      process.exit(1);
    }
    const { loginToPatreon } = await import('./browser/patreon/login.js');
    console.log(`\n🌐 Opening browser for Patreon login — ${nickname}`);
    await loginToPatreon({ nickname });
    console.log('\n✅ Patreon session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
    return;
  }

  if (mode === 'save-notion-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-notion-session <nickname>');
      process.exit(1);
    }
    const { loginToNotion } = await import('./browser/notion/login.js');
    console.log(`\n🌐 Opening browser for Notion login — ${nickname}`);
    await loginToNotion({ nickname });
    console.log('\n✅ Notion session saved. Press Ctrl+C to exit.');
    await new Promise(() => {});
    return;
  }

  if (mode === 'save-note-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-note-session <nickname>');
      console.error('   Example: npm run dev -- save-note-session aniket');
      process.exit(1);
    }
    const { saveNoteSession } = await import('./coordinator/masterCoordinator.js');
    await saveNoteSession(nickname);
    return;
  }

  if (mode === 'save-medium-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-medium-session <nickname>');
      console.error('   Example: npm run dev -- save-medium-session pranav');
      process.exit(1);
    }
    const { saveMediumSession } = await import('./coordinator/masterCoordinator.js');
    await saveMediumSession(nickname);
    return;
  }

  if (mode === 'save-linkmate-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-linkmate-session <nickname>');
      console.error('   Example: npm run dev -- save-linkmate-session pranav');
      process.exit(1);
    }
    const { saveLinkMateSession } = await import('./coordinator/masterCoordinator.js');
    await saveLinkMateSession(nickname);
    return;
  }

  if (mode === 'save-devto-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-devto-session <nickname>');
      console.error('   Example: npm run dev -- save-devto-session pranav');
      process.exit(1);
    }
    const { getDevtoAccountByNickname } = await import('./browser/devto/login.js');
    const { chromium } = await import('playwright');
    const path = await import('path');
    const fs = await import('fs');

    const account = getDevtoAccountByNickname(nickname);
    if (!account) {
      console.error(`❌ No Dev.to account found for nickname: ${nickname}`);
      process.exit(1);
    }

    const sessionDir = path.resolve(account.sessionDir);
    const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
    fs.mkdirSync(sessionDir, { recursive: true });

    console.log(`\n🌐 Opening browser for Dev.to login — @${nickname} (${account.email})`);
    console.log(`   Session dir: ${sessionDir}`);
    console.log(`   Log in manually in the browser, then press Enter here to save & close.\n`);

    const ctx = await chromium.launchPersistentContext(sessionDir, {
      headless: process.env.HEADLESS !== 'false',
      executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
      channel: fs.existsSync(chromePath) ? undefined : 'chrome',
      viewport: { width: 1366, height: 900 },
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--disable-infobars'],
    });

    const pages = ctx.pages();
    const page = pages[0] || await ctx.newPage();
    await page.goto('https://dev.to/enter', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for user to press Enter in terminal
    await new Promise<void>(resolve => {
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
    });

    console.log('\n   Saving session & closing browser...');
    await ctx.close();
    console.log(`✅ Dev.to session saved for @${nickname}\n`);
    return;
  }

  if (mode === 'save-googlesite-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-googlesite-session <nickname>');
      console.error('   Example: npm run dev -- save-googlesite-session aniket');
      process.exit(1);
    }
    const { saveGoogleSiteSession } = await import('./coordinator/masterCoordinator.js');
    await saveGoogleSiteSession(nickname);
    return;
  }

  if (mode === 'save-calisthenics-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-calisthenics-session <nickname>');
      console.error('   Example: npm run dev -- save-calisthenics-session pranav');
      process.exit(1);
    }
    const { saveCalisthenicsSession } = await import('./coordinator/masterCoordinator.js');
    await saveCalisthenicsSession(nickname);
    return;
  }

  if (mode === 'save-substack-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-substack-session <nickname>');
      console.error('   Example: npm run dev -- save-substack-session pranav');
      process.exit(1);
    }
    const path = await import('path');
    const { chromium } = await import('playwright');
    const sessionDir = path.default.resolve(`.sessions/substack/${nickname}`);
    const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
    console.log(`\n🔐 Opening Substack browser for: ${nickname}`);
    console.log(`   Session dir: ${sessionDir}\n`);
    const fs = await import('fs');
    if (!fs.default.existsSync(sessionDir)) fs.default.mkdirSync(sessionDir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(sessionDir, {
      headless: process.env.HEADLESS !== 'false',
      executablePath: chromePath,
      viewport: { width: 1280, height: 720 },
      slowMo: 50,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--start-minimized',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run', '--no-default-browser-check',
        '--disable-session-crashed-bubble', '--disable-infobars',
      ],
    });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ctx.addInitScript(() => {
      Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => false });
      (globalThis as any).window.chrome = (globalThis as any).window.chrome || { runtime: {} };
    });
    const pages = ctx.pages();
    const pg = pages[0] || await ctx.newPage();
    await pg.goto('https://substack.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
    process.stdout.write('\n✅ Browser open. Log in to Substack (use Continue with Google), then type y and press Enter: ');
    await new Promise<void>(resolve => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
    console.log('\n   Saving session & closing browser...');
    await ctx.close();
    console.log(`\n✅ Session saved for ${nickname}! (${sessionDir})`);
    return;
  }

  if (mode === 'save-facebook-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-facebook-session <nickname>');
      console.error('   Example: npm run dev -- save-facebook-session pranav');
      process.exit(1);
    }
    const { loginToFacebook, closeFacebookBrowser } = await import('./browser/facebook/login.js');
    console.log(`\n🔐 Opening Facebook browser for: ${nickname}`);
    console.log('   Log in manually if needed, then close the browser.\n');
    await loginToFacebook({ nickname });
    process.stdout.write('\n✅ Browser open. Log in to Facebook if needed, then type y and press Enter: ');
    await new Promise<void>(resolve => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
    console.log(`\n✅ Session saved for ${nickname}!`);
    await closeFacebookBrowser();
    return;
  }

  if (mode === 'save-wordpress-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-wordpress-session <nickname>');
      console.error('   Example: npm run dev -- save-wordpress-session pranav');
      process.exit(1);
    }
    const path = await import('path');
    const { chromium } = await import('playwright');
    const sessionDir = path.default.resolve(`.sessions/wordpress/${nickname}`);
    const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
    console.log(`\n🔐 Opening WordPress browser for: ${nickname}`);
    console.log(`   Session dir: ${sessionDir}\n`);
    const fs = await import('fs');
    if (!fs.default.existsSync(sessionDir)) fs.default.mkdirSync(sessionDir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(sessionDir, {
      headless: process.env.HEADLESS !== 'false',
      executablePath: chromePath,
      viewport: { width: 1366, height: 900 },
      slowMo: 50,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--start-minimized',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run', '--no-default-browser-check',
        '--disable-session-crashed-bubble', '--disable-infobars',
      ],
    });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ctx.addInitScript(() => {
      Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => false });
      (globalThis as any).window.chrome = (globalThis as any).window.chrome || { runtime: {} };
    });
    const pages = ctx.pages();
    const pg = pages[0] || await ctx.newPage();
    // Force window to top-left via CDP
    try {
      const cdp = await ctx.newCDPSession(pg);
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: 1366, height: 900, windowState: 'normal' } });
      await cdp.detach().catch(() => {});
    } catch { /* ignore */ }
    await pg.goto('https://wordpress.com/log-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
    process.stdout.write('\n✅ Browser open. Log in to WordPress, then type y and press Enter: ');
    await new Promise<void>(resolve => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
    console.log(`\n✅ Session saved for ${nickname}! (${sessionDir})`);
    await ctx.close();
    return;
  }

  if (mode === 'save-blogger-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-blogger-session <nickname>');
      console.error('   Example: npm run dev -- save-blogger-session pranav');
      process.exit(1);
    }
    const path = await import('path');
    const { chromium } = await import('playwright');
    const sessionDir = path.default.resolve(`.sessions/blogger/${nickname}`);
    const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
    console.log(`\n🔐 Opening Blogger browser for: ${nickname}`);
    console.log(`   Session dir: ${sessionDir}\n`);
    const fs = await import('fs');
    if (!fs.default.existsSync(sessionDir)) fs.default.mkdirSync(sessionDir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(sessionDir, {
      headless: process.env.HEADLESS !== 'false',
      executablePath: chromePath,
      viewport: null,
      slowMo: 50,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--start-minimized',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run', '--no-default-browser-check',
        '--disable-session-crashed-bubble', '--disable-infobars',
      ],
    });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ctx.addInitScript(() => {
      Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => false });
      (globalThis as any).window.chrome = (globalThis as any).window.chrome || { runtime: {} };
    });
    const pages = ctx.pages();
    const pg = pages[0] || await ctx.newPage();
    await pg.goto('https://www.blogger.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    process.stdout.write('\n✅ Browser open. Log in to Blogger, then type y and press Enter: ');
    await new Promise<void>(resolve => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
    console.log(`\n✅ Session saved for ${nickname}! (${sessionDir})`);
    await ctx.close();
    return;
  }

  if (mode === 'save-ameba-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-ameba-session <nickname>');
      console.error('   Example: npm run dev -- save-ameba-session pranav');
      process.exit(1);
    }
    const path = await import('path');
    const { chromium } = await import('playwright');
    const sessionDir = path.default.resolve(`.sessions/ameba/${nickname}`);
    const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
    console.log(`\n🔐 Opening Ameba browser for: ${nickname}`);
    console.log(`   Session dir: ${sessionDir}\n`);
    const fs = await import('fs');
    if (!fs.default.existsSync(sessionDir)) fs.default.mkdirSync(sessionDir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(sessionDir, {
      headless: process.env.HEADLESS !== 'false',
      executablePath: chromePath,
      viewport: null,
      slowMo: 50,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--start-minimized',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run', '--no-default-browser-check',
        '--disable-session-crashed-bubble', '--disable-infobars',
      ],
    });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ctx.addInitScript(() => {
      Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => false });
      (globalThis as any).window.chrome = (globalThis as any).window.chrome || { runtime: {} };
    });
    const pages = ctx.pages();
    const pg = pages[0] || await ctx.newPage();
    await pg.goto('https://www.ameba.jp/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    process.stdout.write('\n✅ Browser open. Log in to Ameba, then type y and press Enter: ');
    await new Promise<void>(resolve => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
    console.log(`\n✅ Session saved for ${nickname}! (${sessionDir})`);
    await ctx.close();
    return;
  }

  if (mode === 'save-paragraph-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-paragraph-session <nickname>');
      console.error('   Example: npm run dev -- save-paragraph-session pranav');
      process.exit(1);
    }
    const path = await import('path');
    const { spawn } = await import('child_process');
    const fs = await import('fs');
    const sessionDir = path.default.resolve(`.sessions/paragraph/${nickname}`);
    const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
    console.log(`\n🔐 Opening Paragraph in normal Chrome (no automation) for: ${nickname}`);
    console.log(`   Session dir: ${sessionDir}\n`);
    if (!fs.default.existsSync(sessionDir)) fs.default.mkdirSync(sessionDir, { recursive: true });
    // Plain Chrome — no Playwright, no automation flags → bypasses captcha detection
    const proc = spawn(chromePath, [
      `--user-data-dir=${sessionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'https://paragraph.com/home',
    ], { detached: true, stdio: 'ignore' });
    proc.unref();
    process.stdout.write('\n✅ Normal Chrome open. Log in to Paragraph, then type y and press Enter: ');
    await new Promise<void>(resolve => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
    console.log(`\n✅ Session saved for ${nickname}! (${sessionDir})`);
    console.log('   Close Chrome manually if still open.');
    return;
  }

  if (mode === 'save-hackmd-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-hackmd-session <nickname>');
      console.error('   Example: npm run dev -- save-hackmd-session kamakshi');
      process.exit(1);
    }
    const { saveHackmdSession } = await import('./coordinator/masterCoordinator.js');
    await saveHackmdSession(nickname);
    return;
  }

  if (mode === 'login' || mode === 'save-x-session') {
    const nickname = process.argv[3];
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- save-x-session <nickname>');
      console.error('   Example: npm run dev -- save-x-session aniket');
      process.exit(1);
    }
    const { getAccountByHandle } = await import('./config/accounts.js');
    const { spawn } = await import('child_process');
    const path = await import('path');
    const fs = await import('fs');
    const account = getAccountByHandle(nickname);
    if (!account) {
      console.error(`❌ Account "${nickname}" not found in accounts.json`);
      process.exit(1);
    }
    const sessionDir = path.default.resolve(account.sessionDir || `.sessions/chrome-${account.handle}`);
    fs.default.mkdirSync(sessionDir, { recursive: true });
    const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
    console.log(`\n🔐 Opening plain Chrome for: @${account.handle} (${nickname})`);
    console.log(`   Session dir: ${sessionDir}`);
    console.log(`   → Log in to X manually, then come back here and press Enter.\n`);
    const chrome = spawn(chromePath, [
      `--user-data-dir=${sessionDir}`,
      '--new-window',
      'https://x.com/login',
    ], { detached: true, stdio: 'ignore' });
    chrome.unref();
    process.stdout.write('✅ Browser open. Login complete? Press Enter to finish: ');
    await new Promise<void>(resolve => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
    console.log(`\n✅ Session saved for ${nickname}!`);
    return;
  }

  if (mode === 'manual-login') {
    // One shared Chrome profile per person, reused across every platform
    // (X, FB, LI, and all blog platforms) — cookies are domain-scoped so
    // this is safe. Opens straight to the platform's own landing page (same
    // URL the real login/poster code checks), so if you're already logged
    // in from a prior run you'll just see the logged-in page and can press
    // Enter immediately; if not, log in by hand then press Enter.
    const PLATFORM_URLS: Record<string, string> = {
      google: 'https://accounts.google.com/',
      x: 'https://x.com/home',
      fb: 'https://www.facebook.com/',
      li: 'https://www.linkedin.com/feed/',
      medium: 'https://medium.com/',
      wordpress: 'https://wordpress.com/',
      blogger: 'https://www.blogger.com/',
      notion: 'https://app.notion.com/',
      patreon: 'https://www.patreon.com/login',
      paragraph: 'https://paragraph.com/home',
      substack: 'https://substack.com/',
      hackmd: 'https://hackmd.io/?nav=overview',
      devto: 'https://dev.to/dashboard',
      googlesite: 'https://sites.google.com/',
      calisthenics: 'https://calisthenics.mn.co/',
      linkmate: 'https://linkmate.mn.co/',
      note: 'https://note.com/',
      ameba: 'https://www.ameba.jp/home',
      articlescad: 'https://articlescad.com/dashboard',
    };
    // Same file each platform's real posting/login code reads its sessionDir from
    // (getAccountByHandle, getFacebookAccountByNickname, getLinkedInAccountByNickname,
    // etc.) — keyed the same as PLATFORM_URLS so manual-login opens the EXACT profile
    // posting will use, instead of guessing a fresh ".sessions/chrome-<name>" one.
    const PLATFORM_ACCOUNTS_FILE: Record<string, string> = {
      x: '.accounts/accounts.json',
      fb: '.accounts/facebook-accounts.json',
      li: '.accounts/linkedin-accounts.json',
      medium: '.accounts/accounts-medium.json',
      wordpress: '.accounts/accounts-wordpress.json',
      blogger: '.accounts/accounts-blogger.json',
      notion: '.accounts/accounts-notion.json',
      patreon: '.accounts/accounts-patreon.json',
      paragraph: '.accounts/accounts-paragraph.json',
      substack: '.accounts/accounts-substack.json',
      hackmd: '.accounts/accounts-hackmd.json',
      devto: '.accounts/accounts-devto.json',
      googlesite: '.accounts/accounts-googlesite.json',
      calisthenics: '.accounts/accounts-calisthenics.json',
      linkmate: '.accounts/accounts-linkmate.json',
      note: '.accounts/accounts-note.json',
      ameba: '.accounts/accounts-ameba.json',
      articlescad: '.accounts/accounts-articlescad.json',
    };

    const nickname = process.argv[3];
    const platformArg = process.argv[4]; // optional: shortcut key above, or a raw URL
    if (!nickname) {
      console.error('❌ Usage: npm run dev -- manual-login <nickname> [platform|url]');
      console.error(`   Platforms: ${Object.keys(PLATFORM_URLS).join(', ')}`);
      process.exit(1);
    }
    let startUrl: string | undefined;
    if (platformArg) {
      const isUrl = /^https?:\/\//i.test(platformArg);
      const known = PLATFORM_URLS[platformArg.toLowerCase()];
      if (known) {
        startUrl = known;
      } else if (isUrl) {
        startUrl = platformArg;
      } else {
        console.error(`❌ "${platformArg}" isn't a recognized platform or a URL (did you mean to pass a platform name here, not a person's name?)`);
        console.error(`   Platforms: ${Object.keys(PLATFORM_URLS).join(', ')}`);
        console.error(`   Usage: npm run dev -- manual-login <nickname> <platform>`);
        process.exit(1);
      }
    }

    const path = await import('path');
    const fs = await import('fs');
    const { chromium } = await import('playwright');
    const { killChromeForProfile } = await import('./utils/killChrome.js');

    // Look up the real sessionDir from that platform's accounts file (same one the
    // posting/login code reads), falling back to the shared default only if the
    // platform has no accounts file or no matching entry for this nickname.
    function lookupSessionDir(platform: string | undefined, name: string): string | undefined {
      const file = platform ? PLATFORM_ACCOUNTS_FILE[platform.toLowerCase()] : undefined;
      if (!file || !fs.default.existsSync(file)) return undefined;
      try {
        const list = JSON.parse(fs.default.readFileSync(file, 'utf8'));
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
        const match = (Array.isArray(list) ? list : []).find((a: any) => a.nickname && norm(a.nickname) === norm(name));
        return match?.sessionDir;
      } catch { return undefined; }
    }

    const foundSessionDir = lookupSessionDir(platformArg, nickname);
    const resolvedSessionDir = path.default.resolve(foundSessionDir || `.sessions/chrome-${nickname.toLowerCase()}`);
    if (!foundSessionDir && platformArg && PLATFORM_ACCOUNTS_FILE[platformArg.toLowerCase()]) {
      console.log(`⚠ No "${nickname}" entry found in ${PLATFORM_ACCOUNTS_FILE[platformArg.toLowerCase()]} — falling back to default profile. Posting may use a different session than this login!`);
    }
    fs.default.mkdirSync(resolvedSessionDir, { recursive: true });
    // Kill any Chrome still holding this profile (e.g. left open from a prior
    // manual-login run) BEFORE we launch — otherwise Playwright either fails to
    // attach or spawns alongside it, and closing later can race a half-written
    // cookie DB.
    killChromeForProfile(resolvedSessionDir);
    const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
    console.log(`\n🔐 Opening shared Chrome profile for ${nickname}${platformArg ? ` — ${platformArg}` : ''}`);
    console.log(`   Session dir: ${resolvedSessionDir}`);
    if (startUrl) console.log(`   Opening: ${startUrl}`);
    console.log('   Already logged in from a prior session? Great, just press Enter.');
    console.log('   Not logged in? Log in by hand — nothing is auto-filled — then press Enter.\n');

    // Playwright's launchPersistentContext (not a bare detached spawn) so we can
    // cleanly .close() it below — a hard "leave Chrome running" leak meant the
    // NEXT command's killChromeForProfile() could force-kill this window before
    // the cookie DB was durably flushed, so a completed login could still read
    // back as logged-out. Matches how save-x-session/save-fb-session/etc. do it.
    const ctx = await chromium.launchPersistentContext(resolvedSessionDir, {
      headless: false,
      executablePath: fs.default.existsSync(chromePath as string) ? chromePath : undefined,
      channel: fs.default.existsSync(chromePath as string) ? undefined : 'chrome',
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check', '--disable-infobars'],
    });
    if (startUrl) {
      const page = ctx.pages()[0] || await ctx.newPage();
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }
    process.stdout.write('✅ Browser open. Done? Press Enter to finish: ');
    await new Promise<void>(resolve => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    });
    await ctx.close();
    console.log(`\n✅ Session saved for ${nickname}! (browser closed & flushed)`);
    return;
  }

  if (mode === 'tracker') {
    console.log('📊 Running daily posting tracker...\n');
    const { runTracker, printTrackerReport } = await import('./tracker.js');
    const result = await runTracker();
    printTrackerReport(result);
    return;
  }

  if (mode === 'today') {
    const { runTracker, printTodaySummary, postTodaySummaryToTeams } = await import('./tracker.js');
    const result = await runTracker();
    printTodaySummary(result);

    if (process.argv.includes('--no-teams')) return;

    const autoSend = process.argv.includes('--send');
    if (autoSend) {
      await postTodaySummaryToTeams(result);
      return;
    }

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve =>
      rl.question('\nSend this summary to Teams? (y/N): ', a => { rl.close(); resolve(a); })
    );
    if (answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes') {
      await postTodaySummaryToTeams(result);
    } else {
      console.log('Skipped Teams post.');
    }
    return;
  }

  if (mode === 'status') {
    console.log('📊 Fetching sheet stats...\n');
    const { getUnassignedRows, getRowsReadyForFb, getRowsReadyForLi } = await import('./sheets/sheets.js');
    const unassigned = await getUnassignedRows();
    const fbReady    = await getRowsReadyForFb(999);
    const liReady    = await getRowsReadyForLi(999);
    console.log(`  Unassigned (no SEO rank yet):  ${unassigned.length} rows`);
    console.log(`  Ready for FB (rank set, no FB post): ${fbReady.length} rows`);
    console.log(`  Ready for LI (rank set, no LI post): ${liReady.length} rows`);
    return;
  }

  if (mode === 'reset-medium-posts') {
    console.log('🔄 Resetting Medium posts...\n');
    const { resetMediumPosts } = await import('./coordinator/masterCoordinator.js');
    await resetMediumPosts();
    return;
  }

  // ── Retry a specific row on a specific platform ─────────────────────────────
  //   npm run dev -- row 15 googlesite
  //   npm run dev -- row 22 hackmd
  //   npm run dev -- row 8 devto
  if (mode === 'row') {
    const rowArg = process.argv[3];
    const platformArg = process.argv[4];
    if (!rowArg || !platformArg) {
      console.error('❌ Usage: npm run dev -- row <rowNumber> <platform>');
      console.error('   Example: npm run dev -- row 15 googlesite');
      console.error('   Platforms: googlesite, hackmd, devto, medium, linkmate, linkedin-pulse, calisthenics, substack, wordpress');
      process.exit(1);
    }
    const rowIndex = parseInt(rowArg, 10);
    if (isNaN(rowIndex) || rowIndex < 2) {
      console.error(`❌ Row number must be a number ≥ 2 (row 1 is the header). Got: ${rowArg}`);
      process.exit(1);
    }
    const { runRetryRow } = await import('./coordinator/masterCoordinator.js');
    await runRetryRow(rowIndex, platformArg);
    return;
  }

  // ── Retry a row range on one platform, sequentially ──────────────────────
  //   npm run dev -- rows 10 20 x
  //   npm run dev -- rows 32 46 hackmd
  if (mode === 'rows' || mode === 'row-range') {
    const fromArg = process.argv[3];
    const toArg = process.argv[4];
    const platformArg = process.argv[5];
    if (!fromArg || !toArg || !platformArg) {
      console.error('❌ Usage: npm run dev -- rows <fromRow> <toRow> <platform>');
      console.error('   Example: npm run dev -- rows 10 20 x');
      console.error('   Platforms: googlesite, hackmd, devto, medium, linkmate, linkedin-pulse, calisthenics, substack, wordpress, blogger, x, facebook, linkedin');
      process.exit(1);
    }

    const fromRow = parseInt(fromArg, 10);
    const toRow = parseInt(toArg, 10);
    if (isNaN(fromRow) || isNaN(toRow) || fromRow < 2 || toRow < 2 || fromRow > toRow) {
      console.error(`❌ Row range must be valid sheet rows ≥ 2 and fromRow <= toRow. Got: ${fromArg} ${toArg}`);
      process.exit(1);
    }

    const { runRetryRow } = await import('./coordinator/masterCoordinator.js');
    console.log(`\n🔁 Running rows ${fromRow}-${toRow} on ${platformArg}\n`);
    for (let rowIndex = fromRow; rowIndex <= toRow; rowIndex++) {
      console.log(`\n──────── Row ${rowIndex}/${toRow} ────────`);
      await runRetryRow(rowIndex, platformArg);
    }
    console.log(`\n✅ Row range complete: ${fromRow}-${toRow} on ${platformArg}`);
    return;
  }

  // The posting daemon is long-lived and drives many browsers. A single Playwright
  // "Target/context/browser has been closed" surfaces as an unhandledRejection when
  // a Chrome dies mid-post. Without a guard, Node tears down the WHOLE scheduler →
  // pm2 restarts it → the running session is abandoned and a fresh one starts (the
  // fragmented-cycle / ~7-restarts-a-day problem). These are per-session faults, not
  // process faults: log and carry on so one bad post never kills the daemon. Scoped
  // to the daemon modes so one-shot CLI commands still exit on error. Mirrors the
  // guards already on login-api (server.ts).
  if (mode === 'schedule' || mode === 'schedule-now') {
    process.on('unhandledRejection', (reason: any) => {
      console.error('[scheduler] unhandledRejection (ignored):', (reason as any)?.message || reason);
    });
    process.on('uncaughtException', (err: any) => {
      console.error('[scheduler] uncaughtException (ignored):', err?.message || err);
    });
  }

  // mode === 'schedule-now': cron triggers armed AND a posting session starts
  // right away. mode === 'schedule' (or unspecified): cron-only — register
  // the 11:00 AM/PM triggers and wait for the next one, no immediate run.
  await startCoordinatorDaemon(mode === 'schedule-now');

  // Keep the process alive for cron jobs to fire
  await new Promise(() => {});
}

// Modes that either never open a browser, or already manage their own
// agent-scoped browser slot internally (schedule/schedule-now → runStage() in
// scheduler-new.ts) — everything else is a one-off command that opens exactly
// one browser lifecycle and exits, so it gets wrapped in this agent's slot
// here to guarantee only one browser is ever open for this agent at a time,
// even across separate manual CLI invocations.
const NO_SLOT_MODES = new Set([undefined, 'monitor', 'tracker', 'today', 'status', 'schedule', 'schedule-now']);

async function run() {
  if (NO_SLOT_MODES.has(mode)) {
    await main();
    return;
  }
  const agent = (process.env.WORKER_NAME || 'abhinav').toLowerCase();
  const release = await acquireBrowserSlot(mode!, { agent });
  try {
    await main();
  } finally {
    release();
  }
}

run().catch(err => {
  console.error('❌ Fatal error:', err.message);
  console.error(err);
  process.exit(1);
});
