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
    key: 'threads', label: 'Threads', icon: '@', color: '#000000',
    statusCols: ['Thread status'],
    urlCols: ['Thread Post URl'],
    batchCols: ['Thread Batch'],
    errorCols: ['Thread Error'],
    dateCols: [], // no lastPosted column tracked for this platform yet
  },
  {
    key: 'instagram', label: 'Instagram', icon: '📷', color: '#E1306C',
    statusCols: ['Instagram Status'],
    urlCols: ['Instagram Post URl'],
    batchCols: ['instagram Batch'],
    errorCols: ['Instagram Error'],
    dateCols: [], // no lastPosted column tracked for this platform yet
  },
];

export const BLOG_PLATFORMS: PlatformDef[] = [
  {
    key: 'medium', label: 'Medium', icon: 'M', color: '#000000',
    statusCols: ['Medium Status', 'mediumStatus'],
    urlCols: ['Medium Post URL', 'mediumPostUrl'],
    batchCols: ['Medium Batch', 'mediumBatch'],
    errorCols: ['Medium Error', 'mediumError'],
    dateCols: ['lastPostedMedium'],
  },
  {
    key: 'devto', label: 'Dev.to', icon: 'DEV', color: '#0a0a0a',
    statusCols: ['Dev.to Status', 'devtoStatus'],
    urlCols: ['Dev.to Post URL', 'devtoPostUrl'],
    batchCols: ['Dev.to Batch', 'devtoBatch'],
    errorCols: ['Dev.to Error', 'devtoError'],
    dateCols: ['lastPostedDevto'],
  },
  {
    key: 'substack', label: 'Substack', icon: 'S', color: '#FF6719',
    statusCols: ['Substack Status', 'substackStatus'],
    urlCols: ['Substack Post URL', 'substackPostUrl'],
    batchCols: ['Substack Batch', 'substackBatch'],
    errorCols: ['Substack Error', 'substackError'],
    dateCols: ['lastPostedSubstack'],
  },
  {
    key: 'hackmd', label: 'HackMD', icon: 'H', color: '#1E90FF',
    statusCols: ['HackMD Status', 'hackmdStatus'],
    urlCols: ['HackMD Post URL', 'hackmdPostUrl'],
    batchCols: ['HackMD Batch', 'hackmdBatch'],
    errorCols: ['HackMD Error', 'hackmdError'],
    dateCols: ['lastPostedHackmd', 'lastPostedHackMD'],
  },
  {
    key: 'linkedinPulse', label: 'LI Pulse', icon: 'LP', color: '#0077B5',
    statusCols: ['LinkedIn Pulse Status', 'linkedinPulseStatus', 'Linkedin Pulse Status'],
    urlCols: ['LinkedIn Pulse URL', 'LinkedIn Pulse Post URL', 'linkedinPulsePostUrl'],
    batchCols: ['LinkedIn Pulse Batch', 'linkedinPulseBatch'],
    errorCols: ['LinkedIn Pulse Error', 'linkedinPulseError'],
    dateCols: ['lastPosted linkedin Pulse', 'lastPostedLinkedinPulse'],
  },
  {
    key: 'wordpress', label: 'WordPress', icon: 'WP', color: '#21759B',
    statusCols: ['WordPress Status', 'wordpressStatus'],
    urlCols: ['WordPress Post URL', 'wordpressPostUrl'],
    batchCols: ['WordPress Batch', 'wordpressBatch'],
    errorCols: ['WordPress Error', 'wordpressError'],
    dateCols: ['lastPostedWordpress'],
  },
  {
    key: 'blogger', label: 'Blogger', icon: 'B', color: '#FF5722',
    statusCols: ['Blogger Status', 'bloggerStatus'],
    urlCols: ['Blogger Post URL', 'bloggerPostUrl'],
    batchCols: ['Blogger Batch', 'bloggerBatch'],
    errorCols: ['Blogger Error', 'bloggerError'],
    dateCols: ['Last Posted Blogger', 'lastPostedBlogger'],
  },
  {
    key: 'notion', label: 'Notion', icon: 'N', color: '#888',
    statusCols: ['Notion Status', 'notionStatus'],
    urlCols: ['Notion Post URL', 'notionPostUrl'],
    batchCols: ['Notion Batch', 'notionBatch'],
    errorCols: ['Notion Error', 'notionError'],
    dateCols: ['Last Posted Notion', 'lastPostedNotion'],
  },
  {
    key: 'googlesite', label: 'Google Sites', icon: 'G', color: '#4285F4',
    statusCols: ['Google Site Status', 'googleSiteStatus'],
    urlCols: ['Google Site Post URL', 'googleSitePostUrl'],
    batchCols: ['Google Site Batch', 'googleSiteBatch'],
    errorCols: ['Google Site Error', 'googleSiteError'],
    dateCols: ['lastPostedGoogleSite'],
  },
  {
    key: 'note', label: 'Note', icon: '📝', color: '#4DB6AC',
    statusCols: ['Note Status', 'noteStatus'],
    urlCols: ['Note Post URL', 'notePostUrl'],
    batchCols: ['Note Batch', 'noteBatch'],
    errorCols: ['Note Error', 'noteError'],
    dateCols: ['Last Posted Note', 'lastPostedNote'],
  },
  {
    key: 'paragraph', label: 'Paragraph', icon: '¶', color: '#9C27B0',
    statusCols: ['Paragraph Status', 'paragraphStatus'],
    urlCols: ['Paragraph Post URL', 'paragraphPostUrl'],
    batchCols: ['Paragraph Batch', 'paragraphBatch'],
    errorCols: ['Paragraph Error', 'paragraphError'],
    dateCols: ['Last Posted Paragraph', 'lastPostedParagraph'],
  },
  {
    key: 'patreon', label: 'Patreon', icon: 'P', color: '#F96854',
    statusCols: ['Patreon Status', 'patreonStatus'],
    urlCols: ['Patreon Post URL', 'patreonPostUrl'],
    batchCols: ['Patreon Batch', 'patreonBatch'],
    errorCols: ['Patreon Error', 'patreonError'],
    dateCols: ['Last Posted Patreon', 'lastPostedPatreon'],
  },
  {
    key: 'calisthenics', label: 'Calisthenics', icon: 'C', color: '#4CAF50',
    statusCols: ['Calisthenics Status', 'calisthenicsStatus'],
    urlCols: ['Calisthenics Post URL', 'calisthenicsPostUrl'],
    batchCols: ['Calisthenics Batch', 'calisthenicsNBatch'],
    errorCols: ['Calisthenics Error', 'calisthenicsError'],
    dateCols: ['lastPosted Calisthenics', 'lastPostedCalisthenics'],
  },
  {
    key: 'linkmate', label: 'Linkmate', icon: '🔗', color: '#FF9800',
    statusCols: ['Linkmate Status', 'linkMateStatus'],
    urlCols: ['Linkmate Post URL', 'linkMatePostUrl'],
    batchCols: ['Linkmate Batch', 'linkmateBatch'],
    errorCols: ['Linkmate Error', 'linkMateError'],
    dateCols: ['lastPostedLinkmate'],
  },
  {
    key: 'coda', label: 'Coda', icon: 'C', color: '#F46A54',
    statusCols: ['Coda Status', 'codaStatus'],
    urlCols: ['Coda Post URL', 'codaPostUrl'],
    batchCols: ['Coda Batch', 'codaBatch'],
    errorCols: ['Coda Error', 'codaError'],
    dateCols: ['Last Posted Coda', 'lastPostedCoda'],
  },
];

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


