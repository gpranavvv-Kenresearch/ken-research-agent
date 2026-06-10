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

export const SOCIAL_PLATFORMS: PlatformDef[] = [
  {
    key: 'x', label: 'X / Twitter', icon: '𝕏', color: '#1DA1F2',
    statusCols: ['X Status', 'xStatus'],
    urlCols: ['X Post URL', 'xPostUrl'],
    batchCols: ['X Batch', 'xBatch'],
    errorCols: ['X Error', 'xError'],
  },
  {
    key: 'facebook', label: 'Facebook', icon: 'f', color: '#4267B2',
    statusCols: ['FB Status', 'fbStatus'],
    urlCols: ['FB Post URL', 'fbPostUrl'],
    batchCols: ['FB Batch', 'fbBatch'],
    errorCols: ['FB Error', 'fbError'],
  },
  {
    key: 'linkedin', label: 'LinkedIn', icon: 'in', color: '#0077B5',
    statusCols: ['LinkedIn Status', 'linkedinStatus'],
    urlCols: ['LinkedIn Post URL', 'linkedinPostUrl'],
    batchCols: ['liBatch', 'LI Batch'],
    errorCols: ['LinkedIn Error', 'linkedinError'],
  },
];

export const BLOG_PLATFORMS: PlatformDef[] = [
  {
    key: 'medium', label: 'Medium', icon: 'M', color: '#000000',
    statusCols: ['Medium Status', 'mediumStatus'],
    urlCols: ['Medium Post URL', 'mediumPostUrl'],
    batchCols: ['Medium Batch', 'mediumBatch'],
    errorCols: ['Medium Error', 'mediumError'],
  },
  {
    key: 'devto', label: 'Dev.to', icon: 'DEV', color: '#0a0a0a',
    statusCols: ['Dev.to Status', 'devtoStatus'],
    urlCols: ['Dev.to Post URL', 'devtoPostUrl'],
    batchCols: ['Dev.to Batch', 'devtoBatch'],
    errorCols: ['Dev.to Error', 'devtoError'],
  },
  {
    key: 'substack', label: 'Substack', icon: 'S', color: '#FF6719',
    statusCols: ['Substack Status', 'substackStatus'],
    urlCols: ['Substack Post URL', 'substackPostUrl'],
    batchCols: ['Substack Batch', 'substackBatch'],
    errorCols: ['Substack Error', 'substackError'],
  },
  {
    key: 'hackmd', label: 'HackMD', icon: 'H', color: '#1E90FF',
    statusCols: ['HackMD Status', 'hackmdStatus'],
    urlCols: ['HackMD Post URL', 'hackmdPostUrl'],
    batchCols: ['HackMD Batch', 'hackmdBatch'],
    errorCols: ['HackMD Error', 'hackmdError'],
  },
  {
    key: 'linkedinPulse', label: 'LI Pulse', icon: 'LP', color: '#0077B5',
    statusCols: ['LinkedIn Pulse Status', 'linkedinPulseStatus', 'Linkedin Pulse Status'],
    urlCols: ['LinkedIn Pulse URL', 'LinkedIn Pulse Post URL', 'linkedinPulsePostUrl'],
    batchCols: ['LinkedIn Pulse Batch', 'linkedinPulseBatch'],
    errorCols: ['LinkedIn Pulse Error', 'linkedinPulseError'],
  },
  {
    key: 'wordpress', label: 'WordPress', icon: 'WP', color: '#21759B',
    statusCols: ['WordPress Status', 'wordpressStatus'],
    urlCols: ['WordPress Post URL', 'wordpressPostUrl'],
    batchCols: ['WordPress Batch', 'wordpressBatch'],
    errorCols: ['WordPress Error', 'wordpressError'],
  },
  {
    key: 'blogger', label: 'Blogger', icon: 'B', color: '#FF5722',
    statusCols: ['Blogger Status', 'bloggerStatus'],
    urlCols: ['Blogger Post URL', 'bloggerPostUrl'],
    batchCols: ['Blogger Batch', 'bloggerBatch'],
    errorCols: ['Blogger Error', 'bloggerError'],
  },
  {
    key: 'notion', label: 'Notion', icon: 'N', color: '#888',
    statusCols: ['Notion Status', 'notionStatus'],
    urlCols: ['Notion Post URL', 'notionPostUrl'],
    batchCols: ['Notion Batch', 'notionBatch'],
    errorCols: ['Notion Error', 'notionError'],
  },
  {
    key: 'googlesite', label: 'Google Sites', icon: 'G', color: '#4285F4',
    statusCols: ['Google Site Status', 'googleSiteStatus'],
    urlCols: ['Google Site Post URL', 'googleSitePostUrl'],
    batchCols: ['Google Site Batch', 'googleSiteBatch'],
    errorCols: ['Google Site Error', 'googleSiteError'],
  },
  {
    key: 'note', label: 'Note', icon: '📝', color: '#4DB6AC',
    statusCols: ['Note Status', 'noteStatus'],
    urlCols: ['Note Post URL', 'notePostUrl'],
    batchCols: ['Note Batch', 'noteBatch'],
    errorCols: ['Note Error', 'noteError'],
  },
  {
    key: 'paragraph', label: 'Paragraph', icon: '¶', color: '#9C27B0',
    statusCols: ['Paragraph Status', 'paragraphStatus'],
    urlCols: ['Paragraph Post URL', 'paragraphPostUrl'],
    batchCols: ['Paragraph Batch', 'paragraphBatch'],
    errorCols: ['Paragraph Error', 'paragraphError'],
  },
  {
    key: 'patreon', label: 'Patreon', icon: 'P', color: '#F96854',
    statusCols: ['Patreon Status', 'patreonStatus'],
    urlCols: ['Patreon Post URL', 'patreonPostUrl'],
    batchCols: ['Patreon Batch', 'patreonBatch'],
    errorCols: ['Patreon Error', 'patreonError'],
  },
  {
    key: 'calisthenics', label: 'Calisthenics', icon: 'C', color: '#4CAF50',
    statusCols: ['Calisthenics Status', 'calisthenicsStatus'],
    urlCols: ['Calisthenics Post URL', 'calisthenicsPostUrl'],
    batchCols: ['Calisthenics Batch', 'calisthenicsNBatch'],
    errorCols: ['Calisthenics Error', 'calisthenicsError'],
  },
  {
    key: 'linkmate', label: 'Linkmate', icon: '🔗', color: '#FF9800',
    statusCols: ['Linkmate Status', 'linkMateStatus'],
    urlCols: ['Linkmate Post URL', 'linkMatePostUrl'],
    batchCols: ['Linkmate Batch', 'linkmateBatch'],
    errorCols: ['Linkmate Error', 'linkMateError'],
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
    label: 'Format 1',
    subLabel: 'SEO-Li Article',
    desc: 'SEO-optimised LinkedIn article (800–1100 words, 17 quality flags, AEO/GEO signals)',
    sampleRoute: '/samples/format-1.html',
    color: 'blue',
  },
  {
    id: 'linkedin',
    label: 'Format 2',
    subLabel: 'LinkedIn Pulse',
    desc: 'Standard LinkedIn Pulse blog (1000–1300 words, 8–9 interlinks, automated publishing)',
    sampleRoute: '/samples/format-2.html',
    color: 'indigo',
  },
  {
    id: 'testing-demo',
    label: 'Format 3',
    subLabel: 'Testing Demo',
    desc: 'Sandbox run with full HTML output — no live writes, safe to preview format',
    sampleRoute: '/samples/format-3.html',
    color: 'teal',
  },
];
