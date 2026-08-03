import { google } from 'googleapis';
import fs from 'fs';

const SHEETS: Record<string, string> = {
  sanya: '1pP_nr0vSfeyoxboaOSIcKI53URHQ6ii4VhvzsIznqCM',
  meenakshi: '1IAI2S1LQJ2opg6zu-Sir7BAC8elHGC9TONLTuhibHKg',
  hritika: '1NjOCYlYPV1W-8FYNoLI7m_lqxx5pr5H9xTWu6OvWmcY',
  vansh: '1N_hPhtCA9qIVBpeftgxqRc0farsjAKTcZWMgbhJZQHM',
};

const raw = fs.readFileSync('.accounts/google-service-account.json', 'utf8');
const creds = JSON.parse(raw);
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });

const REQUIRED_SOCIAL = ['targetUrl', 'Name', 'X Status', 'FB Status', 'LinkedIn Status'];
const REQUIRED_BLOG = ['targetUrl', 'Name', 'Blog Title', 'Blog Content'];

for (const [name, id] of Object.entries(SHEETS)) {
  const cap = name[0].toUpperCase() + name.slice(1);
  for (const [tabSuffix, required] of [['Social', REQUIRED_SOCIAL], ['Blog', REQUIRED_BLOG]] as const) {
    const tab = `${cap} ${tabSuffix}`;
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tab}!A1:BZ1` });
      const header = res.data.values?.[0] || [];
      const missing = required.filter((h) => !header.includes(h));
      console.log(`${tab}: ${header.length} cols — ${missing.length ? 'MISSING: ' + missing.join(', ') : 'OK'}`);
    } catch (err: any) {
      console.log(`${tab}: ERROR — ${err.message}`);
    }
  }
}
