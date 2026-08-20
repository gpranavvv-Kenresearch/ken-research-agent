export interface RawRow {
  _dataRow: number;
  _sheetRow: number;
  [key: string]: unknown;
}

export interface PlatformDef {
  key: string;
  label: string;
  icon: string;
  statusCols: string[];
  urlCols: string[];
  batchCols: string[];
  errorCols: string[];
  dateCols: string[]; // real "last posted" timestamp column(s) — batchCols is just a label like "Batch 1", not a date
  color: string;
}

export function getField(row: RawRow, ...cols: string[]): string {
  for (const c of cols) {
    const v = row[c];
    if (v && String(v).trim()) return String(v).trim();
    // try lowercase variant
    const lower = c.toLowerCase();
    const v2 = row[lower];
    if (v2 && String(v2).trim()) return String(v2).trim();
  }
  return '';
}

/** dateCols cells accumulate history as "stamp1 | stamp2 | ..." (sheets.ts's appendValue) — last segment is the most recent. Returns "YYYY-MM-DD" or ''. */
export function latestDateFromCell(raw: string): string {
  if (!raw) return '';
  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const m = last.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

/** The most recent "last posted" date across every platform on this row, "YYYY-MM-DD" or ''. */
export function latestPostDate(row: RawRow, platforms: PlatformDef[]): string {
  let latest = '';
  for (const p of platforms) {
    if (!p.dateCols.length) continue;
    const d = latestDateFromCell(getField(row, ...p.dateCols));
    if (d && d > latest) latest = d;
  }
  return latest;
}

// ──── Blog posting slots ────────────────────────────────────────────────
// Every blog platform now posts through 2 shared slots per row (max 2
// platforms/row) instead of a dedicated column set per platform — see
// claimNextBlogSlot/saveBlogSlotResult in src/sheets/sheets.ts. A row's
// "platform" is dynamic (whichever platform claimed that slot), so unlike
// SOCIAL_PLATFORMS this isn't a fixed PlatformDef[] — it's read per row.

export interface BlogSlot {
  slot: 1 | 2;
  platform: string; // e.g. "Blogger", '' if unclaimed
  url: string;
  status: string;   // this slot's status, e.g. "Posted" / "Failed" / "Error" / ''
  error: string;
}

/** Parses "P1:<state>|P2:<state>" (written by saveBlogSlotResult) into { 1: state, 2: state }. */
function parseBlogSlotState(raw: string): Record<1 | 2, string> {
  const out: Record<1 | 2, string> = { 1: '', 2: '' };
  raw.split('|').map((s) => s.trim()).filter(Boolean).forEach((part) => {
    const m = part.match(/^P([12]):(.*)$/);
    if (m) out[Number(m[1]) as 1 | 2] = m[2].trim();
  });
  return out;
}

export function getBlogSlots(row: RawRow): BlogSlot[] {
  const statusState = parseBlogSlotState(getField(row, 'Blog Status', 'blogStatus'));
  const errorState = parseBlogSlotState(getField(row, 'Blog Error', 'blogError'));
  return [
    { slot: 1, platform: getField(row, 'Blog Platform 1', 'blogPlatform1'), url: getField(row, 'Blog URL 1', 'blogUrl1'), status: statusState[1], error: errorState[1] },
    { slot: 2, platform: getField(row, 'Blog Platform 2', 'blogPlatform2'), url: getField(row, 'Blog URL 2', 'blogUrl2'), status: statusState[2], error: errorState[2] },
  ];
}

export function latestBlogPostDate(row: RawRow): string {
  return latestDateFromCell(getField(row, 'Last Posted Blog', 'lastPostedBlog'));
}

/** Maps a claimed platform label (as stored in "Blog Platform 1/2") to the lowercase key runRetryRow/post-now expect. */
export const BLOG_PLATFORM_KEY_BY_LABEL: Record<string, string> = {
  'Google Sites': 'googlesite', HackMD: 'hackmd', 'Dev.to': 'devto', Medium: 'medium',
  Linkmate: 'linkmate', 'LinkedIn Pulse': 'linkedin-pulse', Calisthenics: 'calisthenics',
  Substack: 'substack', WordPress: 'wordpress', Blogger: 'blogger',
  Notion: 'notion', Note: 'note', Coda: 'coda',
};

export const SOCIAL_PLATFORMS: PlatformDef[] = [
  {
    key: 'x', label: 'X / Twitter', icon: '𝕏', color: '#1DA1F2',
    statusCols: ['X Status', 'xStatus'],
    urlCols: ['X Post URL', 'xPostUrl'],
    batchCols: ['X Batch', 'xBatch'],
    errorCols: ['X Error', 'xError'],
    dateCols: ['lastPostedX'],
  },
  {
    key: 'facebook', label: 'Facebook', icon: 'f', color: '#4267B2',
    statusCols: ['FB Status', 'fbStatus'],
    urlCols: ['FB Post URL', 'fbPostUrl'],
    batchCols: ['FB Batch', 'fbBatch'],
    errorCols: ['FB Error', 'fbError'],
    dateCols: ['lastPostedFb'],
  },
  {
    key: 'linkedin', label: 'LinkedIn', icon: 'in', color: '#0077B5',
    statusCols: ['LinkedIn Status', 'linkedinStatus'],
    urlCols: ['LinkedIn Post URL', 'linkedinPostUrl'],
    batchCols: ['liBatch', 'LI Batch'],
    errorCols: ['LinkedIn Error', 'linkedinError'],
    dateCols: ['lastPostedLi'],
  },
  {
    key: 'tumblr', label: 'Tumblr', icon: 't', color: '#36465D',
    statusCols: ['Tumblr Status', 'tumblrStatus'],
    urlCols: ['Tumblr Post URL', 'tumblrPostUrl'],
    batchCols: ['Tumblr Batch', 'tumblrBatch'],
    errorCols: ['Tumblr Error', 'tumblrError'],
    dateCols: ['lastPostedTumblr'],
  },
  {
    key: 'mastodon', label: 'Mastodon', icon: 'M', color: '#6364FF',
    statusCols: ['Mastodon Status', 'mastodonStatus'],
    urlCols: ['Mastodon Post URL', 'mastodonPostUrl'],
    batchCols: ['Mastodon Batch', 'mastodonBatch'],
    errorCols: ['Mastodon Error', 'mastodonError'],
    dateCols: ['lastPostedMastodon'],
  },
];

/** Icon/color per blog platform label, purely cosmetic for BlogSlotBadge — same set previously listed per-platform in BLOG_PLATFORMS. */
export const BLOG_PLATFORM_META: Record<string, { icon: string; color: string }> = {
  Medium: { icon: 'M', color: '#000000' },
  'Dev.to': { icon: 'DEV', color: '#0a0a0a' },
  Substack: { icon: 'S', color: '#FF6719' },
  HackMD: { icon: 'H', color: '#1E90FF' },
  'LinkedIn Pulse': { icon: 'LP', color: '#0077B5' },
  WordPress: { icon: 'WP', color: '#21759B' },
  Blogger: { icon: 'B', color: '#FF5722' },
  Notion: { icon: 'N', color: '#888' },
  'Google Sites': { icon: 'G', color: '#4285F4' },
  Note: { icon: '📝', color: '#4DB6AC' },
  Calisthenics: { icon: 'C', color: '#4CAF50' },
  Linkmate: { icon: '🔗', color: '#FF9800' },
  Coda: { icon: 'C', color: '#F46A54' },
};

export const ACCOUNT_NICKNAMES = [
  'aniket', 'krishi', 'sameeksha', 'hritika', 'meenakshi',
  'vansh', 'kamakshi', 'vishal', 'pranav', 'shrey',
  'sanya', 'shivani', 'vijay', 'avdhesh', 'abhinav',
];

export const FORMATS = [
  {
    id: 'seo-li',
    label: 'Sample 1',
    subLabel: '',
    desc: 'SERP + AI-citation optimized article: 1,450-1,600 words, 7 sections, 5 FAQs, sourced and fact-checked.',
    color: 'blue',
    sample: '/samples/sample-1.html',
  },
  {
    id: 'custom',
    label: 'Custom',
    subLabel: '',
    desc: 'Paste your own sample blog to use as the template.',
    color: 'amber',
    sample: '',
  }
];

export const IMAGE_PROMPT_OPTIONS = [
  { id: '1', label: 'Image 1', example: 'https://ik.imagekit.io/m139x4s8x/microblogs/samples/image-prompt-1-example_kycrQnBCW.png' },
  { id: '2', label: 'Image 2', example: 'https://ik.imagekit.io/m139x4s8x/microblogs/samples/image-prompt-2-example_YQO9uDy-BJ.png' },
];


