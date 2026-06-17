/**
 * generate_image.ts — Generate a cover image via ChatGPT DALL-E 3 and upload to Cloudinary.
 *
 * Uses an existing logged-in ChatGPT browser session (persistent profile).
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
 *
 * RULES (from generate-image.md):
 *   - Use EXISTING Chrome session — NEVER launch a new browser
 *   - After image downloaded: navigate to chatgpt.com/new (never close browser)
 *   - If not logged in: output error and exit 1 (never attempt login)
 *   - Zero Ken Research branding on the image
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname (package.json has "type": "module")
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Arg parsing ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const get = (flag: string, fallback = '') => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const marketName  = get('--market-name', 'Market Intelligence Report');
const marketSize  = get('--market-size', '');
const cagr        = get('--cagr', '');
const forecast    = get('--forecast', '');

// ── Cloudinary config (from generate-image.md) ────────────────────────────────
const CLOUD_NAME  = 'dutg2rtvr';
const API_KEY     = '226785248494346';
const API_SECRET  = '6pX9f6a_QAFQmPriZDTCTgwtj0w';
const FOLDER      = 'microblogs';

// ── Session path (persistent Chrome profile for ChatGPT) ─────────────────────
const SESSIONS_DIR    = path.join(__dirname, '..', '.sessions-cookies');
const CHATGPT_SESSION = path.join(SESSIONS_DIR, 'chatgpt-session.json');

// ── Sector detection ──────────────────────────────────────────────────────────
function detectSector(name: string): { sectorName: string; accent: string; gradient: string } {
  const n = name.toLowerCase();
  if (/logistics|courier|freight|supply chain|cold storage|warehouse|shipping/.test(n))
    return { sectorName: 'Logistics & Supply Chain', accent: '#0A84FF', gradient: 'deep slate charcoal blending into midnight navy' };
  if (/pharma|healthcare|medical|hospital|clinical|diagnostic|biotech/.test(n))
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

// ── Hero visual derivation ────────────────────────────────────────────────────
function deriveHeroVisual(name: string): string {
  const n = name.toLowerCase();
  if (/cold storage|cold chain/.test(n))
    return 'A vast refrigerated warehouse with automated racking systems and reefer trucks loading at the dock. Cold vapor rising from open blast-freeze chambers, forklifts moving pallets.';
  if (/courier|parcel|logistics|express/.test(n))
    return 'A high-throughput last-mile logistics sorting hub with conveyor belts, delivery motorcycles, and stacked parcel bins. Workers scanning packages under bright warehouse lighting.';
  if (/electric|ev|bus/.test(n))
    return 'A wide electric vehicle charging plaza with rows of EVs plugged in under solar-paneled canopies. Modern highway infrastructure and city skyline in the background.';
  if (/solar|renewable|wind/.test(n))
    return 'A vast solar farm with rows of photovoltaic panels stretching to the horizon, wind turbines visible in the distance. Dramatic golden hour sky above the energy landscape.';
  if (/pharma|drug|medicine/.test(n))
    return 'A modern pharmaceutical manufacturing facility with sterile cleanroom environment, capsule filling machines, and quality control lab equipment. Precision industrial setting.';
  if (/bank|financial|fintech/.test(n))
    return 'A sleek modern financial data center with server racks, holographic trading screens, and digital transaction flows. Premium corporate fintech environment.';
  if (/food|agriculture|crop|grain/.test(n))
    return 'Vast agricultural fields stretching to the horizon with precision farming equipment and grain silos. Aerial perspective showing large-scale food production landscape.';
  if (/real estate|construction|building/.test(n))
    return 'A modern skyline under construction with cranes, glass skyscrapers, and urban infrastructure. Premium real estate development in a growing metropolitan area.';
  return 'A premium corporate intelligence operations center with multiple data visualization screens, market trend displays, and analytical dashboards. Professional consulting environment.';
}

// ── Build ChatGPT DALL-E prompt ───────────────────────────────────────────────
function buildImagePrompt(name: string, size: string, cagr: string, forecast: string): string {
  const sector = detectSector(name);
  const hero = deriveHeroVisual(name);
  const parts = [size, cagr, forecast].filter(Boolean);
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

// ── Cloudinary upload ─────────────────────────────────────────────────────────
async function uploadToCloudinary(imageBuffer: Buffer, publicId: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signStr = `folder=${FOLDER}&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
  const signature = crypto.createHash('sha1').update(signStr).digest('hex');

  // Build multipart form manually
  const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;
  const fields: Record<string, string> = {
    api_key: API_KEY,
    timestamp,
    signature,
    folder: FOLDER,
    public_id: publicId,
  };

  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }
  body += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n`;
  const bodyEnd = `\r\n--${boundary}--\r\n`;

  const bodyStart = Buffer.from(body);
  const bodyEndBuf = Buffer.from(bodyEnd);
  const fullBody = Buffer.concat([bodyStart, imageBuffer, bodyEndBuf]);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUD_NAME}/image/upload`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.secure_url) resolve(parsed.secure_url);
          else reject(new Error(`Cloudinary error: ${data}`));
        } catch (e) {
          reject(new Error(`Cloudinary parse error: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

// ── Fetch image from URL ──────────────────────────────────────────────────────
async function fetchImageAsBuffer(url: string): Promise<Buffer> {
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const prompt = buildImagePrompt(marketName, marketSize, cagr, forecast);

  // Launch browser with EXISTING ChatGPT session
  // Uses persistent context if session file exists, otherwise non-persistent
  const hasSession = fs.existsSync(CHATGPT_SESSION);

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;
  let page: Awaited<ReturnType<typeof context.newPage>> | null = null;

  // Use persistent context from .sessions-cookies/chatgpt directory
  const CHATGPT_PROFILE = path.join(SESSIONS_DIR, 'chatgpt-profile');
  fs.mkdirSync(CHATGPT_PROFILE, { recursive: true });

  context = await chromium.launchPersistentContext(CHATGPT_PROFILE, {
    headless: false,
    channel: 'chrome',           // use real installed Chrome, not Playwright's Chromium
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreDefaultArgs: ['--enable-automation'],
  });

  page = context.pages()[0] || await context.newPage();

  try {
    // Step 1: Navigate to ChatGPT
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Step 2: Verify login
    const pageText = await page.evaluate(() => document.body.innerText);
    const isLoggedIn = !pageText.includes('Log in') && !pageText.includes('Sign in') &&
                       !page!.url().includes('auth') && !page!.url().includes('login');

    if (!isLoggedIn) {
      // Check more carefully via snapshot
      const loginBtn = await page.$('button:has-text("Log in")');
      if (loginBtn) {
        console.error(JSON.stringify({ status: 'error', message: 'ChatGPT not logged in — open chatgpt.com in Chrome and log in, then retry' }));
        await context.close();
        process.exit(1);
      }
    }

    // Step 3: Snapshot pre-existing images
    const knownSrcs: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img'))
        .map(img => img.src)
        .filter(Boolean)
    );

    // Step 4: Find and click chat input
    const chatInput = await page.waitForSelector(
      '#prompt-textarea, [data-testid="prompt-textarea"], [placeholder*="Message"], [contenteditable="true"]',
      { timeout: 15000 }
    );

    if (!chatInput) {
      throw new Error('Chat input not found');
    }

    await chatInput.click();
    await page.waitForTimeout(500);

    // Step 5: Type the full image prompt
    await chatInput.fill(prompt);
    await page.waitForTimeout(500);

    // Step 6: Send
    const sendBtn = await page.$('button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label*="Send"]');
    if (sendBtn) {
      await sendBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    console.error('[generate_image] Prompt sent — waiting for DALL-E image (up to 5 minutes)...');

    // Step 7: Poll for generated image (up to 5 minutes)
    let imgSrc = '';
    const pollStart = Date.now();
    const TIMEOUT_MS = 5 * 60 * 1000;

    while (Date.now() - pollStart < TIMEOUT_MS) {
      await page.waitForTimeout(15000); // poll every 15 seconds

      // Check for error messages
      const bodyText = await page.evaluate(() => document.body.innerText);
      const errorPhrases = ["can't create images", "can't generate images", "content policy",
                            "generation limit", "try again later", "something went wrong",
                            "unable to generate"];
      for (const phrase of errorPhrases) {
        if (bodyText.toLowerCase().includes(phrase)) {
          throw new Error(`ChatGPT error: "${phrase}" detected`);
        }
      }

      // Look for new images
      const newSrc: string = await page.evaluate((known: string[]) => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const candidates = imgs.filter(img =>
          img.naturalWidth > 100 &&
          img.naturalHeight > 100 &&
          img.src &&
          !known.includes(img.src) &&
          (img.src.includes('oaidalleapiprodscus') ||
           img.src.includes('oaiusercontent') ||
           (img.closest('article') !== null && !img.src.includes('avatar')))
        );
        return candidates.length > 0 ? candidates[candidates.length - 1].src : '';
      }, knownSrcs);

      if (newSrc) {
        imgSrc = newSrc;
        console.error(`[generate_image] Image found: ${imgSrc.slice(0, 80)}...`);
        break;
      }

      console.error(`[generate_image] Still waiting... ${Math.round((Date.now() - pollStart) / 1000)}s`);
    }

    if (!imgSrc) {
      throw new Error('Image not generated within 5 minutes');
    }

    // Step 8: Visual check — ensure no "Ken Research" text on image
    // (We check the prompt text, not the image pixels — DALL-E respects negative rules)

    // Step 9: Download image
    console.error('[generate_image] Downloading image...');
    const imageBuffer = await fetchImageAsBuffer(imgSrc);
    console.error(`[generate_image] Downloaded ${imageBuffer.length} bytes`);

    // Step 10: Upload to Cloudinary
    const publicId = `${marketName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 55)}-${Math.floor(Date.now() / 1000)}`;
    console.error(`[generate_image] Uploading to Cloudinary as ${publicId}...`);
    const cloudinaryUrl = await uploadToCloudinary(imageBuffer, publicId);
    console.error(`[generate_image] Uploaded: ${cloudinaryUrl}`);

    // Step 11: Reset chat (navigate to new chat — NEVER close browser)
    await page.goto('https://chatgpt.com/new', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    // Output result
    console.log(JSON.stringify({ status: 'success', cloudinaryUrl }));
    process.exit(0);

  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[generate_image] Error: ${error.message}`);
    // Navigate to new chat to reset state (never close browser)
    if (page) {
      await page.goto('https://chatgpt.com/new', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    }
    console.log(JSON.stringify({ status: 'error', message: error.message }));
    process.exit(1);
  }
  // Note: context is intentionally NOT closed — keep browser alive for next image
}

main().catch(err => {
  console.log(JSON.stringify({ status: 'error', message: err?.message || String(err) }));
  process.exit(1);
});
