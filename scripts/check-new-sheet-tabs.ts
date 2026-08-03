import { google } from 'googleapis';
import fs from 'fs';

const SHEETS = {
  sanya: '1pP_nr0vSfeyoxboaOSIcKI53URHQ6ii4VhvzsIznqCM',
  meenakshi: '1IAI2S1LQJ2opg6zu-Sir7BAC8elHGC9TONLTuhibHKg',
  hritika: '1NjOCYlYPV1W-8FYNoLI7m_lqxx5pr5H9xTWu6OvWmcY',
  vansh: '1N_hPhtCA9qIVBpeftgxqRc0farsjAKTcZWMgbhJZQHM',
};

const raw = fs.readFileSync('.accounts/google-service-account.json', 'utf8');
const creds = JSON.parse(raw);
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });

for (const [name, id] of Object.entries(SHEETS)) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
    const tabNames = (meta.data.sheets || []).map((s) => s.properties?.title);
    console.log(name, ':', JSON.stringify(tabNames));
  } catch (err: any) {
    console.log(name, ': ERROR —', err.message);
  }
}
