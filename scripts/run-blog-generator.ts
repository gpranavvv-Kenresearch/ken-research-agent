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
import { runBlogSanityChecks } from '../src/agents/blogSanityAgent.js';
import { validateBrandAuthority } from '../src/agents/blogBrandValidator.js';
import { applyPreferredSourceCTA, validatePreferredSourceCTA, PreferredSourceMode } from '../src/agents/blogPreferredSourceAgent.js';

// 'tracked' uses the approved encurtador.dev/acesse.one short URL. Single
// constant so the mode can be flipped in one place if ever needed.
const PREFERRED_SOURCE_MODE: PreferredSourceMode = 'tracked';

// This script is only ever used for actual generation (scheduled or a
// dashboard "generate now" click) — never for a manual ChatGPT login, which
// is its own separate standalone invocation of generate_blog_chatgpt.ts /
// generate_image.ts directly.
//
// Headed vs headless for the ChatGPT windows: HEADED whenever a display is
// available, headless only when there is none. chatgpt.com sits behind a
// Cloudflare challenge that never clears in headless Chrome — the page just
// stays on "Just a moment..." — so a headless run reads every profile as
// "not logged in" even when the session is perfectly valid (this took blog
// generation to zero for every agent from 2026-09-02 until it was caught).
// The VPS runs everything on the Xvfb :99 virtual display (DISPLAY is set by
// the rotation / cron), so it stays headed there; a machine with no display
// at all (a Windows box running this unattended) gets headless as the only
// option. An explicit GEN_HEADLESS in the environment always wins. Set on
// process.env so it flows through the existing spawnTsx(args, process.env)
// calls below without touching each call site.
if (!process.env.GEN_HEADLESS) {
  process.env.GEN_HEADLESS = process.env.DISPLAY ? 'false' : 'true';
}

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
  const t = String(row['Report Title'] || row.title || row['Blog Title'] || '').trim();
  if (t) return t;
  // No title in the sheet at all — derive one from the report URL's slug
  // ("…/oman-physiotherapy-equipment-market" → "Oman Physiotherapy Equipment
  // Market") rather than failing the row outright with "--title is required"
  // on every turn until someone notices.
  const slug = String(row.targetUrl || '').split('?')[0].replace(/\/+$/, '').split('/').pop() || '';
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

function readUnprocessed(): BlogRow[] {
  const r = spawnSync(PY, ['scripts/sheet_read.py', '--sheet', 'blog', '--name', NAME, '--action', 'blog-unprocessed', '--limit', String(LIMIT)], { encoding: 'utf-8' });
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
    const to = setTimeout(() => { try { child.kill(); } catch { /* noop */ } }, 20 * 60 * 1000); // per-blog watchdog: drop a stuck blog after 20 min, move on
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

// A real Ken Research article ALWAYS has an <h1> and at least one <h2>. When
// ChatGPT refuses ("RESEARCH BLOCKED: Primary report could not be verified", a
// transient bot-check, an apology, etc.) the response has neither — so that's
// our signal it isn't a valid blog and must be regenerated, not saved.
function isValidBlog(html: string | undefined): boolean {
  if (!html) return false;
  if (/RESEARCH BLOCKED/i.test(html)) return false;
  return /<h1[\s>]/i.test(html) && /<h2[\s>]/i.test(html);
}

/** Mark a row as blocked so it's never re-picked: writes blogBatch="BLOCKED-<ist>".
 * The blog-unprocessed filter skips BLOCKED rows, and posting ignores it (Blog
 * Content stays empty). Frees the loop to move on to reports ChatGPT CAN verify. */
function markBlocked(dataRow: number): void {
  const tmp = path.join(os.tmpdir(), `blk_${dataRow}_${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ blogBatch: `BLOCKED-${istTimestamp()}` }), 'utf-8');
  spawnSync(PY, ['scripts/sheet_write.py', '--sheet', 'blog', '--name', NAME, '--row', String(dataRow), '--updates-file', tmp], { encoding: 'utf-8' });
  try { fs.rmSync(tmp, { force: true }); } catch { /* noop */ }
}

const MAX_GEN_ATTEMPTS = 2;

/** Generate the article. If ChatGPT refuses with RESEARCH BLOCKED (it can't
 * verify this report), that's deterministic — don't retry: mark the row blocked
 * so it's never re-picked, and skip to the next row. Only a non-refusal invalid
 * (cut-off / transient) is retried. Never saves a refusal as the blog. */
async function generateWithRetry(row: BlogRow): Promise<{ title: string; description: string; html: string } | null> {
  for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
    const res = await generate(row);
    if (res && isValidBlog(res.html)) return res;
    if (res && /RESEARCH\s*BLOCKED/i.test(res.html || '')) {
      console.log('⏭ RESEARCH BLOCKED — ChatGPT can\'t verify this report; marking blocked + skipping to the next row.');
      const dr = Number((row as { _dataRow?: number })._dataRow);
      if (dr > 0) markBlocked(dr);
      return null;
    }
    console.log(`⚠ Attempt ${attempt}/${MAX_GEN_ATTEMPTS}: no valid blog — retrying…`);
  }
  console.log('✗ No valid blog after retries — leaving this row for a later run.');
  return null;
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

// A failed image (rate-limit modal, a transient DOM glitch) is worth one retry
// before giving up on it — but NOT unbounded retries: a genuinely exhausted
// ChatGPT Plus image quota can take hours to reset (confirmed 2026-08-06 — "You're
// out of image creations for now... wait until 2:18 PM"), and retrying into that
// would just stall the whole batch for hours instead of one row. 2 total
// attempts catches transient failures without risking that.
const MAX_IMAGE_ATTEMPTS = 2;

/** Generate the cover image, retrying once on failure before giving up on this row. */
async function generateImageWithRetry(marketName: string, reportUrl: string, imagePromptChoice: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
    const url = await generateImage(marketName, reportUrl, imagePromptChoice);
    if (url) return url;
    if (attempt < MAX_IMAGE_ATTEMPTS) {
      console.log(`⏳ Cover image attempt ${attempt}/${MAX_IMAGE_ATTEMPTS} failed — retrying for: "${marketName}"`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  console.log(`✗ Cover image failed after ${MAX_IMAGE_ATTEMPTS} attempts — saving this row without one.`);
  return '';
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

/** "YYYY-MM-DD-HH:MM:SS" in IST — used to timestamp blogBatch so generation duration is derivable later. */
function istTimestamp(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const iso = ist.toISOString(); // e.g. 2026-08-06T00:14:32.000Z (already IST-shifted above)
  return `${iso.slice(0, 10)}-${iso.slice(11, 19)}`;
}

function writeRow(dataRow: number, res: { title: string; description: string; html: string }, coverImageUrl: string): void {
  const updates: Record<string, string> = {
    'Blog Content': res.html,
    'blogBatch': `BLOG-${istTimestamp()}-CG`,
  };
  if (res.title) updates['Blog Title'] = res.title;
  if (res.description) {
    updates['Blog Description'] = res.description;
    updates['Blog Caption'] = res.description; // same Ken Research-style description into the Caption column too
  }
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
          withCoverLog(generateImageWithRetry(marketName, String(row.targetUrl || ''), imagePromptChoice)),
          generateWithRetry(row),
        ]);
      } else {
        // Sharing one ChatGPT profile (no dedicated image login for this agent) — a
        // second logged-in profile for the same account gets its session killed
        // server-side the moment it's used (OpenAI's anti-hijack defense, not
        // fixable by copying cookies more carefully), and Chrome only allows one
        // process per profile dir at a time either way — so these run one after
        // another instead.
        console.log(`\n🖼️  Generating cover image for: "${marketName}"`);
        coverImageUrl = await withCoverLog(generateImageWithRetry(marketName, String(row.targetUrl || ''), imagePromptChoice));
        res = await generateWithRetry(row);
      }

      if (res && res.html) {
        const html = injectCoverImage(res.html, coverImageUrl, marketName);
        const sanity = runBlogSanityChecks(html, { title: marketName });
        if (sanity.changes.length > 0) {
          console.log(`   [BLOG SANITY] Applied: ${sanity.changes.join(', ')}`);
        }

        // Writes into the ONE shared Blog Content cell every off-page
        // platform poster reads from, so this one insertion point covers
        // all of them.
        const cta = applyPreferredSourceCTA(sanity.html, { mode: PREFERRED_SOURCE_MODE, title: res.title || marketName });
        console.log(`   [PREFERRED SOURCE CTA] ${cta.applied ? `applied (${cta.placement})` : `not applied (${cta.placement})`}`);
        if (cta.applied) {
          const ctaCheck = validatePreferredSourceCTA(cta.html, PREFERRED_SOURCE_MODE);
          if (ctaCheck.status !== 'PASS') {
            console.log(`   [PREFERRED SOURCE CTA] ISSUE: ${ctaCheck.issues.join(' | ')}`);
          }
        }

        // Log-only for now — the generation prompt already enforces most of
        // this; a false block here would lose real, otherwise-good content.
        const brandCheck = validateBrandAuthority(cta.html, { title: res.title || marketName });
        if (brandCheck.status !== 'PASS') {
          const issueSummary = brandCheck.issues.map((i) => `${i.rule}: ${i.problem}`).join(' | ');
          console.log(`   [BRAND CHECK] ${brandCheck.status} (score ${brandCheck.score}/10): ${issueSummary}`);
        } else {
          console.log(`   [BRAND CHECK] PASS (score ${brandCheck.score}/10)`);
        }
        writeRow(row._dataRow, { ...res, html: cta.html }, coverImageUrl);
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
