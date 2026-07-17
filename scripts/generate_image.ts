/**
 * generate_image.ts — Generate a cover image via ChatGPT DALL-E 3 (v5 prompt) and
 * upload to ImageKit. Ported from Analytical-AIO-Blogs' generate_image.js, using the
 * same Lexical-safe composer paste helper (chatgpt_composer.ts) and image-polling
 * logic, adapted to this repo's CLI args and ImageKit upload step.
 *
 * Runs on a SEPARATE ChatGPT profile from the blog-text writer
 * (.sessions-cookies/chatgpt-image-profile/, vs generate_blog_chatgpt.ts's
 * .sessions-cookies/chatgpt-profile/) so image generation can run truly in
 * parallel with text generation — no shared-profile lock contention.
 *
 * Usage:
 *   npx tsx scripts/generate_image.ts \
 *     --market-name "India Cold Storage Market" \
 *     --market-size "USD 2.68 Billion" \
 *     --cagr "12.5% CAGR" \
 *     --forecast "USD 5.1 Billion by 2030"
 *
 * Outputs JSON to stdout:
 *   {"status":"success","imageUrl":"https://ik.imagekit.io/..."}
 *   {"status":"error","message":"..."}
 */

import { chromium, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pasteIntoChatGPTComposer } from './chatgpt_composer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const get  = (flag: string, fallback = '') => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const marketName = get('--market-name', 'Market Intelligence Report');
const marketSize = get('--market-size', '');
const cagr       = get('--cagr', '');
const forecast   = get('--forecast', '');
const sectorArg  = get('--sector', '');
const countryArg = get('--country', 'Global');
const reportUrl  = get('--url', '');

// ── ImageKit ──────────────────────────────────────────────────────────────────
const IMAGEKIT_PRIVATE_KEY = 'private_MkJ4nzxRoVz+dDpEeFUTryhRXVM=';
const IMAGEKIT_FOLDER      = '/microblogs';

// ── Paths ─────────────────────────────────────────────────────────────────────
const SESSIONS_DIR    = path.join(__dirname, '..', '.sessions-cookies');
// Dedicated profile — deliberately NOT the same one generate_blog_chatgpt.ts uses,
// so this can run concurrently with blog-text generation without profile-lock conflicts.
const CHATGPT_PROFILE = path.join(SESSIONS_DIR, 'chatgpt-image-profile');
const TMP_DIR          = path.join(__dirname, '..', 'generated_images');
fs.mkdirSync(CHATGPT_PROFILE, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Sector color system (primary / secondary / accent-name) ───────────────────
// The 5 rows marked "live" are the exact hex values from the v5 pipeline doc;
// the rest extend the same keyword-detection heuristic this repo already used,
// restyled into the primary/secondary pairing (approximate — adjust if a more
// complete table becomes available).
interface SectorColors { sectorName: string; primary: string; secondary: string; accentName: string; }
const SECTOR_TABLE: Record<string, SectorColors> = {
  logistics:    { sectorName: 'Logistics & Supply Chain',       primary: '#0A84FF', secondary: '#38BDF8', accentName: 'Electric Blue' }, // live
  healthcare:   { sectorName: 'Healthcare & Pharma',             primary: '#00BFA5', secondary: '#2DD4BF', accentName: 'Teal' },          // live
  fintech:      { sectorName: 'Fintech & Financial Services',    primary: '#DC143C', secondary: '#FB7185', accentName: 'Crimson' },       // live
  technology:   { sectorName: 'Technology',                      primary: '#8B5CF6', secondary: '#A78BFA', accentName: 'Violet' },        // live
  energy:       { sectorName: 'Energy & Power',                  primary: '#10B981', secondary: '#34D399', accentName: 'Emerald' },       // live
  agriculture:  { sectorName: 'Food & Agriculture',               primary: '#16A34A', secondary: '#4ADE80', accentName: 'Green' },
  automotive:   { sectorName: 'Automotive & Mobility',            primary: '#EA580C', secondary: '#FB923C', accentName: 'Orange' },
  retail:       { sectorName: 'Retail & Consumer',                primary: '#DB2777', secondary: '#F472B6', accentName: 'Pink' },
  education:    { sectorName: 'Education & Training',             primary: '#4F46E5', secondary: '#818CF8', accentName: 'Indigo' },
  construction: { sectorName: 'Real Estate & Construction',       primary: '#B45309', secondary: '#FBBF24', accentName: 'Amber' },
  default:      { sectorName: 'Market Intelligence',              primary: '#CC2222', secondary: '#EF4444', accentName: 'Red' },          // live
};

function detectSector(name: string, explicitSector = ''): SectorColors {
  const requested = explicitSector.trim().toLowerCase();
  if (requested && SECTOR_TABLE[requested]) return SECTOR_TABLE[requested];

  const n = name.toLowerCase();
  if (/logistics|courier|freight|supply chain|cold storage|warehouse|shipping/.test(n)) return SECTOR_TABLE.logistics;
  if (/pharma|healthcare|medical|hospital|clinical|diagnostic|biotech|ai in health/.test(n)) return SECTOR_TABLE.healthcare;
  if (/fintech|payment|banking|insurance|lending|financial|investment/.test(n)) return SECTOR_TABLE.fintech;
  if (/technology|software|saas|ai|cloud|data|digital|cyber|iot|semiconductor/.test(n)) return SECTOR_TABLE.technology;
  if (/energy|power|solar|wind|renewable|oil|gas|petroleum|electricity/.test(n)) return SECTOR_TABLE.energy;
  if (/food|agriculture|agricultural|surfactant|edible|dairy|beverage|crop|grain|organic|meat/.test(n)) return SECTOR_TABLE.agriculture;
  if (/automotive|car|vehicle|ev|electric|bus|motor|tire|rental/.test(n)) return SECTOR_TABLE.automotive;
  if (/retail|consumer|fashion|cosmetic|luxury|apparel|ecommerce/.test(n)) return SECTOR_TABLE.retail;
  if (/education|training|university|learning|academic|school/.test(n)) return SECTOR_TABLE.education;
  if (/real estate|construction|housing|property|building|infrastructure/.test(n)) return SECTOR_TABLE.construction;
  return SECTOR_TABLE.default;
}

/**
 * Instruction (not a pre-written scene) telling ChatGPT to invent the visual
 * itself based on what the market actually is. A hardcoded keyword→scene
 * lookup table was tried here before and consistently failed for anything
 * outside ~10 categories — e.g. "Sour Milk Drinks Market" matched none of the
 * keywords (not even the food/agriculture pattern, which only checked for
 * "food|agriculture|crop|grain") and silently fell back to a generic
 * "corporate boardroom with people" image that had nothing to do with the
 * topic. ChatGPT already knows what any given market actually involves —
 * asking it to reason about that directly is more robust than any keyword
 * list could ever be, and scales to markets no one anticipated.
 */
function sceneInstruction(name: string): string {
  return `Think about what "${name}" actually is and what its real-world products, equipment, facilities, or processes look like — then invent 4-6 SPECIFIC, RELEVANT visual elements for a scene built entirely from that. Do NOT default to a generic corporate boardroom, meeting room, or people in suits sitting around a table — that has nothing to do with any specific market and must be avoided. The scene must be immediately recognizable as belonging to THIS exact market, not a generic "business intelligence" placeholder.`;
}

function buildImagePrompt(name: string, size: string, cagrVal: string, forecastVal: string, country: string, reportUrl: string, explicitSector = ''): string {
  const currentYear = new Date().getFullYear();
  const forecastYear = currentYear + 5;
  const sector = detectSector(name, explicitSector);
  const scene = sceneInstruction(name);

  // If we already have real numbers (from the row/sheet), hand them over as fact —
  // no need for GPT to re-research those specific fields. Anything missing, GPT
  // must research itself (via the report URL if given, else a live web search) —
  // never invent figures.
  const knownFacts = [
    size && `Market Size: ${size} (${currentYear})`,
    cagrVal && `CAGR: ${cagrVal}`,
    forecastVal && `Forecast: ${forecastVal}`,
  ].filter(Boolean).join('\n');

  const researchBlock = reportUrl
    ? `STEP 1 — RESEARCH (do this before designing anything):
Visit ${reportUrl} and read it. Extract the REAL, current figures for this market:
- Market size (with currency and year)
- CAGR / growth rate
- Forecast value and year
- 2 more concrete, specific stats: one regulatory/policy figure, one demand-driver or segment/technology figure — each with an actual number.
${knownFacts ? `\nAlready confirmed (use these, don't override):\n${knownFacts}\n` : ''}
Use ONLY real figures found on that page (or, if the page doesn't have enough detail, from a quick web search on "${name} market size CAGR forecast"). Do NOT fabricate or estimate numbers — if a specific figure truly cannot be found, use a general qualitative phrase instead of a fake number for that one line only.

STEP 2 — DESIGN
`
    : `STEP 1 — RESEARCH (do this before designing anything):
${knownFacts
        ? `Use these confirmed figures:\n${knownFacts}\nResearch 2 more concrete, real stats for "${name}" (one regulatory/policy figure, one demand-driver or segment/technology figure, each with an actual number) via a quick web search.`
        : `No source URL was provided. Research real, current figures for "${name}" via a quick web search: market size (currency + year), CAGR, forecast value/year, plus 2 more concrete stats (regulatory/policy, demand-driver or segment). Do NOT fabricate or estimate — use only what you actually find.`}

STEP 2 — DESIGN
`;

  return `MASTER UNIVERSAL HORIZONTAL MARKET INTELLIGENCE COVER IMAGE PROMPT v5

ROLE
You are a world-class editorial visual designer, Bloomberg Intelligence art director, McKinsey report designer, and market intelligence cover specialist.

${researchBlock}
MARKET DETAILS TO VISUALIZE
Market: ${name}
Market Size: [from your research above — real figure + year]
Country: ${country || 'Global'}
Sector: ${sector.sectorName}
Forecast: Through ${forecastYear}

KEY MARKET STATISTICS (use the real figures from your research — render them as short punchy labels, not full sentences):
• [market size + CAGR + forecast value, from research]
• [the regulatory/policy stat, from research]
• [the demand-driver stat, from research]
• [the segment/technology stat, from research]

LEFT SIDE (35-45%): Information Hierarchy
• ${name}
• [market size figure + year, from research]
• [shortest, punchiest stat from research — 8-10 words max]
• [second short stat from research — 8-10 words max]

RIGHT SIDE (55-65%): Visual Scene
${scene}
Render this as ONE cohesive photographic/illustrative scene — NOT a dashboard of separate boxed panels, charts, or stat cards. At most one subtle data-visualization overlay (a single chart or map, low-opacity, blended into the scene) is allowed; do not add more than that, and never stack multiple small panels with their own numbers and labels next to each other — that reads as cluttered and small text inside those panels reliably renders as illegible garbage.

INDUSTRY COLOR SYSTEM (${sector.sectorName})
Primary: ${sector.primary} (${sector.accentName} dominant tone)
Secondary: ${sector.secondary} (${sector.accentName} lighter accent)
Accent: ${sector.secondary} (highlight / data-point color)

TEXT TO DISPLAY
(same 4 lines as the LEFT SIDE section above — the real market size and the two short stats from your research)

ABSOLUTE RULES — NON-NEGOTIABLE:
• NO Ken Research branding, text, watermarks, logos anywhere on the image
• NO company names, firm names, brand identifiers of any kind
• NO cartoonish or stock-photo aesthetic — premium editorial quality only
• NO dense data tables — use flowing infographic elements
• Image dimensions: 1672 x 941 pixels (16:9 horizontal)
• Style: Bloomberg Intelligence / McKinsey editorial — sophisticated, data-forward, professional

FINAL OUTPUT
Generate ONE premium horizontal market intelligence cover image for ${name} showing ${sector.sectorName.toLowerCase()} market momentum through ${forecastYear}.`;
}

// ── Multi-selector image finder (polls every 2s, up to 9 min) ─────────────────
async function findGeneratedImage(page: Page, timeout = 9 * 60 * 1000): Promise<{ src: string; naturalWidth: number; naturalHeight: number }> {
  const deadline = Date.now() + timeout;
  const started = Date.now();
  let lastLogAt = 0;
  while (Date.now() < deadline) {
    const found = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const candidates = imgs.filter((img: any) => Math.max(img.naturalWidth || 0, img.naturalHeight || 0) >= 800);
      if (!candidates.length) return null;
      const target = candidates[candidates.length - 1] as any;
      return { src: target.src, naturalWidth: target.naturalWidth, naturalHeight: target.naturalHeight };
    });

    if (found && found.src) {
      console.error(`[generate_image] Image found: ${found.naturalWidth}x${found.naturalHeight}`);
      return found;
    }

    const elapsed = Math.round((Date.now() - started) / 1000);
    if (elapsed - lastLogAt >= 20) {
      console.error(`[generate_image] Waiting for image... (${elapsed}s elapsed)`);
      lastLogAt = elapsed;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error('Generated image not found after timeout (no img with naturalWidth/Height >= 800)');
}

// ── ImageKit upload ────────────────────────────────────────────────────────────
async function uploadToImageKit(imageBuffer: Buffer, publicId: string): Promise<string> {
  const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;
  const fields: Record<string, string> = { fileName: `${publicId}.png`, folder: IMAGEKIT_FOLDER };

  let body = '';
  for (const [k, v] of Object.entries(fields))
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  body += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${publicId}.png"\r\nContent-Type: image/png\r\n\r\n`;
  const fullBody = Buffer.concat([Buffer.from(body), imageBuffer, Buffer.from(`\r\n--${boundary}--\r\n`)]);

  const auth = Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'upload.imagekit.io',
      path: '/api/v1/files/upload',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.url) resolve(parsed.url);
          else reject(new Error(`ImageKit error: ${data.slice(0, 300)}`));
        } catch { reject(new Error(`ImageKit parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const prompt = buildImagePrompt(marketName, marketSize, cagr, forecast, countryArg, reportUrl, sectorArg);
  console.error(`[generate_image] Starting for: ${marketName}`);

  const context = await chromium.launchPersistentContext(CHATGPT_PROFILE, {
    channel: 'chrome',
    headless: false,
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = context.pages()[0] ?? await context.newPage();

  try {
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // ── Login check ───────────────────────────────────────────────────────────
    const isLoggedIn = async () => {
      if (await page.locator('button:has-text("Log in"), a:has-text("Log in")').isVisible({ timeout: 1000 }).catch(() => false)) return false;
      for (const sel of ['a:has-text("New chat")', '[href="/new"]', 'button:has-text("New chat")', 'nav:has-text("New chat")']) {
        if (await page.locator(sel).first().isVisible({ timeout: 1000 }).catch(() => false)) return true;
      }
      return false;
    };

    if (await isLoggedIn()) {
      console.error('[generate_image] Already logged in ✓');
    } else {
      console.error('[generate_image] Not logged in — waiting up to 5 min for manual login...');
      const deadline = Date.now() + 5 * 60 * 1000;
      let ok = false;
      while (Date.now() < deadline) {
        await page.waitForTimeout(3000);
        if (await isLoggedIn()) { ok = true; break; }
        console.error(`[generate_image] Waiting for login... ${Math.round((deadline - Date.now()) / 1000)}s left`);
      }
      if (!ok) throw new Error('Login timeout — please log in to ChatGPT (image profile) via the dashboard login portal');
    }

    // ── Submit prompt (Lexical-safe paste — .fill() truncates multi-paragraph prompts) ──
    console.error('[generate_image] Pasting prompt...');
    await pasteIntoChatGPTComposer(page, prompt);
    await page.waitForTimeout(1000);

    const sendSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label*="Send"]',
      'button:has(svg)[data-disabled="false"]',
      'div[class*="composer"] button:last-child',
      'form button[type="submit"]',
    ];
    let sendClicked = false;
    for (const sel of sendSelectors) {
      if (await page.locator(sel).last().isVisible({ timeout: 3000 }).catch(() => false)) {
        await page.locator(sel).last().click();
        sendClicked = true;
        console.error(`[generate_image] Send clicked via "${sel}"`);
        break;
      }
    }
    if (!sendClicked) {
      await page.keyboard.press('Enter');
      console.error('[generate_image] Send via Enter key');
    }

    // ── Wait for image (polls every 2s, up to 9 min) ──────────────────────────
    console.error('[generate_image] Waiting for DALL-E image (up to 9 min)...');
    const generatedImage = await findGeneratedImage(page);

    // Stability wait — ChatGPT swaps the low-res preview for the full-res image shortly after.
    console.error('[generate_image] Stability wait (30s)...');
    await page.waitForTimeout(30 * 1000);

    const finalImage = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const candidates = imgs.filter((img: any) => Math.max(img.naturalWidth || 0, img.naturalHeight || 0) >= 800);
      if (!candidates.length) return null;
      const target = candidates[candidates.length - 1] as any;
      return { src: target.src, naturalWidth: target.naturalWidth, naturalHeight: target.naturalHeight };
    });
    const imgSrc = finalImage?.src || generatedImage.src;
    if (!imgSrc) throw new Error('Could not resolve final image src after stability wait');
    console.error(`[generate_image] Final image: ${finalImage?.naturalWidth ?? generatedImage.naturalWidth}x${finalImage?.naturalHeight ?? generatedImage.naturalHeight}px`);

    // ── Download via browser fetch (preserves auth cookies) ───────────────────
    console.error('[generate_image] Downloading via browser fetch...');
    const base64Data: string = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, imgSrc);

    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.error(`[generate_image] Downloaded ${imageBuffer.length} bytes`);

    const publicId = `${marketName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 55)}-${Math.floor(Date.now() / 1000)}`;

    // Local save (matches the Analytical-AIO-Blogs script's output convention)
    const today = new Date().toISOString().slice(0, 10);
    const localPath = path.join(TMP_DIR, `image_${today}_${publicId}.png`);
    fs.writeFileSync(localPath, imageBuffer);
    console.error(`[generate_image] Saved locally: ${localPath}`);

    // ── Upload to ImageKit (this repo's articles need a real public URL) ──────
    const imageUrl = await uploadToImageKit(imageBuffer, publicId);
    console.error(`[generate_image] Uploaded: ${imageUrl}`);

    console.log(JSON.stringify({ status: 'success', imageUrl, localPath }));
    // Close cleanly so the profile's SingletonLock is released for the next run.
    await context.close().catch(() => {});
    process.exit(0);

  } catch (err: unknown) {
    const msg = (err as Error).message || String(err);
    console.error(`[generate_image] Error: ${msg}`);
    try {
      const debugPath = path.join(TMP_DIR, `error_${Date.now()}.png`);
      await page.screenshot({ path: debugPath, fullPage: true });
      console.error(`[generate_image] Debug screenshot: ${debugPath}`);
    } catch {}
    console.log(JSON.stringify({ status: 'error', message: msg }));
    await context.close().catch(() => {});
    process.exit(1);
  }
}

main().catch(err => {
  console.log(JSON.stringify({ status: 'error', message: err?.message || String(err) }));
  process.exit(1);
});
