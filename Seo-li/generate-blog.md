# Skill: Generate Article (Seo-li v1.2)

Generates a LinkedIn Article from a Ken Research report URL, optimized for Search Everywhere Optimization (SEO + AEO + AIO + GEO + SXO + Query Fan-Out).

**Reference spec:** v1.2 LinkedIn Article Indexing Workflow (Search Everywhere Optimization layer)

---

## Full Pipeline (MANDATORY ORDER — every article, no steps skipped)

```
STEP 1a  Pick URL                           scripts/pick_urls.py
STEP 1b  Scrape report page                 WebFetch
STEP 1c  Find first empty row in Blogs      Sheets API (header lookup)
STEP 1d  FIRE IMAGE PROMPT (background)     Seo-li/generate-image.md 1-5e   ← MANDATORY, BEFORE research
STEP 2   Market research (3 parallel)       WebSearch
STEP 3   Build UTM URL                      inline
STEP 4   Write H1 + Article Title           inline
STEP 5   Write article body (800-1100w)     inline
STEP 6   Wrap into HTML template            inline
STEP 7   RETRIEVE IMAGE + CLOUDINARY        Seo-li/generate-image.md 5f-6   ← MANDATORY, replace placeholder
STEP 8   Sanity check (17 flags + Jaccard)  Seo-li/sanity-blog.md
STEP 9   QA score (must >= 88)              Seo-li/qa-blog.md
         If 70-87 → repair (Seo-li/repair-blog.md), max 2 attempts
STEP 10  Generate caption (data + urgency)  Seo-li/generate-caption.md
STEP 11a Write to Blogs sheet               scripts/sheet_write.py --sheet seoli
STEP 11b Save markdown + caption files      outputs/linkedin_articles/{vertical}/{slug}.md
```

**HARD RULES — never skipped, never optional:**

1. **Image MUST be generated for every article.** No placeholder URL is acceptable for an article being written to the sheet. If ChatGPT image generation fails after 2 retry attempts, STOP that article, log the failure, and move to the next URL in the batch. Never write an article with a placeholder image.
2. **Step 1d (fire image) MUST run BEFORE Step 2 (research).** Image gen is the slowest step (60-90s). Firing it first lets it run in the background while you research, write, sanity, and QA the article — total wall-clock time drops by ~90 seconds per article.
3. **Step 7 (retrieve image) MUST run BEFORE Step 11 (sheet write).** The HTML `<img src='...'>` tag must contain the real Cloudinary `secure_url`, NOT a placeholder, NOT a chatgpt.com backend URL (which expires).
4. **Row write uses sheet_write.py --row <data_row>.** The tool converts data_row → sheet_row by adding 1 (header is row 1). Always pass the **data_row** value returned by Step 1c, never the sheet_row.

---

## CORE OBJECTIVE

Convert structured Ken Research report data into LinkedIn Articles that are:
- Research-backed
- Entity-rich
- Non-duplicative
- Easy for Googlebot to parse
- Useful for B2B decision-makers
- Connected back to the original Ken Research report URL

One strong, data-backed article beats twenty weak duplicated microblogs.

---

## UNIVERSAL HARD RULES

### Rule 1: ONE Ken Research Link Only (CRITICAL — v1.2 anti-pattern reversal)
The article must contain **exactly ONE** link to a Ken Research URL — placed in the final "Data Source and Full Analysis" section. NO inline KR interlinks, NO multiple CTAs, NO branding paragraph with a second link. More than one KR link = REJECT.

### Rule 2: ZERO Em/En Dashes Anywhere
The characters `—` (U+2014) and `–` (U+2013) are completely banned from every field: H1, headings, body, bullets, caption, metadata. Use colons, commas, periods, or "as/while/because" instead.

### Rule 3: All Numbers and Stats MUST Be Bold
Every number, percentage, currency figure, statistic, or data point in the body MUST be wrapped in `<strong>` tags. No exceptions.

### Rule 4: UTM Format LOCKED
All Ken Research links use exactly: `?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=AN`

### Rule 5: Entity Mapping Mandatory
Every article must name at least:
- 3 companies / competitors / ecosystem entities
- 1 regulator, government body, or institutional authority
- 1 policy, framework, or official reference

### Rule 6: ChatGPT Image Generation — Existing Browser
Use the existing logged-in Chrome session at `https://chatgpt.com`. NEVER launch a new browser. After download, navigate to `https://chatgpt.com/new`. Never close the browser.

### Rule 7: ZERO Ken Research Branding on Cover Image
No company name, logo, wordmark, or brand text on the image. If detected → regenerate.

### Rule 8: Government Programme Names — No Quotes
Programme names like `Make in India`, `Vision 2030`, `Merdeka Belajar` are proper nouns. NEVER wrap in double quotes.

---

## INPUTS

- `targetUrl` — Ken Research report URL (picked from `data/sitemap_urls.json` via `scripts/pick_urls.py`)
- `rowNumber` — Blogs tab data row (find first empty)

---

## STEP 1: PICK URL + SCRAPE REPORT

### 1a. Pick URL
```
python scripts/pick_urls.py --count <N>
```
Picks N fresh URLs from the sitemap cache. Logs to `data/already_posted.json`.

For large batches (N >= 50), use vertical filter:
```
python scripts/pick_urls.py --count <k> --vertical education
python scripts/pick_urls.py --count <k> --vertical warehousing
python scripts/pick_urls.py --count <k> --vertical ecommerce-logistics
python scripts/pick_urls.py --count <k> --vertical furniture
```

### 1b. Scrape Report Page
For each URL, fetch and extract:
- `report_title` — H1/title
- `meta_description`
- `page_content` (first 8000 chars)
- `sample_report_url`
- Market metrics (base year, current value, forecast year, projected value, CAGR)
- Competitor entities, regulatory bodies, policies

### 1c. Find Target Row in Blogs Tab
Read the shared `Blogs` Google Sheet tab via Sheets API. Find first empty row by checking `Blog Content` column (header lookup, not hardcoded index).

### ⚡ 1d. FIRE IMAGE PROMPT IMMEDIATELY — BEFORE RESEARCH (HARD RULE)

As soon as the URL is picked and the market name is known, fire the image prompt to ChatGPT RIGHT NOW. Do NOT wait for Step 2 research. The image generates in the background (60-90s) while research and writing run (3-5 min), so there is zero idle wait.

**Run `Seo-li/generate-image.md` — Steps 1 through 5e:**

1. Read `Seo-li/generate-image.md`.
2. Inputs: `marketName` (derive from the URL slug — hyphens to title case, e.g. `thailand-data-center-and-cloud-services-market` becomes `Thailand Data Center and Cloud Services Market`). Set `marketSize`, `cagr`, `forecast` to `""` (research has not run yet).
3. Execute that skill's Step 1 (hook title), Step 2 (sector palette), Step 2.5 (hero visual), Step 3 (chart guidance — use the "No data at all" variant since research has not run), Step 4 (assemble `imagePrompt`).
4. Execute its Step 5a-5e: navigate to `https://chatgpt.com` on the existing Chrome session, confirm login, snapshot `knownSrcsBefore`, type `imagePrompt`, send.
5. **DO NOT wait for generation to finish.** Once the prompt is sent, immediately proceed to Step 2 (research).

Carry `knownSrcsBefore`, `marketName`, and `sectorName` forward to Step 7.

**IMAGE HARD RULES:**
- ZERO Ken Research branding on the image — no company name, logo, or wordmark anywhere on the canvas. Enforced in Step 7 visual check.
- Use the FULL structured prompt from `Seo-li/generate-image.md` Step 4. NEVER use a short prompt.
- Never close the ChatGPT browser between articles. Navigate to `https://chatgpt.com/new` between runs (Step 7 handles this).

If ChatGPT is not logged in: log the error, STOP this article, mark URL as failed, and move to the next URL in the batch. Do NOT attempt login yourself. Do NOT fall back to a placeholder image — placeholder articles are not acceptable output.

**Pipelining for N > 1 articles in one batch:** as soon as the CURRENT article's image prompt is sent (Step 1d), and before the current article's research, fire the NEXT article's image prompt too. ChatGPT generates them back to back while you research and write. Retrieve each article's image (Step 7) only after that article's HTML is written.

---

## STEP 2: RESEARCH MARKET DATA

Run 3 focused web searches in PARALLEL (single tool-call message):

1. `"{market name} market size CAGR {country} 2024 2025 forecast"` — confirm/enrich numbers
2. `"{market name} key players companies market share deals"` — entities
3. `"{market name} {country} government ministry regulation policy 2024"` — regulator + policy

Max 5 searches total. Compress to a structured fact bank IMMEDIATELY, discard raw text:

```json
{
  "report_title": "...",
  "vertical": "...",
  "country_or_region": "...",
  "base_year": 2024,
  "forecast_year": 2030,
  "current_market_value": "USD X Billion",
  "projected_market_value": "USD Y Billion",
  "cagr": "X.X%",
  "dominant_region": "...",
  "dominant_region_share": "X%",
  "primary_growth_driver": "...",
  "secondary_growth_drivers": ["...", "..."],
  "competitor_entities": ["Company A", "Company B", "Company C"],
  "regulatory_entities": ["Ministry of ..."],
  "regulatory_frameworks": ["Policy Name", "Regulation Number"],
  "official_reference_links": ["https://gov.example.gov/specific-page"],
  "ken_report_url": "https://www.kenresearch.com/...",
  "target_audience": ["CXOs", "Strategy Heads", "Procurement", "Investors", "Market Entry"]
}
```

---

## STEP 3: BUILD UTM URL (single link only)

Only ONE Ken Research URL appears in the article — the target report link in the final section:

```
{ken_report_url}?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=AN
```

NO sample report link, NO homepage link, NO related report interlinks, NO inline KR mentions with URLs.

---

## STEP 4: WRITE THE TITLE

### H1 Title — 60-90 chars
Format: `{Market Name} Market Analysis: Growth Drivers, Revenue Projections, and Competitive Landscape ({Base Year}-{Forecast Year})`

If too long, use shorter form: `{Market Name} Outlook {Base Year}-{Forecast Year}: {Sharp Hook}`

Hard checks:
- Starts with market name (not "Ken Research", not a question word)
- Contains the forecast year span
- No em/en dashes
- No stale years (older than current year)

### Article Display Title — same as H1 (LinkedIn uses one title field)

---

## STEP 5: WRITE THE ARTICLE BODY (v1.2 STRUCTURE)

Use this exact structure. Word target: **800-1100 words**.

```markdown
# [Market Name] Market Analysis: Growth Drivers, Revenue Projections, and Competitive Landscape ([Base Year]-[Forecast Year])

## Executive Summary
[35-45 words. Direct answer. What is changing in this market and why now? No fluff, no "in today's fast-paced world". Open with the shift, name the driver.]

## Key Market Velocity Data
- **Current Market Value:** [Value] in [Base Year]
- **Projected Market Value:** [Value] by [Forecast Year]
- **CAGR:** [CAGR]% during [Forecast Period]
- **Dominant Regional Hub:** [Region] with [share if available]
- **Primary Growth Catalyst:** [Main driver]

## What Is Driving the Market?
[2-3 specific drivers with data and business meaning. Each driver: signal + bolded figure + implication. 90-120 words.]

Bullet 2-3 supporting points if useful:
- **Demand shift:** [specific reason with stat]
- **Supply-side change:** [specific reason with stat]
- **Regulatory push:** [policy/regulator with date or threshold]

## Which Entities Are Shaping the Market?
[Name AT LEAST 3 companies and 1 regulator and 1 policy. Connect them to market dynamics. 90-120 words. No "best/top" claims without evidence.]

## What Does This Mean for B2B Decision-Makers?
[Explain procurement, investment, market entry, pricing, or vendor strategy implications. Target audience: CXOs, Strategy Heads, Procurement, Investors. 90-120 words.]

Bulleted action points:
- **For [stakeholder 1]:** [specific action + figure + outcome]
- **For [stakeholder 2]:** [specific action + figure + outcome]
- **For [stakeholder 3]:** [specific action + figure + outcome]

## Ken Research Strategic Outlook
[2-3 sentences of ORIGINAL interpretation. NOT a summary of the report. Add a new angle: consolidation, margin pressure, regulatory transfer, regional pivot, etc. This is the non-commodity insight that makes the article AI-citable.]

## Data Source and Full Analysis
For deeper segment-level analysis, access the full Ken Research report here:
[**[Market Name] Market Report**](REPORT_URL_WITH_UTM)
```

### Body writing rules
- Use H2 question-style subheads (AEO)
- Short paragraphs (3-4 lines max for SXO)
- Scannable bullets where stats stack
- Every paragraph carries at least 2 data figures (DATA DENSITY)
- No two consecutive sentences both stat-free
- All numbers wrapped in `<strong>` tags in the final HTML
- Entity mapping in section 3 is mandatory (3 companies + 1 regulator + 1 policy)
- Strategic Outlook is mandatory (no generic restatement)

### Banned phrases (AI fluff — REJECT if found)
- "In today's fast-paced world"
- "Delve deep" / "Delve into"
- "Revolutionizing"
- "Dynamic landscape"
- "Testament to"
- "Game changer"
- "Unlock potential"
- "Cutting-edge"
- "Robust ecosystem"

---

## STEP 6: HTML CONVERSION

For Pulse publishing, the markdown is rendered as HTML. Locked HTML template (insert cover image at top):

```html
<img src='{coverImageUrl}' alt='{market name} showing {2-3 visual elements}'>

<h1>{H1 — 60-90 chars}</h1>

<h2>Executive Summary</h2>
<p>{35-45 words direct answer}</p>

<h2>Key Market Velocity Data</h2>
<ul>
  <li><strong>Current Market Value:</strong> <strong>{value}</strong> in <strong>{base year}</strong></li>
  <li><strong>Projected Market Value:</strong> <strong>{value}</strong> by <strong>{forecast year}</strong></li>
  <li><strong>CAGR:</strong> <strong>{X.X}%</strong> during <strong>{period}</strong></li>
  <li><strong>Dominant Regional Hub:</strong> {region} <strong>{share}</strong></li>
  <li><strong>Primary Growth Catalyst:</strong> {driver}</li>
</ul>

<h2>What Is Driving the Market?</h2>
<p>{driver paragraph with bolded stats and implication}</p>
<ul>
  <li><strong>{Label}:</strong> {content with stat}</li>
</ul>

<h2>Which Entities Are Shaping the Market?</h2>
<p>{companies + regulators + policies}</p>

<h2>What Does This Mean for B2B Decision-Makers?</h2>
<p>{implications}</p>
<ul>
  <li><strong>For {stakeholder}:</strong> {action + stat + outcome}</li>
</ul>

<h2>Ken Research Strategic Outlook</h2>
<p>{2-3 sentences original interpretation}</p>

<h2>Data Source and Full Analysis</h2>
<p>For deeper segment-level analysis, access the full Ken Research report here: <a href='{report_url_with_utm}' style='color:#0645AD; font-weight:700; text-decoration:underline;' target='_blank' rel='noopener'><strong>{Market Name} Market Report</strong></a></p>
```

**Total links in HTML:** exactly 1 (the target report).
**Optional external links:** 1 government/regulator link in the body is allowed and improves GEO. Use plain `<a>` style (no bold wrap), exact page (not homepage). The Ken Research link still counts as the only KR link.

---

## STEP 7: RETRIEVE IMAGE + UPLOAD TO CLOUDINARY

The image prompt was sent at Step 1d. By now (research, URL selection, and writing are done) the image should be ready or nearly ready.

**Run `Seo-li/generate-image.md` — Steps 5f through 6:**

1. Read `Seo-li/generate-image.md`.
2. Execute its Step 5f (poll for the new image, up to 5 min, matched against `knownSrcsBefore`; check for ChatGPT error text).
3. Execute Step 5f-verify (visual branding check — if "Ken Research" or any brand text is visible on the generated image, REJECT and regenerate with the stricter ban prepended to the prompt).
4. Execute Step 5g (get `imgSrc` from the matched DOM node).
5. Execute Step 5h (download base64 via browser_evaluate fetch + readAsDataURL).
6. Execute Step 5i (save the base64 payload to a local temp file under `C:/tmp/seoli_cover_{slug}.png`).
7. Execute Step 6: upload the temp file to Cloudinary, parse `secure_url`, clean up the temp file.
8. Navigate `browser` to `https://chatgpt.com/new` (NEVER close the browser, NEVER use about:blank — this keeps the session alive for the next article).

**On success:**
- Set `coverImageUrl` = the Cloudinary `secure_url`
- Replace the `{coverImageUrl}` placeholder in the HTML img tag with the real URL
- Log: `[image] Cover URL: {coverImageUrl}`

**On failure (ChatGPT error, login lost, Cloudinary error, branding visible after 2 regen attempts):**
- Log the failure with the exact reason and which step failed (5f poll / 5f-verify branding / 5g src / 5h base64 / 5i save / 6 Cloudinary)
- STOP this article. Do NOT proceed to sanity / QA / sheet write.
- Mark this URL as failed in the batch tracker; move to the next URL.
- Never fall back to a placeholder URL in the sheet — placeholder articles are not acceptable output.

The `{coverImageUrl}` variable is the value used in the Step 6 HTML template `<img src='{coverImageUrl}'>` at the very top of the article body.

---

## STEP 8: SANITY CHECK

Read `Seo-li/sanity-blog.md` and run every block. Pass inputs: `h1`, `articleTitle`, `htmlContent`, `seoDescription`, `caption`.

Fix every CRITICAL [FAIL] before proceeding. The 17 v1.2 validation flags must all be TRUE.

Hard character ceiling: HTML must be **strictly under 14,000 characters**.

---

## STEP 9: QA SCORE

Read `Seo-li/qa-blog.md` and score the article. Pass: `htmlContent`, `h1`, `articleTitle`, `targetUrl`.

Gate:
- **score >= 88 → PASS** → proceed
- **score 70-87 → FAIL** → run `Seo-li/repair-blog.md` (max 2 attempts)
- **score < 70 → REJECT** → repair; if still < 70 after 2 attempts, flag the row red

Set `articleRating = round(score / 10)`.

---

## STEP 10: GENERATE THE CAPTION

Read `Seo-li/generate-caption.md`. Generate the LinkedIn feed caption (under 150 words, curiosity-gap structure, one specific question, soft CTA, NO "link in comments" language).

---

## STEP 11: WRITE TO SHEET + MARKDOWN FILE

### 11a. Write to Seo-li Sheet Tab
Build a JSON payload with columns: `targetUrl`, `Title`, `Name`, `Blog Title`, `Blog Description`, `Blog Caption`, `Blog Content`, `blogBatch`, `Rating`.

```
python scripts/sheet_write.py --sheet linkedin --row <data_row> --updates-file C:/tmp/li_blog_updates_{row}.json
```

(Requires `seoli` alias in `scripts/sheet_write.py` SHEET_MAP pointing to the `Seo-li` tab. Add the tab if it doesn't exist.)

### 11b. Save Markdown File (for browser publishing)
```
outputs/linkedin_articles/{vertical-slug}/{report-slug}.md
```

Include YAML frontmatter:
```yaml
---
platform: linkedin_article
publishing_method: browser_manual
brand: Ken Research
vertical: {vertical}
country_or_region: {country}
report_title: {report_title}
report_url: {ken_report_url}
base_year: {base_year}
forecast_year: {forecast_year}
status: draft_ready
operator_action_required: true
---
```

The frontmatter is NOT pasted into LinkedIn — it is automation tracking only.

### 11c. Save the Caption
```
outputs/linkedin_articles/{vertical-slug}/{report-slug}_caption.md
```

---

## STEP 12: OPERATOR PUBLISHING (manual browser paste)

The operator:
1. Opens LinkedIn → "Write an article"
2. Pastes the title into the headline field
3. Pastes the article body into the editor
4. Manually hyperlinks: Ken Research title → report URL (already done), regulator name → official domain (if not already linked)
5. Publishes
6. Copies the live Linkedin Pulse URL
7. Saves URL + published date back to the Blogs tab

Then in a SEPARATE LinkedIn feed post, the operator posts the caption (from `..._caption.md`) referencing the article.

---

## ANTI-PATTERNS (REJECT IF PRESENT)

Reject the draft if:
- Has MORE than one Ken Research link
- Has zero original strategic interpretation (just restates report)
- Contains "best", "top", "leading" claims without supporting evidence
- Contains fake citations or fake company names
- Uses any banned AI fluff phrase from Step 5
- Has fewer than 3 company entities OR no regulator OR no policy
- Has em/en dashes anywhere
- Has unbolded numbers in the body
- Has Ken Research mentioned more than 3 times total
- Has a "Research Basis" section (the Strategic Outlook section replaces it)
- Has thin "what is" content with no Ken Research perspective
- Has duplicate similarity above threshold vs another platform version
- Uses "link in comments" / "full analysis linked in comments" anywhere
- Has hidden prompts for AI crawlers
- Manipulates AI systems through fake authority claims

---

## QUERY FAN-OUT REQUIREMENT (5-OF-8)

Every article must cover at least 5 of these 8 fan-out angles:

| # | Angle | Covered in section |
|---|---|---|
| 1 | market_definition | Executive Summary |
| 2 | market_size | Key Market Velocity Data |
| 3 | growth_drivers | What Is Driving the Market |
| 4 | regional_dynamics | Key Market Velocity Data + What Is Driving |
| 5 | competitive_landscape | Which Entities Are Shaping the Market |
| 6 | regulatory_context | Which Entities Are Shaping the Market |
| 7 | buyer_implication | What Does This Mean for B2B Decision-Makers |
| 8 | future_outlook | Ken Research Strategic Outlook |

Sanity will count covered angles. <5 = REJECT.

---

## RETURN

```
articleTitle: {title} ({char_count} chars, 60-90)
wordCount: {n} (target 800-1100)
charCount: {n} (max 14000)
kenResearchLinks: 1 (must be exactly 1)
externalGovLinks: {0 or 1}
entities: {n companies + n regulators + n policies}
fanoutAngles: {n}/8 (must be >=5)
seoDescription: {n chars, max 160}
caption: {n words, max 150}
rating: {1-10}
rowNumber: {n}
coverImageUrl: {cloudinary_url}
mdFile: outputs/linkedin_articles/{vertical}/{slug}.md
captionFile: outputs/linkedin_articles/{vertical}/{slug}_caption.md
status: ready_for_manual_publishing
```
