/**
 * test-cdp-screencast.ts — local proof-of-concept for the CDP screencast viewer.
 * Launches a real headed Chrome, streams it live over CDP screencast instead of
 * VNC, and cycles through a few demo pages so there's visible motion to judge
 * latency/smoothness against the current noVNC setup.
 *
 * Usage:
 *   npx tsx scripts/test-cdp-screencast.ts
 *   Then open http://localhost:7900 in any regular browser tab.
 */

import { chromium } from 'playwright';
import { startScreencastServer } from '../src/screencast/screencastServer.js';

const PORT = Number(process.env.SCREENCAST_PORT || 7900);

async function main() {
  const chromePath = process.env.CHROME_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

  console.log('  Launching headed Chrome...');
  const browser = await chromium.launch({
    headless: false,
    executablePath: chromePath,
    args: ['--start-maximized'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const handle = await startScreencastServer(page, PORT);
  console.log(`\n  ✅ Live viewer ready: ${handle.url}`);
  console.log('  Open that URL in a normal browser tab now — you should see the Chrome window live.\n');

  const demoUrls = [
    'https://example.com',
    'https://en.wikipedia.org/wiki/Special:Random',
    'https://news.ycombinator.com',
    'https://en.wikipedia.org/wiki/Special:Random',
  ];

  for (const url of demoUrls) {
    console.log(`  Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((e) => console.error('  nav error:', e.message));
    await page.mouse.wheel(0, 800).catch(() => {});
    await page.waitForTimeout(4000);
  }

  console.log('\n  Demo navigation done. Viewer stays live — Ctrl+C to stop.\n');
  await new Promise(() => {}); // keep process alive
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
