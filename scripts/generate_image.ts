/**
 * generate_image.ts — Generate a cover image via Pollinations.ai and upload to Cloudinary.
 *
 * No browser, no login, no session required.
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

import https from 'https';
import http from 'http';
import crypto from 'crypto';

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

// ── Cloudinary config ────────────────────────────────────────────────────────
const CLOUD_NAME = 'dutg2rtvr';
const API_KEY    = '226785248494346';
const API_SECRET = '6pX9f6a_QAFQmPriZDTCTgwtj0w';
const FOLDER     = 'microblogs';

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
    return 'A vast refrigerated warehouse with automated racking systems and reefer trucks loading at the dock';
  if (/courier|parcel|logistics|express/.test(n))
    return 'A high-throughput last-mile logistics sorting hub with conveyor belts and delivery vehicles';
  if (/electric|ev|bus/.test(n))
    return 'A wide electric vehicle charging plaza with rows of EVs plugged in under solar-paneled canopies';
  if (/solar|renewable|wind/.test(n))
    return 'A vast solar farm with rows of photovoltaic panels, wind turbines visible in the distance';
  if (/pharma|drug|medicine|diagnostic|healthcare/.test(n))
    return 'A modern pharmaceutical and diagnostics facility with precision equipment and digital health screens';
  if (/ai|artificial intelligence/.test(n))
    return 'A sleek AI operations center with neural network visualizations, data flows, and intelligent diagnostic screens';
  if (/bank|financial|fintech/.test(n))
    return 'A sleek modern financial data center with server racks and holographic trading screens';
  if (/food|agriculture|crop|grain/.test(n))
    return 'Vast agricultural fields with precision farming equipment and grain silos';
  if (/real estate|construction|building/.test(n))
    return 'A modern skyline under construction with cranes and glass skyscrapers';
  return 'A premium corporate intelligence operations center with market trend displays and analytical dashboards';
}

function buildImagePrompt(name: string, size: string, cagr: string, forecast: string): string {
  const sector = detectSector(name);
  const hero   = deriveHeroVisual(name);
  const parts  = [size, cagr, forecast].filter(Boolean);
  const dataLine = parts.join(' · ').slice(0, 120);

  return `Premium editorial market intelligence cover image, 16:9 landscape (1920x1080). ` +
    `Topic: ${name}. Sector: ${sector.sectorName}. ` +
    `${dataLine ? `Data: ${dataLine}. ` : ''}` +
    `Visual style: McKinsey or Bloomberg Intelligence strategic report cover. ` +
    `Dark cinematic background: ${sector.gradient}. ` +
    `Left 55%: bold white sans-serif title text "${name}", ${sector.accent} data line below. ` +
    `Right 45%: ${hero}, with premium line chart overlay in ${sector.accent} showing market growth. ` +
    `Thin ${sector.accent} accent strip at top. ` +
    `No Ken Research logo, no company name, no watermark. ` +
    `Professional, enterprise-grade, photorealistic quality.`;
}

// ── Fetch image buffer from URL ───────────────────────────────────────────────
function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
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
  const prompt   = buildImagePrompt(marketName, marketSize, cagr, forecast);
  const encoded  = encodeURIComponent(prompt);
  const seed     = Math.floor(Math.random() * 999999);

  // Pollinations.ai — free, no API key, no browser needed
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=1920&height=1080&seed=${seed}&nologo=true&enhance=true`;

  console.error(`[generate_image] Generating via Pollinations.ai for: ${marketName}`);
  console.error(`[generate_image] URL length: ${pollinationsUrl.length} chars`);

  try {
    // Pollinations generates synchronously — just fetch the URL
    const imageBuffer = await fetchBuffer(pollinationsUrl);

    if (imageBuffer.length < 10000) {
      throw new Error(`Image too small (${imageBuffer.length} bytes) — likely an error response`);
    }

    console.error(`[generate_image] Downloaded ${imageBuffer.length} bytes`);

    const slug     = marketName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
    const publicId = `${slug}-${Math.floor(Date.now() / 1000)}`;

    console.error(`[generate_image] Uploading to Cloudinary as ${publicId}...`);
    const cloudinaryUrl = await uploadToCloudinary(imageBuffer, publicId);

    console.error(`[generate_image] Done: ${cloudinaryUrl}`);
    console.log(JSON.stringify({ status: 'success', cloudinaryUrl }));
    process.exit(0);

  } catch (err: unknown) {
    const msg = (err as Error).message || String(err);
    console.error(`[generate_image] Error: ${msg}`);
    console.log(JSON.stringify({ status: 'error', message: msg }));
    process.exit(1);
  }
}

main().catch(err => {
  console.log(JSON.stringify({ status: 'error', message: err?.message || String(err) }));
  process.exit(1);
});
