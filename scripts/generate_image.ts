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
 *   {"status":"error","message":"..."}
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

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

// ── Cloudinary ────────────────────────────────────────────────────────────────
const CLOUD_NAME = 'dutg2rtvr';
const API_KEY    = '226785248494346';
const API_SECRET = '6pX9f6a_QAFQmPriZDTCTgwtj0w';
const FOLDER     = 'microblogs';

// ── Paths ─────────────────────────────────────────────────────────────────────
const SESSIONS_DIR    = path.join(__dirname, '..', '.sessions-cookies');
const CHATGPT_PROFILE = path.join(SESSIONS_DIR, 'chatgpt-profile');
const TMP_DIR         = path.join(__dirname, '..', 'generated_images');
fs.mkdirSync(CHATGPT_PROFILE, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Sector / prompt helpers ───────────────────────────────────────────────────
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
  if (/cold storage|cold chain/.test(n))    return 'A vast refrigerated warehouse with automated racking systems and reefer trucks. Cold vapor rising from blast-freeze chambers.';
  if (/courier|parcel|logistics/.test(n))   return 'A high-throughput last-mile logistics sorting hub with conveyor belts and delivery vehicles.';
  if (/electric|ev|bus/.test(n))            return 'A wide electric vehicle charging plaza with rows of EVs under solar-paneled canopies.';
  if (/solar|renewable|wind/.test(n))       return 'A vast solar farm with photovoltaic panels and wind turbines in the distance.';
  if (/pharma|drug|medicine|diagnostic/.test(n)) return 'A modern pharmaceutical facility with sterile cleanroom environment and precision medical equipment.';
  if (/ai|artificial intelligence/.test(n)) return 'A sleek AI operations center with neural network visualizations and intelligent diagnostic screens.';
  if (/bank|financial|fintech/.test(n))     return 'A modern financial data center with server racks and holographic trading screens.';
  if (/food|agriculture|crop/.test(n))      return 'Vast agricultural fields with precision farming equipment and grain silos.';
  if (/real estate|construction/.test(n))   return 'A modern skyline under construction with cranes and glass skyscrapers.';
  return 'A premium corporate intelligence operations center with data visualization screens and analytical dashboards.';
}

function buildImagePrompt(name: string, size: string, cagr: string, forecast: string): string {
  const sector   = detectSector(name);
  const hero     = deriveHeroVisual(name);
  const parts    = [size, cagr, forecast].filter(Boolean);
  const dataLine = parts.join(' · ').slice(0, 100);

  return `Act as a premium editorial data visualization designer creating a production-ready cover image for a global strategic market intelligence firm.

Create a finished 16:9 landscape cover (1920×1080) for:
Post Title: ${name}
${dataLine ? `Data Line: ${dataLine}` : ''}
Sector: ${sector.sectorName}

VISUAL DIRECTION:
Design a premium, enterprise-grade editorial intelligence cover. The image must feel like a strategic market intelligence visual from McKinsey, Bain, or Bloomberg Intelligence. Dominant accent color: ${sector.accent}.

CANVAS LAYOUT:
- LEFT ZONE 55%: title text, data hook line, sector badge
- RIGHT ZONE 45%: data visualization chart + hero visual backdrop
- 7% safe margin on all sides

TOP ACCENT STRIP: Thin 3-4px bar in ${sector.accent} across the full top edge.
BACKGROUND: Dark cinematic gradient: ${sector.gradient}. Left side darkest.

LEFT TEXT CONTENT:
Render EXACTLY: "${name}" — white, 600 weight, premium sans-serif, 3-4 lines.
${dataLine ? `DATA HOOK LINE: "${dataLine}" — ${sector.accent} color.` : ''}
SECTOR BADGE: Small pill "${sector.sectorName}", transparent background.

RIGHT-SIDE: Premium line/area chart showing market growth. Bloomberg Terminal style. Chart color: ${sector.accent}.
HERO VISUAL (behind chart, low opacity): ${hero}

STRICT RULES:
- NO "Ken Research" or any company/brand name anywhere
- NO logo, monogram, or wordmark
- Do NOT misspell "${name}"
- BOTTOM-RIGHT: clean negative space, no text

OUTPUT: Finished premium consulting-grade market intelligence cover. Cinematic + analytical + editorial typography.`;
}

// ── Multi-selector image finder (polls every 2s) ──────────────────────────────
async function findGeneratedImage(page: any, timeoutMs = 180000) {
  const selectors = [
    '[data-message-author-role="assistant"] img',
    'img[src*="oaidalleapiprodscus"]',
    'img[src*="oaiusercontent"]',
    'img[src*="dalle"]',
    'div[data-testid="generated-image"] img',
    '.agent-turn img',
    '.assistant-message img',
    'main img',
  ];

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).last();
        if (await locator.isVisible().catch(() => false)) {
          const box = await locator.boundingBox().catch(() => null);
          if (box && box.width > 100 && box.height > 100) {
            console.error(`[generate_image] Image found via "${selector}" (${Math.round(box.width)}x${Math.round(box.height)})`);
            return locator;
          }
        }
      } catch {}
    }
    const elapsed = Math.round((Date.now() - (deadline - timeoutMs)) / 1000);
    if (elapsed > 0 && elapsed % 20 === 0) {
      const imgCount = await page.locator('img').count().catch(() => 0);
      console.error(`[generate_image] Still waiting... (${elapsed}s, ${imgCount} imgs on page)`);
    }
    await page.waitForTimeout(2000);
  }
  throw new Error('Generated image not found after 3 minutes');
}

// ── Cloudinary upload ─────────────────────────────────────────────────────────
async function uploadToCloudinary(imageBuffer: Buffer, publicId: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signStr   = `folder=${FOLDER}&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
  const signature = crypto.createHash('sha1').update(signStr).digest('hex');
  const boundary  = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;
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
        } catch { reject(new Error(`Cloudinary parse error: ${data.slice(0, 200)}`)); }
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
  console.error(`[generate_image] Starting for: ${marketName}`);

  const context = await chromium.launchPersistentContext(CHATGPT_PROFILE, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
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
      if (!ok) throw new Error('Login timeout — please log in to ChatGPT in the Chrome window');
    }

    // ── Submit prompt ─────────────────────────────────────────────────────────
    const chatInput = page.locator('#prompt-textarea').first();
    await chatInput.waitFor({ state: 'visible', timeout: 15000 });
    await chatInput.fill(prompt);
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

    // ── Wait for image (polls every 2s) ───────────────────────────────────────
    console.error('[generate_image] Waiting for DALL-E image (up to 3 min)...');
    const generatedImage = await findGeneratedImage(page, 3 * 60 * 1000);

    await generatedImage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    // ── Wait for full resolution ──────────────────────────────────────────────
    console.error('[generate_image] Waiting for full resolution...');
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const large = imgs.filter((img: any) => img.naturalWidth > 100 && img.naturalHeight > 100);
      const last = large[large.length - 1] as any;
      return last && last.complete && last.naturalWidth >= 800;
    }, { timeout: 120000 });

    const dims: any = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const large = imgs.filter((img: any) => img.naturalWidth > 100 && img.naturalHeight > 100);
      const last = large[large.length - 1] as any;
      return last ? { w: last.naturalWidth, h: last.naturalHeight } : null;
    });
    console.error(`[generate_image] Full image ready: ${dims?.w}x${dims?.h}px`);

    // ── Stability buffer ──────────────────────────────────────────────────────
    console.error('[generate_image] Stability wait 60s...');
    await page.waitForTimeout(60000);

    // ── Download via browser fetch (preserves auth cookies) ───────────────────
    const imgSrc = await generatedImage.getAttribute('src');
    if (!imgSrc) throw new Error('Could not get image src');

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

    // ── Upload to Cloudinary ──────────────────────────────────────────────────
    const publicId     = `${marketName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 55)}-${Math.floor(Date.now() / 1000)}`;
    const cloudinaryUrl = await uploadToCloudinary(imageBuffer, publicId);
    console.error(`[generate_image] Uploaded: ${cloudinaryUrl}`);

    // ── Reset to new chat (never close browser) ───────────────────────────────
    await page.goto('https://chatgpt.com/new', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    console.log(JSON.stringify({ status: 'success', cloudinaryUrl }));
    process.exit(0);

  } catch (err: unknown) {
    const msg = (err as Error).message || String(err);
    console.error(`[generate_image] Error: ${msg}`);
    try {
      const debugPath = path.join(TMP_DIR, `error-${Date.now()}.png`);
      await page.screenshot({ path: debugPath, fullPage: true });
      console.error(`[generate_image] Debug screenshot: ${debugPath}`);
    } catch {}
    await page.goto('https://chatgpt.com/new', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    console.log(JSON.stringify({ status: 'error', message: msg }));
    process.exit(1);
  }
}

main().catch(err => {
  console.log(JSON.stringify({ status: 'error', message: err?.message || String(err) }));
  process.exit(1);
});
