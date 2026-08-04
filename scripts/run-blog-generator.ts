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
 *   [--loop] [--interval 300] [--format-override seo-li|custom] [--sample-file path] [--image-prompt 1|2]
 */

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { acquireBrowserSlot } from '../src/utils/browserSlots.js';
import { acquireJobSlot, estimateWaitMs } from '../src/utils/jobQueue.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const NAME = (arg('--name') || process.env.WORKER_NAME || '').toLowerCase();
const LOOP = process.argv.includes('--loop');
const INTERVAL_S = Number(arg('--interval') || 300);
const LIMIT = Number(arg('--limit') || 3);
// Use the repo's venv Python (has google-auth/requests); fall back to system python3,
// or plain "python" on Windows, where "python3" is often just a broken Microsoft
// Store app-execution-alias stub rather than a real interpreter.
const PY = process.env.PYTHON
  || (fs.existsSync(path.resolve('venv/bin/python3')) ? path.resolve('venv/bin/python3')
    : process.platform === 'win32' ? 'python' : 'python3');
// Batch overrides (from the dashboard Generate modal): one format/sample for every row.
const FORMAT_OVERRIDE = (arg('--format-override') || '').trim();
const SAMPLE_OVERRIDE = (arg('--sample-file') || '').trim();
const IMAGE_PROMPT = (arg('--image-prompt') || '1').trim(); // '1' or '2' — which cover-image prompt to use
const FORCE = process.argv.includes('--force'); // skip the box-wide generation queue, run a 3rd+ concurrent pass anyway

// Mirrors generate_image.ts's own profile-path check: if this agent already
// has a dedicated, logged-in chatgpt-image-profile (existing VPS agents),
// image + text generation each get their own ChatGPT browser and can run in
// parallel as before. Agents with no dedicated image profile (e.g. local
// vishal) fall back to generate_image.ts sharing the text profile instead —
// which only one process can hold at a time, so those two steps must run
// one after another, not concurrently.
const isAbhinav = !NAME || NAME === 'abhinav';
const DEDICATED_IMAGE_PROFILE = path.resolve('.sessions-cookies', isAbhinav ? 'chatgpt-image-profile' : `chatgpt-image-profile-${NAME}`);
const HAS_DEDICATED_IMAGE_PROFILE = fs.existsSync(DEDICATED_IMAGE_PROFILE);
// spawn('npx', ...) is unreliable on Windows — npx is a .cmd shim (ENOENT
// without the extension) and even 'npx.cmd' can throw EINVAL depending on how
// Windows resolves it. Spawn node directly with the same --import=tsx loader
// used everywhere else in this repo instead, sidestepping .cmd resolution
// entirely. `tsxArgs` drops the old leading 'tsx' arg that npx used to consume.
function spawnTsx(tsxArgs: string[], env: NodeJS.ProcessEnv) {
  return spawn(process.execPath, ['--import=tsx', ...tsxArgs.slice(1)], { env });
}

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
  // format2/testing-demo are legacy values from old rows — no longer real
  // options, but still routed to the master prompt (anything non-'custom'
  // does) rather than erroring, so just label them the same as Sample 1.
  return ({ 'custom': 'your custom sample' } as Record<string, string>)[id] || 'Sample 1';
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

  const args = ['tsx', 'scripts/generate_blog_chatgpt.ts', '--agent', NAME, '--format', format, '--url', String(row.targetUrl || ''), '--title', title];
  if (sampleFile) args.push('--sample-file', sampleFile);

  return new Promise((resolve) => {
    const child = spawnTsx(args, process.env);
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
 * to ImageKit. Uses this agent's dedicated chatgpt-image-profile if one already
 * exists (own ChatGPT browser, runs in parallel with generate() below), otherwise
 * shares generate()'s chatgpt-profile and pass() runs the two sequentially instead
 * — see HAS_DEDICATED_IMAGE_PROFILE and generate_image.ts's own file header.
 */
function generateImage(marketName: string, reportUrl: string, imagePromptChoice: string): Promise<string> {
  return new Promise((resolve) => {
    const args = ['tsx', 'scripts/generate_image.ts', '--agent', NAME, '--market-name', marketName, '--image-prompt', imagePromptChoice];
    if (reportUrl) args.push('--url', reportUrl);
    const child = spawnTsx(args, process.env);
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

  // Box-wide generation queue — up to 2 agents generating at once, everyone
  // else waits their turn (or ticks "generate right now anyway" → --force).
  const releaseQueue = await acquireJobSlot('blog-gen', NAME, {
    force: FORCE,
    onWaiting: (status, position) => {
      const others = status.running.map((r) => r.agent).join(', ') || 'someone';
      const etaMs = estimateWaitMs('blog-gen', position);
      console.log(`⏳ Queued for a generation slot — you are #${position}, currently generating for: ${others} (~${Math.round(etaMs / 60000)} min estimated wait)`);
    },
  });

  // This agent's own browser slot, held for the whole pass — so this agent's
  // blog-gen browsers and its own posting browser (index.ts/scheduler-new.ts)
  // can never be open at the same time, while a DIFFERENT agent's slot is
  // completely independent and free to run concurrently.
  const releaseSlot = await acquireBrowserSlot('blog-gen', { agent: NAME });
  try {
    let done = 0;
    for (const row of rows) {
      if (!String(row.targetUrl || '').trim()) continue;
      if (overrideFmt) writeFormatCol(row._dataRow, overrideFmt);

      const marketName = rowTitle(row);
      // Row's own "Image Prompt" pick (from the Submit form) wins; falls back to the
      // batch/CLI default so old rows and the agent-page Generate modal still work.
      const imagePromptChoice = String(row['Image Prompt'] || '').trim() || IMAGE_PROMPT;

      const withCoverLog = (p: Promise<string>) => p.then((url) => {
        if (url) { console.log(`✓ Cover image ready: ${url}`); writeCoverImageUrl(row._dataRow, url); }
        else console.log('⚠ Continuing without a cover image for this row.');
        return url;
      });

      let coverImageUrl: string;
      let res: { title: string; description: string; html: string } | null;
      if (HAS_DEDICATED_IMAGE_PROFILE) {
        // Separate ChatGPT profiles (chatgpt-image-profile vs chatgpt-profile) — safe to run together.
        console.log(`\n🖼️  Generating cover image + article in parallel for: "${marketName}"`);
        [coverImageUrl, res] = await Promise.all([
          withCoverLog(generateImage(marketName, String(row.targetUrl || ''), imagePromptChoice)),
          generate(row),
        ]);
      } else {
        // Sharing one ChatGPT profile (no dedicated image login for this agent) — a
        // second logged-in profile for the same account gets its session killed
        // server-side the moment it's used (OpenAI's anti-hijack defense, not
        // fixable by copying cookies more carefully), and Chrome only allows one
        // process per profile dir at a time either way — so these run one after
        // another instead.
        console.log(`\n🖼️  Generating cover image for: "${marketName}"`);
        coverImageUrl = await withCoverLog(generateImage(marketName, String(row.targetUrl || ''), imagePromptChoice));
        res = await generate(row);
      }

      if (res && res.html) {
        const html = injectCoverImage(res.html, coverImageUrl, marketName);
        writeRow(row._dataRow, { ...res, html }, coverImageUrl);
        done++;
      }
    }
    console.log(`\n🏁 Finished. ${done} of ${rows.length} blog${rows.length === 1 ? '' : 's'} saved to your sheet.`);
  } finally {
    releaseSlot();
    releaseQueue();
  }
}

async function main() {
  console.log(`Starting blog generation for "${NAME}"${LOOP ? ` (checking every ${INTERVAL_S}s)` : ''}…`);
  do {
    try { await pass(); } catch (e) { console.log('⚠ Something went wrong this run:', e instanceof Error ? e.message : e); }
    if (LOOP) await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
  } while (LOOP);
}

main();
