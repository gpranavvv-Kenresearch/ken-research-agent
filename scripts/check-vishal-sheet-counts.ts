import { google } from 'googleapis';
import fs from 'fs';

const SHEET_ID = '1ZTgKCRs6Hcmi4pymYa6pZOerxX5cqT23FS1Z8c-RwJU';

async function getSheets() {
  const raw = fs.readFileSync('.accounts/google-service-account.json', 'utf8');
  const creds = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function countTab(tabName: string) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1:BZ5000`,
  });
  const rows = res.data.values || [];
  if (!rows.length) { console.log(tabName, ': no data'); return; }
  const header = rows[0];
  const nameIdx = header.findIndex((h) => (h || '').toLowerCase().trim() === 'name');
  const statusCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /status/i.test(h || ''));

  console.log(`\n=== ${tabName} ===`);
  console.log('Name column index:', nameIdx, 'Status columns:', statusCols.map(c => c.h));

  const vishalRows = rows.slice(1).filter((r) => (r[nameIdx] || '').toLowerCase().trim() === 'vishal');
  console.log('Total rows with Name=vishal:', vishalRows.length);

  for (const { h, i } of statusCols) {
    const posted = vishalRows.filter((r) => (r[i] || '').toLowerCase().trim() === 'posted').length;
    const failed = vishalRows.filter((r) => /fail|error/i.test(r[i] || '')).length;
    const empty = vishalRows.filter((r) => !r[i] || !r[i].trim()).length;
    console.log(`  ${h}: posted=${posted} failed/error=${failed} empty=${empty}`);
  }
}

await countTab('Vishal Social');
await countTab('Vishal Blog');

// print full header for Vishal Blog to see every column
