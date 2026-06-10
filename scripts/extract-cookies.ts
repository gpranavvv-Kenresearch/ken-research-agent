/**
 * extract-cookies.ts — Extract auth cookies from Chrome profiles
 *
 * Opens each Chrome profile (X, Facebook, LinkedIn), exports just the auth
 * cookies/localStorage as small JSON files (~50–200KB each).
 * Total output: ~5MB instead of 100GB.
 *
 * Usage (run from the agents/ project root):
 *   node --import=tsx scripts/extract-cookies.ts
 *
 * Optional env overrides:
 *   SESSIONS_DIR  — path to the .sessions folder  (default: ../x-posting-agent/.sessions)
 *   ACCOUNTS_DIR  — path to the .accounts folder  (default: ../x-posting-agent/.accounts)
 *   OUT_DIR       — where to write cookie JSONs    (default: .sessions-cookies)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = process.env.SESSIONS_DIR
  ?? path.resolve('..', 'x-posting-agent', '.sessions');

const ACCOUNTS_DIR = process.env.ACCOUNTS_DIR
  ?? path.resolve('..', 'x-posting-agent', '.accounts');

const OUT_DIR = path.resolve(process.env.OUT_DIR ?? '.sessions-cookies');

const CHROME_PATH = process.env.CHROME_PATH
  ?? (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);

const LINUX_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(file: string): any[] {
  if (!fs.existsSync(file)) { console.warn(`  ⚠️  Not found: ${file}`); return []; }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function extractFromProfile(opts: {
  profileDir: string;
  navigateTo: string;
  loggedInCheck: (url: string) => boolean;
  outFile: string;
  label: string;
}): Promise<boolean> {
  const { profileDir, navigateTo, loggedInCheck, outFile, label } = opts;

  const fullProfile = path.isAbsolute(profileDir)
    ? profileDir
    : path.join(SESSIONS_DIR, path.basename(profileDir));

  if (!fs.existsSync(fullProfile)) {
    console.log(`  ⏭  ${label}: profile not found at ${fullProfile}`);
    return false;
  }

  if (fs.existsSync(outFile)) {
    console.log(`  ✅ ${label}: already extracted (${path.basename(outFile)})`);
    return true;
  }

  console.log(`  🔓 ${label}: opening profile...`);

  let context: any = null;
  try {
    const launchOpts: any = {
      headless: true,
      slowMo: 0,
      args: [
        '--start-minimized',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        ...(process.platform !== 'win32' ? LINUX_ARGS : []),
      ],
    };

    if (CHROME_PATH && fs.existsSync(CHROME_PATH)) {
      launchOpts.executablePath = CHROME_PATH;
    }

    context = await chromium.launchPersistentContext(fullProfile, {
      ...launchOpts,
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = context.pages()[0] || await context.newPage();

    await page.goto(navigateTo, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (!loggedInCheck(currentUrl)) {
      console.log(`  ❌ ${label}: not logged in (url: ${currentUrl.slice(0, 80)})`);
      return false;
    }

    const state = await context.storageState();
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(state));
    const kb = Math.round(fs.statSync(outFile).size / 1024);
    console.log(`  ✅ ${label}: saved ${kb}KB → ${path.basename(outFile)}`);
    return true;
  } catch (err: any) {
    console.error(`  ❌ ${label}: error — ${err.message}`);
    return false;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

// ── X accounts ────────────────────────────────────────────────────────────────

async function extractX() {
  console.log('\n[X] Extracting X/Twitter sessions...');
  const accounts = readJson(path.join(ACCOUNTS_DIR, 'accounts.json'));
  let ok = 0;

  for (const acc of accounts) {
    const nickname = (acc.nickname || acc.handle || 'unknown').toLowerCase();
    const success = await extractFromProfile({
      profileDir: acc.sessionDir,
      navigateTo: 'https://x.com/home',
      loggedInCheck: (url) => url.includes('x.com/home') || url.includes('twitter.com/home'),
      outFile: path.join(OUT_DIR, `x-${nickname}.json`),
      label: `X:${nickname}`,
    });
    if (success) ok++;
  }

  console.log(`[X] Done: ${ok}/${accounts.length} extracted`);
}

// ── Facebook accounts ─────────────────────────────────────────────────────────

async function extractFacebook() {
  console.log('\n[FB] Extracting Facebook sessions...');
  const accounts = readJson(path.join(ACCOUNTS_DIR, 'facebook-accounts.json'));
  let ok = 0;

  for (const acc of accounts) {
    const nickname = (acc.nickname || 'unknown').toLowerCase();
    const success = await extractFromProfile({
      profileDir: acc.sessionDir || `.sessions/chrome-fb-${nickname}`,
      navigateTo: 'https://www.facebook.com/',
      loggedInCheck: (url) => !url.includes('/login') && !url.includes('login.php'),
      outFile: path.join(OUT_DIR, `fb-${nickname}.json`),
      label: `FB:${nickname}`,
    });
    if (success) ok++;
  }

  console.log(`[FB] Done: ${ok}/${accounts.length} extracted`);
}

// ── LinkedIn accounts ─────────────────────────────────────────────────────────

async function extractLinkedIn() {
  console.log('\n[LI] Extracting LinkedIn sessions...');
  const accounts = readJson(path.join(ACCOUNTS_DIR, 'linkedin-accounts.json'));
  let ok = 0;

  for (const acc of accounts) {
    const nickname = (acc.nickname || 'unknown').toLowerCase();
    const success = await extractFromProfile({
      profileDir: acc.sessionDir || `.sessions/chrome-linkedin-${nickname}`,
      navigateTo: 'https://www.linkedin.com/feed/',
      loggedInCheck: (url) => url.includes('/feed') || url.includes('/in/'),
      outFile: path.join(OUT_DIR, `li-${nickname}.json`),
      label: `LI:${nickname}`,
    });
    if (success) ok++;
  }

  console.log(`[LI] Done: ${ok}/${accounts.length} extracted`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Cookie Extractor ===');
  console.log(`Sessions dir : ${SESSIONS_DIR}`);
  console.log(`Accounts dir : ${ACCOUNTS_DIR}`);
  console.log(`Output dir   : ${OUT_DIR}`);

  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error(`\n❌ Sessions dir not found: ${SESSIONS_DIR}`);
    console.error('Set SESSIONS_DIR env var or run from the agents/ project root');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  await extractX();
  await extractFacebook();
  await extractLinkedIn();

  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json'));
  const totalKB = files.reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0) / 1024;
  console.log(`\n✅ Extraction complete: ${files.length} files, ${Math.round(totalKB)}KB total`);
  console.log(`\nNext step: npm run sessions:upload`);
}

main().catch(err => { console.error(err); process.exit(1); });
