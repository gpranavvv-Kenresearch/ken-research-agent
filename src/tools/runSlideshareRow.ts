/**
 * Upload a single row's PDF/PPT to SlideShare.
 *   npx tsx src/tools/runSlideshareRow.ts <rowIndex>
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { getSheetRowByIndex, saveUnifiedSlideshareResult } from '../sheets/sheets.js';
import { postToSlideShare } from '../browser/slideshare/poster.js';
import { getSlideShareAccountByNickname, getActiveSlideShareAccount } from '../browser/slideshare/login.js';

const rowIndex = parseInt(process.argv[2] || '0', 10);
if (!rowIndex) {
  console.error('Usage: npx tsx src/tools/runSlideshareRow.ts <rowIndex>');
  process.exit(1);
}

(async () => {
  console.log(`\nFetching blog sheet row ${rowIndex}...`);
  const row = await getSheetRowByIndex(rowIndex, 'blog');
  if (!row) {
    console.error(`❌ Row ${rowIndex} not found in Blogs sheet`);
    process.exit(1);
  }

  const filePath = (row as any).pdfFilePath || '';
  const title       = row.title || '';
  const description = row.description || row.blogSeoDescription || '';
  const tags        = row.seedKeyword
    ? [row.seedKeyword, 'Ken Research', 'Market Research']
    : ['Ken Research', 'Market Research'];

  console.log(`   Title     : ${title}`);
  console.log(`   Account   : ${row.name}`);
  console.log(`   File path : ${filePath || '(empty)'}`);

  if (!filePath) {
    console.error('❌ No PDF File Path in row — add value in "PDF File Path" column');
    process.exit(1);
  }
  if (!fs.existsSync(path.resolve(filePath))) {
    console.error(`❌ File not found: ${path.resolve(filePath)}`);
    process.exit(1);
  }

  const account = getSlideShareAccountByNickname(row.name) ?? getActiveSlideShareAccount();
  if (!account) {
    console.error(`❌ No SlideShare account for "${row.name}"`);
    process.exit(1);
  }

  const sessionDir = account.sessionDir
    ? path.resolve(account.sessionDir)
    : path.resolve(`.sessions/slideshare/${row.name}`);
  const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  fs.mkdirSync(sessionDir, { recursive: true });

  console.log(`\nOpening browser with saved session: ${sessionDir}`);
  const ctx = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    channel: fs.existsSync(chromePath) ? undefined : 'chrome',
    viewport: { width: 1366, height: 900 },
    slowMo: 50,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--start-minimized', '--no-sandbox', '--disable-blink-features=AutomationControlled',
           '--no-first-run', '--no-default-browser-check', '--disable-infobars'],
  });
  await ctx.addInitScript(() => {
    Object.defineProperty((globalThis as any).navigator, 'webdriver', { get: () => false });
  });

  const existingPages = ctx.pages();
  const page = existingPages[0] || await ctx.newPage();
  for (const p of existingPages.slice(1)) await p.close().catch(() => {});

  try {
    console.log('\nUploading to SlideShare...');
    const result = await postToSlideShare(page, filePath, title, description, tags);
    console.log(`\n✅ Uploaded: ${result.postUrl}`);
    await saveUnifiedSlideshareResult(row, { postUrl: result.postUrl, status: 'Posted', batch: 'Manual' });
  } catch (err: any) {
    console.error(`\n❌ Upload failed: ${err.message}`);
    await saveUnifiedSlideshareResult(row, { postUrl: '', status: 'Failed', batch: 'Manual', error: err.message });
  } finally {
    await ctx.close();
  }

  process.exit(0);
})();
