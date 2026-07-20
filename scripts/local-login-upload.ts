/**
 * local-login-upload.ts — log in on YOUR OWN machine, upload the session.
 *
 * This is the fast alternative to the dashboard's remote live-view login:
 * instead of streaming a remote browser over the network (bottlenecked by
 * whatever network path connects you to the VPS), a REAL Chrome opens right
 * here on your own computer — full native speed, zero streaming lag. Log in
 * normally, press Enter, and this script packages the resulting session and
 * uploads it straight to the exact folder the scheduler reads from.
 *
 * You don't run this by hand normally — the dashboard's "Add Account" button
 * gives you the exact command to copy-paste, already filled in with the
 * right platform/login URL/upload token. Just paste and run it.
 *
 * Usage:
 *   npx tsx scripts/local-login-upload.ts --server <url> --agent <agent> \
 *     --platform <platform> --login-url <url> --upload-token <token>
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import readline from 'readline';
import * as tar from 'tar';

function arg(flag: string): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? (process.argv[i + 1] ?? '') : '';
}

const server = arg('--server');
const agent = arg('--agent');
const platform = arg('--platform');
const loginUrl = arg('--login-url');
const uploadToken = arg('--upload-token');

if (!server || !agent || !platform || !loginUrl || !uploadToken) {
  console.error('Usage: local-login-upload.ts --server <url> --agent <agent> --platform <platform> --login-url <url> --upload-token <token>');
  process.exit(1);
}

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

// Same disposable-cache list identified when cleaning up the VPS earlier
// (~99% of a profile's disk usage, ~0% of what actually matters for login) —
// strip it here so every new account doesn't re-introduce that bloat.
const SAFE_TO_TRIM = [
  'Default/Cache', 'Default/Service Worker', 'Default/Code Cache', 'Default/GPUCache',
  'Default/DawnWebGPUCache', 'Default/DawnGraphiteCache', 'Default/Shared Dictionary',
  'component_crx_cache', 'Safe Browsing', 'WasmTtsEngine', 'OnDeviceHeadSuggestModel',
  'ActorSafetyLists', 'hyphen-data', 'ZxcvbnData', 'CertificateRevocation',
  'OptimizationHints', 'Dictionaries', 'PKIMetadata', 'GraphiteDawnCache',
  'Crowd Deny', 'Subresource Filter', 'SafetyTips', 'segmentation_platform',
  'optimization_guide_model_store', 'TrustTokenKeyCommitments', 'FirstPartySetsPreloaded',
];

function trimCache(profileDir: string): void {
  for (const rel of SAFE_TO_TRIM) {
    const p = path.join(profileDir, rel);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  }
}

async function main() {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ken-local-login-'));
  const chromePath = process.env.CHROME_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const hasChromePath = !!chromePath && fs.existsSync(chromePath);

  console.log(`\n  Opening a real Chrome window for ${platform} login (on this machine, full speed)...`);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: hasChromePath ? undefined : 'chrome',
    executablePath: hasChromePath ? chromePath : undefined,
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  console.log('  Log in normally in the window that just opened.');
  await waitForEnter('  Press Enter here once you are fully logged in (on the real home/feed page) → ');

  await context.close();
  console.log('  Browser closed. Trimming disposable cache before upload...');
  trimCache(profileDir);

  console.log('  Packaging session...');
  const archivePath = path.join(os.tmpdir(), `ken-local-login-${Date.now()}.tar.gz`);
  await tar.create({ gzip: true, file: archivePath, cwd: profileDir }, ['.']);
  const sizeKB = Math.round(fs.statSync(archivePath).size / 1024);
  console.log(`  Archive ready (${sizeKB}KB). Uploading...`);

  const body = fs.readFileSync(archivePath);
  const uploadUrl = `${server.replace(/\/$/, '')}/api/agent/${agent}/local-login/upload/${uploadToken}`;

  let json: any;
  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/gzip' },
      body,
    });
    json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`\n  ❌ Upload failed (HTTP ${res.status}): ${json?.error || 'unknown error'}`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(archivePath, { force: true });
    fs.rmSync(profileDir, { recursive: true, force: true });
  }

  if (json.ok) {
    console.log(`\n  ✅ Uploaded successfully.`);
    console.log(`  Session ready: ${json.ready ? '✅ YES — account is live' : '⚠️  not detected yet — you may need to redo the login'}`);
  } else {
    console.error(`\n  ❌ Upload rejected: ${json.error || 'unknown error'}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
