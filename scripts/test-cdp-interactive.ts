/**
 * test-cdp-interactive.ts — proves out interactive CDP remote control (the
 * replacement for the noVNC "Add Account" login flow) against a real,
 * TRULY HEADLESS Chrome — no Xvfb, no X11, no display server of any kind.
 * Loads a local fake-login form so input correctness can be verified exactly
 * (the form echoes what was typed back onto the page).
 *
 * Usage:
 *   npx tsx scripts/test-cdp-interactive.ts
 *   Then open http://localhost:7901 — click into the fields and type/click
 *   through the canvas exactly like a real login. Compare against the form's
 *   own on-page echo to confirm every character/click landed correctly.
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { startScreencastServer } from '../src/screencast/screencastServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.SCREENCAST_PORT || 7901);

async function main() {
  const chromePath = process.env.CHROME_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

  console.log('  Launching TRUE HEADLESS Chrome (no Xvfb, no display server)...');
  const browser = await chromium.launch({
    headless: true, // <-- the whole point: no X11 dependency at all
    executablePath: chromePath,
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

  const formPath = path.join(__dirname, 'test-login-form.html');
  await page.goto(`file://${formPath}`);

  const handle = await startScreencastServer(page, PORT, { interactive: true });
  console.log(`\n  ✅ Interactive viewer ready: ${handle.url}`);
  console.log('  Open that URL, click the email field, type something, tab to password,');
  console.log('  type again, then click "Log In" — all through the canvas.\n');
  console.log('  This Chrome has NO physical/virtual display — proving Xvfb/x11vnc are');
  console.log('  no longer needed for either watching OR interactive login.\n');
  console.log('  Ctrl+C to stop.\n');

  await new Promise(() => {}); // keep alive
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
