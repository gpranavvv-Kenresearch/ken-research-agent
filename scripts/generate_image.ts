/**
 * generate_image.ts — Generate a cover image via ChatGPT DALL-E 3 and upload to Cloudinary.
 *
 * Uses a persistent Chrome profile for ChatGPT (stays logged in long-term).
 * Called as a subprocess by generate_blog.py.
 *
 * Usage:
 *   npx tsx scripts/generate_image.ts \
 *     --market-name "India Cold Storage Market" \
 *     --market-size "USD 2.68 Billion" \
 *     --cagr "12.5% CAGR" \
 *     --forecast "USD 5.1 Billion by 2030"
 *
 * Outputs JSON to stdout:
 *   {"status":"success","cloudinaryUrl":"https://res.cloudinary.com/..."}
 *   {"status":"error","message":"ChatGPT not logged in"}
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Arg parsing ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const get = (flag: string, fallback = '') => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const marketName = get('--market-name', 'Market Intelligence Report');
const marketSize = get('--market-size', '');
const cagr       = get('--cagr', '');
const forecast   = get('--forecast', '');

// ── Cloudinary config ─────────────────────────────────────────────────────────
const CLOUD_NAME = 'dutg2rtvr';
const API_KEY    = '226785248494346';
const API_SECRET = '6pX9f6a_QAFQmPriZDTCTgwtj0w';
const FOLDER     = 'microblogs';

// ── Persistent ChatGPT Chrome profile ─────────────────────────────────────────
const SESSIONS_DIR   = path.join(__dirname, '..', '.sessions-cookies');
const CHATGPT_PROFILE = path.join(SESSIONS_DIR, 'chatgpt-profile');
fs.mkdirSync(CHATGPT_PROFILE, { recursive: true });

// ── Sector detection ──────────────────────────────────────────────────────────
function detectSector(name: string): { sectorName: string; accent: string; gradient: string } {
  const n = name.toLowerCase();
  if (/logistics|courier|freight|supply chain|cold storage|warehouse|shipping/.test(n))
    return { sectorName: 'Logistics & Supply Chain', accent: '#0A84FF', gradient: 'deep slate charcoal blending into midnight navy' };
  if (/pharma|healthcare|medical|hospital|clinical|diagnostic|biotech|ai in health/.test(n))
    return { sectorName: 'Healthcare & Pharma', accent: '#00BFA5', gradient: 'cool blue-gray blending into deep teal-charcoal' };
  if (/fintech|payment|banking|insurance|lending|financial|investment/.test(n))
    return { sectorName: 'Fintech & Financial Services', accent: '#DC143C', gradient: 'deep maroon blending into charcoal black' };
  if (/technology|software|saas|ai|cloud|data|digital|cyber|iot|semiconductor/.test(n))
    return { sectorName: 'Technology', accent: '#8B5CF6', gradient: 'graphite steel blending into deep violet-black' };
  if (/energy|power|solar|wind|renewable|oil|gas|petroleum|electricity/.test(n))
    return { sectorName: 'Energy & Power', accent: '#10B981', gradient: 'deep navy blending into forest-black' };
  if (/food|agriculture|edible|dairy|beverage|crop|grain|organic|meat/.test(n))
    return { sectorName: 'Food & Agriculture', accent: '#D97706', gradient: 'muted warm brown blending into dark umber' };
  if (/automotive|car|vehicle|ev|electric|bus|motor|tire|rental/.test(n))
    return { sectorName: 'Automotive & Mobility', accent: '#F97316', gradient: 'dark charcoal blending into deep warm black' };
  if (/retail|consumer|fashion|cosmetic|luxury|apparel|ecommerce/.test(n))
    return { sectorName: 'Retail & Consumer', accent: '#EC4899', gradient: 'deep plum blending into dark aubergine' };
  if (/education|training|university|learning|academic|school/.test(n))
    return { sectorName: 'Education & Training', accent: '#6366F1', gradient: 'deep indigo-black blending into midnight blue' };
  if (/real estate|construction|housing|property|building|infrastructure/.test(n))
    return { sectorName: 'Real Estate & Construction', accent: '#B45309', gradient: 'warm taupe gray blending into dark earth' };
  return { sectorName: 'Market Intelligence', accent: '#CC2222', gradient: 'dark charcoal blending into near-black' };
}

function deriveHeroVisual(name: string): string {
  const n = name.toLowerCase();
  if (/cold storage|cold chain/.test(n))
    return 'A vast refrigerated warehouse with automated racking systems and reefer trucks loading at the dock. Cold vapor rising from open blast-freeze chambers, forklifts moving pallets.';
  if (/courier|parcel|logistics|express/.test(n))
    return 'A high-throughput last-mile logistics sorting hub with conveyor belts, delivery motorcycles, and stacked parcel bins.';
  if (/electric|ev|bus/.test(n))
    return 'A wide electric vehicle charging plaza with rows of EVs plugged in under solar-paneled canopies.';
  if (/solar|renewable|wind/.test(n))
    return 'A vast solar farm with rows of photovoltaic panels stretching to the horizon, wind turbines visible in the distance.';
  if (/pharma|drug|medicine|diagnostic|healthcare/.test(n))
    return 'A modern pharmaceutical and diagnostics facility with sterile cleanroom environment and precision medical equipment.';
  if (/ai|artificial intelligence/.test(n))
    return 'A sleek AI operations center with neural network visualizations, glowing data flows, and intelligent diagnostic screens.';
  if (/bank|financial|fintech/.test(n))
    return 'A sleek modern financial data center with server racks, holographic trading screens, and digital transaction flows.';
  if (/food|agriculture|crop|grain/.test(n))
    return 'Vast agricultural fields stretching to the horizon with precision farming equipment and grain silos.';
  if (/real estate|construction|building/.test(n))
    return 'A modern skyline under construction with cranes, glass skyscrapers, and urban infrastructure.';
  return 'A premium corporate intelligence operations center with multiple data visualization screens, market trend displays, and analytical dashboards.';
}

function buildImagePrompt(name: string, size: string, cagr: string, forecast: string): string {
  const sector = detectSector(name);
  const hero   = deriveHeroVisual(name);
  const parts  = [size, cagr, forecast].filter(Boolean);
  const dataLine = parts.join(' · ').slice(0, 100);

  return `Act as a premium editorial data visualization designer creating a production-ready cover image for a global strategic market intelligence firm.

Create a finished 16:9 landscape cover (1920×1080) for:
Post Title: ${name}
${dataLine ? `Data Line: ${dataLine}` : ''}
Sector: ${sector.sectorName}

VISUAL DIRECTION:
Design a premium, enterprise-grade editorial intelligence cover. The image must feel like a strategic market intelligence visual from McKinsey, Bain, or Bloomberg Intelligence. It must combine a cinematic sector hero scene with a layered analytical data visualization. The dominant accent color is ${sector.accent}.

CANVAS LAYOUT:
- LEFT ZONE = 55%: title text, data hook line, sector badge
- RIGHT ZONE = 45%: data visualization chart + hero visual backdrop
- 7% safe margin on all sides

TOP ACCENT STRIP: Thin 3-4px bar in ${sector.accent} across the full top edge.

BACKGROUND: Dark cinematic gradient: ${sector.gradient}. Left side darkest behind the text.

LEFT TEXT CONTENT:
Render EXACTLY this text: "${name}" — cross-check every word character by character. White text, 600 weight, clean premium sans-serif. Break into 3-4 lines naturally.
${dataLine ? `DATA HOOK LINE directly below: "${dataLine}" — single line, ${sector.accent} color.` : ''}
SECTOR BADGE: Small pill: "${sector.sectorName}" with transparent background, rounded corners.

RIGHT-SIDE DATA VISUALIZATION:
Premium analytical chart — line/area chart showing market growth trajectory over time. Bloomberg Terminal or McKinsey strategy visual style. Colored data points, trend curves, subtle grid lines at low opacity. Chart color: ${sector.accent}.

MARKET INTELLIGENCE LABEL: Small top-right micro label "MARKET INTELLIGENCE" in tiny white text.

HERO VISUAL (behind chart): ${hero} Apply schematic blueprint wireframe overlay. Keep at moderated opacity so chart remains primary.

SIGNATURE OVERLAY: Thin wireframe mesh, drafting arcs, measurement ticks across full canvas at 8-12% opacity.

BOTTOM-LEFT: Single thin vertical accent line in ${sector.accent}, 28-36px tall. NO text, NO brand name, NO logo, NO company name.
BOTTOM-RIGHT: Clean negative space for manual logo placement. No text.

STRICT RULES — DO NOT:
- Render "Ken Research" or ANY company/brand name ANYWHERE on the image
- Add any logo, monogram, or wordmark
- Misspell the title "${name}"
- Use cartoon colors or generic infographic style
- Add any text except: the title, data line, sector badge, and MARKET INTELLIGENCE micro label

OUTPUT: A finished premium consulting-grade market intelligence cover image. Cinematic atmosphere + analytical chart + bold editorial typography. Ready for publishing after manual logo placement in the bottom-right reserved zone.`;
}

// ── Fetch image buffer from URL ───────────────────────────────────────────────
function fetchImageAsBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Cloudinary upload ─────────────────────────────────────────────────────────
async function uploadToCloudinary(imageBuffer: Buffer, publicId: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signStr   = `folder=${FOLDER}&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
  const signature = crypto.createHash('sha1').update(signStr).digest('hex');

  const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;
  const fields: Record<string, string> = { api_key: API_KEY, timestamp, signature, folder: FOLDER, public_id: publicId };

  let body = '';
  for (const [k, v] of Object.entries(fields))
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  body += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n`;

  const fullBody = Buffer.concat([Buffer.from(body), imageBuffer, Buffer.from(`\r\n--${boundary}--\r\n`)]);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUD_NAME}/image/upload`,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': fullBody.length },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.secure_url) resolve(parsed.secure_url);
          else reject(new Error(`Cloudinary error: ${data.slice(0, 300)}`));
        } catch (e) { reject(new Error(`Cloudinary parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const prompt = buildImagePrompt(marketName, marketSize, cagr, forecast);

  console.error(`[generate_image] Starting ChatGPT DALL-E 3 for: ${marketName}`);

  const context = await chromium.launchPersistentContext(CHATGPT_PROFILE, {
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    // Step 1: Navigate to ChatGPT
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Step 2: Verify login
    const loginBtn = await page.$('button:has-text("Log in"), a:has-text("Log in")');
    if (loginBtn) {
      console.log(JSON.stringify({ status: 'error', message: 'ChatGPT not logged in — open Chrome with the chatgpt-profile and log in once, then retry' }));
      await context.close();
      process.exit(1);
    }
    console.error('[generate_image] ChatGPT logged in ✓');

    // Step 3: Snapshot pre-existing images to detect new ones
    const knownSrcs: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img')).map(img => img.src).filter(Boolean)
    );

    // Step 4: Find chat input
    const chatInput = await page.waitForSelector(
      '#prompt-textarea, [data-testid="prompt-textarea"], [placeholder*="Message"], [contenteditable="true"]',
      { timeout: 15000 }
    );
    if (!chatInput) throw new Error('Chat input not found');

    await chatInput.click();
    await page.waitForTimeout(500);

    // Step 5: Send prompt
    await chatInput.fill(prompt);
    await page.waitForTimeout(500);

    const sendBtn = await page.$('button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label*="Send"]');
    if (sendBtn) await sendBtn.click();
    else await page.keyboard.press('Enter');

    console.error('[generate_image] Prompt sent — checking every 60s, max 3 min...');

    // Step 6: Poll for generated image — every 60s, max 3 minutes
    let imgSrc = '';
    const pollStart = Date.now();
    const TIMEOUT_MS = 3 * 60 * 1000;

    while (Date.now() - pollStart < TIMEOUT_MS) {
      await page.waitForTimeout(60000);

      const elapsed = Math.round((Date.now() - pollStart) / 1000);
      console.error(`[generate_image] Checking at ${elapsed}s...`);

      const bodyText = await page.evaluate(() => document.body.innerText);
      for (const phrase of ["can't create images", "content policy", "generation limit", "try again later", "something went wrong"]) {
        if (bodyText.toLowerCase().includes(phrase))
          throw new Error(`ChatGPT error: "${phrase}" detected`);
      }

      const newSrc: string = await page.evaluate((known: string[]) => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const candidates = imgs.filter(img =>
          img.naturalWidth > 100 && img.naturalHeight > 100 && img.src && !known.includes(img.src) &&
          (img.src.includes('oaidalleapiprodscus') || img.src.includes('oaiusercontent') ||
           (img.closest('article') !== null && !img.src.includes('avatar')))
        );
        return candidates.length > 0 ? candidates[candidates.length - 1].src : '';
      }, knownSrcs);

      if (newSrc) {
        imgSrc = newSrc;
        console.error(`[generate_image] Image found ✓ at ${elapsed}s`);
        break;
      }
      console.error(`[generate_image] Not ready yet...`);
    }

    if (!imgSrc) throw new Error('Image not generated within 3 minutes');

    // Step 7: Download + upload to Cloudinary
    const imageBuffer = await fetchImageAsBuffer(imgSrc);
    console.error(`[generate_image] Downloaded ${imageBuffer.length} bytes`);

    const publicId     = `${marketName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 55)}-${Math.floor(Date.now() / 1000)}`;
    const cloudinaryUrl = await uploadToCloudinary(imageBuffer, publicId);
    console.error(`[generate_image] Uploaded: ${cloudinaryUrl}`);

    // Step 8: Reset to new chat (never close browser)
    await page.goto('https://chatgpt.com/new', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    console.log(JSON.stringify({ status: 'success', cloudinaryUrl }));
    process.exit(0);

  } catch (err: unknown) {
    const msg = (err as Error).message || String(err);
    console.error(`[generate_image] Error: ${msg}`);
    await page.goto('https://chatgpt.com/new', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    console.log(JSON.stringify({ status: 'error', message: msg }));
    process.exit(1);
  }
  // intentionally never close context — keep Chrome alive
}

main().catch(err => {
  console.log(JSON.stringify({ status: 'error', message: err?.message || String(err) }));
  process.exit(1);
});
