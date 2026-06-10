# Skill: Generate Image (Agentic)

Generates a 16:9 cover image via ChatGPT DALL-E using Playwright MCP,
uploads to Cloudinary, and returns the secure URL.

**MANDATORY step in blog generation. Never skip. Never use a placeholder. Blog generation stops if this fails.**

---

## HARD RULE: ZERO KEN RESEARCH BRANDING ON ANY IMAGE (NON-NEGOTIABLE)

**This rule overrides everything. No exceptions. No workarounds.**

The generated image MUST NOT contain any of the following — in any font, size, color, opacity, zone, watermark, overlay, badge, or encoded form:
- The words "Ken Research" or "KenResearch" or "Ken" alone as a brand identifier
- Any company name, firm name, brand name, or organization name
- Any tagline, sub-label, or wordmark
- Any logo, monogram, icon, or emblem
- Any text in the bottom-left zone beyond the single thin accent line (pure visual anchor only)
- Any text in the bottom-right zone (reserved for manual logo placement)

The ONLY text allowed on the canvas:
1. The market name title (e.g. "India Cold Storage Market")
2. The optional data hook line (market size · CAGR · forecast)
3. The sector-region badge (e.g. "Logistics & Supply Chain · Asia")
4. The "MARKET INTELLIGENCE" micro label (top-right)

**If the image comes back with "Ken Research" or any brand text visible anywhere → reject it, regenerate with a stricter prompt addition explicitly repeating the ban.**

---

## Inputs
- `marketName` — report topic / market name (e.g. "India Cold Storage Market")
- `marketSize` — e.g. "USD 2.68 Billion" (optional, pass "" if unknown)
- `cagr` — e.g. "12.5% CAGR" (optional, pass "" if unknown)
- `forecast` — e.g. "USD 5.1 Billion by 2028" (optional, pass "" if unknown)

---

## Cloudinary Credentials (hardcoded)
```
CLOUDINARY_CLOUD_NAME = dutg2rtvr
CLOUDINARY_API_KEY    = 226785248494346
CLOUDINARY_API_SECRET = 6pX9f6a_QAFQmPriZDTCTgwtj0w
```

---

## Step 1: Generate Hook Title (inline reasoning)

From `marketName` + data inputs, craft a short catchy cover image title:
- **8–12 words max**
- Include one compelling angle: growth, transformation, opportunity, disruption
- Weave in a key stat naturally if marketSize/cagr/forecast is available
- Title case, no quotes, no em dashes

**Examples:**
- "Indonesia's Courier Wars: A USD 9.2 Billion Battleground"
- "Cold Storage Revolution: USD 2.68 Billion and Climbing"
- "Electric Buses Are Reshaping India's Transit Future"
- "The USD 4.64 Billion Opportunity Big Pharma Cannot Ignore"

Set `hookTitle` = your generated title.

---

## Step 2: Detect Sector Palette (inline reasoning)

Lowercase `marketName` and match to the FIRST matching row:

| Match keywords (any one) | sectorName | accent | accentAlt | dataLineColor | badge | gradient | chartPrimary | chartSecondary | chartTertiary |
|---|---|---|---|---|---|---|---|---|---|
| logistics, cep, courier, express, parcel, freight, supply chain, cold storage, cold chain, warehouse, shipping, cargo | Logistics & Supply Chain | #0A84FF | #38BDF8 | #38BDF8 | #0A84FF | deep slate charcoal (#1B2838) blending into midnight navy (#0F1A2E) | #0A84FF | #38BDF8 | #F59E0B |
| pharma, healthcare, medical, hospital, clinical, diagnostic, ophthalmology, surgery, vaccine, biotech | Healthcare & Pharma | #00BFA5 | #2DD4BF | #2DD4BF | #00BFA5 | cool blue-gray (#1A2332) blending into deep teal-charcoal (#0D1F2D) | #00BFA5 | #2DD4BF | #F43F5E |
| fintech, payment, banking, insurance, lending, credit, financial, investment | Fintech & Financial Services | #DC143C | #FB7185 | #FB7185 | #DC143C | deep maroon (#2A0A0A) blending into charcoal black (#1A1A2E) | #DC143C | #FB7185 | #FBBF24 |
| technology, software, saas, ai, cloud, data, digital, cyber, iot, semiconductor, chip | Technology | #8B5CF6 | #A78BFA | #A78BFA | #8B5CF6 | graphite steel (#1C1C2E) blending into deep violet-black (#12111F) | #8B5CF6 | #A78BFA | #22D3EE |
| energy, power, solar, wind, renewable, oil, gas, petroleum, electricity, grid, nuclear | Energy & Power | #10B981 | #34D399 | #34D399 | #10B981 | deep navy (#0A1628) blending into forest-black (#0B1D0E) | #10B981 | #34D399 | #F59E0B |
| food, agriculture, edible, dairy, beverage, crop, grain, organic, meat, poultry, seafood | Food & Agriculture | #D97706 | #FBBF24 | #FBBF24 | #D97706 | muted warm brown (#2A1F14) blending into dark umber (#1A130D) | #D97706 | #FBBF24 | #34D399 |
| automotive, car, vehicle, ev, electric bus, bus, motor, tire, aftermarket, rental, leasing | Automotive & Mobility | #F97316 | #FB923C | #FB923C | #F97316 | dark charcoal (#1E1E1E) blending into deep warm black (#1A1610) | #F97316 | #FB923C | #3B82F6 |
| real estate, construction, housing, property, building, infrastructure, cement, steel | Real Estate & Construction | #B45309 | #D97706 | #D97706 | #B45309 | warm taupe gray (#2A2420) blending into dark earth (#1A1510) | #B45309 | #D97706 | #0EA5E9 |
| retail, consumer, fashion, perfume, cosmetic, luxury, apparel, ecommerce, e-commerce, shopping | Retail & Consumer | #EC4899 | #F472B6 | #F472B6 | #EC4899 | deep plum (#1F0A1F) blending into dark aubergine (#150A18) | #EC4899 | #F472B6 | #A78BFA |
| education, training, university, learning, academic, school, executive education | Education & Training | #6366F1 | #818CF8 | #818CF8 | #6366F1 | deep indigo-black (#0F0E24) blending into midnight blue (#111827) | #6366F1 | #818CF8 | #F59E0B |
| polymer, chemical, plastic, rubber, material, composite, resin, transformer, bushing | Materials & Chemicals | #0891B2 | #22D3EE | #22D3EE | #0891B2 | dark cyan-gray (#152028) blending into deep petrol (#0C1820) | #0891B2 | #22D3EE | #F97316 |
| (no match — default) | General | #CC2222 | #EF4444 | #E8A317 | #CC2222 | dark charcoal (#1A1A2E) blending into near-black (#0F0F1A) | #CC2222 | #E8A317 | #2ECC71 |

Record as variables: `sectorName`, `accent`, `accentAlt`, `dataLineColor`, `gradient`, `chartPrimary`, `chartSecondary`, `chartTertiary`.

---

## Step 2.5: Derive Hero Visual (inline reasoning)

From `marketName`, extract the 2-3 most specific physical nouns or industrial processes that define this exact market. Write a **2-sentence cinematic scene description** that is unique to this market — never a generic sector fallback like "industrial plant" or "laboratory".

**Examples:**
- `Global Wood Pulp Market` → "A large-scale kraft pulp mill with steaming digesters, wood chip conveyors, and stacked timber logs. Dense forest visible in the background as the raw material source, mist rising from processing towers."
- `India Cold Storage Market` → "A vast refrigerated warehouse with automated racking systems and reefer trucks loading at the dock. Cold vapor rising from open blast-freeze chambers, forklifts moving pallets of packaged goods."
- `Saudi Arabia EV Market` → "A wide electric vehicle charging plaza with rows of EVs plugged in under solar-paneled canopies. Modern highway infrastructure and city skyline visible in the background."
- `Indonesia Courier & Parcel Market` → "A high-throughput last-mile logistics sorting hub with conveyor belts, delivery motorcycles, and stacked parcel bins. Workers scanning packages under bright warehouse lighting."
- `India Transformer Market` → "A high-voltage electrical substation with large oil-immersed transformers, transmission towers, and live power lines. Industrial precision equipment under a dramatic dusk sky."

Set `heroVisual` = your 2-sentence description for this specific `marketName`.

---

## Step 3: Build Chart Guidance (inline reasoning)

Pick ONE based on which data you have:

**All three (marketSize + cagr + forecast):**
```
PREFERRED CHART: Growth Trajectory Visualization
- Line or area chart showing market growth over time
- Starting point: {marketSize}, growth curve at {cagr}, endpoint: {forecast}
- 3-5 segment bubbles along trajectory
- Color coding: primary {chartPrimary}, secondary {chartSecondary}, contrast {chartTertiary}
- Y-axis = Market Value, X-axis = Timeline
- Subtle dashed trend line
```

**marketSize + cagr only:**
```
PREFERRED CHART: Market Sizing Bubble Matrix
- Scatter/bubble chart, total market at {marketSize} as dominant bubble
- {cagr} shows growth momentum, 3-5 smaller segment bubbles
- Y-axis: Growth Rate, X-axis: Market Share or Revenue
- Color coding: primary {chartPrimary}, secondary {chartSecondary}, accent {chartTertiary}
```

**marketSize only:**
```
PREFERRED CHART: Market Composition Bar or Donut Chart
- Total market at {marketSize}, broken into 4-5 segment bars or donut slices
- Horizontal stacked bar or semi-donut style
- Color coding: {chartPrimary}, {chartSecondary}, {chartTertiary}
```

**No data at all:**
```
PREFERRED CHART: Analytical Scatter Plot
- Market intelligence scatter plot
- Y-axis: Market Impact or Growth Rate, X-axis: Timeline or Market Maturity
- 4-6 data bubbles for market segments
- Color coding: primary {chartPrimary}, secondary {chartSecondary}, contrast {chartTertiary}
- Consulting strategy framework feel
```

Set `chartGuidance` = the filled-in text block above.

---

## Step 4: Build the ChatGPT Prompt (inline assembly)

Construct `imagePrompt` by substituting all `${...}` variables below with your Step 1-3 values.
`${safeDataLine}` = marketSize + " · " + cagr + " · " + forecast (skip blanks), max 100 chars.
`${hasData}` = true if any of marketSize/cagr/forecast is non-empty, else false.

```
Act as a premium editorial data visualization designer creating a production-ready cover image for a global strategic market intelligence firm.

Create a finished 16:9 landscape cover (1920×1080) for:
Post Title: ${marketName}
${hasData ? `Data Line: ${safeDataLine}` : ""}
Sector: ${palette.name}

====================================================
VISUAL DIRECTION
====================================================
Design a premium, enterprise-grade editorial intelligence cover.
The image must feel like a strategic market intelligence visual from McKinsey, Bain, or Bloomberg Intelligence.
It must combine a cinematic sector hero scene with a layered analytical data visualization.
The dominant color identity for this sector is ${palette.accent} — use it as the signature accent throughout.

====================================================
CANVAS & LAYOUT
====================================================
Use a frozen two-zone layout:
- LEFT ZONE = 55% of canvas: title, data hook, sector badge
- RIGHT ZONE = 45% of canvas: data visualization chart + hero visual backdrop
Maintain 7% safe margin on all sides. No critical element touches edges.

====================================================
TOP ACCENT STRIP
====================================================
Add a thin 3-4px accent bar across the full top edge using ${palette.accent}.
This strip spans the entire canvas width and sits at the very top.

====================================================
BACKGROUND
====================================================
Use this exact dark cinematic gradient: ${palette.gradient}.
The left side must be darkest behind the text, softly blending toward the center.
The gradient must feel premium, deep, and sector-appropriate.

====================================================
LEFT TEXT CONTENT
====================================================

TITLE LOCK (TOP LEFT):
Render this exact text with zero spelling errors: "${marketName}"
Cross-check every word character by character before rendering.
Use a clean premium sans-serif font similar to Inter or Helvetica Neue.
White text, strong 600 weight.
Break naturally into 3-4 editorial lines, with 2-4 words per line.
Maximum width: 50% of canvas width.
Maximum height: 45% of canvas height.

Automatic line break intelligence:
- Break at natural semantic points (geography, industry, market, transformation)
- Prioritize editorial balance over equal word count
- Each line must feel premium
- Line widths taper naturally
- Maintain elegant vertical rhythm
${hasData ? `
DATA HOOK LINE (directly below title):
Render this exact text: "${safeDataLine}"
Rules:
- ONE single line only, never wrap to a second line
- Font size: 55-65% of title size, clearly legible at a glance
- Use ${palette.dataLineColor} as the accent color for the data text
- Left-aligned directly below the title with a small gap
- Render every character exactly as given: numbers, %, USD, · separators
- If text is long, reduce size to minimum 55% of title size, never smaller
` : ""}

SECTOR-REGION BADGE:
Detect the region from the title "${marketName}".
Create a small pill badge showing: "${palette.name} · [Detected Region]"
Use ${palette.badge} at 20% opacity as badge background, white label text, 11-12px, rounded corners.
Position 12px below the data line (or below the title if no data line).

====================================================
RIGHT-SIDE DATA VISUALIZATION
====================================================

Create a premium analytical chart on the right 45% of the canvas.
The chart must feel like a Bloomberg Terminal or McKinsey strategy visual.
NOT a generic infographic — it must look like real analytical output.

${chartGuidance}

Chart styling rules:
- Thin white or light gray axis lines
- Muted grid lines at very low opacity (5-8%)
- Bubble or node labels in small white text (10-12px equivalent)
- Add subtle connecting lines, trend curves, or trajectory arrows where appropriate
- Numbers and labels must be clearly legible
- The chart should look data-rich but not cluttered
- Use slight glow or highlight effects on key data points using ${palette.accentAlt}

====================================================
MARKET INTELLIGENCE LABEL (TOP RIGHT)
====================================================
Add a small top-right micro label: "MARKET INTELLIGENCE"
Use tiny 10-11px white text with slight transparency (70-80% opacity).
Position within the top-right safe margin area.

====================================================
SECTOR HERO VISUAL (BEHIND CHART)
====================================================
Behind and around the chart, integrate this specific cinematic hero scene:
${heroVisual}

The hero scene must be subtle and cinematic, serving as atmospheric backdrop behind the chart.
Apply a refined schematic / blueprint wireframe overlay to the visual.
Keep hero opacity moderated so the chart remains the primary focus on the right side.

====================================================
SIGNATURE ANALYTICAL OVERLAY
====================================================
Apply a restrained blueprint overlay across the FULL canvas:
- Thin wireframe mesh
- Drafting arcs and construction circles
- Measurement ticks
- Schematic geometry lines
- Subtle technical grid elements
Opacity: 8-12%. Must remain elegant and restrained.
Do NOT obscure the title, data line, or chart labels.

====================================================
BOTTOM-LEFT ACCENT MARK (NO BRAND NAME)
====================================================
Bottom-left safe zone:
- Render a single thin vertical accent line using ${palette.accent}, roughly 28-36px tall
- Leave the area immediately beside it as clean negative space
- DO NOT render any firm name, brand name, company name, tagline, sub-label, or wordmark
- DO NOT render any letters, words, or text in this zone
- No icon, no logo, no monogram, no decorative emblem
- Purpose: pure visual anchor only

====================================================
BOTTOM-RIGHT RESERVED AREA
====================================================
Keep bottom-right corner clean and visually quiet.
Leave negative space for manual logo placement later.
No text, no bright highlights, no important data in this zone.

====================================================
LIGHTING RULES
====================================================
Lighting must feel premium and cinematic.
The overall color temperature should complement the ${palette.accent} accent tone:
- Use subtle ${palette.accentAlt} glow highlights on edges and key surfaces
- Background hero scene should have muted, complementary lighting
- Chart elements should have subtle luminous quality against the dark background
Always: sharp detail, premium realism, strong contrast.

====================================================
STRICT NEGATIVE RULES
====================================================
Do NOT:
- Render the words "Ken Research" anywhere on the image, in any size, font, opacity, or zone
- Render any firm name, company name, brand wordmark, tagline, or sub-label such as "Strategic Intelligence"
- Embed any brand text into the hero scene, chart, watermark, badge, or overlay
- Misspell or alter any word in the title "${marketName}"
- Distort or compress title text
- Add any logo, monogram, or icon
- Create a collage with multiple competing hero visuals
- Place dense text on the right side (chart labels are fine)
- Break safe area margins
- Use cartoon colors or overly saturated colors
- Make it look like a generic infographic or PowerPoint chart
- Clutter with excessive labels or decorations
- Use em dashes in the title

====================================================
FINAL GOAL
====================================================
Output must look like a finished premium consulting-grade market intelligence visual.
It must combine cinematic atmosphere + analytical data visualization + bold editorial typography.
The dominant accent color ${palette.accent} must be clearly visible in the accent strip, data line, chart highlights, and bottom-left accent mark.
The only rendered text on the canvas is: the title, the optional data hook line, the sector-region badge, and the top-right "MARKET INTELLIGENCE" micro label. Nothing else.
The image must be immediately publishable as a microblog header image after manual logo placement in the reserved bottom-right zone.
The viewer should feel they are looking at a Bloomberg or McKinsey strategy document, not a stock photo.
```

---

## Step 5: Open ChatGPT and Generate Image

**BROWSER RULE (HARD — NEVER CHANGES):**
- Use `browser_navigate → https://chatgpt.com` on the EXISTING Chrome session (same profile, same cookies)
- Do NOT launch a new browser or a new incognito session — Cloudflare detects fresh automation sessions
- After image is downloaded, run `browser_navigate → about:blank` to free the tab — NEVER close the browser
- This keeps the ChatGPT login alive for the next blog's image generation

**5a. Navigate to ChatGPT**
```
browser_navigate → https://chatgpt.com
```
Wait 3 seconds after load (`browser_wait_for` or `browser_snapshot`).

**5b. Confirm login status**
Take a `browser_snapshot`. Look for any of:
- New chat button or nav menu → **logged in** ✓
- "Log in" or "Sign in" button → **not logged in**

If NOT logged in: stop, write error "ChatGPT not logged in — please log in manually and retry", return `{ status: "error", message: "ChatGPT not logged in" }`.

**5c. Snapshot pre-existing images**
```javascript
// via browser_evaluate
Array.from(document.querySelectorAll('img')).map(img => img.src).filter(Boolean)
```
Save as `knownSrcsBefore` list.

**5d. Locate chat input and type prompt**
```
browser_click → #prompt-textarea   (or the visible text input area)
browser_type  → {imagePrompt}      (the full prompt from Step 4)
```

**5e. Send the prompt**
Try these selectors in order (stop at first success):
1. `button[data-testid="send-button"]`
2. `button[aria-label="Send prompt"]`
3. `button[aria-label*="Send"]`

If none found → `browser_press_key → Enter`

**5f. Wait for image generation (up to 5 minutes)**

Poll every 15 seconds using `browser_snapshot` until you see an `<img>` element that:
- Has `src` containing `oaidalleapiprodscus` OR `oaiusercontent`
- OR is inside `article img`, `figure img`, `[data-testid*="turn"] img`
- Width > 100px AND height > 100px
- src is NOT in `knownSrcsBefore`

At each poll, also check for error text (any of):
`"can't create images"`, `"can't generate images"`, `"unable to generate"`, `"content policy"`, `"generation limit"`, `"try again later"`, `"something went wrong"`

If error text found → return `{ status: "error", message: "ChatGPT error: {phrase}" }`.

**5f-verify. Visual check after image appears**
Take a `browser_screenshot` immediately after the image loads. Scan visually for any text reading "Ken Research", any company name, any logo, any wordmark. If any brand text is visible anywhere on the image → do NOT download it. Clear the chat, resubmit the prompt with this line prepended: `CRITICAL: Do NOT render the words Ken Research or any company name or brand anywhere on this image. Zero branding.` Then wait for a new image and re-verify.

**5g. Get image src**
```javascript
// via browser_evaluate — get src of the newest large image not in knownSrcsBefore
const imgs = Array.from(document.querySelectorAll('img'));
const fresh = imgs.filter(img =>
  img.naturalWidth > 100 &&
  img.naturalHeight > 100 &&
  img.src &&
  !knownSrcsBefore.includes(img.src)
);
fresh[fresh.length - 1]?.src || null
```
Set `imgSrc` = result.

If `imgSrc` is null → return `{ status: "error", message: "Image src not found after generation" }`.

**5h. Download image as base64**
```javascript
// via browser_evaluate
const response = await fetch('{imgSrc}');
const blob = await response.blob();
return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result.split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});
```
Set `base64Data` = result.

**5i. Save image to temp file (Bash)**

```bash
# Build public_id slug from marketName (max 60 chars)
PUBLIC_ID=$(echo "{marketName}" | tr '[:upper:]' '[:lower:]' | tr ' /' '--' | tr -cd 'a-z0-9-' | cut -c1-60 | sed 's/-*$//')
TEMP_FILE="C:/Users/Pranav Gupta/OneDrive - Ken Research Private Limited/Desktop/agents/generated_images/${PUBLIC_ID}_$(date +%s).png"

# Write base64 to file
echo "{base64Data}" | base64 -d > "$TEMP_FILE"
echo "TEMP_FILE=$TEMP_FILE"
echo "PUBLIC_ID=$PUBLIC_ID"
```

Set `tempFile` and `publicId` from output.

---

## Step 6: Upload to Cloudinary (Bash — no Python needed)

```bash
CLOUD_NAME="dutg2rtvr"
API_KEY="226785248494346"
API_SECRET="6pX9f6a_QAFQmPriZDTCTgwtj0w"
FOLDER="microblogs"
PUBLIC_ID="{publicId}"
TEMP_FILE="{tempFile}"

TIMESTAMP=$(date +%s)

# Generate SHA1 signature
SIGN_STRING="folder=${FOLDER}&public_id=${PUBLIC_ID}&timestamp=${TIMESTAMP}${API_SECRET}"
SIGNATURE=$(echo -n "$SIGN_STRING" | openssl sha1 -hex | awk '{print $NF}')

# Upload
RESPONSE=$(curl -s -X POST \
  -F "file=@${TEMP_FILE}" \
  -F "api_key=${API_KEY}" \
  -F "timestamp=${TIMESTAMP}" \
  -F "signature=${SIGNATURE}" \
  -F "folder=${FOLDER}" \
  -F "public_id=${PUBLIC_ID}" \
  "https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload")

echo "$RESPONSE"
```

Parse `secure_url` from JSON response. Set `cloudinaryUrl`.

**Cleanup temp file:**
```bash
rm -f "{tempFile}"
```

---

## Step 7: Return Result

```json
{
  "status": "success",
  "cloudinaryUrl": "{cloudinaryUrl}",
  "hookTitle": "{hookTitle}",
  "sector": "{sectorName}",
  "marketName": "{marketName}"
}
```

On any failure at any step:
```json
{
  "status": "error",
  "message": "{what failed}",
  "marketName": "{marketName}"
}
```

---

## Error Handling Rules

- **ChatGPT not logged in** → return error immediately, do NOT attempt login
- **Image not found after 5 min** → return error, close browser
- **Cloudinary upload fails** (non-200 response) → return error with full curl response
- **base64 decode fails** → return error
- **Always close the browser tab** after Step 5 (success or failure):
  ```
  browser_navigate → about:blank
  ```
  This keeps the browser ready for the next task.

---

## Generated Images Folder

Save temp files to:
```
C:/Users/Pranav Gupta/OneDrive - Ken Research Private Limited/Desktop/agents/generated_images/
```

Create folder if it doesn't exist:
```bash
mkdir -p "C:/Users/Pranav Gupta/OneDrive - Ken Research Private Limited/Desktop/agents/generated_images"
```
