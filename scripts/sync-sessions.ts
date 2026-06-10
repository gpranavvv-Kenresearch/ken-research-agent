/**
 * sync-sessions.ts — Upload/Download cookie sessions from Google Drive
 *
 * Usage:
 *   npx tsx scripts/sync-sessions.ts upload    (run from your PC after extract-cookies)
 *   npx tsx scripts/sync-sessions.ts download  (run by GitHub Actions before posting)
 */

import { google } from 'googleapis';
import * as tar from 'tar';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ARCHIVE_NAME = 'ken-sessions-cookies.tar.gz';
const SESSIONS_DIR = '.sessions-cookies';
const TMP_ARCHIVE  = path.join(os.tmpdir(), ARCHIVE_NAME);

async function getDrive() {
  let credentials: object;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.replace(/^﻿/, ''));
  } else {
    credentials = JSON.parse(fs.readFileSync('.accounts/google-service-account.json', 'utf8'));
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

async function findFile(drive: any): Promise<string | null> {
  const envId = process.env.SESSIONS_DRIVE_FILE_ID;
  if (envId) return envId;

  const res = await drive.files.list({
    q: `name='${ARCHIVE_NAME}' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  return res.data.files?.[0]?.id ?? null;
}

async function download() {
  const drive = await getDrive();
  const fileId = await findFile(drive);

  if (!fileId) {
    console.log('No sessions archive found in Drive — skipping download.');
    console.log('Run: npm run sessions:upload   (from your PC first)');
    return;
  }

  console.log(`Downloading sessions from Drive (file: ${fileId})...`);

  const dest = fs.createWriteStream(TMP_ARCHIVE);
  const res  = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

  await new Promise<void>((resolve, reject) => {
    (res.data as NodeJS.ReadableStream).on('end', resolve).on('error', reject).pipe(dest);
  });

  console.log(`Downloaded to ${TMP_ARCHIVE}`);
  console.log('Extracting sessions...');
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });

  await tar.extract({ file: TMP_ARCHIVE, cwd: process.cwd() });

  console.log('Sessions restored.');
}

async function upload() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error(`No ${SESSIONS_DIR} directory found. Run: npm run extract-cookies first.`);
    process.exit(1);
  }

  console.log('Creating sessions archive...');

  // Collect all files in SESSIONS_DIR relative to cwd
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(SESSIONS_DIR, f));

  if (files.length === 0) {
    console.error('No .json files found in .sessions-cookies/ — run npm run extract-cookies first.');
    process.exit(1);
  }

  await tar.create({ gzip: true, file: TMP_ARCHIVE, cwd: process.cwd() }, [SESSIONS_DIR]);

  const sizeKB = Math.round(fs.statSync(TMP_ARCHIVE).size / 1024);
  console.log(`Archive created: ${TMP_ARCHIVE} (${sizeKB}KB, ${files.length} cookie files)`);

  const drive  = await getDrive();
  const fileId = await findFile(drive);

  const media = {
    mimeType: 'application/gzip',
    body: fs.createReadStream(TMP_ARCHIVE),
  };

  if (fileId) {
    console.log('Updating sessions in Drive...');
    await drive.files.update({ fileId, media });
    console.log(`Done. File ID: ${fileId}`);
    console.log(`\nGitHub Secret already set: SESSIONS_DRIVE_FILE_ID=${fileId}`);
  } else {
    console.log('Uploading sessions to Drive for the first time...');
    const created = await drive.files.create({
      requestBody: { name: ARCHIVE_NAME },
      media,
      fields: 'id',
    });
    const newId = created.data.id!;
    console.log(`Done. File ID: ${newId}`);
    console.log(`\nADD THIS TO GITHUB SECRETS:`);
    console.log(`  Name:  SESSIONS_DRIVE_FILE_ID`);
    console.log(`  Value: ${newId}`);
  }
}

const cmd = process.argv[2];
if      (cmd === 'download') download().catch(e => { console.error(e); process.exit(1); });
else if (cmd === 'upload')   upload().catch(e => { console.error(e); process.exit(1); });
else    console.log('Usage: npx tsx scripts/sync-sessions.ts [upload|download]');
