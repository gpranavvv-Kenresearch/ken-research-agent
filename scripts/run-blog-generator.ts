/**
 * run-blog-generator.ts — VPS blog-generation loop (ChatGPT method).
 *
 * Finds blog rows that still need content (targetUrl set, Blog Content empty),
 * reads each row's Format (or a batch override from the dashboard modal),
 * generates the article via the shared ChatGPT session (generate_blog_chatgpt.ts),
 * and writes Blog Title / Description / Content back to the sheet.
 *
 * Human-readable progress is streamed live so the dashboard status banner shows it.
 *
 * Usage:
 *   DISPLAY=:99 npx tsx scripts/run-blog-generator.ts --name abhinav --limit 3
 *   [--loop] [--interval 300] [--format-override seo-li|format2|...|custom] [--sample-file path]
 */

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const NAME = (arg('--name') || process.env.WORKER_NAME || '').toLowerCase();
const LOOP = process.argv.includes('--loop');
const INTERVAL_S = Number(arg('--interval') || 300);
const LIMIT = Number(arg('--limit') || 3);
// Use the repo's venv Python (has google-auth/requests); fall back to system python3.
const PY = process.env.PYTHON
  || (fs.existsSync(path.resolve('venv/bin/python3')) ? path.resolve('venv/bin/python3') : 'python3');
// Batch overrides (from the dashboard Generate modal): one format/sample for every row.
const FORMAT_OVERRIDE = (arg('--format-override') || '').trim();
const SAMPLE_OVERRIDE = (arg('--sample-file') || '').trim();

if (!NAME) { console.error('--name (or WORKER_NAME) required'); process.exit(1); }

// Mirror all logs straight into the shared log file (unbuffered) so the dashboard
// status banner updates live rather than waiting for Node's stdout buffer to flush.
const BLOG_LOG = process.env.BLOG_LOG;
const _origLog = console.log.bind(console);
console.log = (...a: unknown[]) => {
  const s = a.map(String).join(' ');
  _origLog(s);
  if (BLOG_LOG) { try { fs.appendFileSync(BLOG_LOG, s + '\n'); } catch { /* noop */ } }
};

interface BlogRow { _dataRow: number; targetUrl?: string; title?: string; Format?: string; 'Custom Prompt'?: string; [k: string]: unknown; }

function normalizeFormat(raw: string): string {
  const s = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (['format1', '1', 'seoli', 'seo'].includes(s)) return 'seo-li';
  if (['format2', '2'].includes(s)) return 'format2';
  if (['format3', '3', 'testingdemo', 'testing'].includes(s)) return 'testing-demo';
  if (['format4', '4', 'custom'].includes(s)) return 'custom';
  return 'seo-li';
}
function formatLabel(id: string): string {
  return ({ 'seo-li': 'Sample 1', 'format2': 'Sample 2', 'testing-demo': 'Sample 3', 'custom': 'your custom sample' } as Record<string, string>)[id] || id;
}
function looksLikeHtml(s: string): boolean {
  return /<[a-z!][\s\S]*>/i.test(s) && s.length > 60;
}
function rowTitle(row: BlogRow): string {
  // Input report title lives in "Report Title"; fall back to older columns.
  return String(row['Report Title'] || row.title || row['Blog Title'] || '').trim();
}
function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

function readUnprocessed(): BlogRow[] {
  const r = spawnSync(PY, ['scripts/sheet_read.py', '--sheet', 'blog', '--name', NAME, '--action', 'blog-unprocessed'], { encoding: 'utf-8' });
  if (r.status !== 0) {
    console.log('⚠ Could not read your Google Sheet. (Check the server / credentials.)');
    return [];
  }
  try {
    const data = JSON.parse(r.stdout);
    return data.ok ? (data.rows as BlogRow[]) : [];
  } catch { console.log('⚠ Got an unexpected response reading your sheet.'); return []; }
}

/** Generate one blog, streaming ChatGPT's progress live to our log. */
function generate(row: BlogRow): Promise<{ title: string; description: string; html: string } | null> {
  let format = 'seo-li';
  let sampleFile = '';
  let tmpToClean = '';

  if (FORMAT_OVERRIDE) {
    format = FORMAT_OVERRIDE === 'custom' ? 'custom' : normalizeFormat(FORMAT_OVERRIDE);
    if (SAMPLE_OVERRIDE) sampleFile = SAMPLE_OVERRIDE;
  } else {
    const rawFormat = String(row.Format || '').trim();
    let sampleContent = '';
    if (looksLikeHtml(rawFormat)) { format = 'custom'; sampleContent = rawFormat; }
    else if (rawFormat) { format = normalizeFormat(rawFormat); }
    const pasted = String(row['Custom Prompt'] || '').trim();
    if (!sampleContent && pasted) sampleContent = pasted;
    if (sampleContent) {
      tmpToClean = path.join(os.tmpdir(), `sample_${row._dataRow}_${Date.now()}.html`);
      fs.writeFileSync(tmpToClean, sampleContent, 'utf-8');
      sampleFile = tmpToClean;
    }
  }

  const title = rowTitle(row);
  console.log(`\n📝 Generating blog for: "${title}"  (style: ${formatLabel(format)})`);

  const args = ['tsx', 'scripts/generate_blog_chatgpt.ts', '--format', format, '--url', String(row.targetUrl || ''), '--title', title];
  if (sampleFile) args.push('--sample-file', sampleFile);

  return new Promise((resolve) => {
    const child = spawn('npx', args, { env: process.env });
    let stdout = '';
    const to = setTimeout(() => { try { child.kill(); } catch { /* noop */ } }, 35 * 60 * 1000);
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { process.stdout.write(d.toString()); }); // live progress → status banner
    child.on('close', () => {
      clearTimeout(to);
      if (tmpToClean) { try { fs.rmSync(tmpToClean, { force: true }); } catch { /* noop */ } }
      const lastLine = stdout.trim().split('\n').filter(Boolean).pop() || '';
      try {
        const out = JSON.parse(lastLine);
        if (out.status === 'success') { resolve({ title: out.title, description: out.description, html: out.html }); return; }
        console.log(`✗ Couldn't generate this blog: ${out.message}`);
      } catch {
        console.log('✗ ChatGPT did not return a finished blog (it may have timed out or the page changed).');
      }
      resolve(null);
    });
  });
}

/**
 * Generate a cover image via ChatGPT DALL-E 3 (scripts/generate_image.ts), uploaded
 * to ImageKit. Runs on its own dedicated ChatGPT profile (chatgpt-image-profile),
 * separate from generate()'s shared blog-writer profile — so pass() below runs this
 * concurrently with generate() instead of waiting for it to finish first.
 */
function generateImage(marketName: string, reportUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const args = ['tsx', 'scripts/generate_image.ts', '--market-name', marketName];
    if (reportUrl) args.push('--url', reportUrl);
    const child = spawn('npx', args, { env: process.env });
    let stdout = '';
    const to = setTimeout(() => { try { child.kill(); } catch { /* noop */ } }, 12 * 60 * 1000);
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { process.stdout.write(d.toString()); }); // live progress → status banner
    child.on('close', () => {
      clearTimeout(to);
      const lastLine = stdout.trim().split('\n').filter(Boolean).pop() || '';
      try {
        const out = JSON.parse(lastLine);
        if (out.status === 'success' && out.imageUrl) { resolve(out.imageUrl); return; }
        console.log(`✗ Couldn't generate a cover image: ${out.message || 'unknown error'}`);
      } catch {
        console.log('✗ Cover image step did not return a usable result.');
      }
      resolve('');
    });
  });
}

/** Force the real cover image into the article HTML — replaces a model-written <img> if any, else prepends one. */
function injectCoverImage(html: string, imageUrl: string, altText: string): string {
  if (!imageUrl) return html;
  const alt = altText.replace(/"/g, '&quot;');
  const imgTag = `<img src="${imageUrl}" alt="${alt} market research"/>`;
  return /<img\b[^>]*>/i.test(html) ? html.replace(/<img\b[^>]*>/i, imgTag) : `${imgTag}\n${html}`;
}

function writeCoverImageUrl(dataRow: number, imageUrl: string): void {
  const tmp = path.join(os.tmpdir(), `cover_${dataRow}_${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ 'Cover Image URL': imageUrl }), 'utf-8');
  spawnSync(PY, ['scripts/sheet_write.py', '--sheet', 'blog', '--name', NAME, '--row', String(dataRow), '--updates-file', tmp], { encoding: 'utf-8' });
  fs.rmSync(tmp, { force: true });
}

/** Record the chosen format/sample into a row's Format column (so the sheet shows it). */
function writeFormatCol(dataRow: number, value: string): void {
  const tmp = path.join(os.tmpdir(), `fmt_${dataRow}_${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ Format: value }), 'utf-8');
  spawnSync(PY, ['scripts/sheet_write.py', '--sheet', 'blog', '--name', NAME, '--row', String(dataRow), '--updates-file', tmp], { encoding: 'utf-8' });
  fs.rmSync(tmp, { force: true });
}

function writeRow(dataRow: number, res: { title: string; description: string; html: string }, coverImageUrl: string): void {
  const updates: Record<string, string> = {
    'Blog Content': res.html,
    'blogBatch': `BLOG-${new Date().toISOString().slice(0, 10)}-CG`,
  };
  if (res.title) updates['Blog Title'] = res.title;
  if (res.description) updates['Blog Description'] = res.description;
  if (coverImageUrl) updates['Cover Image URL'] = coverImageUrl;

  const tmp = path.join(os.tmpdir(), `blog_updates_${dataRow}_${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(updates), 'utf-8'); // JSON via Node, never PowerShell (safe HTML)
  const r = spawnSync(PY, ['scripts/sheet_write.py', '--sheet', 'blog', '--name', NAME, '--row', String(dataRow), '--updates-file', tmp], { encoding: 'utf-8' });
  fs.rmSync(tmp, { force: true });
  if (r.status !== 0) { console.log(`✗ Couldn't save to the sheet: ${(r.stderr || '').slice(0, 200)}`); return; }
  console.log(`✓ Saved to your sheet: "${res.title}" (~${wordCount(res.html)} words)`);
}

async function pass() {
  const rows = readUnprocessed().slice(0, LIMIT);
  if (!rows.length) {
    console.log('Nothing to generate — no rows have a URL with empty content. Add a row first.');
    return;
  }
  console.log(`Found ${rows.length} blog${rows.length === 1 ? '' : 's'} to generate.`);

  // Record the batch format/sample into each target row's Format column first.
  const overrideFmt = FORMAT_OVERRIDE
    ? (FORMAT_OVERRIDE === 'custom' && SAMPLE_OVERRIDE && fs.existsSync(SAMPLE_OVERRIDE)
        ? fs.readFileSync(SAMPLE_OVERRIDE, 'utf-8')
        : FORMAT_OVERRIDE)
    : '';

  let done = 0;
  for (const row of rows) {
    if (!String(row.targetUrl || '').trim()) continue;
    if (overrideFmt) writeFormatCol(row._dataRow, overrideFmt);

    const marketName = rowTitle(row);
    console.log(`\n🖼️  Generating cover image + article in parallel for: "${marketName}"`);

    // Separate ChatGPT profiles (chatgpt-image-profile vs chatgpt-profile) — safe to run together.
    const [coverImageUrl, res] = await Promise.all([
      generateImage(marketName, String(row.targetUrl || '')).then((url) => {
        if (url) { console.log(`✓ Cover image ready: ${url}`); writeCoverImageUrl(row._dataRow, url); }
        else console.log('⚠ Continuing without a cover image for this row.');
        return url;
      }),
      generate(row),
    ]);

    if (res && res.html) {
      const html = injectCoverImage(res.html, coverImageUrl, marketName);
      writeRow(row._dataRow, { ...res, html }, coverImageUrl);
      done++;
    }
  }
  console.log(`\n🏁 Finished. ${done} of ${rows.length} blog${rows.length === 1 ? '' : 's'} saved to your sheet.`);
}

async function main() {
  console.log(`Starting blog generation for "${NAME}"${LOOP ? ` (checking every ${INTERVAL_S}s)` : ''}…`);
  do {
    try { await pass(); } catch (e) { console.log('⚠ Something went wrong this run:', e instanceof Error ? e.message : e); }
    if (LOOP) await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
  } while (LOOP);
}

main();
