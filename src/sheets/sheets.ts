/**
 * sheets.ts — Google Sheets Integration (Unified Single Tab)
 * All platforms (X, Facebook, LinkedIn) in one "insta" tab.
 *
 * Auth: Google Service Account JSON
 * Place your service account JSON at: .accounts/google-service-account.json
 * OR set GOOGLE_SERVICE_ACCOUNT_JSON env var with the JSON string
 */

import { google } from 'googleapis';
import fsSync from 'fs';
import 'dotenv/config';
import { listAgentStatus } from '../login-portal/sessionResolver.js';

// ──── History-safe helpers ──────────────────────────────────────────────────

/** Appends newVal to existing cell with ' | ' separator. Skips if newVal empty or duplicate. */
function appendValue(existing: string | undefined, newVal: string): string {
  if (!newVal) return existing ?? '';
  const trimmed = (existing ?? '').trim();
  if (!trimmed) return newVal;
  const parts = trimmed.split(' | ');
  if (parts[parts.length - 1].trim() === newVal.trim()) return trimmed;
  return `${trimmed} | ${newVal}`;
}

/** Extracts most-recent date from a possibly-appended value like "2025-01-15 | 2025-01-16". */
function latestDate(value: string): string {
  const parts = value.split(' | ');
  return (parts[parts.length - 1] ?? '').split('T')[0].trim();
}

// A posting session (11:00/23:00 cron) can run past midnight IST — a lap
// started 23:00 on day D can still be posting after 00:00 on day D+1. Pin the
// calendar date to the session's START day for the whole session, so every
// post it makes stamps as day D, never rolling over to D+1 mid-session. Set by
// scheduler-new.ts's startDailyLoop() at session start, cleared at session end.
let pinnedSessionDate: string | null = null;
export function pinSessionDate(date: string | null): void {
  pinnedSessionDate = date;
}

/**
 * Full IST timestamp "YYYY-MM-DD HH:MM:SS IST" for lastPosted columns.
 * Second-resolution → every post gets a distinct stamp, so appending never
 * collapses two same-day posts into one (the old date-only value did).
 */
function nowStamp(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const stamp = ist.toISOString().replace('T', ' ').slice(0, 19);
  const timePart = stamp.slice(11); // "HH:MM:SS" — real time-of-day, always
  const datePart = pinnedSessionDate || stamp.slice(0, 10);
  return `${datePart} ${timePart} IST`;
}

// Sheet configuration for different platform types
const COMBINED_SHEET_ID = '1ZTgKCRs6Hcmi4pymYa6pZOerxX5cqT23FS1Z8c-RwJU'; // X, FB, LI — per-person tabs: "{Name} Social"

// A few workers have their own personal spreadsheet instead of a tab on the
// combined one — same "{Name} Social"/"{Name} Blog" tab-naming convention,
// just a different spreadsheetId. Everyone not listed here stays on the
// combined sheet.
const PERSONAL_SHEET_ID: Record<string, string> = {
  sanya: '1pP_nr0vSfeyoxboaOSIcKI53URHQ6ii4VhvzsIznqCM',
  meenakshi: '1IAI2S1LQJ2opg6zu-Sir7BAC8elHGC9TONLTuhibHKg',
  hritika: '1NjOCYlYPV1W-8FYNoLI7m_lqxx5pr5H9xTWu6OvWmcY',
  vansh: '1N_hPhtCA9qIVBpeftgxqRc0farsjAKTcZWMgbhJZQHM',
  sameeksha: '1MA5duGvHHDe-cnnf4Ibj5-d9mW6JpYcziPkKGbMZZIo',
};
const RESOLVED_SHEET_ID = PERSONAL_SHEET_ID[(process.env.WORKER_NAME || '').toLowerCase()] || COMBINED_SHEET_ID;

const SOCIAL_SHEET_ID = RESOLVED_SHEET_ID;
const SOCIAL_SHEET_NAME = process.env.WORKER_NAME
  ? `${process.env.WORKER_NAME.charAt(0).toUpperCase()}${process.env.WORKER_NAME.slice(1).toLowerCase()} Social`
  : 'Social Media';

const BLOG_SHEET_ID = RESOLVED_SHEET_ID;
const BLOG_SHEET_NAME = process.env.WORKER_NAME
  ? `${process.env.WORKER_NAME.charAt(0).toUpperCase()}${process.env.WORKER_NAME.slice(1).toLowerCase()} Blog`
  : 'Blogs';

// Helper to get sheet config based on platform
function getSheetConfig(platform?: 'social' | 'blog'): { id: string; name: string } {
  if (platform === 'blog') {
    return { id: BLOG_SHEET_ID, name: BLOG_SHEET_NAME };
  }
  return { id: SOCIAL_SHEET_ID, name: SOCIAL_SHEET_NAME }; // default to social
}

// Backwards-compatible default (for functions that don't specify)
const SHEET_ID   = SOCIAL_SHEET_ID;
const SHEET_NAME = SOCIAL_SHEET_NAME;

export type SheetType = 'social' | 'blog';

export interface SheetRow {
  rowIndex: number;         // 1-based row index in sheet (for updates)
  sheetType?: SheetType;
  title: string;
  seedKeyword?: string;     // keyword for hashtags/SEO (e.g., "logistics", "robotics")
  descriptionTitle?: string; // alternative/meta description title for blogs
  description?: string;      // SEO description / article description
  blogSeoTitle?: string;    // "Blog SEO Title" column
  blogSeoDescription?: string; // "Blog SEO Description" column
  blogCaption?: string;     // "Blog Caption" column
  targetUrl: string;
  marketValue: string;      // fetched from Tavily at post time (not read from sheet)
  cagr?: string;            // fetched from report page (not read from sheet)
  batch: number;
  date: string;
  name: string;             // account nickname/handle to post from
  newName?: string;         // platform-specific override (e.g. Medium uses "New Name" column)
  priority?: string;        // manual priority hint (e.g. 'high', 'low')
  lastPostedX?: string;     // last X post date
  lastPostedFb?: string;    // last FB post date
  lastPostedLi?: string;    // last LI post date
  lastPostedMedium?: string;    // last Medium post date
  lastPostedLinkmate?: string;  // last Linkmate post date
  // SEO analysis columns (written by seoAgent before posting)
  seoIndexed?: string;      // 'yes' | 'no'
  seoPage?: string;         // exact Google position e.g. '3', '55', '100+', 'N/A'
  seoKeywords?: string;     // comma-separated trending keywords
  seoRanking?: string;      // P1/P2/P3 priority based on ranking
  lastSerpCheckDate?: string; // When SERP was last checked (YYYY-MM-DD)
  priorityAssignedDate?: string; // When priority was assigned (YYYY-MM-DD)
  platforms?: string;       // 'x' | 'x,facebook' | 'x,facebook,linkedin' etc.
  // Unified content column
  blogContent?: string;     // HTML content for Medium, Linkmate, Google Sites
  // X columns
  xThread?: string;         // if non-empty → post as thread instead of single tweet
  xPost?: string;
  xPostUrl?: string;
  xStatus?: string;
  xError?: string;
  // Facebook columns
  fbPost?: string;
  fbPostUrl?: string;
  fbStatus?: string;
  fbError?: string;
  // LinkedIn columns
  linkedinPost?: string;
  linkedinPostUrl?: string;
  linkedinStatus?: string;
  linkedinError?: string;
  // Result columns
  messageStatus?: string;
  sanityIssues?: string;
  seoScore?: string;
  // Batch tracking columns (written after each post)
  xBatch?: string;        // "Batch 1" ... "Batch 13"
  fbBatch?: string;       // "Batch 1" ... "Batch 5"
  liBatch?: string;       // "Batch 1" ... "Batch 3"
  // Shared blog-posting slots — every blog platform posts through these same
  // 2 slots per row (max 2 platforms/row) instead of its own dedicated
  // columns, so a row's content promotes 2 distinct platforms, not all of
  // them. See claimNextBlogSlot/saveBlogSlotResult.
  blogPlatform1?: string;
  blogUrl1?: string;
  blogPlatform2?: string;
  blogUrl2?: string;
  blogStatus?: string;   // "P1:<state>|P2:<state>"
  blogError?: string;    // "P1:<msg>|P2:<msg>"
  blogBatch?: string;
  lastPostedBlog?: string;
  /** Runtime-only: which slot claimNextBlogSlot just claimed on this row (not a sheet column). */
  blogSlot?: 1 | 2;
}

// Backwards-compatible alias used by facebookPostingAgent and linkedinPostingAgent
export type SocialSheetRow = SheetRow;

// ──── Retry wrapper for quota errors ─────────────────────────────────────
// Retries on "Quota exceeded" / "Resource has been exhausted" with exponential backoff.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withRetry<T = any>(fn: () => Promise<T>, label = 'Sheets'): Promise<T> {
  const MAX_RETRIES = 5;
  let delay = 5000;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      const isQuota =
        msg.includes('Quota exceeded') ||
        msg.includes('Resource has been exhausted') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('rateLimitExceeded') ||
        msg.includes('userRateLimitExceeded');
      if (isQuota && attempt < MAX_RETRIES) {
        const jitter = Math.random() * 1000;
        const wait = delay + jitter;
        console.warn(`   ⚠️  ${label} quota — waiting ${Math.round(wait / 1000)}s then retrying (${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, wait));
        delay = Math.min(delay * 2, 60_000);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`${label}: max retries exceeded`);
}

// ──── Auth ──────────────────────────────────────────────────────────────

async function getSheetsClient() {
  let credentials: object;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    const fs = (await import('fs')).default;
    const raw = fs.readFileSync('.accounts/google-service-account.json', 'utf8');
    credentials = JSON.parse(raw);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// ──── Column map (0-indexed, header-row-driven) ──────────────────────────

interface ColMap {
  [key: string]: number;
}

async function getColumnMap(sheets: any, sheetId: string = SHEET_ID, sheetName: string = SHEET_NAME): Promise<ColMap> {
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!1:1`,
  }), 'getColumnMap');
  const headers: string[] = res.data.values?.[0] ?? [];
  const map: ColMap = {};
  headers.forEach((h, i) => {
    const trimmed = h.trim();
    map[trimmed] = i;
    map[trimmed.toLowerCase()] = i;
  });
  return map;
}

// ──── Helper: pick first defined column index from multiple name variants ────

function col(colMap: ColMap, ...names: string[]): number | undefined {
  for (const n of names) {
    if (colMap[n] !== undefined) return colMap[n];
    if (colMap[n.toLowerCase()] !== undefined) return colMap[n.toLowerCase()];
  }
  return undefined;
}

// ──── Read rows for a batch (picks rows where column M is empty) ──────────

export async function getTodaysBatchRows(batch: number): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getTodaysBatchRows');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowBatch = Number(row[col(colMap, 'batch') ?? -1] ?? -1);

    if (rowBatch !== batch) continue;

    // Skip rows that already have an X Status (already posted/attempted)
    const xStatusVal = row[col(colMap, 'X Status', 'x status') ?? -1] ?? '';
    if (xStatusVal.trim()) continue;

    results.push(mapRow(row, colMap, i + 1));
  }

  if (results.length === 0) {
    const origHeaders = Object.keys(colMap).filter(k => k === k.trim() && k !== k.toLowerCase());
    console.log(`   ⚠️  Sheet headers found: ${origHeaders.join(', ')}`);
  }
  console.log(`   📄 Found ${results.length} rows for batch ${batch}`);
  return results;
}

// ──── Map raw sheet row to SheetRow interface ───────────────────────────

function mapRow(row: string[], colMap: ColMap, rowIndex: number, sheetType: SheetType = 'social'): SheetRow {
  const g = (colMap: ColMap, ...names: string[]) => {
    const idx = col(colMap, ...names);
    return idx !== undefined ? (row[idx] ?? '') : '';
  };

  return {
    rowIndex,
    sheetType,
    title:            g(colMap, 'Blog Title', 'blog title', 'Title', 'title', 'Main Title'),
    seedKeyword:      g(colMap, 'Seed Keyword', 'seed keyword', 'seedKeyword'),
    descriptionTitle: g(colMap, 'Blog SEO Title', 'blog seo title', 'Title', 'title', 'Main Title'),
    description:      g(colMap, 'Blog Description', 'blog description', 'Blog SEO Description', 'blog seo description', 'Description', 'description'),
    blogSeoTitle:     g(colMap, 'Blog SEO Title', 'blog seo title'),
    blogSeoDescription: g(colMap, 'Blog SEO Description', 'blog seo description'),
    blogCaption:      g(colMap, 'Blog Caption', 'blog caption'),
    targetUrl:        g(colMap, 'targetUrl', 'targeturl', 'Download Report URL', 'Report URL', 'Target URL', 'URL', 'url'),
    marketValue:     g(colMap, 'market_value', 'marketValue', 'market value'),
    cagr:            g(colMap, 'cagr') || undefined,
    batch:           Number(g(colMap, 'Batch', 'batch', 'S.No') || -1),
    date:            g(colMap, 'Date to Be Published', 'date to be published', 'date'),
    // A blank Name cell defaults to WORKER_NAME — every row in a "{Name} Social"/
    // "{Name} Blog" tab belongs to that worker even if the cell itself was never filled in.
    name:            g(colMap, 'Name', 'name') || (process.env.WORKER_NAME || ''),
    newName:         g(colMap, 'New Name', 'new name', 'newName'),
    priority:        g(colMap, 'priority', 'seoRanking', 'seoranking'),
    lastPostedX:     g(colMap, 'lastPostedX', 'lastpostedx'),
    lastPostedFb:    g(colMap, 'lastPostedFb', 'lastpostedfb'),
    lastPostedLi:    g(colMap, 'lastPostedLi', 'lastpostedli'),
    // SEO columns
    seoIndexed:      g(colMap, 'seoIndexed', 'seoindexed'),
    seoPage:         g(colMap, 'seoPage', 'seopage'),
    seoKeywords:     g(colMap, 'seoKeywords', 'seokeywords'),
    seoRanking:      g(colMap, 'seoRanking', 'seoranking', 'priority'),
    lastSerpCheckDate: g(colMap, 'lastSerpCheckDate', 'last serp check date'),
    priorityAssignedDate: g(colMap, 'priorityAssignedDate', 'priority assigned date'),
    platforms:       g(colMap, 'Submitted at', 'submitted at', 'Platforms', 'platforms'),
    // Unified content column — "Blog Content" (col 4) takes priority over generic "Content" (col 14)
    blogContent:     g(colMap, 'Blog Content', 'blog content', 'Blog Content for all', 'blog content for all', 'blogcontent', 'Content', 'content'),
    // X columns
    xThread:         g(colMap, 'X Thread', 'x thread', 'xThread', 'Thread'),
    xPost:           g(colMap, 'X Post', 'x post'),
    xPostUrl:        g(colMap, 'X Post URL', 'x post url'),
    xStatus:         g(colMap, 'X Status', 'x status'),
    xError:          g(colMap, 'X Error', 'x error'),
    // Facebook columns
    fbPost:          g(colMap, 'FB Post', 'fb post'),
    fbPostUrl:       g(colMap, 'FB Post URL', 'fb post url'),
    fbStatus:        g(colMap, 'FB Status', 'fb status'),
    fbError:         g(colMap, 'FB Error', 'fb error'),
    // LinkedIn columns
    linkedinPost:    g(colMap, 'LinkedIn Post', 'linkedin post'),
    linkedinPostUrl: g(colMap, 'LinkedIn Post URL', 'linkedin post url'),
    linkedinStatus:  g(colMap, 'LinkedIn Status', 'linkedin status'),
    linkedinError:   g(colMap, 'LinkedIn Error', 'linkedin error'),
    // Shared blog-posting slots (max 2 platforms/row — see claimNextBlogSlot)
    blogPlatform1:  g(colMap, 'Blog Platform 1', 'blog platform 1'),
    blogUrl1:       g(colMap, 'Blog URL 1', 'blog url 1'),
    blogPlatform2:  g(colMap, 'Blog Platform 2', 'blog platform 2'),
    blogUrl2:       g(colMap, 'Blog URL 2', 'blog url 2'),
    blogStatus:     g(colMap, 'Blog Status', 'blog status'),
    blogError:      g(colMap, 'Blog Error', 'blog error'),
    blogBatch:      g(colMap, 'Blog Batch', 'blog batch'),
    lastPostedBlog: g(colMap, 'Last Posted Blog', 'lastPostedBlog', 'lastpostedblog'),
    // Result columns
    messageStatus:   g(colMap, 'Message Status', 'message status'),
    sanityIssues:    g(colMap, 'Sanity Issues', 'sanity issues'),
    seoScore:        g(colMap, 'SEO Score', 'seo score'),
  };
}

// ──── Write generated tweet back to sheet ───────────────────────────────

export async function saveGeneratedTweet(row: SheetRow, xPost: string): Promise<void> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const colIdx = col(colMap, 'X Post', 'x post');
  if (colIdx === undefined) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!${colToLetter(colIdx)}${row.rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[xPost]] },
  });
}

// ──── Write X posting result back to sheet ──────────────────────────────

export async function savePostingResult(
  row: { rowIndex: number },
  result: {
    xPostUrl: string;
    xStatus: string;
    xError?: string;
    xPost?: string;
    seoScore?: number;
    sanityIssues?: string[];
    messageStatus?: string;
    xBatch?: string;
  }
): Promise<void> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const today = nowStamp();
  const existing = await getRowByIndex(row.rowIndex);
  const newUrl = appendValue(existing?.xPostUrl, result.xPostUrl);
  const newLastPosted = result.xStatus?.toLowerCase() === 'posted'
    ? appendValue(existing?.lastPostedX, today)
    : (existing?.lastPostedX ?? '');

  const data = buildUpdates(colMap, row.rowIndex, [
    { names: ['X Post',          'x post'],               value: result.xPost ?? '' },
    { names: ['X Post URL',      'x post url'],            value: newUrl },
    { names: ['X Status',        'x status'],              value: result.xStatus },
    { names: ['X Error',         'x error'],               value: result.xError ?? '' },
    { names: ['SEO Score',       'seo score'],             value: result.seoScore != null ? String(result.seoScore) : '' },
    { names: ['Sanity Issues',   'sanity issues'],         value: result.sanityIssues?.join(' | ') ?? '' },
    { names: ['Message Status',  'message status'],        value: result.messageStatus ?? '' },
    { names: ['xBatch',          'x batch',   'X Batch'], value: result.xBatch ?? '' },
    { names: ['lastPostedX',     'lastpostedx'],           value: newLastPosted },
  ]);

  await batchWrite(sheets, data);
  console.log(`   📝 Sheet updated for row ${row.rowIndex}: ${result.xStatus}`);
}

// ──── Write SEO analysis data to sheet ──────────────────────────────────

export async function saveUnifiedSeoData(
  row: { rowIndex: number; sheetType?: SheetType },
  seoData: { indexStatus: string; rankPage: number; rankPosition?: number; keywords: string[]; platforms: string[]; priority?: string }
): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetConfig = getSheetConfig(row.sheetType);
  const colMap = await getColumnMap(sheets, sheetConfig.id, sheetConfig.name);

  const posStr = positionToString(seoData.rankPosition ?? -1, seoData.indexStatus);
  const indexed = (seoData.rankPosition ?? -1) >= 0 ? 'yes' : 'no';

  const data = buildUpdates(colMap, row.rowIndex, [
    { names: ['seoIndexed', 'seoindexed'],   value: indexed },
    { names: ['seoPage',    'seopage'],       value: posStr },
    { names: ['seoKeywords','seokeywords'],   value: seoData.keywords.join(', ') },
    { names: ['platforms'],                   value: seoData.platforms.join(',') },
    { names: ['priority', 'seoRanking', 'seoranking'], value: seoData.priority ?? '' },
  ], sheetConfig.name);

  await batchWrite(sheets, data, sheetConfig.id);
  console.log(`   📝 SEO data saved for row ${row.rowIndex}: ${seoData.priority ?? 'N/A'} | ${posStr}`);
}

// ──── Bulk-write SEO data for many rows in a single API call ──────────────
// Avoids quota exhaustion by reusing one client + colMap and sending all
// updates in chunks of 500 ranges (Sheets API limit per batchUpdate).

export async function saveBulkSeoData(
  entries: Array<{
    rowIndex: number;
    seoData: { indexStatus: string; rankPage: number; rankPosition?: number; keywords: string[]; platforms: string[]; priority?: string };
  }>,
  sheetType: SheetType = 'social'
): Promise<void> {
  if (entries.length === 0) return;

  const sheets = await getSheetsClient();
  const sheetConfig = getSheetConfig(sheetType);
  const colMap = await getColumnMap(sheets, sheetConfig.id, sheetConfig.name);

  const allUpdates: { range: string; values: string[][] }[] = [];

  for (const { rowIndex, seoData } of entries) {
    const posStr = positionToString(seoData.rankPosition ?? -1, seoData.indexStatus);
    const indexed = (seoData.rankPosition ?? -1) >= 0 ? 'yes' : 'no';
    const updates = buildUpdates(colMap, rowIndex, [
      { names: ['seoIndexed', 'seoindexed'],   value: indexed },
      { names: ['seoPage',    'seopage'],       value: posStr },
      { names: ['seoKeywords','seokeywords'],   value: seoData.keywords.join(', ') },
      { names: ['platforms'],                   value: seoData.platforms.join(',') },
      { names: ['priority', 'seoRanking', 'seoranking'], value: seoData.priority ?? '' },
    ], sheetConfig.name);
    allUpdates.push(...updates);
  }

  const CHUNK = 500;
  for (let i = 0; i < allUpdates.length; i += CHUNK) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetConfig.id,
      requestBody: { valueInputOption: 'RAW', data: allUpdates.slice(i, i + CHUNK) },
    });
  }
}

// ──── Write Facebook posting result to unified sheet ──────────────────────

export async function saveUnifiedFbResult(
  row: SheetRow,
  result: { post: string; postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const today = nowStamp();

  // Re-read live cell values so we always append to current sheet data,
  // not the stale row object fetched at batch-start.
  let liveFbPostUrl = row.fbPostUrl ?? '';
  let liveLastPostedFb = row.lastPostedFb ?? '';
  try {
    const liveRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!${row.rowIndex}:${row.rowIndex}`,
    });
    const liveRow: string[] = liveRes.data.values?.[0] ?? [];
    const urlIdx = col(colMap, 'FB Post URL', 'fb post url');
    const dateIdx = col(colMap, 'lastPostedFb', 'lastpostedfb');
    if (urlIdx !== undefined) liveFbPostUrl = (liveRow[urlIdx] ?? '').trim();
    if (dateIdx !== undefined) liveLastPostedFb = (liveRow[dateIdx] ?? '').trim();
  } catch { /* non-critical — fall back to row object */ }

  console.log(`   [FB save] row ${row.rowIndex} | existing URL: "${liveFbPostUrl}" | new URL: "${result.postUrl}"`);
  const newUrl = appendValue(liveFbPostUrl, result.postUrl);
  const newLastPosted = result.status?.toLowerCase() === 'posted'
    ? appendValue(liveLastPostedFb, today)
    : liveLastPostedFb;
  console.log(`   [FB save] → writing URL: "${newUrl}" | date: "${newLastPosted}"`);

  const data = buildUpdates(colMap, row.rowIndex, [
    { names: ['FB Post',     'fb post'],                        value: result.post    },
    { names: ['FB Post URL', 'fb post url'],                    value: newUrl },
    { names: ['FB Status',   'fb status'],                      value: result.status  },
    { names: ['FB Error',    'fb error'],                       value: result.error ?? '' },
    { names: ['fbBatch',     'fb batch',    'FB Batch'],        value: result.batch ?? '' },
    { names: ['lastPostedFb','lastpostedfb'],                   value: newLastPosted },
  ]);

  await batchWrite(sheets, data);
  console.log(`   📝 FB updated for row ${row.rowIndex}: ${result.status}`);
}

// ──── Write LinkedIn posting result to unified sheet ──────────────────────

export async function saveUnifiedLinkedInResult(
  row: SheetRow,
  result: { post: string; postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const today = nowStamp();

  let liveLinkedinPostUrl = row.linkedinPostUrl ?? '';
  let liveLastPostedLi = row.lastPostedLi ?? '';
  try {
    const liveRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!${row.rowIndex}:${row.rowIndex}`,
    });
    const liveRow: string[] = liveRes.data.values?.[0] ?? [];
    const urlIdx = col(colMap, 'LinkedIn Post URL', 'linkedin post url');
    const dateIdx = col(colMap, 'lastPostedLi', 'lastpostedli');
    if (urlIdx !== undefined) liveLinkedinPostUrl = (liveRow[urlIdx] ?? '').trim();
    if (dateIdx !== undefined) liveLastPostedLi = (liveRow[dateIdx] ?? '').trim();
  } catch { /* non-critical — fall back to row object */ }

  console.log(`   [LI save] row ${row.rowIndex} | existing URL: "${liveLinkedinPostUrl}" | new URL: "${result.postUrl}"`);
  const newUrl = appendValue(liveLinkedinPostUrl, result.postUrl);
  const newLastPosted = result.status?.toLowerCase() === 'posted'
    ? appendValue(liveLastPostedLi, today)
    : liveLastPostedLi;
  console.log(`   [LI save] → writing URL: "${newUrl}" | date: "${newLastPosted}"`);

  const data = buildUpdates(colMap, row.rowIndex, [
    { names: ['LinkedIn Post',     'linkedin post'],                              value: result.post    },
    { names: ['LinkedIn Post URL', 'linkedin post url'],                          value: newUrl },
    { names: ['LinkedIn Status',   'linkedin status'],                            value: result.status  },
    { names: ['LinkedIn Error',    'linkedin error'],                             value: result.error ?? '' },
    { names: ['liBatch',           'li batch',         'LI Batch'],              value: result.batch ?? '' },
    { names: ['lastPostedLi',      'lastpostedli'],                               value: newLastPosted },
  ]);

  await batchWrite(sheets, data);
  console.log(`   📝 LinkedIn updated for row ${row.rowIndex}: ${result.status}`);
}

// ──── Write Medium posting result to unified sheet ────────────────────────

export async function saveUnifiedMediumResult(
  row: SheetRow,
  result: { post: string; postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ──── Write Linkmate posting result to unified sheet ────────────────────

export async function saveUnifiedLinkmateResult(
  row: SheetRow,
  result: { content: string; postUrl: string; status: string; error?: string; batch?: string; lastPosted?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ──── Write Google Sites posting result to unified sheet ────────────────

export async function saveUnifiedGoogleSiteResult(
  row: SheetRow,
  result: { post: string; postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

/**
 * Write a single column's value for one row. Generic escape hatch for one-off
 * data fixes (e.g. backfilling a blank "New Name" column) — most writes should
 * go through a platform-specific save*Result function instead, this is for
 * when there isn't one.
 */
export async function updateSheetField(rowIndex: number, sheetType: 'blog' | 'social', columnNames: string[], value: string): Promise<void> {
  const sheets = await getSheetsClient();
  const config = getSheetConfig(sheetType);
  const colMap = await getColumnMap(sheets, config.id, config.name);
  const updates = buildUpdates(colMap, rowIndex, [{ names: columnNames, value }], config.name);
  await batchWrite(sheets, updates, config.id);
}

/**
 * Fetch a single row by its Google Sheet row number (1-based, row 1 = header).
 * e.g. rowIndex=15 returns the data in sheet row 15.
 */
export async function getSheetRowByIndex(rowIndex: number, sheetType: 'blog' | 'social'): Promise<SheetRow | null> {
  const sheets = await getSheetsClient();
  const config = getSheetConfig(sheetType);
  const colMap = await getColumnMap(sheets, config.id, config.name);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.id,
    range: `${config.name}!A:AZ`,
  }), 'getSheetRowByIndex');

  const rows: string[][] = res.data.values ?? [];
  // rows[0] = header, rows[rowIndex-1] = sheet row rowIndex
  const arrIdx = rowIndex - 1;
  if (arrIdx < 1 || arrIdx >= rows.length) return null;

  return mapRow(rows[arrIdx], colMap, rowIndex, sheetType);
}

// ──── Write Dev.to posting result to unified sheet ──────────────────────

export async function saveUnifiedDevtoResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ──── Write LinkedIn Pulse posting result to unified sheet ──────────────

export async function saveLinkedinPulseResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

export async function saveCalisthenicsResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ──── Shared blog-posting slots (max 2 platforms/row) ────────────────────
// Every blog platform shares these 2 slots per row instead of its own
// dedicated columns, so a row's content promotes 2 distinct platforms, not
// all 15. The per-platform get/save functions below are now thin wrappers
// around these two.

const BLOG_PLATFORM1_NAMES = ['Blog Platform 1', 'blog platform 1'];
const BLOG_URL1_NAMES = ['Blog URL 1', 'blog url 1'];
const BLOG_PLATFORM2_NAMES = ['Blog Platform 2', 'blog platform 2'];
const BLOG_URL2_NAMES = ['Blog URL 2', 'blog url 2'];
const BLOG_STATUS_NAMES = ['Blog Status', 'blog status'];
const BLOG_ERROR_NAMES = ['Blog Error', 'blog error'];
const BLOG_BATCH_NAMES = ['Blog Batch', 'blog batch'];
const BLOG_LASTPOSTED_NAMES = ['Last Posted Blog', 'lastPostedBlog', 'lastpostedblog'];

/** Parses "P1:<state>|P2:<state>" into { 1: state, 2: state }. */
function parseSlotState(raw: string | undefined): Record<1 | 2, string> {
  const out: Record<1 | 2, string> = { 1: '', 2: '' };
  (raw ?? '').split('|').map(s => s.trim()).filter(Boolean).forEach(part => {
    const m = part.match(/^P([12]):(.*)$/);
    if (m) out[Number(m[1]) as 1 | 2] = m[2].trim();
  });
  return out;
}

function formatSlotState(state: Record<1 | 2, string>): string {
  return `P1:${state[1]}|P2:${state[2]}`;
}

/**
 * Claim the next open blog-posting slot for `platformKey` (max 2 platforms
 * per row). Scans rows with generated content in order; skips a row this
 * platform already claimed a slot on; writes the platform name into the
 * first open slot immediately (before posting), so a concurrent claim for a
 * different platform never lands on the same slot. Returns null when every
 * generated row currently has both slots taken (caller just no-ops this run).
 */
export async function claimNextBlogSlot(platformKey: string): Promise<SheetRow | null> {
  const sheets = await getSheetsClient();
  const sheetConfig = getSheetConfig('blog');
  const colMap = await getColumnMap(sheets, sheetConfig.id, sheetConfig.name);
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: sheetConfig.id, range: `${sheetConfig.name}!A:ZZ`,
  }), `claimNextBlogSlot_${platformKey}`);
  const rows: string[][] = res.data.values ?? [];

  const p1Idx = col(colMap, ...BLOG_PLATFORM1_NAMES);
  const p2Idx = col(colMap, ...BLOG_PLATFORM2_NAMES);
  const titleIdx = col(colMap, 'Blog Title', 'blog title', 'Title', 'title', 'Main Title');
  const targetUrlIdx = col(colMap, 'Report URL', 'Download Report URL', 'Target URL', 'target url', 'targetUrl', 'URL', 'url');
  const contentIdx = col(colMap, 'Blog Content', 'blog content', 'Blog Content for all', 'blog content for all', 'blogcontent', 'Content', 'content');

  if (p1Idx === undefined || p2Idx === undefined) {
    console.warn(`   ⚠️ [${platformKey}] "Blog Platform 1"/"Blog Platform 2" columns not found — add them to the sheet first.`);
    return null;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = titleIdx !== undefined ? (row[titleIdx] ?? '').trim() : '';
    const targetUrl = targetUrlIdx !== undefined ? (row[targetUrlIdx] ?? '').trim() : '';
    const content = contentIdx !== undefined ? (row[contentIdx] ?? '').trim() : '';
    if (!title || !targetUrl || !content) continue;

    const p1 = (row[p1Idx] ?? '').trim();
    const p2 = (row[p2Idx] ?? '').trim();
    if (p1 === platformKey || p2 === platformKey) continue; // already claimed on this row

    let slot: 1 | 2 | undefined;
    if (!p1) slot = 1;
    else if (!p2) slot = 2;
    if (!slot) continue; // both slots taken, keep scanning

    const rowIndex = i + 1;
    const claimData = buildUpdates(colMap, rowIndex, [
      { names: slot === 1 ? BLOG_PLATFORM1_NAMES : BLOG_PLATFORM2_NAMES, value: platformKey },
    ], sheetConfig.name);
    await batchWrite(sheets, claimData, sheetConfig.id);

    const mapped = mapRow(row, colMap, rowIndex, 'blog');
    mapped.blogSlot = slot;
    console.log(`   🔗 [${platformKey}] claimed row ${rowIndex} slot ${slot}`);
    return mapped;
  }

  console.log(`   📄 [${platformKey}] No open blog slot found`);
  return null;
}

/** Loops claimNextBlogSlot up to `limit` times, stopping early once no slot is available. */
async function claimNextBlogSlots(platformKey: string, limit: number): Promise<SheetRow[]> {
  const results: SheetRow[] = [];
  for (let i = 0; i < limit; i++) {
    const claimed = await claimNextBlogSlot(platformKey);
    if (!claimed) break;
    results.push(claimed);
  }
  return results;
}

/** Admin/reset helper: rows where `platformKey` currently holds a slot (used by resetMediumPosts-style utilities). */
export async function getRowsClaimedByPlatform(platformKey: string, limit: number = 999): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const sheetConfig = getSheetConfig('blog');
  const colMap = await getColumnMap(sheets, sheetConfig.id, sheetConfig.name);
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: sheetConfig.id, range: `${sheetConfig.name}!A:ZZ`,
  }), `getRowsClaimedByPlatform_${platformKey}`);
  const rows: string[][] = res.data.values ?? [];
  const p1Idx = col(colMap, ...BLOG_PLATFORM1_NAMES);
  const p2Idx = col(colMap, ...BLOG_PLATFORM2_NAMES);
  const results: SheetRow[] = [];
  for (let i = 1; i < rows.length && results.length < limit; i++) {
    const row = rows[i];
    const p1 = p1Idx !== undefined ? (row[p1Idx] ?? '').trim() : '';
    const p2 = p2Idx !== undefined ? (row[p2Idx] ?? '').trim() : '';
    let slot: 1 | 2 | undefined;
    if (p1 === platformKey) slot = 1;
    else if (p2 === platformKey) slot = 2;
    if (!slot) continue;
    const mapped = mapRow(row, colMap, i + 1, 'blog');
    mapped.blogSlot = slot;
    results.push(mapped);
  }
  return results;
}

/**
 * Write the result of posting into the slot `row.blogSlot` (set by
 * claimNextBlogSlot) — live-re-reads Blog Status/Error first so a concurrent
 * write to the other slot on the same row never gets clobbered.
 */
async function saveBlogSlotResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  const slot = row.blogSlot;
  if (!slot) {
    console.warn(`   ⚠️ saveBlogSlotResult: row ${row.rowIndex} has no claimed slot — skipping save`);
    return;
  }
  const sheets = await getSheetsClient();
  const sheetConfig = getSheetConfig('blog');
  const colMap = await getColumnMap(sheets, sheetConfig.id, sheetConfig.name);
  const today = nowStamp();

  let liveStatus = '', liveError = '', liveLastPosted = '';
  try {
    const liveRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetConfig.id,
      range: `${sheetConfig.name}!${row.rowIndex}:${row.rowIndex}`,
    });
    const liveRow: string[] = liveRes.data.values?.[0] ?? [];
    const statusIdx = col(colMap, ...BLOG_STATUS_NAMES);
    const errorIdx = col(colMap, ...BLOG_ERROR_NAMES);
    const lastPostedIdx = col(colMap, ...BLOG_LASTPOSTED_NAMES);
    if (statusIdx !== undefined) liveStatus = (liveRow[statusIdx] ?? '').trim();
    if (errorIdx !== undefined) liveError = (liveRow[errorIdx] ?? '').trim();
    if (lastPostedIdx !== undefined) liveLastPosted = (liveRow[lastPostedIdx] ?? '').trim();
  } catch { /* non-critical */ }

  const statusState = parseSlotState(liveStatus);
  const errorState = parseSlotState(liveError);
  statusState[slot] = result.status;
  errorState[slot] = result.status?.toLowerCase() === 'posted' ? '' : (result.error ?? '');

  const newLastPosted = result.status?.toLowerCase() === 'posted'
    ? appendValue(liveLastPosted, today)
    : liveLastPosted;

  const data = buildUpdates(colMap, row.rowIndex, [
    { names: slot === 1 ? BLOG_URL1_NAMES : BLOG_URL2_NAMES, value: result.postUrl || '' },
    { names: BLOG_STATUS_NAMES, value: formatSlotState(statusState) },
    { names: BLOG_ERROR_NAMES, value: formatSlotState(errorState) },
    { names: BLOG_BATCH_NAMES, value: result.batch ?? '' },
    { names: BLOG_LASTPOSTED_NAMES, value: newLastPosted },
  ], sheetConfig.name);

  await batchWrite(sheets, data, sheetConfig.id);
  console.log(`   📝 [Blog slot ${slot}] updated row ${row.rowIndex}: ${result.status}`);
}

// ──── Save weekly SERP re-check results (Feature 2) ───────────────────────

export async function saveWeeklySerpRecheck(
  row: SheetRow,
  seoResult: {
    seoRanking: number;
    indexStatus: string;
    priority: string;
    keywords: string[];
  },
  contentResult?: {
    tweet: string;
    fbPost: string;
    liPost: string;
    blog: string;
  }
): Promise<void> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);
  const today = nowStamp();

  const indexed = (seoResult.seoRanking ?? -1) >= 0 ? 'yes' : 'no';
  const updates = [
    { names: ['priority'],                                              value: seoResult.priority },
    { names: ['seoIndexed', 'seoindexed'],                             value: indexed },
    { names: ['seoKeywords', 'seokeywords'],                           value: seoResult.keywords.join(', ') },
    // Clear old post URLs so rows are re-picked for re-posting
    { names: ['X Post URL',         'x post url'],                     value: '' },
    { names: ['FB Post URL',        'fb post url'],                    value: '' },
    { names: ['LinkedIn Post URL',  'linkedin post url'],              value: '' },
  ];

  // If content was regenerated, update it
  if (contentResult) {
    updates.push(
      { names: ['X Post', 'x post', 'xPost'],                           value: contentResult.tweet },
      { names: ['FB Post', 'fb post', 'fbPost'],                        value: contentResult.fbPost },
      { names: ['LinkedIn Post', 'linkedin post', 'linkedinPost'],      value: contentResult.liPost },
      { names: ['Message Status'],                                      value: contentResult.blog }
    );
  }

  const data = buildUpdates(colMap, row.rowIndex, updates);
  await batchWrite(sheets, data);
  console.log(`   📝 SERP re-checked for row ${row.rowIndex}: ${seoResult.priority} (${today})`);
}

// ──── Read a single row by 1-based row index ────────────────────────────

export async function getRowByIndex(rowIndex: number): Promise<SheetRow | null> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A${rowIndex}:AH${rowIndex}`,
  }), 'getRowByIndex');

  const rows: string[][] = res.data.values ?? [];
  if (rows.length === 0) return null;
  return mapRow(rows[0], colMap, rowIndex);
}

// ──── Read rows across a date range (for unprocessed detection) ──────────

export async function getAllRowsInDateRange(dates: string[]): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getAllRowsInDateRange');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowDate   = row[col(colMap, 'date') ?? -1]                 ?? '';
    const rowStatus = row[col(colMap, 'X Status', 'x status') ?? -1] ?? '';

    if (!dates.includes(rowDate)) continue;
    if (rowStatus && rowStatus.trim() !== '') continue;

    results.push(mapRow(row, colMap, i + 1));
  }

  console.log(`   📄 Found ${results.length} unprocessed rows for dates: ${dates.join(', ')}`);
  return results;
}

// ──── Read unassigned rows (name/batch/date empty, URL+title present) ────

export interface UnassignedRow {
  rowIndex: number;
  title: string;
  targetUrl: string;
  name: string;
  marketValue?: string;
}

export async function getUnassignedRows(): Promise<UnassignedRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const dataRes = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getUnassignedRows');
  const rows: string[][] = dataRes.data.values ?? [];
  const results: UnassignedRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title     = row[col(colMap, 'Blog Title', 'blog title', 'Title', 'title', 'Main Title') ?? -1]                   ?? '';
    const targetUrl = row[col(colMap, 'Download Report URL', 'Report URL', 'Target URL', 'targetUrl', 'targeturl', 'URL', 'url') ?? -1]  ?? '';
    const seoRanking = row[col(colMap, 'seoRanking', 'priority') ?? -1] ?? '';

    // Must have URL + title
    if (!targetUrl.trim() || !title.trim()) continue;
    // NEW ARCHITECTURE: Skip rows already with priority (P1/P2/P3)
    if (seoRanking.trim()) continue;

    results.push({
      rowIndex: i + 1,
      title,
      targetUrl,
      name: row[col(colMap, 'Name', 'name') ?? -1] ?? '',
      marketValue: row[col(colMap, 'market_value', 'marketValue', 'market value') ?? -1] ?? '',
    });
  }

  console.log(`   📄 Found ${results.length} unassigned rows (no priority yet)`);
  return results;
}

// ──── Get unassigned rows as SheetRow (for batch top-up) ─────────────────

export async function getUnassignedRowsAsSheetRows(limit: number = 15, sheetType: 'social' | 'blog' = 'social'): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const sheetConfig = sheetType === 'blog' ? { id: BLOG_SHEET_ID, name: BLOG_SHEET_NAME } : { id: SOCIAL_SHEET_ID, name: SOCIAL_SHEET_NAME };
  const colMap = await getColumnMap(sheets, sheetConfig.id, sheetConfig.name);

  const dataRes = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: sheetConfig.id,
    range: `${sheetConfig.name}!A:AZ`,
  }), 'getUnassignedRowsAsSheetRows');
  const rows: string[][] = dataRes.data.values ?? [];
  const results: SheetRow[] = [];

  for (let i = 1; i < rows.length && results.length < limit; i++) {
    const row = rows[i];
    const title     = row[col(colMap, 'Blog Title', 'blog title', 'Title', 'title', 'Main Title') ?? -1]                   ?? '';
    const targetUrl = row[col(colMap, 'Download Report URL', 'Report URL', 'Target URL', 'targetUrl', 'targeturl', 'URL', 'url') ?? -1]  ?? '';
    const seoRanking = row[col(colMap, 'seoRanking', 'priority') ?? -1] ?? '';

    // Must have URL + title
    if (!targetUrl.trim() || !title.trim()) continue;
    // Skip rows already with priority (P1/P2/P3)
    if (seoRanking.trim()) continue;

    results.push(mapRow(row, colMap, i + 1, sheetType));
  }

  return results;
}

// ──── Get rows for continuous reposting (priority-based) ──────────────────

export async function getRowsForContinuousXPosting(limit: number = 15): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:AZ`,
  }), 'getRowsForContinuousXPosting');
  const rows: string[][] = res.data.values ?? [];
  return pickNextSequentialBlogRows(rows, colMap, ['X Status', 'x status', 'xStatus'], limit, 'X', 'social');
}

export async function getRowsForContinuousFbPosting(limit: number = 15): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:AZ`,
  }), 'getRowsForContinuousFbPosting');
  const rows: string[][] = res.data.values ?? [];
  return pickNextSequentialBlogRows(rows, colMap, ['FB Status', 'fb status', 'fbStatus'], limit, 'FB', 'social');
}

export async function getRowsForContinuousLiPosting(limit: number = 15): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:AZ`,
  }), 'getRowsForContinuousLiPosting');
  const rows: string[][] = res.data.values ?? [];
  return pickNextSequentialBlogRows(rows, colMap, ['LinkedIn Status', 'linkedin status', 'liStatus'], limit, 'LI', 'social');
}

/**
 * Failed/errored SOCIAL rows for reposting. The social pickers treat any non-empty
 * status (incl. "Failed"/"Error") as done, so failed X/FB/LI rows are never retried
 * by the normal batches (blogs self-retry — their pickers key off a posted URL, not
 * status). This returns those failed rows so the scheduler's gap sweep can repost
 * them. A row is retryable if status is failed/error AND it has no post URL yet.
 */
export async function getFailedSocialRows(platform: 'X' | 'FB' | 'LI', limit: number = 8): Promise<SheetRow[]> {
  const cols = {
    X:  { status: ['X Status', 'x status', 'xStatus'],                 url: ['X Post URL', 'x post url', 'xPostUrl'] },
    FB: { status: ['FB Status', 'fb status', 'fbStatus'],              url: ['FB Post URL', 'fb post url', 'fbPostUrl'] },
    LI: { status: ['LinkedIn Status', 'linkedin status', 'liStatus'],  url: ['LinkedIn Post URL', 'linkedin post url', 'linkedinPostUrl'] },
  }[platform];
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:AZ`,
  }), 'getFailedSocialRows');
  const rows: string[][] = res.data.values ?? [];
  const statusIdx = col(colMap, ...cols.status) ?? -1;
  const urlIdx = col(colMap, ...cols.url) ?? -1;
  if (statusIdx < 0) return [];
  const out: SheetRow[] = [];
  for (let i = 1; i < rows.length && out.length < limit; i++) {
    const row = rows[i];
    const status = (row[statusIdx] ?? '').trim().toLowerCase();
    if (status !== 'failed' && status !== 'error') continue;
    if (urlIdx >= 0 && (row[urlIdx] ?? '').trim()) continue; // has a URL → actually posted, don't repost
    out.push(mapRow(row, colMap, i + 1, 'social'));
  }
  console.log(`   🔁 [retry] ${platform}: found ${out.length} failed rows to repost`);
  return out;
}

// ──── Read leftover rows (assigned but unposted from before today) ────────

export interface LeftoverRow {
  rowIndex: number;
  title: string;
  targetUrl: string;
}

export async function getLeftoverRows(today: string): Promise<LeftoverRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getLeftoverRows');

  const rows: string[][] = res.data.values ?? [];
  const results: LeftoverRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row     = rows[i];
    const title     = row[col(colMap, 'title') ?? -1]                  ?? '';
    const targetUrl = row[col(colMap, 'targetUrl', 'targeturl') ?? -1] ?? '';
    const batch     = row[col(colMap, 'batch') ?? -1]                  ?? '';
    const date      = row[col(colMap, 'date') ?? -1]                   ?? '';
    const name      = row[col(colMap, 'Name', 'name') ?? -1]           ?? '';
    const xStatus   = row[col(colMap, 'X Status', 'x status') ?? -1]  ?? '';

    // Must have url + title
    if (!targetUrl.trim() || !title.trim()) continue;
    // Must have been assigned (has batch + date + name) – skip url-title-only rows
    if (!batch.trim() || !date.trim() || !name.trim()) continue;
    // Date must be before today
    if (date.trim() >= today) continue;
    // Must not have been posted
    if (xStatus.trim().toLowerCase() === 'posted') continue;

    results.push({ rowIndex: i + 1, title, targetUrl });
  }

  console.log(`   📄 Found ${results.length} leftover rows before ${today}`);
  return results;
}

// ──── Append url+title rows to end of sheet (for leftover agent) ──────────

export async function appendRowsToSheet(rows: Array<{ title: string; targetUrl: string }>): Promise<void> {
  if (rows.length === 0) return;
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const titleIdx  = col(colMap, 'title');
  const urlIdx    = col(colMap, 'targetUrl', 'targeturl');
  if (titleIdx === undefined || urlIdx === undefined) {
    console.warn('   ⚠️  Cannot append rows – title or targetUrl column not found');
    return;
  }

  const maxCol = Math.max(titleIdx, urlIdx) + 1;
  const data = rows.map(r => {
    const arr = Array(maxCol).fill('');
    arr[titleIdx] = r.title;
    arr[urlIdx]   = r.targetUrl;
    return arr;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: data },
  });
  console.log(`   📄 Appended ${rows.length} leftover rows to end of sheet`);
}

// ──── Read today's rows for FB/LI batches (filtered by platform eligibility) ──

export async function getFbPendingRowsForBatches(xBatches: number[], today: string): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getFbPendingRows');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row       = rows[i];
    const rowBatch  = Number(row[col(colMap, 'batch') ?? -1] ?? -1);
    const rowDate   = row[col(colMap, 'date') ?? -1]                        ?? '';
    const platforms = row[col(colMap, 'platforms') ?? -1]                   ?? '';
    const fbStatus  = row[col(colMap, 'FB Status', 'fb status') ?? -1]      ?? '';

    if (rowDate !== today) continue;
    if (!xBatches.includes(rowBatch)) continue;
    if (!platforms.includes('facebook')) continue;
    if (fbStatus.trim().toLowerCase() === 'posted') continue;

    results.push(mapRow(row, colMap, i + 1));
  }

  return results;
}

export async function getLiPendingRowsForBatches(xBatches: number[], today: string): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getLiPendingRows');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row           = rows[i];
    const rowBatch      = Number(row[col(colMap, 'batch') ?? -1] ?? -1);
    const rowDate       = row[col(colMap, 'date') ?? -1]                          ?? '';
    const platforms     = row[col(colMap, 'platforms') ?? -1]                     ?? '';
    const liStatus      = row[col(colMap, 'LinkedIn Status', 'linkedin status') ?? -1] ?? '';

    if (rowDate !== today) continue;
    if (!xBatches.includes(rowBatch)) continue;
    if (!platforms.includes('linkedin')) continue;
    if (liStatus.trim().toLowerCase() === 'posted') continue;

    results.push(mapRow(row, colMap, i + 1));
  }

  return results;
}

export const getUnassignedXRows = getUnassignedRows;

// ──── Get all rows with a targetUrl and no X Status (pending posts) ──────

export async function getPendingRows(): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getPendingRows');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row       = rows[i];
    const targetUrl = row[col(colMap, 'targetUrl', 'targeturl') ?? -1] ?? '';
    const name      = row[col(colMap, 'Name', 'name') ?? -1]           ?? '';
    const xStatus   = row[col(colMap, 'X Status', 'x status') ?? -1]  ?? '';

    if (!targetUrl.trim()) continue;
    if (!name.trim()) continue;
    if (xStatus.trim().toLowerCase() === 'posted') continue;

    results.push(mapRow(row, colMap, i + 1));
  }

  console.log(`   📄 Found ${results.length} pending rows`);
  return results;
}

// ──── New: get rows ready for FB/LI batch (seoRanking set, postUrl empty) ──

/**
 * Get rows where X has assigned priority (seoRanking/seoPage is set)
 * but fbPostUrl is still empty. Used by FB batch to pick rows to post.
 */
export async function getRowsReadyForFb(limit: number = 15): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getRowsReadyForFb');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];

  for (let i = 1; i < rows.length && results.length < limit; i++) {
    const row = rows[i];
    const fbPostUrl  = (row[col(colMap, 'FB Post URL', 'fb post url') ?? -1] ?? '').trim();
    const targetUrl  = (row[col(colMap, 'Download Report URL', 'Report URL', 'Target URL', 'target url', 'targetUrl') ?? -1] ?? '').trim();
    const title      = (row[col(colMap, 'title') ?? -1] ?? '').trim();

    // Must have URL + title, and no FB post yet
    if (!targetUrl || !title) continue;
    if (fbPostUrl) continue;

    results.push(mapRow(row, colMap, i + 1));
  }

  console.log(`   📄 FB: Found ${results.length} rows ready for posting`);
  return results;
}

/**
 * Get rows where linkedinPostUrl is still empty. Used by LI batch.
 */
export async function getRowsReadyForLi(limit: number = 15): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getRowsReadyForLi');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];

  for (let i = 1; i < rows.length && results.length < limit; i++) {
    const row = rows[i];
    const liPostUrl     = (row[col(colMap, 'LinkedIn Post URL', 'linkedin post url') ?? -1] ?? '').trim();
    const targetUrl     = (row[col(colMap, 'Download Report URL', 'Target URL', 'target url', 'targetUrl') ?? -1] ?? '').trim();
    const title         = (row[col(colMap, 'Title', 'title') ?? -1] ?? '').trim();

    // Must have URL + title, and no LI post yet
    if (!targetUrl || !title) continue;
    if (liPostUrl) continue;

    results.push(mapRow(row, colMap, i + 1));
  }

  console.log(`   📄 LI: Found ${results.length} rows ready for posting`);
  return results;
}

/**
 * Get rows where mediumPostUrl is still empty. Used by Medium batch.
 */
export async function getRowsReadyForMedium(limit: number = 15): Promise<SheetRow[]> {
  return getRowsClaimedByPlatform('Medium', limit);
}

// ──── Continuous posting for blog platforms (sequential: next unposted rows) ──

/**
 * Shared helper: find the last row that already has a URL for this platform,
 * then return the next `limit` rows after it where the URL is still empty.
 * No P1/P2/P3 or SERP required — pure sequential order.
 */
function pickNextSequentialBlogRows(
  rows: string[][],
  colMap: ColMap,
  urlColNames: string[],
  limit: number,
  label: string,
  sheetType: 'social' | 'blog' = 'blog',
  statusColNames?: string[],
  minRowIndex: number = 0,
  requireNewName: boolean = false
): SheetRow[] {
  const urlColIdx = col(colMap, ...urlColNames) ?? -1;
  const titleIdx = col(colMap, 'Blog Title', 'blog title', 'Title', 'title', 'Main Title') ?? -1;
  const targetUrlIdx = col(colMap, 'Report URL', 'Download Report URL', 'Target URL', 'target url', 'targetUrl', 'URL', 'url') ?? -1;
  const statusColIdx = statusColNames ? (col(colMap, ...statusColNames) ?? -1) : -1;
  const newNameIdx = requireNewName ? (col(colMap, 'New Name', 'new name', 'newName') ?? -1) : -1;

  // A row counts as "processed" if it has a URL OR a status (Posted/Failed/Error)
  const isProcessed = (row: string[]): boolean => {
    if (urlColIdx >= 0) {
      if ((row[urlColIdx] ?? '').trim()) return true;
    }
    if (statusColIdx >= 0) {
      const status = (row[statusColIdx] ?? '').trim().toLowerCase();
      if (status === 'posted' || status === 'failed' || status === 'error') return true;
    }
    return false;
  };

  // Scan the WHOLE sheet for unprocessed rows, in order — never skip ahead based
  // on the highest row processed so far. Resuming from "highest processed row + 1"
  // meant a single out-of-order row (e.g. a manual single-row retry/test hitting a
  // row far ahead of the normal queue) permanently blinded every future automatic
  // batch to every legitimate unprocessed row below it — confirmed to have silently
  // stalled Dev.to for days despite ~90 ready rows sitting below the poisoned cursor.
  const startIdx = minRowIndex > 0 ? minRowIndex - 1 : 1;
  const results: SheetRow[] = [];
  for (let i = startIdx; i < rows.length && results.length < limit; i++) {
    const row = rows[i];
    const title = titleIdx >= 0 ? (row[titleIdx] ?? '').trim() : '';
    const targetUrl = targetUrlIdx >= 0 ? (row[targetUrlIdx] ?? '').trim() : '';

    if (isProcessed(row)) continue;
    if (!title || !targetUrl) continue;
    if (requireNewName && newNameIdx >= 0 && !(row[newNameIdx] ?? '').trim()) continue;

    results.push(mapRow(row, colMap, i + 1, sheetType));
  }

  console.log(`   📄 [${label}] Scanned rows ${startIdx + 1}-${rows.length} → found ${results.length} rows ready`);
  return results;
}

export async function getRowsForContinuousMediumPosting(limit: number = 25): Promise<SheetRow[]> {
  return claimNextBlogSlots('Medium', limit);
}

export async function getRowsForContinuousLinkmatePosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('Linkmate', limit);
}

export async function getRowsForContinuousDevtoPosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('Dev.to', limit);
}

export async function getRowsForContinuousGoogleSitePosting(limit: number = 25): Promise<SheetRow[]> {
  return claimNextBlogSlots('Google Sites', limit);
}

export async function getRowsForContinuousLinkedinPulsePosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('LinkedIn Pulse', limit);
}

export async function getRowsForContinuousCalisthenicsPosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('Calisthenics', limit);
}

// ──── Continuous row picking for FB/LI (legacy - kept for compatibility) ──

export async function getRowsWithoutFbUrl(startRowIndex: number, limit: number = 15): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getRowsWithoutFbUrl');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];
  let count = 0;
  let currentRowIndex = 0;

  for (let i = 1; i < rows.length && count < limit; i++) {
    const row = rows[i];
    const fbPostUrl = row[col(colMap, 'FB Post URL', 'fb post url') ?? -1] ?? '';

    // Skip rows that already have fbPostUrl filled
    if (fbPostUrl.trim()) continue;

    currentRowIndex++;

    // Only include rows >= startRowIndex
    if (currentRowIndex < startRowIndex) continue;

    results.push(mapRow(row, colMap, i + 1));
    count++;
  }

  console.log(`   📄 FB: Found ${results.length} rows starting from index ${startRowIndex}`);
  return results;
}

export async function getRowsWithoutLiUrl(startRowIndex: number, limit: number = 15): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getRowsWithoutLiUrl');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];
  let count = 0;
  let currentRowIndex = 0;

  for (let i = 1; i < rows.length && count < limit; i++) {
    const row = rows[i];
    const liPostUrl = row[col(colMap, 'LinkedIn Post URL', 'linkedin post url') ?? -1] ?? '';

    // Skip rows that already have liPostUrl filled
    if (liPostUrl.trim()) continue;

    currentRowIndex++;

    // Only include rows >= startRowIndex
    if (currentRowIndex < startRowIndex) continue;

    results.push(mapRow(row, colMap, i + 1));
    count++;
  }

  console.log(`   📄 LI: Found ${results.length} rows starting from index ${startRowIndex}`);
  return results;
}

// ──── Get URLs due for weekly SERP re-check (Week 2+ feature) ──────────

export async function getUrlsDueForRecheck(): Promise<SheetRow[]> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  }), 'getUrlsDueForRecheck');

  const rows: string[][] = res.data.values ?? [];
  const results: SheetRow[] = [];
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const targetUrl = row[col(colMap, 'targetUrl', 'targeturl') ?? -1] ?? '';
    const lastSerpCheckDate = row[col(colMap, 'lastSerpCheckDate', 'last serp check date') ?? -1] ?? '';
    const priority = row[col(colMap, 'priority', 'seoRanking') ?? -1] ?? '';

    // Need: targetUrl exists AND priority was assigned AND lastSerpCheckDate <= 7 days ago
    if (!targetUrl.trim()) continue;
    if (!priority.trim()) continue; // Skip unprocessed URLs

    // If no lastSerpCheckDate, it's new - skip
    if (!lastSerpCheckDate.trim()) continue;

    // Check if > 7 days old
    if (lastSerpCheckDate <= sevenDaysAgo) {
      results.push(mapRow(row, colMap, i + 1));
    }
  }

  console.log(`   📄 Found ${results.length} URLs due for SERP re-check (> 7 days old)`);
  return results;
}

// ──── Batch-assign name/batch/date back to sheet rows ──────────────────

export interface RowAssignment {
  rowIndex: number;
  name: string;
  batch: number;
  date: string;
}

export async function assignRowsBatch(assignments: RowAssignment[]): Promise<void> {
  if (assignments.length === 0) return;
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets);

  const nameCol  = colToLetter(col(colMap, 'Name', 'name') ?? 0);
  const batchCol = colToLetter(col(colMap, 'batch') ?? 0);
  const dateCol  = colToLetter(col(colMap, 'date') ?? 0);

  const data = assignments.flatMap(a => [
    { range: `${SHEET_NAME}!${nameCol}${a.rowIndex}`,  values: [[a.name]] },
    { range: `${SHEET_NAME}!${batchCol}${a.rowIndex}`, values: [[String(a.batch)]] },
    { range: `${SHEET_NAME}!${dateCol}${a.rowIndex}`,  values: [[a.date]] },
  ]);

  const CHUNK = 500;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    await withRetry(() => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: chunk },
    }), 'assignRowsBatch');
  }
  console.log(`   ✔ Assigned ${assignments.length} rows`);
}

export const assignXRowsBatch  = (a: RowAssignment[]) => assignRowsBatch(a);
export const assignFbRowsBatch = (a: RowAssignment[]) => assignRowsBatch(a);
export const assignLiRowsBatch = (a: RowAssignment[]) => assignRowsBatch(a);

// ──── Internal helpers ──────────────────────────────────────────────────

/**
 * Converts exact rank position to a human-readable sheet value.
 *   rankPosition > 0  → "PageNo=1 ranking=7"  (page number + exact position)
 *   rankPosition = 0  → "PageNo=11+ ranking=100+"  (indexed but outside top 100)
 *   rankPosition = -1 → "N/A" (unknown / SerpAPI unavailable)
 */
function positionToString(rankPosition: number, indexStatus: string): string {
  if (rankPosition > 0 && rankPosition < 999) {
    const page = Math.ceil(rankPosition / 10);
    return `page=${page}/ranking=${rankPosition}`;
  }
  if (rankPosition === 999) return 'page=NA/ranking=NA';
  if (rankPosition === 0) return 'page=11+/ranking=100+';
  return 'N/A';
}

// ──── Get next batch number from sheet (last written batch + 1) ─────────

export async function getLastBatchNumber(
  batchColNames: string[],
  sheetType: SheetType = 'social'
): Promise<number> {
  const sheets = await getSheetsClient();
  const sheetConfig = getSheetConfig(sheetType);
  const colMap = await getColumnMap(sheets, sheetConfig.id, sheetConfig.name);
  const batchColIdx = col(colMap, ...batchColNames);
  if (batchColIdx === undefined) return 0;

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: sheetConfig.id,
    range: `${sheetConfig.name}!A:AZ`,
  }), 'getLastBatchNumber');

  const rows: string[][] = res.data.values ?? [];
  let maxBatch = 0;
  for (let i = 1; i < rows.length; i++) {
    const val = (rows[i][batchColIdx] || '').trim();
    if (val.startsWith('Batch ')) {
      const num = parseInt(val.slice(6), 10);
      if (!isNaN(num) && num > maxBatch) maxBatch = num;
    }
  }
  return maxBatch;
}

function buildUpdates(
  colMap: ColMap,
  rowIndex: number,
  fields: { names: string[]; value: string }[],
  sheetName: string = SHEET_NAME
): { range: string; values: string[][] }[] {
  const results: { range: string; values: string[][] }[] = [];
  for (const f of fields) {
    const colIdx = col(colMap, ...f.names);
    if (colIdx === undefined) {
      console.warn(`   ⚠️ buildUpdates: column NOT FOUND for names [${f.names.join(', ')}] – skipping`);
    } else {
      results.push({
        range: `${sheetName}!${colToLetter(colIdx)}${rowIndex}`,
        values: [[f.value]],
      });
    }
  }
  if (results.length === 0) {
    console.warn(`   ⚠️ buildUpdates: NO columns matched for row ${rowIndex} – nothing will be written!`);
  } else {
    console.log(`   ✔ buildUpdates: ${results.length}/${fields.length} fields matched for row ${rowIndex}`);
  }
  return results;
}

async function batchWrite(sheets: any, data: { range: string; values: string[][] }[], spreadsheetId: string = SHEET_ID): Promise<void> {
  if (data.length === 0) {
    console.warn('   ⚠️ batchWrite: called with EMPTY data – nothing to write');
    return;
  }
  console.log(`   ✔ batchWrite: writing ${data.length} cells – ${data.map(d => d.range).join(', ')}`);
  await withRetry(() => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  }), 'batchWrite');
}

function colToLetter(col: number): string {
  let letter = '';
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// ──── Sunday Examination: Move Failed Posts to End of Sheet ──────────────────

export async function examineSundayFailedPosts(): Promise<void> {
  const sheets = await getSheetsClient();
  const colMap = await getColumnMap(sheets, BLOG_SHEET_ID, BLOG_SHEET_NAME);

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: BLOG_SHEET_ID, range: `${BLOG_SHEET_NAME}!A:BZ`,
  }), 'examineSundayFailedPosts');

  const rows: string[][] = res.data.values ?? [];
  const failedRows: { rowIndex: number; data: string[]; platform: string }[] = [];
  let lastDataRowIndex = 1; // Start from header

  // Column indexes for relevant fields
  const descTitleCol = col(colMap, 'descriptionTitle', 'Report Title', 'description title', 'report title');
  const targetUrlCol = col(colMap, 'targetUrl', 'Target URL', 'Download Report URL', 'target url', 'url');

  // Platform status columns
  const mediumStatusCol = col(colMap, 'mediumStatus', 'Medium Status', 'medium status');
  const mediumUrlCol = col(colMap, 'mediumPostUrl', 'Medium Post URL', 'medium post url');
  const linkmateStatusCol = col(colMap, 'linkMateStatus', 'Linkmate Status', 'linkmate status');
  const linkmateUrlCol = col(colMap, 'linkMatePostUrl', 'Linkmate Post URL', 'linkmate post url');
  const googleSiteStatusCol = col(colMap, 'googleSiteStatus', 'Google Site Status', 'google site status');
  const googleSiteUrlCol = col(colMap, 'googleSitePostUrl', 'Google Site Post URL', 'google site post url');
  const devtoStatusCol = col(colMap, 'devtoStatus', 'Dev.to Status', 'dev.to status');
  const devtoUrlCol = col(colMap, 'devtoPostUrl', 'Dev.to Post URL', 'dev.to post url');
  const liPulseStatusCol = col(colMap, 'linkedinPulseStatus', 'LinkedIn Pulse Status', 'linkedin pulse status');
  const liPulseUrlCol = col(colMap, 'linkedinPulsePostUrl', 'LinkedIn Pulse Post URL', 'linkedin pulse post url');
  const calisthenicsStatusCol = col(colMap, 'calisthenicsStatus', 'Calisthenics Status', 'calisthenics status');
  const calisthenicsUrlCol = col(colMap, 'calisthenicsPostUrl', 'Calisthenics Post URL', 'calisthenics post url');

  // Scan for failed rows and last data row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const descTitle = (row[descTitleCol ?? -1] ?? '').trim();
    const targetUrl = (row[targetUrlCol ?? -1] ?? '').trim();

    // Track last row with data
    if (descTitle || targetUrl) {
      lastDataRowIndex = i + 1; // Convert to 1-based for sheet operations
    }

    // Check for failed posts
    const checks = [
      { status: mediumStatusCol, url: mediumUrlCol, platform: 'Medium' },
      { status: linkmateStatusCol, url: linkmateUrlCol, platform: 'Linkmate' },
      { status: googleSiteStatusCol, url: googleSiteUrlCol, platform: 'Google Sites' },
      { status: devtoStatusCol, url: devtoUrlCol, platform: 'Dev.to' },
      { status: liPulseStatusCol, url: liPulseUrlCol, platform: 'LinkedIn Pulse' },
      { status: calisthenicsStatusCol, url: calisthenicsUrlCol, platform: 'Calisthenics' },
    ];

    for (const check of checks) {
      if (check.status === undefined || check.url === undefined) continue;

      const status = (row[check.status] ?? '').trim();
      const postUrl = (row[check.url] ?? '').trim();

      if (status.toLowerCase() === 'failed' && !postUrl) {
        failedRows.push({
          rowIndex: i + 1,
          data: [...row],
          platform: check.platform,
        });
        break; // Don't count same row twice for multiple platforms
      }
    }
  }

  if (failedRows.length === 0) {
    console.log(`   ✅ Sunday Examination: No failed posts to move`);
    return;
  }

  console.log(`   🔍 Sunday Examination: Found ${failedRows.length} failed posts`);

  // Insert failed rows at the end (after lastDataRowIndex)
  const insertStartRow = lastDataRowIndex + 1;
  const updates: any[] = [];

  for (let i = 0; i < failedRows.length; i++) {
    const failedRow = failedRows[i];
    const sheetRowIndex = insertStartRow + i;

    // Build update for this row
    const rowData: any[] = [];
    for (let colIndex = 0; colIndex < failedRow.data.length; colIndex++) {
      rowData.push({ userEnteredValue: { stringValue: failedRow.data[colIndex] ?? '' } });
    }

    // Append rows to sheet
    updates.push({
      range: `${BLOG_SHEET_NAME}!A${sheetRowIndex}`,
      values: [failedRow.data],
    });
  }

  // Write all updates
  await batchWrite(sheets, updates, BLOG_SHEET_ID);

  console.log(`   📋 Moved ${failedRows.length} failed posts to rows ${insertStartRow}-${insertStartRow + failedRows.length - 1}`);
  console.log(`      Failed posts:`);
  for (const fp of failedRows) {
    const title = (fp.data[col(colMap, 'Blog Title', 'blog title', 'Title', 'title', 'Main Title') ?? -1] ?? 'N/A').slice(0, 50);
    console.log(`        • ${title}... (${fp.platform})`);
  }
}

// ──── Substack Blog Posting ─────────────────────────────────────────────────────

export async function getRowsReadyForSubstack(limit: number = 15): Promise<SheetRow[]> {
  return getRowsClaimedByPlatform('Substack', limit);
}

export async function getRowsForContinuousSubstackPosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('Substack', limit);
}

export async function getRowsForContinuousWordpressPosting(limit: number = 15, _minRowIndex: number = 0): Promise<SheetRow[]> {
  return claimNextBlogSlots('WordPress', limit);
}

export async function getRowsForContinuousBloggerPosting(limit: number = 15, _minRowIndex: number = 0): Promise<SheetRow[]> {
  return claimNextBlogSlots('Blogger', limit);
}

export async function saveUnifiedSubstackResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ──── HackMD Blog Posting ─────────────────────────────────────────────────────

export async function getRowsReadyForHackmd(limit: number = 15): Promise<SheetRow[]> {
  return getRowsClaimedByPlatform('HackMD', limit);
}

export async function getRowsForContinuousHackmdPosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('HackMD', limit);
}

export async function saveUnifiedWordpressResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

export async function saveUnifiedBloggerResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ──── Coda Blog Posting ───────────────────────────────────────────────────

export async function getRowsForContinuousCodaPosting(limit: number = 15, _minRowIndex: number = 0): Promise<SheetRow[]> {
  return claimNextBlogSlots('Coda', limit);
}

export async function saveUnifiedCodaResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

export async function saveUnifiedHackmdResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ──── Patreon Blog Posting ─────────────────────────────────────────────────────

export async function getRowsForContinuousPatreonPosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('Patreon', limit);
}

export async function saveUnifiedPatreonResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ──── Notion Blog Posting ─────────────────────────────────────────────────────

export async function getRowsForContinuousNotionPosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('Notion', limit);
}

export async function saveUnifiedNotionResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ──── Note Blog Posting ────────────────────────────────────────────────────────

export async function getRowsForContinuousNotePosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('Note', limit);
}

export async function saveUnifiedNoteResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ── Ameba ─────────────────────────────────────────────────────────────────────

export async function getRowsForContinuousAmebaPosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('Ameba', limit);
}

export async function saveUnifiedAmebaResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ── Paragraph ─────────────────────────────────────────────────────────────────

export async function getRowsForContinuousParagraphPosting(limit: number = 15): Promise<SheetRow[]> {
  return claimNextBlogSlots('Paragraph', limit);
}

export async function saveUnifiedParagraphResult(
  row: SheetRow,
  result: { postUrl: string; status: string; error?: string; batch?: string }
): Promise<void> {
  await saveBlogSlotResult(row, result);
}

// ── Fleet name rebalancing ────────────────────────────────────────────────────
//
// Sheet rows route to accounts via the Name column verbatim, so an agent's fleet
// only gets work if rows carry its name. This rebalances UNTOUCHED rows (nothing
// posted anywhere yet) across all fleet agents, weighted by fleet size, so every
// logged-in fleet account gets a share of every future session. Runs at session
// start; deterministic over the same untouched set, so it doesn't flip-flop.

/** Fleet agents and their account counts, derived from the X registry (accounts.json). */
function fleetAgentsFromRegistry(): Array<{ agent: string; count: number }> {
  try {
    const raw = JSON.parse(fsSync.readFileSync('.accounts/accounts.json', 'utf8'));
    const list: any[] = Array.isArray(raw) ? raw : (raw.accounts ?? []);
    const counts = new Map<string, number>();
    for (const a of list) {
      const m = /^([a-z]+) (\d+)$/.exec((a?.nickname ?? '').toLowerCase().trim());
      if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
    // Only agents with a real fleet (2+ indexed accounts) participate.
    return [...counts.entries()].filter(([, c]) => c >= 2)
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count);
  } catch { return []; }
}

/**
 * Rebalance the Name column of untouched rows in one tab across fleet agents.
 * Untouched = no status / post-URL / lastPosted value anywhere on the row.
 * Only rows already carrying a fleet-style name ("agent N") are re-assigned, and
 * only when the target AGENT differs (index-only churn is skipped).
 */
export async function rebalanceFleetNames(): Promise<void> {
  const agents = fleetAgentsFromRegistry();
  if (agents.length < 2) return; // one agent = nothing to distribute
  const total = agents.reduce((s, a) => s + a.count, 0);

  const sheets = await getSheetsClient();
  for (const cfg of [getSheetConfig('social'), getSheetConfig('blog')]) {
    try {
      const res = await withRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: cfg.id, range: `${cfg.name}!A:ZZ`,
      }), 'rebalanceFleetNames');
      const rows: string[][] = res.data.values ?? [];
      if (rows.length < 2) continue;
      const hdr = rows[0];
      const nameIdx = hdr.findIndex(h => h.trim().toLowerCase() === 'name');
      if (nameIdx < 0) continue;
      const urlIdx = hdr.findIndex(h => /^(targeturl|report url|download report url)$/.test(h.trim().toLowerCase()));
      // Columns that mark a row as touched (any posting activity at all).
      const touchIdx = hdr.map((h, i) => {
        const k = h.trim().toLowerCase().replace(/\s+/g, '');
        return (k.includes('status') || k.includes('posturl') || k.includes('lastposted')) ? i : -1;
      }).filter(i => i >= 0);

      // Deterministic weighted sequence over untouched fleet rows (Bresenham spread).
      const updates: { range: string; values: string[][] }[] = [];
      const seen = new Map<string, number>(); // agent -> occurrences (for index cycling)
      const acc = agents.map(() => 0);
      let pos = 0;
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const cur = (row[nameIdx] ?? '').trim().toLowerCase();
        if (!/^[a-z]+ \d+$/.test(cur)) continue;              // fleet-style names only
        if (urlIdx >= 0 && !(row[urlIdx] ?? '').trim()) continue;
        if (touchIdx.some(i => (row[i] ?? '').trim())) continue; // touched → leave alone
        // pick the agent whose accumulated share is furthest behind its weight
        let best = 0;
        for (let a = 0; a < agents.length; a++) {
          acc[a] += agents[a].count;
          if (acc[a] > acc[best]) best = a;
        }
        acc[best] -= total;
        const target = agents[best];
        pos++;
        const n = (seen.get(target.agent) ?? 0) + 1;
        seen.set(target.agent, n);
        const curAgent = cur.replace(/ \d+$/, '');
        if (curAgent !== target.agent) {
          updates.push({
            range: `${cfg.name}!${colToLetter(nameIdx)}${r + 1}`,
            values: [[`${target.agent} ${((n - 1) % target.count) + 1}`]],
          });
        }
      }
      if (updates.length) {
        for (let i = 0; i < updates.length; i += 500) {
          await withRetry(() => sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: cfg.id,
            requestBody: { valueInputOption: 'RAW', data: updates.slice(i, i + 500) },
          }), 'rebalanceFleetNames-write');
        }
      }
      console.log(`   ⚖️  [rebalance] ${cfg.name}: ${pos} untouched fleet rows, ${updates.length} renamed (${agents.map(a => `${a.agent}:${a.count}`).join(', ')})`);
    } catch (err: any) {
      console.warn(`   ⚠️ [rebalance] ${cfg.name} failed (non-fatal): ${err.message}`);
    }
  }
}

/**
 * For ONE agent's own tabs — used by the per-agent "Post Now" cycle only, never
 * the main scheduler daemon (which keeps its stricter, abhinav-focused rules
 * exactly as locked in: no substitution, fixed numbered slots). Reassigns any
 * pending row whose Name does NOT resolve to an account this agent has
 * ACTUALLY LOGGED IN right now, round-robin across whichever accounts are live.
 *
 * rebalanceFleetNames() only touches rows already in "agent N" format and
 * weights by registered X-account COUNT, not live login state — so a bare name
 * ("Vansh", no number) or a number pointing at a deleted/dead account is
 * skipped forever, never fixed. This is for agents like vansh/sanya whose real
 * account count is small and grows as they log in — there is no fixed "N cap"
 * assumed; whatever is logged in right now IS the fleet.
 *
 * A number beyond one specific platform's own real count (e.g. assigned "vansh
 * 2" but Facebook only has "vansh 1") still fails cleanly and individually on
 * THAT platform via the existing no-substitution account lookup — this only
 * ensures the shared Name column points at some real, live account instead of
 * nothing at all.
 *
 * abhinav is EXPLICITLY EXCLUDED, by direct instruction — even if he ever
 * triggers his own "Post Now", his rows must never be auto-reassigned by this
 * small-fleet mechanism; his sheet stays exactly as fixed-slot rules manage it.
 */
export async function assignPendingRowsToLiveAccounts(agent: string): Promise<void> {
  const a = agent.toLowerCase().trim();
  if (a === 'abhinav') return;
  const status = listAgentStatus(a);
  const liveIndices = new Set<number>();
  for (const list of Object.values(status.platforms)) {
    for (const acc of list) if (acc.ready) liveIndices.add(acc.index);
  }
  const live = [...liveIndices].sort((x, y) => x - y);
  if (!live.length) {
    console.log(`   ⚠️ [live-assign] ${a}: no logged-in accounts on any platform — nothing to assign`);
    return;
  }

  const sheets = await getSheetsClient();
  const capA = a.charAt(0).toUpperCase() + a.slice(1);
  const tabs = [
    { id: SOCIAL_SHEET_ID, name: `${capA} Social` },
    { id: BLOG_SHEET_ID, name: `${capA} Blog` },
  ];

  for (const cfg of tabs) {
    try {
      const res = await withRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: cfg.id, range: `${cfg.name}!A:ZZ`,
      }), 'assignPendingRowsToLiveAccounts');
      const rows: string[][] = res.data.values ?? [];
      if (rows.length < 2) continue;
      const hdr = rows[0];
      const nameIdx = hdr.findIndex(h => h.trim().toLowerCase() === 'name');
      if (nameIdx < 0) continue;
      const urlIdx = hdr.findIndex(h => /^(targeturl|report url|download report url)$/.test(h.trim().toLowerCase()));
      const touchIdx = hdr.map((h, i) => {
        const k = h.trim().toLowerCase().replace(/\s+/g, '');
        return (k.includes('status') || k.includes('posturl') || k.includes('lastposted')) ? i : -1;
      }).filter(i => i >= 0);

      // Cap how many rows get unlocked per cycle — exactly ONE per live account,
      // by explicit instruction: "one one post and done." A small fleet (e.g. 2
      // accounts) must never have all 55 broken rows fixed in one shot: the
      // row-pickers would then try to push all of them through in a single
      // batch, hammering 2 real accounts with far more than one post each. Leave
      // the rest bare — they get unlocked one more each on the NEXT cycle's run.
      const MAX_PER_CYCLE = live.length;
      const updates: { range: string; values: string[][] }[] = [];
      let cursor = 0;
      for (let r = 1; r < rows.length && updates.length < MAX_PER_CYCLE; r++) {
        const row = rows[r];
        if (urlIdx >= 0 && !(row[urlIdx] ?? '').trim()) continue;
        if (touchIdx.some(i => (row[i] ?? '').trim())) continue; // touched → leave alone
        const cur = (row[nameIdx] ?? '').trim();
        const m = /^([a-z]+)\s*(\d+)$/i.exec(cur);
        const curAgent = m ? m[1].toLowerCase() : '';
        const curIdx = m ? Number(m[2]) : -1;
        if (curAgent === a && liveIndices.has(curIdx)) continue; // already valid — leave alone

        const idx = live[cursor % live.length];
        cursor++;
        updates.push({
          range: `${cfg.name}!${colToLetter(nameIdx)}${r + 1}`,
          values: [[`${a} ${idx}`]],
        });
      }
      if (updates.length) {
        for (let i = 0; i < updates.length; i += 500) {
          await withRetry(() => sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: cfg.id,
            requestBody: { valueInputOption: 'RAW', data: updates.slice(i, i + 500) },
          }), 'assignPendingRowsToLiveAccounts-write');
        }
      }
      console.log(`   🔀 [live-assign] ${cfg.name}: ${updates.length} unresolvable row(s) assigned to live accounts (${live.map(i => `${a} ${i}`).join(', ')})`);
    } catch (err: any) {
      console.warn(`   ⚠️ [live-assign] ${cfg.name} failed (non-fatal): ${err.message}`);
    }
  }
}

