/**
 * archive-and-reset-sheets.ts — per member, per tab (Blog / Social):
 *   1. duplicate the tab inside the same spreadsheet as "<tab> backup <date>"
 *      (full copy of every cell — the safety net), then
 *   2. blank every data column on the ORIGINAL tab except the identity /
 *      input columns (URL, Name, New Name, Title, Format, Submitted At,
 *      Priority, Image Prompt) — i.e. wipe all generated content, post text,
 *      post URLs, statuses, batches, errors, slots and timestamps, so the
 *      pipeline restarts from a clean queue while the history stays in the
 *      backup tab.
 *
 * Header row is never touched. Rows are never deleted. Idempotent: an
 * existing backup tab of the same name is left alone (no second copy).
 *
 * Dry run by default — prints what WOULD be kept/cleared. Nothing is written
 * until --apply.
 *
 * Usage (from the app dir, where .accounts/google-service-account.json lives):
 *   node --import=tsx scripts/archive-and-reset-sheets.ts                       # dry run, all agents, both tabs
 *   node --import=tsx scripts/archive-and-reset-sheets.ts --agents vansh,sanya --tabs blog
 *   node --import=tsx scripts/archive-and-reset-sheets.ts --apply                # do it
 */
import fs from 'fs';
import { google } from 'googleapis';

const PERSONAL_SHEET_ID: Record<string, string> = {
  sanya: '1pP_nr0vSfeyoxboaOSIcKI53URHQ6ii4VhvzsIznqCM',
  meenakshi: '1IAI2S1LQJ2opg6zu-Sir7BAC8elHGC9TONLTuhibHKg',
  hritika: '1NjOCYlYPV1W-8FYNoLI7m_lqxx5pr5H9xTWu6OvWmcY',
  vansh: '1N_hPhtCA9qIVBpeftgxqRc0farsjAKTcZWMgbhJZQHM',
  sameeksha: '1MA5duGvHHDe-cnnf4Ibj5-d9mW6JpYcziPkKGbMZZIo',
  vijay: '1EDmz1HA6mPzGu-Q-XDuOJZ3A0k0RgGDwBWkPNqcyS1s',
};

// Columns that survive the reset (case-insensitive, exact header match).
const KEEP = new Set([
  // identity
  'report url', 'download report url', 'target url', 'targeturl', 'url',
  'name', 'new name',
  'blog title', 'title', 'report title', 'main title',
  // submit-form inputs (not generated)
  'format', 'submitted at', 'priority', 'image prompt', 'platforms',
]);

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const APPLY = process.argv.includes('--apply');
const AGENTS = (arg('--agents') || Object.keys(PERSONAL_SHEET_ID).join(',')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const TABS = (arg('--tabs') || 'blog,social').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) as Array<'blog' | 'social'>;
const DATE = new Date().toISOString().slice(0, 10);
const BACKUP_SUFFIX = arg('--suffix') || ` backup ${DATE}`;

function tabName(agent: string, tab: 'blog' | 'social'): string {
  const cap = agent.charAt(0).toUpperCase() + agent.slice(1).toLowerCase();
  return `${cap} ${tab === 'blog' ? 'Blog' : 'Social'}`;
}

function colLetter(idx0: number): string {
  let n = idx0 + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

async function client() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    : JSON.parse(fs.readFileSync('.accounts/google-service-account.json', 'utf8'));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return google.sheets({ version: 'v4', auth });
}

async function main() {
  const sheets = await client();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — agents: ${AGENTS.join(', ')} — tabs: ${TABS.join(', ')} — backup suffix: "${BACKUP_SUFFIX}"\n`);
  let totalCleared = 0;

  for (const agent of AGENTS) {
    const spreadsheetId = PERSONAL_SHEET_ID[agent];
    if (!spreadsheetId) { console.log(`!! ${agent}: no personal spreadsheet id — skipped`); continue; }
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = meta.data.sheets ?? [];

    for (const tab of TABS) {
      const name = tabName(agent, tab);
      const src = allSheets.find((s) => s.properties?.title === name);
      if (!src?.properties) { console.log(`!! ${agent}/${name}: tab not found — skipped`); continue; }
      const backupName = `${name}${BACKUP_SUFFIX}`;
      const backupExists = allSheets.some((s) => s.properties?.title === backupName);

      const head = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${name}!1:1` });
      const headers = (head.data.values?.[0] ?? []).map((h) => String(h ?? ''));
      const body = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${name}!A:A` });
      const dataRows = Math.max(0, (body.data.values?.length ?? 1) - 1);

      // "Blog Title" is the GENERATED headline on blog tabs (writeRow overwrites
      // it). Keep it only when the tab also has a separate input title column
      // ("Report Title"); otherwise clear it so the generator derives a clean
      // title from the URL instead of feeding the old headline back in.
      const hasReportTitle = headers.some((h) => h.trim().toLowerCase() === 'report title');
      const keep: string[] = [];
      const clear: Array<{ idx: number; header: string }> = [];
      headers.forEach((h, idx) => {
        if (!h.trim()) return;
        const key = h.trim().toLowerCase();
        const keepIt = KEEP.has(key) && !(tab === 'blog' && key === 'blog title' && !hasReportTitle);
        if (keepIt) keep.push(h); else clear.push({ idx, header: h });
      });

      console.log(`== ${agent} / ${name}  (${dataRows} data rows, ${headers.length} columns) ==`);
      console.log(`   backup tab: "${backupName}" ${backupExists ? '(already exists — reused)' : '(will be created)'}`);
      console.log(`   KEEP  (${keep.length}): ${keep.join(' | ')}`);
      console.log(`   CLEAR (${clear.length}): ${clear.map((c) => c.header).join(' | ')}`);

      if (!APPLY) { console.log(''); continue; }

      if (!backupExists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ duplicateSheet: { sourceSheetId: src.properties.sheetId!, insertSheetIndex: (src.properties.index ?? 0) + 1, newSheetName: backupName } }] },
        });
        console.log(`   ✓ backup created: "${backupName}"`);
      }
      // Verify the backup really holds the same number of rows before clearing anything.
      const bk = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${backupName}!A:A` });
      const bkRows = Math.max(0, (bk.data.values?.length ?? 1) - 1);
      if (bkRows < dataRows) throw new Error(`${agent}/${name}: backup has ${bkRows} rows but original has ${dataRows} — refusing to clear`);

      const ranges = clear.map((c) => `${name}!${colLetter(c.idx)}2:${colLetter(c.idx)}`);
      for (let i = 0; i < ranges.length; i += 40) {
        await sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: ranges.slice(i, i + 40) } });
      }
      totalCleared += clear.length;
      console.log(`   ✓ cleared ${clear.length} columns × ${dataRows} rows (backup verified: ${bkRows} rows)\n`);
    }
  }
  console.log(APPLY ? `Done — ${totalCleared} column ranges cleared across ${AGENTS.length} member(s).` : 'Dry run only — nothing written. Re-run with --apply to execute.');
}

main().catch((e) => { console.error('✗', e instanceof Error ? e.message : e); process.exit(1); });
