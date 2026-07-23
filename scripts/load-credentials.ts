/**
 * load-credentials.ts — load account logins from the Credentials Google Sheet
 * into the local .accounts/*.json registry, so the login portal can auto-fill
 * them (fleet nickname "<agent> <index>").
 *
 * Sheet: URL read from .accounts/Credentials.txt. One tab per platform.
 * Auth: same service account as sync-sessions (.accounts/google-service-account.json
 *       or GOOGLE_SERVICE_ACCOUNT_JSON). The sheet must be shared with it.
 *
 * Usage (run in the run folder, e.g. on the VPS):
 *   npx tsx scripts/load-credentials.ts --platform x            # load X tab
 *   npx tsx scripts/load-credentials.ts --platform x --dry-run  # preview only
 *
 * Re-runnable: upserts by nickname, so editing a row and re-running updates it.
 * Writes "loaded" back to the sheet's Status column for each row it took.
 */

import fs from 'fs';
import { google } from 'googleapis';

// ── Per-platform config: which tab, which registry file, how to build an entry.
// Add FB/LI/etc. here (same shape) when their tabs exist.
type Row = Record<string, string>;
interface PlatformCfg {
  tab: string;
  registryFile: string;
  sessionSub: string; // .sessions-<agent>/<sessionSub>-<index>
  build: (agent: string, index: string, r: Row) => Record<string, unknown>;
}
const PLATFORMS: Record<string, PlatformCfg> = {
  x: {
    tab: 'X',
    registryFile: '.accounts/accounts.json',
    sessionSub: 'x',
    build: (agent, index, r) => {
      const nickname = `${agent.toLowerCase()} ${index}`;
      const handle = (r['Handle'] || '').trim().replace(/^@/, '');
      const username = (r['Login Username'] || '').trim() || handle;
      return {
        nickname,
        handle,
        username,
        password: (r['Password'] || '').trim(),
        sessionDir: `.sessions-${agent.toLowerCase()}/x-${index}`,
        active: true,
      };
    },
  },
  facebook: {
    tab: 'Facebook',
    registryFile: '.accounts/facebook-accounts.json',
    sessionSub: 'facebook',
    build: (agent, index, r) => ({
      nickname: `${agent.toLowerCase()} ${index}`,
      email: (r['Email'] || '').trim(),
      password: (r['Password'] || '').trim(),
      sessionDir: `.sessions-${agent.toLowerCase()}/facebook-${index}`,
      active: true,
    }),
  },
};

function sheetId(): string {
  const txt = fs.readFileSync('.accounts/Credentials.txt', 'utf8');
  const m = txt.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('No spreadsheet link found in .accounts/Credentials.txt');
  return m[1];
}

function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? process.env.GOOGLE_SERVICE_ACCOUNT_JSON.replace(/^﻿/, '')
    : fs.readFileSync('.accounts/google-service-account.json', 'utf8');
  return JSON.parse(raw);
}

// A row is a real account only if it has agent+index+password and isn't the example.
function isRealRow(r: Row): boolean {
  const pw = (r['Password'] || '').trim();
  if (!r['Agent'] || !r['Index'] || !pw) return false;
  if (/^PUT-REAL/i.test(pw) || pw === '(leave blank)') return false;
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const platform = (args[args.indexOf('--platform') + 1] || 'x').toLowerCase();
  const dryRun = args.includes('--dry-run');
  const cfg = PLATFORMS[platform];
  if (!cfg) throw new Error(`Unsupported platform "${platform}". Known: ${Object.keys(PLATFORMS).join(', ')}`);

  const id = sheetId();
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${cfg.tab}!A1:Z1000` });
  const values = resp.data.values || [];
  if (values.length < 2) { console.log(`Tab "${cfg.tab}" has no data rows yet.`); return; }
  const header = values[0].map((h) => String(h).trim());
  const rows: Array<{ r: Row; rowNum: number }> = [];
  for (let i = 1; i < values.length; i++) {
    const r: Row = {};
    header.forEach((h, c) => (r[h] = values[i][c] != null ? String(values[i][c]) : ''));
    rows.push({ r, rowNum: i + 1 }); // 1-based sheet row
  }

  // Load existing registry, upsert by nickname.
  const file = cfg.registryFile;
  let list: any[] = [];
  if (fs.existsSync(file)) { try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; } }
  if (!Array.isArray(list)) list = [];

  let loaded = 0, skipped = 0;
  const statusUpdates: Array<{ range: string; value: string }> = [];
  for (const { r, rowNum } of rows) {
    if (!isRealRow(r)) { skipped++; continue; }
    const entry = cfg.build(r['Agent'], String(r['Index']).trim(), r);
    const nick = String(entry.nickname).toLowerCase();
    const idx = list.findIndex((e) => String(e?.nickname || '').toLowerCase() === nick);
    if (idx >= 0) list[idx] = { ...list[idx], ...entry };
    else list.push(entry);
    loaded++;
    const statusCol = header.indexOf('Status');
    if (statusCol >= 0) statusUpdates.push({ range: `${cfg.tab}!${String.fromCharCode(65 + statusCol)}${rowNum}`, value: 'loaded' });
    console.log(`  ${dryRun ? '[dry] ' : ''}${entry.nickname}  handle=@${entry.handle}  user=${entry.username}  pw=${'*'.repeat(String(entry.password).length)}`);
  }

  if (dryRun) { console.log(`\nDRY RUN — would load ${loaded}, skip ${skipped}. Nothing written.`); return; }

  fs.mkdirSync('.accounts', { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
  for (const u of statusUpdates) {
    await sheets.spreadsheets.values.update({ spreadsheetId: id, range: u.range, valueInputOption: 'RAW', requestBody: { values: [[u.value]] } });
  }
  console.log(`\nLoaded ${loaded} account(s) into ${file}, skipped ${skipped}. Sheet Status column updated.`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
