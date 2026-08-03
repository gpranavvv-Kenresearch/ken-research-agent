/**
 * generate_blog_chatgpt.ts — generate a blog by driving the user's ChatGPT.
 *
 * Flow: open the agent's logged-in ChatGPT (default model) → paste the chosen
 * format's sample HTML as a style template + the report url/title → wait for the
 * response to finish (~10-15 min) → extract Title / Description / Content(HTML).
 * Handles BOTH output shapes: a ```html code block, or raw HTML as message text.
 *
 * Reuses the ChatGPT persistent-profile automation pattern from generate_image.ts.
 * Emits a single last-line JSON: {"status":"success","title","description","html"}.
 *
 * Usage:
 *   npx tsx scripts/generate_blog_chatgpt.ts --agent abhinav --format format2 \
 *       --url "<report url>" --title "<report title>" [--session-dir <dir>]
 */

import { chromium, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const agent      = (arg('--agent') || '').toLowerCase();
const format     = (arg('--format') || 'seo-li').toLowerCase();
const url        = arg('--url') || '';
const title      = arg('--title') || '';
const sessionArg = arg('--session-dir');
const sampleArg  = arg('--sample-file'); // custom format: user-pasted sample blog HTML

function out(obj: Record<string, unknown>): never {
  // Last stdout line is the machine-readable contract (matches generate_image.ts).
  console.log(JSON.stringify(obj));
  process.exit(obj.status === 'success' ? 0 : 1);
}

/** Write a live progress line straight to the shared log (avoids stdout buffering). */
function progress(msg: string): void {
  const f = process.env.BLOG_LOG;
  if (f) { try { fs.appendFileSync(f, msg + '\n'); } catch { /* noop */ } }
  else console.error(msg);
}

if (!url || !title) out({ status: 'error', message: '--url and --title are required' });

// format id → sample HTML file (the style template shown to ChatGPT)
const SAMPLE_BY_FORMAT: Record<string, string> = {
  'seo-li': 'dashboard/public/samples/format-1.html',
  'format2': 'dashboard/public/samples/format-2.html',
  'testing-demo': 'dashboard/public/samples/format-3.html',
  'custom': 'dashboard/public/samples/format-1.html',
};

const CHROME_PATH = process.env.CHROME_PATH || undefined;
const CHATGPT_URL = 'https://chatgpt.com/';
const RESPONSE_TIMEOUT_MS = 30 * 60 * 1000;   // hard cap 30 min
const POLL_MS = Math.round(3.5 * 60 * 1000);  // check every ~3.5 min (generation is 12-15+ min)

// One profile PER AGENT (not shared team-wide) so two agents can each generate
// blog text concurrently without fighting over the same Chrome profile lock.
// "abhinav" keeps the original un-suffixed dir (already logged in there before
// this became per-agent); every other agent gets its own suffixed dir.
function sessionDir(): string {
  if (sessionArg) return path.resolve(sessionArg);
  const a = agent || 'abhinav';
  return path.resolve('.sessions-cookies', a === 'abhinav' ? 'chatgpt-profile' : `chatgpt-profile-${a}`);
}

function loadSample(): string {
  // Custom format (or any override): use the user-pasted sample blog.
  if (sampleArg) {
    const sp = path.resolve(sampleArg);
    if (fs.existsSync(sp)) {
      const txt = fs.readFileSync(sp, 'utf-8').trim();
      if (txt) return txt;
    }
  }
  const rel = SAMPLE_BY_FORMAT[format] || SAMPLE_BY_FORMAT['seo-li'];
  const p = path.resolve(rel);
  if (!fs.existsSync(p)) return ''; // still generate, just without a template
  return fs.readFileSync(p, 'utf-8');
}

function buildPrompt(sampleHtml: string): string {
  const sampleBlock = sampleHtml
    ? `Here is a sample blog article in HTML — use it ONLY as a style/structure reference (do NOT copy its topic or text):\n\n<<<SAMPLE_HTML>>>\n${sampleHtml}\n<<<END_SAMPLE>>>\n\n`
    : '';
  return (
    sampleBlock +
    `Write a BRAND-NEW blog article in the same HTML structure and style for this Ken Research market report:\n\n` +
    `Report Title: ${title}\n` +
    `Report URL: ${url}\n\n` +
    `Strict rules:\n` +
    `1. Length: a full article, about 1500 words.\n` +
    `2. Output valid, clean HTML for the content only — same tag family as the sample. No markdown. Use plain double-quote (") attribute delimiters; never URL-encode quote characters.\n` +
    `3. Interlinks: link ONLY to Ken Research pages (kenresearch.com) and 2-3 relevant government / official statistics websites. Do NOT link to any competitor or other commercial site.\n` +
    `4. Add UTM parameters to EVERY link href: append utm_source=linkedin&utm_medium=referral&utm_campaign=automation (use ? if the URL has no query string, else &).\n` +
    `5. Use the report URL (${url}) as the primary Ken Research link, with the UTM parameters.\n` +
    `6. The Title line MUST follow this EXACT pattern: "{Market name} {a 4-5 word trendy market hook} : Ken Research {varied verb + short key issue}". The trendy hook is a data-driven or catchy angle such as a market-size figure ("Hits USD 4 Billion"), a growth rate ("Hits 25% CAGR"), or another trendy market movement. After the colon it MUST start with "Ken Research" but VARY the verb each time (do NOT always use "Flags") — e.g. Flags, Reveals, Warns, Highlights, Maps, Tracks, Uncovers, Signals. Examples: "US Smokeless Cigarettes Market Hits USD 4 Billion : Ken Research Flags FDA Authorization Shift"; "India Artificial Intelligence Market Hits 25% CAGR : Ken Research Warns of Compute Bottlenecks"; "Spain Solar Rooftop Market Surges on New Subsidies : Ken Research Highlights Policy Volatility".\n\n` +
    `Respond in EXACTLY this structure and nothing else:\n` +
    `Title: <exactly in the rule-6 pattern>\n` +
    `Description: <2-3 sentence meta description on one line>\n` +
    `<the full HTML content>`
  );
}

async function isLoggedIn(page: Page): Promise<boolean> {
  // ChatGPT can be slow to render on the VPS — poll up to ~40s for the composer
  // (or any logged-in affordance) before deciding it's logged out.
  const deadline = Date.now() + 40000;
  const selectors = [
    '#prompt-textarea',
    'div[contenteditable="true"]',
    '[data-testid="composer-text-input"]',
    'button[data-testid="send-button"]',
    'button[aria-label*="New chat"]',
  ];
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      if (await page.locator(sel).first().isVisible({ timeout: 1200 }).catch(() => false)) return true;
    }
    await page.waitForTimeout(1500);
  }
  return false;
}

/** Wait until the assistant response finished streaming (send re-enabled, text stable). */
async function waitForCompletion(page: Page): Promise<void> {
  const start = Date.now();
  let goneChecks = 0;
  let lastLength = -1;
  let unchangedChecks = 0;
  await page.waitForTimeout(60000); // let generation get underway (~1 min) before first check
  while (Date.now() - start < RESPONSE_TIMEOUT_MS) {
    // Check every ~3.5 min: ChatGPT shows a Stop button while streaming. When the
    // Stop button has been gone for two checks in a row (with a real reply present),
    // the blog is finished. Robust to tiny page changes (Sources panel, etc.).
    const stopping = await page
      .locator('button[data-testid="stop-button"], button[aria-label*="Stop streaming"], button[aria-label*="Stop"]')
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    const text = await lastAssistantText(page);
    progress(`  …checked at ${Math.round((Date.now() - start) / 60000)} min: ${stopping ? 'still writing' : 'looks finished'} (${text.length} characters so far)`);
    if (!stopping && text.length > 500) {
      goneChecks++;
      if (goneChecks >= 2) return; // Stop button gone for ~2 checks → done
    } else {
      goneChecks = 0;
    }
    // Second, independent completion signal: the Stop-button check can get stuck
    // reporting "still writing" (a UI glitch) even though generation actually
    // finished. If the character count is IDENTICAL for 3 checks in a row, the
    // text has genuinely stopped changing — treat that as done regardless of
    // what the Stop button says, instead of waiting out the full 30 min timeout.
    if (text.length > 500 && text.length === lastLength) {
      unchangedChecks++;
      if (unchangedChecks >= 3) {
        progress(`  Character count unchanged for 3 checks in a row — treating as finished.`);
        return;
      }
    } else {
      unchangedChecks = 0;
    }
    lastLength = text.length;
    await page.waitForTimeout(POLL_MS);
  }
}

async function lastAssistantText(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Prefer the assistant message element; fall back to page text from the last
    // "Title:" (the response marker) so extraction survives ChatGPT DOM changes.
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    let text = msgs.length ? ((msgs[msgs.length - 1] as HTMLElement).innerText || '') : '';
    if (text.replace(/\s/g, '').length < 100) {
      const body = (document.body as HTMLElement).innerText || '';
      const idx = body.lastIndexOf('Title:');
      if (idx >= 0) text = body.slice(idx);
    }
    return text;
  });
}

/** Extract Title / Description / HTML from the last assistant message (both shapes). */
async function extract(page: Page): Promise<{ title: string; description: string; html: string }> {
  const data = await page.evaluate(() => {
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    const last = msgs.length ? (msgs[msgs.length - 1] as HTMLElement) : null;
    let code = '';
    let text = last ? (last.innerText || '') : '';
    if (last) { const c = last.querySelector('pre code, pre'); code = c ? (c.textContent || '') : ''; }
    // Fallback: page text from the last "Title:" (works regardless of DOM structure).
    if (text.replace(/\s/g, '').length < 100) {
      const body = (document.body as HTMLElement).innerText || '';
      const idx = body.lastIndexOf('Title:');
      if (idx >= 0) text = body.slice(idx);
    }
    return { code, text };
  });

  const text = data.text || '';
  const titleMatch = text.match(/^\s*Title:\s*(.+)$/im);
  const descMatch = text.match(/^\s*Description:\s*(.+)$/im);
  const blogTitle = titleMatch ? titleMatch[1].trim() : title;
  const description = descMatch ? descMatch[1].trim() : '';

  let html = '';
  if (data.code && data.code.includes('<')) {
    html = data.code.trim();
  } else {
    // Raw HTML in the message text: from the first tag to the last tag (drops any
    // trailing page chrome like "ChatGPT can make mistakes" / "Sources").
    const firstTag = text.indexOf('<');
    html = firstTag >= 0 ? text.slice(firstTag) : text;
    const lastTag = html.lastIndexOf('>');
    if (lastTag >= 0) html = html.slice(0, lastTag + 1);
    html = html.trim();
  }
  return { title: blogTitle, description, html };
}

/** Fix ChatGPT quirks: mis-encoded closing quotes (%22) and web-search citation tags. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/%22(?=[\s>])/g, '"')   // closing attribute quote emitted as %22
    .replace(/%22$/g, '"')
    .replace(/\s*:contentReference\[[^\]]*\]\{[^}]*\}/g, '') // ChatGPT web-search citation artifacts
    .trim();
}

/** Safety net: ensure every http(s) link carries the required UTM params. */
function injectUtm(html: string): string {
  const utm = 'utm_source=linkedin&utm_medium=referral&utm_campaign=automation';
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, href: string) => {
    if (/utm_source=/.test(href)) return m;
    const sep = href.includes('?') ? '&' : '?';
    return `href="${href}${sep}${utm}"`;
  });
}

async function main() {
  const dir = sessionDir();
  fs.mkdirSync(dir, { recursive: true });

  const context = await chromium.launchPersistentContext(dir, {
    headless: false,
    channel: 'chrome',
    executablePath: CHROME_PATH && fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check', '--disable-infobars'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = context.pages()[0] ?? (await context.newPage());
  try {
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    progress('Opened ChatGPT.');
    if (!(await isLoggedIn(page))) {
      // isLoggedIn()'s own 40s poll isn't a real login window — a first-time
      // ChatGPT login (email, password, verification) almost never finishes
      // that fast. Give the human an actual chance: wait here for Enter instead
      // of closing the browser out from under a login in progress.
      progress('Not logged in — log in to ChatGPT in the browser window, then press Enter here to continue.');
      await new Promise<void>((resolve) => {
        process.stdin.resume();
        process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
      });
      if (!(await isLoggedIn(page))) {
        const loginBtn = await page.locator('button:has-text("Log in"), a:has-text("Log in"), :text("Sign up")').first().isVisible({ timeout: 1000 }).catch(() => false);
        const bodyPeek = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '').catch(() => '');
        console.error('[dbg] NOT-LOGGED-IN url=', page.url(), 'loginBtnVisible=', loginBtn, 'bodyPeek=', JSON.stringify(bodyPeek));
        await page.screenshot({ path: path.join(os.tmpdir(), 'blog-debug.png'), fullPage: false }).catch((e) => console.error('[dbg] shot failed', e?.message));
        await context.close();
        out({ status: 'error', message: 'Still not logged in to ChatGPT after waiting — try again and make sure the login fully completes before pressing Enter.' });
        return;
      }
      progress('Logged in — continuing.');
    }

    const prompt = buildPrompt(loadSample());
    const input = page.locator('#prompt-textarea, div[contenteditable="true"]').first();
    await input.waitFor({ state: 'visible', timeout: 20000 });
    progress('Logged in. Sending the prompt to ChatGPT…');
    await input.click();
    await page.keyboard.insertText(prompt); // reliable for ChatGPT's contenteditable + large text
    await page.waitForTimeout(1000);

    // Submit (button, else Enter).
    const sendBtn = page.locator('button[data-testid="send-button"], button[aria-label="Send prompt"]').first();
    if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) await sendBtn.click();
    else await page.keyboard.press('Enter');
    progress('Prompt sent — ChatGPT is writing the blog now (about 12-15 minutes)…');

    await waitForCompletion(page);
    progress('ChatGPT finished writing — extracting and saving the blog…');
    const { title: bTitle, description, html } = await extract(page);
    await context.close();

    if (!html || html.length < 100) out({ status: 'error', message: 'no HTML content extracted from ChatGPT response' });
    out({ status: 'success', title: bTitle, description, html: injectUtm(sanitizeHtml(html)) });
  } catch (err) {
    await context.close().catch(() => {});
    out({ status: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

main();
