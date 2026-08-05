/**
 * generate_image.ts — Generate a cover image via ChatGPT DALL-E 3 (v5 prompt) and
 * upload to ImageKit. Ported from Analytical-AIO-Blogs' generate_image.js, using the
 * same Lexical-safe composer paste helper (chatgpt_composer.ts) and image-polling
 * logic, adapted to this repo's CLI args and ImageKit upload step.
 *
 * Profile: uses a DEDICATED chatgpt-image-profile-{agent} if one already
 * exists on disk (already logged in — the original VPS setup, still true for
 * abhinav/krishi/sameeksha/sanya/vansh), otherwise falls back to sharing
 * generate_blog_chatgpt.ts's chatgpt-profile-{agent} (no separate image
 * login needed — used for any newly-added agent, e.g. local vishal).
 * A cloned SECOND login for the same account doesn't work — OpenAI
 * invalidates a session the moment it's used from a second browser
 * fingerprint (same defense LinkedIn applies to li_at) — so an agent with no
 * dedicated image profile must fall back to sharing rather than getting a
 * fresh one via cloning. Chrome also only allows one process per profile
 * directory at a time, so when sharing, run-blog-generator.ts runs this
 * AFTER text generation finishes, never concurrently with it.
 *
 * Two selectable, fully self-contained prompts (each does its own market
 * research, color/industry selection, and layout — see imagePrompt1/
 * imagePrompt2 below) — pick with --image-prompt 1|2 (default 1).
 *
 * Usage:
 *   npx tsx scripts/generate_image.ts \
 *     --market-name "India Cold Storage Market" \
 *     --url "https://www.kenresearch.com/industry-reports/india-cold-storage-market" \
 *     --image-prompt 2
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
import { pasteIntoChatGPTComposer, dismissBlockingModals } from './chatgpt_composer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const get  = (flag: string, fallback = '') => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const marketName = get('--market-name', 'Market Intelligence Report');
const reportUrl  = get('--url', '');
const agentArg   = get('--agent', '').toLowerCase();
const imagePromptChoice = get('--image-prompt', '1'); // '1' or '2' — see imagePrompt1/imagePrompt2 below

// ── ImageKit ──────────────────────────────────────────────────────────────────
const IMAGEKIT_PRIVATE_KEY = 'private_MkJ4nzxRoVz+dDpEeFUTryhRXVM=';
const IMAGEKIT_FOLDER      = '/microblogs';

// ── Paths ─────────────────────────────────────────────────────────────────────
const SESSIONS_DIR    = path.join(__dirname, '..', '.sessions-cookies');
const isAbhinav = !agentArg || agentArg === 'abhinav';
const DEDICATED_IMAGE_PROFILE = path.join(SESSIONS_DIR, isAbhinav ? 'chatgpt-image-profile' : `chatgpt-image-profile-${agentArg}`);
const SHARED_TEXT_PROFILE     = path.join(SESSIONS_DIR, isAbhinav ? 'chatgpt-profile' : `chatgpt-profile-${agentArg}`);
// Use the dedicated image profile if it's already logged in (existing VPS
// agents); otherwise share the text profile rather than requiring — or
// cloning into — a fresh image login (see file header). run-blog-generator.ts
// makes the identical disk check (dedicatedImageProfileExists()) before
// deciding whether it's safe to run image + text generation in parallel.
const CHATGPT_PROFILE = fs.existsSync(DEDICATED_IMAGE_PROFILE) ? DEDICATED_IMAGE_PROFILE : SHARED_TEXT_PROFILE;
const TMP_DIR          = path.join(__dirname, '..', 'generated_images');
fs.mkdirSync(CHATGPT_PROFILE, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Image prompt 1 — research-heavy, structured "canvas architecture" layout.
// User-supplied verbatim (2026-08-04), just with [INSERT MARKET TITLE] /
// [INSERT EXACT REPORT URL] swapped for the real values. Self-contained: does
// its own research, color selection, and layout — no local sector/color logic
// needed anymore.
function imagePrompt1(name: string, reportUrl: string): string {
  return `Act as a senior market researcher and premium editorial data-visualization designer.
Your task is to independently research the supplied market, validate its most important statistics, select an industry-appropriate visual identity, and create a production-ready market-intelligence cover image inspired by the supplied reference image.
USER INPUT
Market/Report Title: "${name}"
Primary Report URL: "${reportUrl}"
Reference Image: "https://lh3.googleusercontent.com/d/13G9f9b25YxH3UUniIzHYaBBK3zPo3Dzf"
Current Year: Use the actual current year.
Do not ask the user to supply market values, CAGR, forecast figures, statistics, colors, or visual concepts. Research and select them yourself.
PHASE 1: MARKET RESEARCH
Before generating the image, search the internet and verify the market information.
Research in this priority order:
Open and analyze the exact Primary Report URL.
Use official government departments, regulators, statistical agencies, and ministries.
Use recognized multilateral organizations such as the World Bank, WHO, OECD, IEA, ITU, FAO, UN agencies, or regional authorities where relevant.
Use credible industry associations, public company filings, and authoritative sector publications.
Avoid using competing market-research-company pages when the supplied report or official sources provide the required data.
Find and validate the following:
Correct market name and geographic scope
Base year
Base-year market value
Forecast year
Forecast market value
Forecast CAGR
Leading product, technology, application, channel, or segment
One verified market-share or adoption statistic
Two or three additional quantitative market indicators
One important qualitative trend if a reliable numerical statistic is unavailable
Possible supporting indicators include:
Unit shipments
User or subscriber count
Online channel share
Production volume
Installed capacity
Average selling price
Technology adoption
Import or export value
Regulatory target
Infrastructure coverage
Premium-product adoption
Digital penetration
Regional contribution
DATA-VALIDATION RULES
Never fabricate a market value, CAGR, percentage, year, unit, currency, or forecast.
Never mix global data with country- or region-specific data.
Never mix adjacent markets unless the distinction is clearly disclosed.
Keep market definitions, geography, currency, base year, and forecast period consistent.
Give priority to the exact supplied report when credible sources show different market estimates.
Recalculate the CAGR when base and forecast values are available:
CAGR = ((Forecast Value ÷ Base Value) ^ (1 ÷ Number of Years) − 1) × 100
If the recalculated CAGR materially conflicts with the published CAGR, use the published figure only when the report clearly defines a different forecast period.
Do not create intermediate annual market values unless they are published by a source.
If only the base and forecast values are available, label only those two endpoints on the chart.
Do not present estimated or interpolated values as published facts.
If a reliable market valuation cannot be found, use verified adoption, shipment, capacity, penetration, or regulatory statistics instead.
When reliable numerical data is unavailable, use concise qualitative language rather than inventing a number.
RESEARCH OUTPUT
Before generating the image, provide a concise validation table containing:
Metric
Selected value
Year
Source name
Direct source URL
Keep this research table outside the image. Do not display source URLs or citations inside the final cover.
PHASE 2: INDUSTRY AND COLOR SELECTION
Identify the market's primary industry and select the color palette yourself.
Choose one dominant accent color and one supporting accent color that match the industry's visual language.
Suggested direction:
Healthcare, medical devices, pharmaceuticals: crimson, medical red, cyan, or clinical blue
Banking, fintech, insurance: electric blue, violet, cyan, or deep emerald
Renewable energy and sustainability: emerald, teal, or clean green
Oil, gas, mining, and heavy industry: amber, copper, orange, or steel blue
Automotive and mobility: electric blue, orange, or metallic cyan
Consumer electronics, ICT, and software: violet, indigo, blue, or neon cyan
Food, agriculture, and natural products: green, olive, gold, or warm amber
Logistics, warehousing, and supply chain: navy, cyan, teal, or orange
Construction and infrastructure: amber, safety orange, yellow, or steel blue
Luxury, beauty, hospitality, and travel: magenta, burgundy, gold, or rose
Aerospace and defense: steel blue, graphite, cyan, or restrained red
Education and professional services: blue, indigo, or turquoise
These are guidelines, not fixed assignments. Select the palette that best represents the specific market.
Color requirements:
State the selected industry and hexadecimal color codes in the research summary.
Use a dark near-black background.
Maintain strong contrast between text and background.
Use the dominant accent for figures, chart lines, icons, and highlights.
Use the supporting accent sparingly for depth.
Avoid oversaturation and excessive neon effects.
Do not automatically use purple for every market.
PHASE 3: IMAGE GENERATION
Create a premium 16:9 landscape market-intelligence cover.
Generate at 2048×1152 pixels in high quality. The composition must remain suitable for export at 1920×1080.
VISUAL STANDARD
The cover should resemble a sophisticated editorial intelligence visual from Bloomberg Intelligence, Bain, McKinsey, or a premium financial publication.
It must feel:
Authoritative
Data-driven
Cinematic
Contemporary
Photorealistic
Executive-grade
Suitable for LinkedIn, report promotion, and corporate publishing
Use the reference image only as structural inspiration. Do not copy its products, text, statistics, map, branding, or exact design.
CANVAS ARCHITECTURE
Left information zone: approximately 38–42%.
Center and right hero zone: approximately 58–62%.
Maintain a minimum 6% safe margin on every side.
Create a clear reading sequence:
Market title
Base-year valuation
CAGR and forecast
Supporting market insight
Hero visual
Forecast chart
Bottom indicator panel
BACKGROUND
Use a cinematic dark gradient built from near-black, charcoal, and the selected industry colors.
Add:
Subtle atmospheric haze
Restrained volumetric lighting
Fine digital texture
Soft reflections
Faint analytical gridlines
A low-opacity map or geographic outline representing the market region
The geographic map must remain subtle and must not interfere with the title.
TITLE AREA
Render the researched market title EXACTLY.
Use a bold premium geometric sans-serif typeface.
Display the title across two to four balanced lines.
Typography treatment:
Geographic region or country in white
Primary market keywords in the dominant accent color
Strong contrast
Clean spacing
No awkward word breaks
No text touching the canvas edges
Add a short horizontal accent line beneath the title.
PRIMARY VALUATION
Display:
"[VERIFIED BASE-YEAR MARKET VALUE]"

"([BASE YEAR])"
Make the market value the most prominent numerical element on the left.
Use white for the currency and the dominant accent color for the numerical value.
CAGR AND FORECAST
Add a clean growth icon and display:
"[VERIFIED CAGR]% CAGR"

"to [VERIFIED FORECAST VALUE] by [FORECAST YEAR]"
Highlight the CAGR and forecast value with the dominant accent color. Keep supporting text white.
If the CAGR or forecast value cannot be verified, remove this block and replace it with a verified market indicator.
SECONDARY MARKET INSIGHT
Display one concise, verified insight such as:
"Online channel share rising to [VALUE]% by [YEAR]"
or:
"[SEGMENT] accounts for [VALUE]% of demand"
or another relevant verified indicator.
Use one simple sector-relevant outline icon.
Keep this insight under 12 words wherever possible.
HERO VISUAL
Independently determine the most relevant hero scene for the market.
Show two to four high-quality visual elements representing the market ecosystem.
Examples:
Products or equipment
Relevant infrastructure
Digital devices and interfaces
Industrial machinery
Healthcare technology
Vehicles and mobility systems
Renewable-energy infrastructure
Consumer goods
Agricultural environments
Logistics facilities
Place the primary hero object near the center-right. Use smaller supporting objects to create depth and market context.
Hero requirements:
Photorealistic
Generic and unbranded
Realistic materials and proportions
Cinematic rim lighting
Controlled depth of field
Subtle reflections
Industry-relevant environment
No copied commercial-product design
DATA-VISUALIZATION LAYER
Integrate a premium upward-trending line or area chart in the upper-right background.
Chart requirements:
Use the selected dominant accent color.
Include a subtle glow.
Use restrained gridlines.
Include circular markers only when meaningful.
Keep the chart visually behind the hero subject.
Do not let the chart cross through important text.
Label only verified values.
If only base and forecast values are known, show only those endpoint labels.
Never invent intermediate annual figures.
At the final data point, display:
"[VERIFIED FORECAST VALUE]"

"[FORECAST YEAR]"
If no reliable forecast value exists, use a qualitative trend visualization without numerical labels.
BOTTOM INTELLIGENCE PANEL
Add a semi-transparent dark glass panel across the lower-left or lower-middle area.
Panel styling:
Rounded corners
Thin border using the dominant accent
Subtle internal glow
Clean vertical dividers
High text contrast
Include a maximum of three verified indicators.
Recommended structure:
Indicator 1:

"[SHORT LABEL]"

"[CURRENT VALUE] → [FORECAST VALUE]"
Indicator 2:

"[SHORT LABEL]"

"[CURRENT VALUE] → [FORECAST VALUE]"
Indicator 3:

"[SHORT LABEL]"

"[VERIFIED VALUE OR SHORT TREND]"
Use a simple outline icon for each indicator.
Do not use paragraphs, citations, disclaimers, or tiny typography inside this panel.
TEXT-CONTROL RULES
Render only the approved title and verified data selected during research.
Preserve spelling, currency, decimals, units, percentages, and years exactly.
Do not paraphrase the report title.
Do not add random text.
Do not repeat a statistic unnecessarily.
Do not invent company names.
Keep text short enough to remain readable on mobile devices.
Use no more than approximately 65–75 words across the entire cover.
Prefer three accurate statistics over many unreadable statistics.
BRANDING RESTRICTIONS
No Ken Research name unless explicitly requested
No company names
No logos
No monograms
No trademarks
No watermarks
No branded products
No copied user interfaces
No competitor branding
FINAL QUALITY CONTROL
After generating the image, inspect it carefully.
Verify:
The market title is spelled correctly.
The geographic region is correct.
All figures match the research table.
Currency units are correct.
CAGR and forecast years are correct.
No fabricated values appear.
Text is legible and correctly placed.
No text is clipped.
No random characters appear.
No logo or brand name appears.
The map matches the market geography.
The color palette suits the industry.
The hero visual accurately represents the market.
The layout remains readable at LinkedIn-feed size.
The chart does not imply unsupported annual figures.
If any title, number, percentage, unit, or year is incorrect or unreadable, repair or regenerate the image before presenting the final result.
NEGATIVE PROMPT
No fabricated statistics, incorrect market values, conflicting forecast years, fake citations, competitor data presented as primary data, random text, spelling mistakes, tiny paragraphs, clipped typography, duplicate objects, distorted products, inaccurate maps, irrelevant hero visuals, logos, company names, trademarks, watermarks, cluttered dashboards, excessive neon, oversaturated colors, cartoon graphics, cheap stock-photo aesthetics, low resolution, weak contrast, or generic template appearance.
FINAL RESPONSE
Return:
The research validation table with direct source links.
The identified industry.
The selected dominant and supporting colors with hexadecimal codes.
The completed 16:9 cover image.
Do not stop after research. Proceed directly to image generation once the selected statistics have been validated.`;
}

// ── Image prompt 2 — immersive editorial/cinematic layout, single continuous
// scene rather than a structured left/right split. User-supplied verbatim
// (2026-08-04), same placeholder substitution as prompt 1.
function imagePrompt2(name: string, reportUrl: string): string {
  return `Act as an elite market-intelligence researcher, creative director, and editorial data-visualization designer.
Create one visually striking, production-ready 16:9 market-intelligence cover for:
MARKET TITLE: "${name}"
REPORT URL: "${reportUrl}"
REFERENCE STYLE: Use this image only as a benchmark for premium quality and data-rich storytelling—not as a layout that must be copied:
https://lh3.googleusercontent.com/d/13G9f9b25YxH3UUniIzHYaBBK3zPo3Dzf
Complete the research, creative direction, color selection, composition, and image generation as one continuous task. Do not stop to present a research table, design plan, or intermediate output. Proceed directly to the finished image.
RESEARCH AND DATA ACCURACY
First, privately research the market using the supplied report URL as the primary source.
Identify:
Correct market title and geographic scope
Most recent reliable market value
Valuation year
Forecast market value
Forecast year
CAGR
One leading segment, channel, technology, or application
Two additional high-value quantitative market indicators
If information is missing from the report page, search reliable government sources, regulators, statistical agencies, international organizations, industry associations, and authoritative sector publications.
Do not use conflicting estimates from competitor market-research firms when the supplied report contains the required information.
Never fabricate a value, CAGR, percentage, currency, year, segment share, shipment figure, or forecast.
Do not combine statistics from different geographies or adjacent markets.
If a reliable figure cannot be verified, omit it and use a concise qualitative market trend instead.
Use no more than five major statistics in the image. Prioritize accuracy, relevance, and visual impact over information volume.
AUTONOMOUS CREATIVE DIRECTION
Identify the industry and independently choose the most appropriate visual language, hero subject, environment, lighting style, data-visualization treatment, and color palette.
Choose:
One dominant industry-appropriate accent color
One complementary supporting color
A dark cinematic background family
A high-contrast neutral color for typography
Do not automatically use purple, red, or blue for every market.
The selected palette should feel psychologically and commercially appropriate for the industry:
Healthcare should feel clinical, trusted, advanced, and human
Technology should feel intelligent, connected, and futuristic
Finance should feel secure, precise, and premium
Renewable energy should feel clean, progressive, and sustainable
Industrial markets should feel powerful, engineered, and operational
Consumer markets should feel desirable, contemporary, and energetic
Luxury markets should feel refined, exclusive, and editorial
Logistics should feel connected, efficient, and infrastructure-led
Agriculture should feel natural, productive, and innovation-driven
Automotive should feel dynamic, engineered, and performance-oriented
VISUAL CONCEPT
Create one cohesive full-bleed editorial scene—not a rigid split-screen template and not a collection of disconnected infographic boxes.
The composition should feel immersive and cinematic, with natural visual flow across the entire canvas.
Use an asymmetrical editorial layout that adapts to the market:
Position the market title within clean negative space.
Make the industry hero visual the central storytelling element.
Integrate statistics into the environment instead of placing everything inside a fixed dashboard.
Allow selected objects, charts, lighting effects, and data signals to visually connect different parts of the composition.
Maintain balance without creating an obvious 50/50 division.
Avoid repetitive "text on the left, product on the right" execution when a more compelling composition is possible.
HERO SCENE
Create a photorealistic hero scene that immediately communicates the market.
Select the most meaningful combination of:
Products
Technology
Infrastructure
Equipment
Professional users
Digital interfaces
Geographic context
Industrial environments
Consumer-use scenarios
Supply-chain elements
Use one dominant focal subject supported by two or three secondary elements.
The primary subject should have:
Realistic scale and proportions
Premium material detail
Cinematic rim lighting
Natural reflections
Controlled depth of field
Strong silhouette
Clear separation from the background
Build depth using foreground, middle-ground, and background layers.
Add restrained atmospheric elements where appropriate:
Volumetric light
Soft haze
Reflections
Subtle particles
Network signals
Energy trails
Data streams
Environmental texture
Geographic contours
These effects should enhance the subject rather than make the image excessively futuristic or artificial.
DATA STORYTELLING
Integrate data visualization organically into the hero scene.
The visualization should relate to the industry:
Technology: network paths, signal waves, connected nodes
Finance: analytical curves, secure transaction flows, digital grids
Energy: capacity curves, power flows, infrastructure networks
Logistics: routes, movement paths, warehouse or port connections
Healthcare: patient pathways, clinical signals, diagnostic interfaces
Automotive: mobility routes, telemetry, charging or traffic patterns
Consumer products: adoption curves, channel growth, product ecosystems
Industrial markets: production paths, capacity indicators, operational systems
Use one principal visualization, such as:
A luminous growth curve
A restrained area chart
A geographic data path
A network visualization
An adoption trajectory
A capacity or volume indicator
Do not add a generic chart simply to fill space.
Label only verified values. Never invent intermediate annual data points.
If only the starting and forecast values are available, show only those verified endpoints.
TYPOGRAPHY AND INFORMATION HIERARCHY
Render the exact market title prominently and verbatim:
"${name}"
Use a premium geometric sans-serif typeface with strong kerning and clean line spacing.
Break the title into two to four balanced lines. Avoid awkward single-word lines.
Create a clear hierarchy:
Market title
Primary market value
CAGR and forecast value
One high-impact market insight
Up to two supporting indicators
Make the market value the strongest numerical element.
Suggested data treatment:
"[VERIFIED MARKET VALUE]"

"[VALUATION YEAR]"
"[VERIFIED CAGR]% CAGR"

"to [VERIFIED FORECAST VALUE] by [FORECAST YEAR]"
All text must be short, bold, high-contrast, and readable at LinkedIn-feed size.
Render every required text element exactly once.
Do not display source URLs, citations, methodology, paragraphs, or disclaimers inside the image.
INTEGRATED STATISTIC CALLOUTS
Display supporting statistics as elegant editorial callouts integrated into available negative space.
They may appear as:
Minimal floating glass capsules
Large standalone numbers
Fine-line annotations
Labels connected to relevant objects
Geographic data markers
Subtle translucent overlays
Do not create a large bottom dashboard.
Do not place all statistics inside identical boxes.
Use no more than three supporting callouts. Each should contain a short label and one meaningful value.
PREMIUM ART DIRECTION
The final image should feel comparable to a high-end Bloomberg Intelligence feature, global consulting publication, institutional-investor presentation, or premium technology campaign.
Aim for:
Strong visual tension
Clear focal hierarchy
Sophisticated asymmetry
Photorealistic materials
Rich but controlled contrast
Elegant negative space
Cinematic lighting
Editorial restraint
Modern data storytelling
Premium commercial finish
The cover must remain visually engaging even when viewed without reading every statistic.
OUTPUT REQUIREMENTS
16:9 landscape
1920×1080 pixels
High-resolution rendering
Sharp, legible typography
Minimum 6% safe margin
No clipped text
No important elements touching the edges
Suitable for LinkedIn, blogs, report pages, PR distribution, and social media
STRICT RESTRICTIONS
No fabricated statistics
No incorrect currencies or years
No competitor market-research figures presented as primary data
No logos
No Ken Research branding unless explicitly requested
No company names
No trademarks
No branded products
No watermarks
No random decorative words
No stock-photo collage
No rigid corporate-template appearance
No large bottom dashboard
No excessive infographic boxes
No crowded composition
No excessive neon
No cartoon or illustration style
No distorted products, people, machinery, or infrastructure
No meaningless futuristic holograms
No repeated title or statistics
No unreadable microtext
FINAL SELF-CHECK
Before delivering the image, visually inspect it and confirm:
The title is spelled exactly as supplied.
The market geography is correct.
Every displayed statistic is verified.
Currency, units, decimals, percentages, and years are accurate.
The colors appropriately represent the industry.
The hero scene clearly communicates the market.
The statistics feel integrated into the visual story.
The image does not resemble a rigid split-screen template.
The composition remains clear at thumbnail size.
No random text, logo, brand name, or watermark appears.
No text is clipped, duplicated, misspelled, or unreadable.
If any text, number, year, currency, or layout element is incorrect, repair the image before delivering the final result.
Return only the completed market-intelligence cover image. Do not provide the research process, source table, explanation, or design rationale.`;
}

function buildImagePrompt(name: string, reportUrl: string, promptChoice: string): string {
  return promptChoice === '2' ? imagePrompt2(name, reportUrl) : imagePrompt1(name, reportUrl);
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
  const prompt = buildImagePrompt(marketName, reportUrl, imagePromptChoice);
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

    // The blocking modal (e.g. "conversation history rate limit") can
    // re-render itself seconds after pasteIntoChatGPTComposer already
    // removed it once — check again right before the send click.
    await dismissBlockingModals(page);
    const sendSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label*="Send"]',
      'button:has(svg)[data-disabled="false"]',
      'div[class*="composer"] button:last-child',
      'form button[type="submit"]',
    ];
    async function trySendClick(): Promise<boolean> {
      for (const sel of sendSelectors) {
        if (await page.locator(sel).last().isVisible({ timeout: 3000 }).catch(() => false)) {
          await page.locator(sel).last().click();
          console.error(`[generate_image] Send clicked via "${sel}"`);
          return true;
        }
      }
      return false;
    }
    let sendClicked = false;
    try {
      sendClicked = await trySendClick();
    } catch (e) {
      console.error(`[generate_image] send click failed (${(e as Error).message.slice(0, 80)}), retrying after modal dismiss...`);
      await dismissBlockingModals(page);
      await page.waitForTimeout(1000);
      sendClicked = await trySendClick();
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
