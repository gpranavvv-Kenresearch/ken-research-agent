import path from 'path';
import fs from 'fs';
import { google } from 'googleapis';
import type { RawRow } from '@/types';
import { SHARED_SHEET_ID } from './userConfig';

// ── Auth ─────────────────────────────────────────────────────────────────────

function getServiceAccount() {
  // On Vercel: read from environment variable (strip BOM if present)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.replace(/^﻿/, '');
    return JSON.parse(raw);
  }
  // Locally: read from .accounts/ file
  const candidates = [
    path.join(process.cwd(), '..', '.accounts', 'google-service-account.json'),
    path.join(process.cwd(), '.accounts', 'google-service-account.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  throw new Error('No service account found. Set GOOGLE_SERVICE_ACCOUNT_JSON env var or add .accounts/google-service-account.json');
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: getServiceAccount(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function fetchRows(tabName: string): Promise<RawRow[]> {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHARED_SHEET_ID,
    range: `'${tabName}'`,
  });

  const values = res.data.values ?? [];
  if (values.length < 2) return [];

  const headers = values[0] as string[];
  const rows: RawRow[] = [];

  for (let i = 1; i < values.length; i++) {
    const row: RawRow = { _dataRow: i, _sheetRow: i + 1 };
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[i][j] ?? '').toString();
    }
    // skip fully empty rows
    if (headers.some((h) => row[h] && String(row[h]).trim())) {
      rows.push(row);
    }
  }

  return rows;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export interface SubmitPayload {
  title: string;
  targetUrl: string;
  name: string;
  format: string;
  platforms: string[];
  description?: string;
  blogTab: string;
}

export async function appendBlogRow(payload: SubmitPayload): Promise<number> {
  const sheets = await getSheetsClient();

  // Fetch current headers from the user's Blog tab
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHARED_SHEET_ID,
    range: `'${payload.blogTab}'!1:1`,
  });
  const headers: string[] = (headerRes.data.values?.[0] ?? []) as string[];

  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const timestamp = ist.toISOString().replace('T', ' ').slice(0, 16);

  const data: Record<string, string> = {
    'targetUrl':        payload.targetUrl,
    'Blog Title':       payload.title,
    'Name':             payload.name,
    'Format':           payload.format,
    'Submitted At':     timestamp,
    'Blog Description': payload.description ?? '',
    'Platforms':        payload.platforms.join(', '),
  };

  const row = headers.length
    ? headers.map((h) => data[h] ?? '')
    : [payload.targetUrl, payload.title, payload.name, payload.format, timestamp, payload.description ?? '', payload.platforms.join(', ')];

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: SHARED_SHEET_ID,
    range: `'${payload.blogTab}'!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  const match = (appendRes.data.updates?.updatedRange ?? '').match(/(\d+)$/);
  return match ? parseInt(match[1]) : -1;
}
