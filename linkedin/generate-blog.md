# Skill: Generate Blog (HTML Microblog)

Generates a 1000-1300 word HTML microblog from a Ken Research report URL.
Pipeline: Scrape → Research → **Start Image** → Sitemaps (parallel) → Retrieve Image → Write HTML → Sanity Check → Save to Sheet

---

## UNIVERSAL RULES (never change, never skip)

### Rule 1: URL Source

Blog target URLs are picked by `scripts/pick_urls.py` from the sitemap cache. **Never read targetUrl from the sheet. Never fetch sitemaps live. Never use web search for URLs.**

**When user says "generate N blogs":**
```
python scripts/pick_urls.py --count N
```

This returns N fresh URLs that:
- Come from `data/sitemap_urls.json` (34,311 URLs, lastmod >= 2025)
- Have NOT been picked before (checked against `data/already_posted.json` log)
- Are NOT already present in the `Blogs` tab `targetUrl` column
- Are logged immediately to `data/already_posted.json` to prevent re-use

The picked log persists across all sessions. Once a URL is picked it will never be picked again unless the log is manually reset.

**If cache file is missing:** run `python scripts/sitemap_cache.py` first, then pick.
**If pick_urls.py returns fewer than N:** cache may be exhausted — run `python scripts/sitemap_cache.py` to refresh.

### Rule 2: Row Targeting in the Blogs Tab
- All LinkedIn blogs are written to the dedicated **`Blogs`** tab — NOT the shared `Blogs` tab
- Always find the **first empty row** in the `Blogs` tab (`Blog Content` column empty or < 50 chars) using the Step 9a row-finding snippet
- Fill from that row onward — never overwrite a row that already has Blog Content
- Write: `targetUrl`, `Title`, `Name` before starting generation if not already present

### Rule 3: Sequential Processing with Image Pipelining
- Each blog is finished one at a time: only after a blog's sheet write confirms `ok: true` do you move to the next blog's research and writing.
- **EXCEPTION — image pipelining (saves 60-90s per blog):** as soon as the CURRENT blog's image prompt is sent to ChatGPT (Step 1d), and before you start the current blog's research, fire the NEXT blog's image prompt too. ChatGPT generates them back to back while you research and write. Retrieve each blog's image (Step 2b) only after that blog's HTML is written.
- Net effect: blog K+1's image generates in the background while blog K is being written — zero idle wait. The blogs themselves are still completed and sheet-written sequentially.

### Rule 5: ZERO EM DASHES AND ZERO EN DASHES — ANYWHERE, EVER (HARD RULE, NON-NEGOTIABLE)

⚠️ THIS MISTAKE HAS HAPPENED BEFORE AND IS UNACCEPTABLE ⚠️

The characters `—` (U+2014 em dash) and `–` (U+2013 en dash) are COMPLETELY BANNED from every single field in the output:
- H1 title
- Blog Title
- Blog Description
- Blog Caption
- Every paragraph in the HTML body
- Every H2 and H3 heading
- Every bullet point
- Both CTA blocks
- All 5 FAQ questions and answers
- The Conclusion

**Before typing a single word of content:** internalize this ban. Every time you would naturally write `—` or `–`, stop and use one of these instead:
- Colon `:` for pivots ("Market grows fast: here is why")
- Comma `,` for parenthetical asides
- Period `.` to start a new sentence
- The word `as`, `while`, `because`, `and` for connective flow
- Parentheses `()` for true parenthetical content

**Also banned:** semicolons `;` used as em-dash substitutes between two clauses. They create the same jarring break as a dash. Use a period or a connective word instead. Semicolons are only permitted inside HTML attribute strings (e.g. `style="color:#000;"`) — never in blog prose.

**After writing the blog:** do a literal character search for `—` and `–` across the ENTIRE output before saving. If either character appears even once → rewrite that sentence. Do NOT patch with a find-replace. Understand why the dash was there and rephrase properly.

**Zero tolerance. No exceptions. Not even one.**

### Rule 6: ALL Numbers and Stats MUST Be Bold (HARD RULE, NO EXCEPTIONS)

Every single number, percentage, currency figure, statistic, or data point in the blog HTML content MUST be wrapped in `<strong>` tags. No exceptions. This applies to:
- Every number in every paragraph (e.g. `<strong>USD 8.4 billion</strong>`, `<strong>12.8% CAGR</strong>`, `<strong>USD 15.6 billion by 2030</strong>`)
- Every percentage in every bullet point
- Every year tied to a value (e.g. `<strong>USD 8.7 billion in 2026</strong>`)
- Every count figure (e.g. `<strong>62 million users</strong>`)
- Every growth multiple or comparative figure (e.g. `<strong>doubled in five years</strong>`)
- Every stat in every FAQ answer

If a number appears unbolded anywhere in the blog HTML → it is a failure. Bold it. There are no exceptions for "too many bolds" — every stat gets `<strong>` regardless.

### Rule 7: No Quotes Around Government Programme or Initiative Names

Government programmes, policy initiatives, and official schemes must **never** be wrapped in double quotes inside the blog HTML. They are proper names and should be written plainly.

**BAD:** `"10 New Balis"` directive / the `"Make in India"` programme / `"Vision 2030"` plan ❌
**GOOD:** `10 New Balis directive` / the `Make in India programme` / `Vision 2030 plan` ✅

This applies to all instances: H2 headings, body paragraphs, FAQ answers, CTAs.

**Why:** Double quotes in HTML around a phrase that already contains the word in surrounding context create visual doubling (e.g. the `"` before `<strong>` and the closing `"` render as `""text""` in some environments). Programme names are proper nouns — they do not need quotation marks.

---

### Rule 4: ChatGPT Image Generation — NORMAL BROWSER (HARD RULE, NEVER CHANGES)
- Navigate to `https://chatgpt.com` using `browser_navigate`
- Use the **existing Chrome session** — do NOT launch a new browser, do NOT clear cookies
- Do NOT trigger Cloudflare bot detection — use the same profile already logged in
- After image is downloaded: run `browser_navigate → https://chatgpt.com/new` to start a fresh chat
- **NEVER close the browser entirely** — only navigate to chatgpt.com/new
- **NEVER navigate to about:blank** — always use chatgpt.com/new to keep the session alive and avoid re-login
- This keeps the ChatGPT login session alive for the next blog with zero extra round-trip
- If ChatGPT is NOT logged in: stop, write error to sheet, do NOT attempt login yourself — wait for user to re-login manually

---

## Inputs
- `targetUrl` — Ken Research report URL (from URLs sheet, then written to the `Blogs` tab)
- `rowNumber` — `Blogs` tab data row number (1-based, find first empty)
- `postingPlatform` — which platform (default: `linkedin-pulse`)

---

## Step 1: Pick URLs + Scrape Report Pages

### 1a. Pick URLs
Before doing anything else, pick the blog target URLs. N = number of blogs the user asked to generate.

**Standard pick (small batches, N < 50):**
```
python scripts/pick_urls.py --count <N>
```
Pick all N normally. No vertical bucket — the mix stays random.

**PRIORITY VERTICAL BUCKET (large batches, N >= 50 only):**

For batches of 50 or more, allocate **~40%** of the blogs to 4 priority verticals, split roughly evenly across them. The remaining ~60% is picked normally (random mix).

The 4 priority verticals: `education`, `warehousing`, `ecommerce-logistics`, `furniture`.

| Batch size | Priority blogs (~40%) | Per vertical | Random blogs |
|-----------|----------------------|--------------|--------------|
| 50 | 20 | 5 each | 30 |
| 70 | 28-30 | 7 each | 40-42 |
| 100 | 40 | 10 each | 60 |

Pick the priority portion with the `--vertical` flag, once per vertical:
```
python scripts/pick_urls.py --count <k> --vertical education
python scripts/pick_urls.py --count <k> --vertical warehousing
python scripts/pick_urls.py --count <k> --vertical ecommerce-logistics
python scripts/pick_urls.py --count <k> --vertical furniture
```
Then pick the remaining ~60% with a plain `--count` call (no `--vertical`).

Rules:
- The bucket applies ONLY at N >= 50. Below 50, pick everything normally — never force the verticals onto a small batch.
- Do not exceed ~40% — the priority verticals supplement the batch, they do not dominate it.
- If a `--vertical` call returns fewer URLs than requested, top up the shortfall with a plain `--count` pick.

All picked URLs (priority + random) are this session's blog targets. Do NOT read targetUrl from the `Blogs` tab.

### 1b. Scrape Each Target Report Page
For each `targetUrl` returned, fetch the page and extract:
- **title** — `<h1>` or `<title>` text
- **meta_description** — `<meta name="description">` content
- **page_content** — first 8000 chars of visible text (strip nav/footer/scripts)
- **sample_report_url** — usually at `https://www.kenresearch.com/sample-report/{slug}`. Fetch to confirm it exists. If it 404s, use `https://www.kenresearch.com/sample-report/` as fallback.

**SPEED RULE:** If N > 1, scrape all N target URLs as parallel tool calls in a single message before starting Step 1d for any blog. Also load `data/sitemap_urls.json` into `url_pool` ONCE here and reuse it for every blog's Step 3 — never re-read that file per blog.

### 1c. Find Target Row in the Blogs Tab
After picking a URL, find the **first empty row** in the `Blogs` tab (Blog Content column empty or < 50 chars) using the Step 9a row-finding snippet. Write `targetUrl`, `Title`, and `Name` to that row before starting generation.

### ⚡ 1d. FIRE IMAGE PROMPT IMMEDIATELY — BEFORE RESEARCH (HARD RULE)

As soon as the URL is picked and the market name is known, fire the image prompt to ChatGPT RIGHT NOW. Do NOT wait for Step 2 research. The image generates in the background (60-90s) while research and writing run (3-5 min), so there is zero idle wait.

**Run `skills/linkedin/generate-image.md` — Steps 1 through 5e:**

1. Read `skills/linkedin/generate-image.md`.
2. Inputs: `marketName` (derive from the URL slug — hyphens to title case, e.g. `indonesia-tortilla-market` becomes `Indonesia Tortilla Market`). Set `marketSize`, `cagr`, `forecast` to `""` (research has not run yet).
3. Execute that skill's Step 1 (hook title), Step 2 (sector palette), Step 2.5 (hero visual), Step 3 (chart guidance — use the "No data at all" variant since research has not run), Step 4 (assemble `imagePrompt`).
4. Execute its Step 5a-5e: navigate to `https://chatgpt.com` on the existing Chrome session, confirm login, snapshot `knownSrcsBefore`, type `imagePrompt`, send.
5. **DO NOT wait for generation to finish.** Once the prompt is sent, immediately proceed to Step 2 (research).

Carry `knownSrcsBefore`, `marketName`, and `sectorName` forward to Step 2b.

**IMAGE HARD RULE:** zero Ken Research branding on the image — no company name, logo, or wordmark anywhere on the canvas. Enforced in Step 2b.

If ChatGPT is not logged in: write error to sheet, stop this row, do not attempt login yourself.

---

## Step 2: Research Market Data

**DATA PRIORITY RULE — READ CAREFULLY:**
- Ken Research's OWN scraped page = SOURCE OF TRUTH for: market size, CAGR, forecast figures, segmentation shares, historical CAGR
- Do NOT use Grand View, IMARC, Mordor, Statista, or other firms' numbers to replace Ken Research figures
- External research ONLY supplements: policy names, named players, recent deals, regulations, developments

Run **3 focused web searches** (minimum). **SPEED RULE: fire all 3 as parallel tool calls in a single message** — they are independent. If a body section has fewer than 2 verifiable stats after the initial 3 searches, run 1 additional targeted search for that specific gap. Maximum 5 searches total.

1. `"{market name} market size CAGR {country} 2024 2025 forecast billion"` — confirm/enrich numbers
2. `"{market name} key players companies market share deals"` — named players + deals
3. `"{market name} {country} government ministry regulation official data 2024 2025"` — **find the government ministry, regulatory body, and official industry association** responsible for this market. Note their full names, any official statistics they publish, and any government portal URLs. These become your external authority link and credibility line sources.

**From search 3, extract:**
- Name of the government ministry or regulatory authority (e.g. Kementerian Perindustrian, Ministry of Road Transport, FDA, EMA, CERC)
- Name of the official industry association (e.g. GAIKINDO, SIAM, FICCI, AMREP)
- Any official statistics or regulatory disclosures (mandate dates, production data, policy frameworks)
- One government/association website URL for the external authority link (if a macro/regulatory claim is made in the blog)

Collect all data into this structured JSON:
```json
{
  "market_size": "from Ken Research page",
  "cagr": "from Ken Research page",
  "forecast": "from Ken Research page",
  "segmentation": {"segment": "share"},
  "key_stats": ["string"],
  "policies": ["e.g. National Food Security Strategy 2051"],
  "regulations": ["regulatory body + standard name"],
  "key_players": ["company names"],
  "player_deals": ["company + amount + location + date"],
  "recent_developments": ["string"],
  "sources": ["url"]
}
```

---

## Step 2b: Retrieve Generated Image (runs AFTER article writing — image was sent at Step 1d)

The image prompt was sent at Step 1d. By now (research, URL selection, and writing are done) the image should be ready or nearly ready.

**Run `skills/linkedin/generate-image.md` — Steps 5f through 6:**

1. Read `skills/linkedin/generate-image.md`.
2. Execute its Step 5f (poll for the new image, up to 5 min, matched against `knownSrcsBefore`; check for ChatGPT error text), Step 5f-verify (visual branding check — if "Ken Research" or any brand text is visible, reject and regenerate with the stricter ban prepended), Step 5g (get `imgSrc`), Step 5h (download base64), Step 5i (save temp file).
3. Execute its Step 6: upload to Cloudinary, parse `secure_url`, clean up the temp file.
4. Navigate `browser` to `https://chatgpt.com/new` (NEVER close the browser, NEVER use about:blank — this keeps the session alive for the next blog).

If image generation succeeds:
- Set `coverImageUrl` = the Cloudinary `secure_url`
- Log: `[image] Cover URL: {coverImageUrl}`

If image generation fails (ChatGPT error, login issue, Cloudinary error):
- Log the error and STOP blog generation for this row
- Write the error to the `Blogs` tab:
  ```
  python scripts/sheet_write.py --sheet linkedin --row <n> --updates '{"Linkedin Pulse Status":"error","Linkedin Pulse Error":"Image generation failed: {error message}"}'
  ```
- Do NOT write a placeholder image — move on to the next row

The `{coverImageUrl}` variable is used in the Step 6 HTML template `<img src='{coverImageUrl}'>`.

---

## Step 3: Find Related Ken Research Report URLs (MANDATORY — for 8-9 total links)

This step is critical. The blog must have 8-9 total links (KR + external combined) spread across body + FAQs.

### 3a. Load URL Pool from Cache (NO live sitemap fetch)

**Read from the pre-built cache file — do NOT fetch sitemaps live:**

```
data/sitemap_urls.json
```

This file contains all Ken Research report URLs with `lastmod >= 2025`, pre-fetched and cached. It is refreshed every Monday at 9 AM automatically.

```python
import json
with open("data/sitemap_urls.json", "r", encoding="utf-8") as f:
    cache = json.load(f)
url_pool = [entry["url"] for entry in cache["urls"]]
# url_pool now has 30,000+ eligible report URLs — use this for all interlink selection
```

**If the cache file does not exist or is missing:** run `python scripts/sitemap_cache.py` to build it first, then proceed. Do NOT fetch sitemaps manually.

**Do NOT fetch any sitemap URLs live during blog generation.** The cache is the only source.

### 3b. Select Related URLs
- Extract topic keywords from the `targetUrl` slug (country name, industry/sector name, product name)
- Search `url_pool` for slugs that share keyword overlap: same country, same industry, adjacent markets, same region
- Select 8-10 related report URLs — enough for distribution across body + FAQs
- Prefer URLs thematically closest to the target market (same sector + same geography first, then adjacent sectors)
- Exclude `targetUrl` itself from the pool

### 3c. Build UTM URLs for each related report
For each related URL:
- `utm_url` = `{related_url}?utm_source={platform}&utm_medium=Referral&utm_campaign=Automation`
- `anchor_text` = slug converted to readable topic (hyphens → spaces, title case)

**If cache file is missing and `sitemap_cache.py` also fails:** stop and report the error. Do NOT fall back to web search for URLs. All interlinks must come from the cache only.

### 3d. Identify Semantic B2B Terms (Topical Support Keywords)

Before writing, identify **4-5 semantic B2B terms** (also called topical support keywords) that are native to this market's industry vertical. These are the advanced operational phrases that B2B professionals, analysts, investors, and buyers use in their daily work — not just the primary market keyword repeated.

**Purpose:** weaving these terms naturally builds topical authority for search crawlers and signals expertise to B2B readers. Do NOT label them as "LSI keywords" anywhere in output.

**Identify by asking:** what 4-5 phrases would a CFO, strategy director, fund manager, or procurement lead for this market search for or use in their own reports?

| Vertical | Example Semantic B2B Terms |
|----------|---------------------------|
| Logistics / supply chain | "supply chain consolidation", "3PL outsourcing", "last-mile fulfillment", "freight forwarding margins" |
| Retail / e-commerce | "omnichannel attribution", "inventory turnover", "basket size growth", "category management" |
| Fintech / payments | "payment stack", "regulatory compliance", "API-first infrastructure", "interchange revenue" |
| Healthcare / pharma | "reimbursement rates", "formulary inclusion", "generic substitution", "patient adherence" |
| Energy / infrastructure | "capacity utilization", "grid modernization", "off-take agreements", "project finance" |
| Real estate | "cap rate compression", "yield spread", "absorption rate", "net operating income" |
| Automotive | "OEM supply chain", "fleet electrification", "residual value risk", "aftermarket penetration" |

**Rules:**
- Weave each term naturally at least once across H2 headings and body paragraphs
- Never force a term — if it sounds unnatural in context, replace with another from the vertical
- Never repeat the exact primary market keyword more than 3 times in the body
- Log the 5 chosen terms at the start of Step 6 writing (sanity-blog.md Block 4.16 verifies they appear)

---

## Step 4: Construct All UTM URLs

EVERY single link in the blog must have UTM parameters. No exceptions.

| Link | UTM format |
|------|-----------|
| Target report | `{targetUrl}?utm_source={platform}&utm_medium=Referral&utm_campaign=Automation` |
| Sample report | `{sample_url}?utm_source={platform}&utm_medium=Referral&utm_campaign=Automation` |
| Ken Research homepage | `https://www.kenresearch.com/?utm_source={platform}&utm_medium=Referral&utm_campaign=Automation` |
| All related reports | `{related_url}?utm_source={platform}&utm_medium=Referral&utm_campaign=Automation` |

Platform slug values:

| Platform | utm_source |
|----------|-----------|
| linkedin-pulse | `linkedin-pulse` |
| medium | `medium` |
| wordpress | `wordpress` |

---

## YEAR MODERNIZATION RULE (applies to ALL titles and ALL content — read before Step 5)

Ken Research reports often have outdated forecast years (e.g., "Outlook to 2022", "CAGR 2012-2017", "forecast through 2020"). **Never use any year older than the current year (2026) in any title, H1, Blog Title, or Blog Description.** Reframe all outdated data with current-year language.

**Rules:**
- If a report title says "Outlook to 2022" or "Forecast to 2023" → drop the year entirely from the title, OR replace with "2026 Outlook" or "2030 Forecast" if you have a forward-looking figure from the report
- If a CAGR range like "(2012-2017)" appears → never put that in any title. Express as the CAGR figure only: "6% CAGR" not "6% CAGR (2012-2017)"
- If all forecast years in the report are past → use the CAGR figure + market direction (e.g., "growing at 6% CAGR") without anchoring to a stale year
- In the **blog body**: historical data (old years) is fine as context inside paragraphs. The ban is on stale years appearing in titles, H1, Blog Title, and Blog Description.
- Always lead with the most recent or forward-looking data point available from the report or from your Step 2 web research

**BAD (stale years in title):**
- "Kuwait Education Market Grows at 6% CAGR with KWD 2 Billion Government Budget" where the CAGR was (2012-2017) ❌
- "India Lithium Ion Battery Market at 36.3% CAGR Led by..." where forecast was "through 2023" ❌

**GOOD (year-agnostic or forward-looking):**
- "Kuwait Education Market: KWD 2 Billion Government Budget Driving 6% CAGR, Ken Research Analysis Shows" ✅
- "India Lithium Ion Battery Market Surges at 36.3% CAGR as EV Demand Accelerates: Ken Research Maps the Competitive Shift" ✅

---

## Step 5: Write TWO Distinct Titles

You must produce **two separate, different titles** for every blog. They must NOT be identical or near-identical to each other.

| Field | Where used | Length | Ken Research | Purpose |
|-------|-----------|--------|--------------|---------|
| **H1** | Inside `<h1>` tag in HTML | 60-90 chars | Starts with market name, Ken Research at END | SERP-optimized — keyword first, brand signal last |
| **Blog Title** | Sheet `Blog Title` column, CMS/LinkedIn header | 70-90 chars | MIDDLE or END — NEVER at start | Hook for discovery — catchy, number-led, emotionally engaging |

---

### 5a. Write the H1 Title

**H1 rules (STRICT — SERP OPTIMIZED):**
- Length: between **60 and 90 characters** (minimum 60, maximum 90). Count every character before finalizing. Google truncates H1s above 90 chars in SERP.
- **ALWAYS start H1 with the exact market name** — front-load the primary keyword. Never open with a question word (Why, What, How, Is), never open with "What Ken Research Found", never open with "Ken Research".
- Format: `{Market Name} + {Data/Insight Hook} | Ken Research`
  - Example: `"Colombia Customs Brokerage Market Hits USD 320M | Ken Research"` (63 chars) ✅
  - Example: `"South Africa Fintech Payments Market at USD 2.5B | Ken Research"` (64 chars) ✅
  - Example: `"India Wheat Gluten Market Grows at 5.5% CAGR | Ken Research"` (60 chars) ✅
- Must include at least one data figure (market size, CAGR, forecast value, or a key stat from the report)
- Derive base from the report title — truncate at the FIRST occurrence of: `market`, `industry`, `sector`, `growth`, `size`, `outlook`, `forecast`, `trends`, `analysis`, `competition`, `segmentation` (keep that word). Do NOT use the full raw sheet title as-is.
  - Example: Sheet title = "Thailand Used Car Market Outlook To 2025" → base = "Thailand Used Car Market" → H1 = `"Thailand Used Car Market Surges on Online Portals | Ken Research"` (65 chars) ✅
  - Example: Sheet title = "Colombia Customs Brokerage Market" → base = "Colombia Customs Brokerage Market" → H1 = `"Colombia Customs Brokerage Market Hits USD 320M | Ken Research"` (63 chars) ✅
- Ken Research appears at the **END** as a compact brand signal — it is the source, not a label
- Avoid comma-heavy structures — max 1 comma in the entire H1
- **HOOK IS MANDATORY — HARDCODED RULE:** Every H1 MUST contain a punchy, emotionally engaging hook that makes a B2B reader stop scrolling. A flat data statement ("at USD 1.2B") is NOT a hook. The hook must create urgency, signal disruption, or imply a competitive insight. Choose one of these hook patterns:
  - **Action verb + surge narrative:** "Hits USD 2.2B on MEMS Surge", "Surges to USD 5B on EV Boom", "Jumps 3x on Regulatory Push"
  - **Disruption signal:** "Redrawn by AI Procurement", "Disrupted by D2C Models at 18% CAGR", "Reshaped by Fleet Electrification"
  - **Urgency / tipping point:** "at Inflection Point: USD 4B by 2030", "Crosses USD 1B Threshold", "Accelerates Past USD 12B"
  - **Comparative scale:** "Doubles to USD 8B as Automation Takes Hold", "Triples on Policy Push"
  - **Named driver:** "Fueled by ADAS Mandates at USD 2.2B", "Powered by MEMS Miniaturization | Ken Research"
  - A flat `"at USD X"` or `"valued at USD X"` is BANNED as the hook — it is a data label, not a hook
  - A hook MUST sit between the market name and "Ken Research" — never buried or omitted
  - Self-check: read the H1 aloud. If it sounds like a press release footnote, rewrite it.
- Use USD unless Ken Research's page publishes figures exclusively in local currency
- **NEVER use em dashes or en dashes** — use colon or "and" instead
- **NEVER start** with generic openers like "The X Market", "Exploring", "Understanding"

**The core principle: market name first, punchy hook second, Ken Research at end**

The H1 must be indexable at first glance. Google reads left to right — the market name at position 1 tells the crawler exactly what this page covers. Ken Research at the end provides brand authority without pushing the keyword out of the SERP-critical front position.

**BAD H1 (keyword not at position 1 — FORBIDDEN):**
- "What Ken Research Found in Colombia's USD 320M Customs Market..." ❌ (question word first, keyword buried)
- "Ken Research Reveals Colombia's USD 320M Brokerage Sector..." ❌ (brand first, keyword second)
- "Is Colombia's USD 320M Customs Brokerage Market Underrated?" ❌ (question word first)
- "Why Is India's Infotainment Market Hitting 8.7% CAGR?" ❌ (question word first)

**GOOD H1 (market name first, punchy hook, 60-90 chars):**
- `"Colombia Customs Brokerage Market Hits USD 320M on Trade Reform | Ken Research"` (80 chars) ✅ (action verb + named driver)
- `"South Africa Fintech Payments Market Surges to USD 2.5B on BNPL Boom | Ken Research"` (85 chars) ✅ (surge + named driver)
- `"Thailand Used Car Market Doubles on Digital Portals | Ken Research"` (67 chars) ✅ (comparative scale)
- `"India Infotainment Market Crosses USD 8.7B as ADAS Mandates Kick In | Ken Research"` (84 chars) ✅ (tipping point + named driver)
- `"Global 5 MM Pressure Sensor Market Hits USD 2.2B on MEMS Surge | Ken Research"` (80 chars) ✅ (action verb + disruption signal)

**BAD H1 hooks (BANNED — too flat, no urgency):**
- `"Colombia Customs Brokerage Market at USD 320M | Ken Research"` ❌ ("at USD X" is a label, not a hook)
- `"South Africa Fintech Payments Market Valued at USD 2.5B | Ken Research"` ❌ ("valued at" = data footnote)
- `"India Electric Bus Market at USD 1.41 Billion | Ken Research"` ❌ (no action, no urgency)

**H1 style patterns (all market-name-first, 60-90 chars — separator before Ken Research is always ` | `):**

- **Style A:** `{Market Name} {verb phrase with data} | Ken Research` — `"Colombia Customs Brokerage Market Hits USD 320M | Ken Research"` ✅
- **Style B:** `{Market Name} {hook phrase} | Ken Research {brief qualifier}` — `"India Infotainment Market Surges at 8.7% CAGR | Ken Research Findings"` ✅
- **Style F:** `{Market Name} {forward-looking phrase} | Ken Research` — `"Vietnam Probiotics Market to Hit USD 350M by 2030 | Ken Research"` ✅

**H1 rules summary:**
- ALWAYS starts with the exact market name — hard rule, no exceptions
- **HOOK IS MANDATORY** — a punchy action verb, disruption signal, or urgency phrase between market name and Ken Research. "at USD X" alone is banned as the hook.
- Ken Research at the END — compact brand signal, never first
- Length: 60-90 characters (hard floor and ceiling)
- Max 1 comma in the full H1
- Always include at least one number (USD/INR/CAGR/%/forecast year)
- Self-check before finalizing: read aloud — if it sounds like a data footnote, rewrite with a stronger hook verb or driver phrase
- No em dashes or en dashes
- No stale years — never use CAGR ranges like "(2012-2017)" or outdated forecast years (see YEAR MODERNIZATION RULE)
- No question format — declarative statements only, keyword must lead

---

### 5b. Write the Blog Title

The Blog Title is the **hook** shown in article lists, CMS, and LinkedIn article headers. Its job is to STOP the scroll — make someone click. It must be a **completely different angle** from the H1, with catchy words, striking numbers, and Ken Research in the middle or end.

**The difference between H1 and Blog Title:**
- **H1** = frames the article — it tells readers what thesis or finding the blog explores. More analytical, drives what the blog is about.
- **Blog Title** = hooks the reader — it uses punchy language, surprising numbers, and emotional triggers to make someone want to click. More marketing, less analytical.

**Blog Title rules (STRICT):**
- **ALWAYS ends with ` | Ken Research`** — this is a hard requirement, no exceptions. The pipe + brand suffix is the standard format for ALL blog titles.
- Length: **70-90 characters total** (hook + " | Ken Research"). Count every character including the " | Ken Research" suffix (14 chars). The hook portion before the pipe should therefore be 56-76 chars.
- Must be DIFFERENT from H1 — different words, different emotional register, different angle
- **NEVER start Blog Title with "Ken Research"** — same hard rule as H1
- Must include at least one **striking number** (CAGR, market size in USD/local currency, forecast figure, player count, growth multiple)
- Use **catchy, punchy words** — Surge, Race, Explode, Reshape, Dominate, Unlock, Hidden, Untapped, Fastest, Biggest, Outpace, Rewrite, Skyrocket, Collapse, Underrated, Double, Triple
- Lead with a hook — a surprising stat, a tension, a bold claim, or a market name with a strong modifier
- No em dashes or en dashes
- No question format (leave questions for H1 only)
- No stale years (see YEAR MODERNIZATION RULE above) — no CAGR ranges like "(2012-2017)"

**Ken Research branding in Blog Title — PIPE FORMAT (STRICT):**

When Ken Research appears at the **END** of the Blog Title, always use a **pipe separator**: `| Ken Research`
When Ken Research appears in the **MIDDLE**, it flows naturally in the sentence.

**End patterns (pipe format):**
- `{Hook stat or punchy claim about market} | Ken Research`
- `{Market} Is {catchy verb}ing at {figure} on {driver}: {tension or outcome} | Ken Research`
- `{Figure} and {catchy tension}: How {market} Is Being {verb}ed | Ken Research`
- `{Market} Surges {figure} on {driver}: What the Data Shows | Ken Research`

**Middle patterns (natural sentence flow):**
- `{Hook}: Ken Research Reveals {what} Across {market}`
- `{Market} at {figure} CAGR: Ken Research Maps {driver or outcome}`

**Examples (70-90 chars total including "| Ken Research" — punchy hook + brand suffix):**
- `"India Wheat Gluten Surges at 5.5% CAGR on Bakery Demand | Ken Research"` (71 chars) ✅
- `"Colombia Customs Market Hits USD 320M as VUCE Rewrites Trade | Ken Research"` (75 chars) ✅
- `"Vietnam Probiotics Sector Races to USD 350M at 31% CAGR | Ken Research"` (71 chars) ✅
- `"Kuwait Education at 6% CAGR on KWD 2 Billion Budget | Ken Research"` (67 chars) ✅
- `"South Africa Fintech Payments Hits USD 2.5B at 9.8% CAGR | Ken Research"` (72 chars) ✅

---

## Step 6: Write the HTML Microblog

**⚠️ WORD COUNT REMINDER — READ BEFORE TYPING A SINGLE WORD:**

Target: **1,000–1,300 words**. Hard ceiling: **1,300**. Hard floor: **1,000**.

Before writing, internalize the per-section budget from CONTENT RULES:
- Intro (S1+S2+S3): 70-85 words
- Credibility line: 20-25 words
- Each H2 body paragraph: 90-110 words
- Each bullet set (2-3 bullets): 35-60 words total
- Conclusion: 55-70 words
- Each FAQ answer: 40-50 words
- Each CTA block: 25-35 words

**Every sentence you write, check: am I over budget for this section?** If yes, cut before moving on — do not write the whole blog then trim. One tight sentence in a bullet beats two loose ones that push the total over 1,300. A 1,100-word blog with strong data is better than a 1,400-word blog that has been padded. Stop at 1,300. Do not push through.

---

**INTERLINK DISTRIBUTION PLAN (plan before writing):**

Before writing, assign all links across the blog. **Total links = 8-9. This count includes ALL links — KR target report, KR homepage, KR related reports, sample report, AND external authority links combined. Not KR links only.**

| Link Type | Count | Placement |
|-----------|-------|-----------|
| KR Target report | 2 | Intro S3 + Conclusion |
| KR Sample report | 1 | CTA 1 |
| KR Homepage | 1 | Embedded naturally in S2 (the "As per Ken Research" attribution sentence) |
| KR Related reports | 3-4 | Body sections + 1-2 FAQs |
| External govt links | 1-2 | Body text only — government websites that validate a Ken Research claim |
| **Total** | **8-9** | |

**Rule A — Intro paragraph: exactly 2 KR links**
- Link 1 (S2): Ken Research homepage UTM link — embedded naturally inside the attribution sentence. Format: `As per <a href='{KR_homepage_UTM}'><strong>Ken Research</strong></a> market modelling, the {market} is valued at...`
- Link 2 (S3): Target report UTM link — placed in its own sentence immediately after S2
- S1 is always anchor-free — contrarian hook only
- **NEVER write a separate S4 sentence** just to place the KR homepage link. The homepage link must live inside the natural "As per Ken Research" prose in S2 — not as a standalone "visit Ken Research" sentence tacked on at the end of the intro

**Rule B — Body paragraphs (H2 sections): maximum 1 KR link per paragraph**
- Never place 2 KR links in the same paragraph
- Never place KR links in back-to-back consecutive paragraphs — skip at least one paragraph between KR links
- The link must be contextually relevant to that paragraph's topic — not a filler link
- Bridge sentence required: one sentence before or after the anchor explaining specifically why this report is relevant

**Rule C — FAQs: 1 KR link in 2-3 of the 5 FAQs**
- FAQ answers that naturally reference a related market get 1 KR link each
- This is where overflow KR related links land when body paragraphs are full
- FAQs with no natural fit stay link-free

**Rule D — CTAs: 1 KR link each**
- CTA 1: sample report link
- CTA 2: target report link

**Rule E — External government links (1-2 total — purpose: validate Ken Research claims):**

The ONLY reason to add an external link is to prove that a Ken Research data point or regulatory claim is real. These links are not for general authority or decoration — they exist so a skeptical B2B reader can click through and see the government source confirming what Ken Research reports.

**Count:** 1 mandatory, 2 maximum. Never 0, never 3+.

**Source type:** Government websites only. No industry associations, no World Bank, no IMF, no media. The source must be an official government ministry, regulatory authority, or national statistics body.
- Examples: `kemenperin.go.id` (Indonesia Ministry of Industry), `mospi.gov.in` (India stats), `morth.nic.in` (India transport ministry), `mfat.govt.nz` (NZ foreign affairs), `ec.europa.eu` (EU regulations), `federalregister.gov` (US federal rules)

**Placement rule:** Place the external link IMMEDIATELY alongside the Ken Research claim it validates — in the same sentence or the next sentence. The reader should be able to see: Ken Research says X → here is the government source that confirms X.
- RIGHT: `"As per Ken Research modelling, Indonesia's Ministry of Industry has mandated AEB fitment by <strong>2028</strong> (<a href='https://kemenperin.go.id/[exact-page]' target='_blank' rel='noopener noreferrer'>Kementerian Perindustrian regulation</a>), forcing OEM design-in cycles..."`
- WRONG: Random mention of a government site with no connection to the Ken Research stat being cited ❌

**EXACT PAGE RULE — CRITICAL:** The link must point to the SPECIFIC PAGE or circular containing the referenced data — NOT the homepage.
- WRONG: `href='https://kemenperin.go.id/'` ❌ (homepage — proves nothing)
- RIGHT: `href='https://kemenperin.go.id/artikel/[specific-regulation-page]'` ✅ (exact regulation page)
- **Before adding any external link:** verify the exact page URL exists and loads (HEAD check or browser_navigate). If you cannot find the specific page URL — do NOT link to the homepage as a substitute. Either find the correct page or skip the external link for that claim.

**Placement restriction:** Body text only — never in CTAs, never in FAQs, never in conclusion.

**Format:** Plain `<a>` tag, no bold wrap, no KR link style:
```html
<a href='EXACT_URL' target='_blank' rel='noopener noreferrer'>Anchor text describing what the page shows</a>
```

**When external = 2:** reduce KR related reports to 3 (not 4) to keep total links at 8-9.
**When external = 1:** KR related reports can be 3-4.

**Back-to-back link check (MANDATORY before saving):**
Scan the full HTML. If any two KR `<a href=` tags (excluding CTA and branding blocks) appear within 3 lines of each other in body sections → redistribute. Move the second link to a FAQ answer or remove it.

---

**INTRO ANCHOR PLACEMENT RULE + B2B SCROLL-STOPPER (strict)**

The intro paragraph is the single highest-leverage section in the blog. On LinkedIn, only sentences 1 and 2 appear before the "See more..." fold. They must earn the click.

**What goes in sentence 1 (B2B SCROLL-STOPPER — mandatory):**
- MUST be a **contrarian insight, a B2B pain point, or a market shift** — never a dry data dump
- Pattern: "The [fastest growth / biggest disruption / sharpest shift] in [market] isn't coming from [expected source], it is coming from [unexpected source]."
- The reader should feel a mild surprise or recognition — "I hadn't thought of it that way"
- Zero anchor links in S1 — pure narrative, no `<a>` tags

**What goes in sentence 2:**
- The **heavy-hitting data figure** that proves the S1 insight — this is the first number in the blog
- S2 carries the Ken Research homepage UTM link embedded inside the attribution phrase. Format: `As per <a href='{KR_homepage_UTM}'><strong>Ken Research</strong></a> market modelling, the {market} is valued at <strong>{figure}</strong>...`
- The KR homepage link must feel like a natural source citation — not a promotional line

**What goes in sentence 3 (MANDATORY):**
- Sentence 3: target report UTM link — e.g. `The full competitive landscape, forecasts, and segment analysis are available in the <a href='{target_report_UTM}'><strong>{Market Name} Report</strong></a>.`
- **NO separate S4 sentence for KR homepage** — the homepage link is already in S2
- **NEVER write an intro with only 1 link** — both are mandatory

**Intro sentence validation (run before saving):**
```
- Split intro paragraph by sentence-ending periods
- S1: assert 0 anchor links, assert content is a contrarian insight or market shift (not raw data)
- S2: assert exactly 1 link (KR homepage embedded in "As per Ken Research" attribution), assert contains at least 1 bolded stat
- S3: assert exactly 1 link (target report) — if more than 1, FAIL
- No S4: assert no standalone "visit Ken Research" sentence exists in the intro paragraph
```

**Why:** S1 and S2 are the only sentences a LinkedIn reader sees before the fold. A data dump in S1 loses the scroll. A contrarian insight with proof in S2 earns the "See more" click from every serious B2B reader.

---

**WRITING STYLE RULE (makes data feel reported, not invented):**

Raw numbers without context read like a spreadsheet. Two patterns make the blog read like analysis.

**Three-part fact pattern — apply to every paragraph's PRIMARY stat:**
1. **Signal** — an inline source tag: "as per government production data", "based on operator fleet disclosures", "as tracked by Ken Research market modelling"
2. **Figure** — the bolded stat
3. **Implication** — one clause on what the number means for operators, investors, or buyers

Supporting stats in the same paragraph need only signal + figure. Match the signal to the data type: "government data" for policy/regulation, "industry surveys" for production/capacity, "operator disclosures" for market share, "Ken Research modelling" for CAGR/forecast. Never use bare "third-party estimates" — pair it with a sector qualifier ("independent crop production surveys").

**Section flow — problem, evidence, implication:**
1. **Problem or market shift** — open with a tension, shift, or gap (1 sentence, no stats)
2. **Evidence** — the 2-3 stats that prove it
3. **Implication** — what it means for operators, investors, or buyers (1 sentence)

Never write stat, link, stat, CTA, stat, link. Stats serve the story, not the reverse.

GOOD example: "The fastest growth in Russia's rental sector is not coming from traditional self-drive. It is coming from app-based platforms consolidating faster than operators anticipated. Russia's carsharing market exceeded **60 billion rubles in 2024**, up from **44 billion rubles in 2023**, at a projected **40% CAGR** through 2028. For fleet investors, this signals a platform-capture dynamic that will narrow entry windows within two years."

---

**GOVERNMENT AUTHORITY RULE (MANDATORY — builds trust, reduces hard claim risk):**

Every blog must mention at least 2 official government bodies, regulatory authorities, or industry associations as data sources alongside Ken Research. This establishes E-E-A-T signals for search and builds credibility with B2B readers who cite data internally.

**How to find them (Step 2 research — search 3 is specifically for this):**
- Search: `"{market name} {country} government ministry regulation official data 2024 2025"` — find the relevant ministry, regulatory body, or official industry association
- Examples: Kementerian Perindustrian (Indonesia manufacturing/automotive), GAIKINDO (Indonesia vehicle sales), Ministry of Road Transport and Highways (India), BIS (India standards), CPCB (India environment), SEBI (India finance), TRAI (India telecom), FDA (US pharma), EMA (EU pharma), CERC (India power), MOSPI (India statistics)

**How to use them in the blog:**
- Attribute OEM sales data, vehicle registration figures, and production stats to official industry associations (e.g. "per GAIKINDO registration data", "per SIAM production data")
- Attribute regulatory mandates and policy timelines to the government ministry (e.g. "per Kementerian Perindustrian regulatory disclosures", "as tracked by Ministry of Road Transport")
- Attribute economic and demographic macro data to national statistics bodies (e.g. "per BPS Indonesia", "per National Statistical Office")
- Add 1-2 external government links (see Rule E) — placed immediately alongside the Ken Research claim they validate, linking to the SPECIFIC PAGE (regulation circular, data table, policy announcement) — never the homepage

**Claim softening rule — MANDATORY for all Ken Research data:**
Ken Research proprietary stats (CAGR, market size, segment shares, unit counts) must NEVER be stated as bare undeniable facts. They are modelled estimates. Always use softening language:
- WRONG: "Radar commands 45.54% of the APAC ADAS market." ❌
- RIGHT: "Radar is estimated to account for approximately 45% of the APAC ADAS market per Ken Research analysis." ✅
- WRONG: "87.73% of ADAS deployments are factory-installed." ❌
- RIGHT: "Close to 88% of ADAS deployments are factory-installed per Ken Research estimates." ✅

Softening phrases to use (rotate these — do not use the same one more than twice in one blog):
- `per Ken Research modelling`
- `per Ken Research analysis`
- `per Ken Research estimates`
- `as estimated by Ken Research`
- `according to Ken Research market modelling`
- `as tracked by Ken Research`

Official government/association data may be stated more directly (it is primary data, not modelled), but still pair with the source: `per GAIKINDO data`, `as per Ministry of Industry disclosures`.

---

**CREDIBILITY LINE RULE (MANDATORY):**

Immediately after the intro paragraph and before the first H2, insert one short credibility line. It signals where the blog's data comes from — naming SPECIFIC sources, not a generic "market modelling and third-party estimates."

**Keep it short: ONE natural sentence, max 3 lines on screen, naming 3-4 specific sources.** Open with a natural lead-in such as "This analysis draws on data from" or "The data in this article comes from". Do NOT pad it with filler like "cross-referenced against primary sources", "proprietary", "verified", "official", or parenthetical name expansions — those make it long and salesy. Plain and confident reads better.

```html
<p><em>This analysis draws on data from Ken Research market modelling, [government ministry/body], [official industry association], and independent [sector]-sector benchmarking.</em></p>
```

Replace placeholders with the actual sources found in Step 2 research:
- Government body: e.g. "Kementerian Perindustrian", "the Ministry of Road Transport and Highways", "FDA filings"
- Industry association: e.g. "GAIKINDO registration data", "SIAM production data", "APJII internet usage data"
- Benchmarking source: e.g. "OEM fleet disclosures", "operator contract data", "edtech platform benchmarking"

**Good example (short, natural, specific):**
`<em>This analysis draws on data from Ken Research market modelling, policy disclosures by Indonesia's Ministry of Primary and Secondary Education, APJII internet usage data, and independent edtech platform benchmarking.</em>`

**Bad example — too generic:**
`<em>This analysis is based on Ken Research market modelling and third-party sector estimates.</em>` ❌

**Bad example — too long and salesy:**
`<em>Every figure in this analysis is cross-referenced against primary sources: Ken Research proprietary market modelling, official policy disclosures from the Ministry of ..., verified platform performance benchmarks, and independent sector research.</em>` ❌

This line builds reader trust before they reach the FAQs. Readers, especially procurement leads and analysts, scan it to decide whether to read the full article.

---

**CONCLUSION RULE (MANDATORY):**

The conclusion must NOT be a number recap. End it on a sharp business takeaway — the strategic implication the reader should walk away with, or the decision they now face.

Structure (55-70 words):
1. **Opening framing** — one sentence naming the shift or inflection (a phase, a reset, a turning point). May carry 2 stats as light context, no more.
2. **The takeaway** — one or two sentences stating what this means for the reader's strategy. State a consequence, a trade-off, or a reframed question. NO new facts, NO repeated stat dump.
3. **Report link** — the target report UTM link (mandatory, never a link-free conclusion).

**Good example (ends on a sharp takeaway):**
`The market has entered a consolidation phase that rewards a different playbook than the one that built it. The platforms that win from here will convert demand into durable retention before capital returns. For operators and investors, the strategic question is no longer how fast to grow, it is how cheaply to keep a customer. Access the {Market} report...`

**Bad example (number recap, flat):**
`The market is at an inflection where a USD 1.3 billion base, a 16% CAGR, and a 2028 mandate have converged. Positions should be set before the next wave. Access the report...` ❌

The takeaway sentence is the last thing the reader remembers — make it a strategic insight, not arithmetic.

---

**LOCKED HTML STRUCTURE:**

```html
<img src='{coverImageUrl}' alt='{market name} showing {2-3 visual elements: chart type, key players, data theme, geographic marker}'>

<h1>{H1 title — 60-90 chars, starts with market name, Ken Research at end, see Step 5a rules}</h1>

<p>{INTRO — sentences 1+2 are anchor-free prose; both intro anchors appear in sentence 3+}</p>

<p><em>This analysis is based on Ken Research market modelling, operator fleet disclosures, {sector} indicators, and third-party {sector}-sector estimates.</em></p>

<h2>{SEGMENT 1 HEADING — Pattern D or A, no ? unless question format}</h2>
<p>{paragraph with 1-2 related report interlinks}</p>
<ul>
  <li><strong style="color:#000000;">{Label}:</strong> {content, add interlink where relevant}</li>
  <li>...</li>
  <li>...</li>
  <li>...</li>
</ul>

<h2>{SEGMENT 2 HEADING — Pattern B or E}</h2>
<p>{paragraph with 1-2 related report interlinks}</p>
<ul>
  <li>...</li>
</ul>

<hr>
<blockquote>
  <p>{topic-specific hook sentence}? <a href='{sample_report_UTM_url}' style='color:#0645AD; font-weight:700; text-decoration:underline;' target='_blank' rel='noopener'><strong>Download Sample Report</strong></a> {topic-specific closing clause}.</p>
</blockquote>
<hr>

<h2>{SEGMENT 3 HEADING — Pattern C, MUST be a question, MUST end with ?}</h2>
<p>{paragraph with 1-2 related report interlinks}</p>

<h2>{SEGMENT 4 HEADING — Pattern F, forward-looking}</h2>
<p>{paragraph with 1 related report interlink}</p>
<ul>
  <li>...</li>
</ul>

<h2>What {OEMs / Investors / Operators / Procurement Teams} Must Do Before {Deadline/Window} Closes</h2>
<p>{1-2 sentence intro: name the time constraint and the 3 stakeholder groups. Include 1-2 bolded stats — design cycle length, mandate year, or market size. NO links in this paragraph.}</p>
<ul>
  <li><strong style='color:#000000;'>{Stakeholder 1 — e.g. OEMs}:</strong> {specific action + 1 stat + 1 concrete outcome — 1 tight sentence only}</li>
  <li><strong style='color:#000000;'>{Stakeholder 2 — e.g. Tier-1 suppliers / investors}:</strong> {specific action + 1 stat + 1 concrete outcome — 1 tight sentence only}</li>
  <li><strong style='color:#000000;'>{Stakeholder 3 — e.g. Investors / distributors / governments}:</strong> {specific action + 1 stat + 1 concrete outcome — 1 tight sentence only}</li>
</ul>

<hr>
<blockquote>
  <p>{topic-specific hook}? <a href='{report_UTM_url}' style='color:#0645AD; font-weight:700; text-decoration:underline;' target='_blank' rel='noopener'><strong>{Market Name} Report</strong></a> {topic-specific closing clause}.</p>
</blockquote>
<hr>

<h2>Conclusion</h2>
<p>{conclusion — see CONCLUSION RULE: framing + sharp business takeaway, NOT a number recap. MUST include target report UTM link}</p>

<h2>Frequently Asked Questions</h2>
<h3>Q1: {question}</h3>
<p>{Answer — NO interlink in this FAQ — min 2 stats}</p>
<h3>Q2: {question}</h3>
<p>{Answer WITH 1 interlink to a related report — min 2 stats}</p>
<h3>Q3: {question}</h3>
<p>{Answer WITH 1 interlink to a related report — min 2 stats}</p>
<h3>Q4: {question}</h3>
<p>{Answer — NO interlink — min 2 stats}</p>
<h3>Q5: {question}</h3>
<p>{Answer WITH 1 interlink to a related report — min 2 stats}</p>

<p>For the full competitive benchmarking, segment-level forecasts, and regional breakdown, access the <a href='{report_UTM_url}' style="color:#0645AD; font-weight:700; text-decoration:underline;" target="_blank" rel="noopener"><strong>{Market Name} Report</strong></a> from Ken Research, a leading market intelligence firm covering {sector} across {region}.</p>
```

**NOTE: No Research Basis section ever. The branding paragraph above is the FINAL element.**

---

**IMG TAG RULE:**

Always use SINGLE QUOTES for img src and alt to avoid JSON escaping issues.

Alt text must be **descriptive** — explain the relationship between the image and the page content, not just the market name. Google and LinkedIn both use alt text as a content signal.

Format:
```html
<img src='{url}' alt='{market name} showing {2-3 visual elements: chart type, key players, data theme, geographic marker, technology/product}'>
```

Example:
```html
<img src='...' alt='South Africa fintech payments and BNPL market showing real-time payment rails, digital wallet growth, SARB regulatory reform, and BNPL consumer adoption trends'>
```

Alt text must reference at least 2 of: the chart type shown, the key market players or segments, the data theme (growth/disruption/consolidation), the geographic region, the technology or product category.

---

**LINK STYLE (use on every single anchor tag — no exceptions):**

Anchors must render as BOLD blue underlined text on every platform. Use the belt-and-suspenders pattern: inline `font-weight:700` AND wrap the anchor text in `<strong>` tags. Inline weight alone gets stripped by some sanitizers (LinkedIn Pulse is the worst offender), so the semantic `<strong>` tag is the reliable backstop.

Use SINGLE QUOTES for href to avoid JSON escaping issues:

```html
<a href='URL_HERE' style="color:#0645AD; font-weight:700; text-decoration:underline;" target="_blank" rel="noopener"><strong>Anchor Text</strong></a>
```

This applies to every anchor in the blog without exception:
- Intro links (Ken Research homepage + target report)
- All 8-10 related report interlinks in body and bullets
- Both CTA anchors (Download Sample Report and View the {Report Name} Report)
- All FAQ interlinks
- Conclusion target report link

**Important — link `<strong>` tags do NOT count toward bolding rule caps:**
- The `<strong>` inside an anchor is structural formatting (it marks the link), not editorial emphasis
- Category B editorial bold cap (max 1 per section): link `<strong>` tags don't count
- FAQ bold cap (max 2 bolds per FAQ answer): link `<strong>` tags don't count
- CTA rule (anchor `<strong>` only): the CTA anchor still gets `<strong>`, but no additional bolds anywhere else in the CTA wrapper text

---

**INTERLINK BRIDGE RULE (MANDATORY — every link must earn its place):**

A B2B reader notices when a link exists purely for SEO. Every interlink in the body and FAQs must have a **bridge sentence** — one sentence immediately before or after the anchor that explains specifically why this related report is relevant to the paragraph's point.

**BAD (bare link — no bridge, reads as SEO padding):**
"Similar trends are emerging in the [APAC Functional Food Market](link)."

**GOOD (bridge sentence earns the link):**
"Operators benchmarking premium positioning strategy will find a direct parallel in the [APAC Functional Food Market](link) — where functional fortification has delivered a 400bps margin premium over commodity-grade lines across the same forecast period."

**Bridge sentence rules:**
- Must contain a specific connecting insight: a shared driver, a comparable metric, a contrasting dynamic, or a cross-market implication
- Must feel like analysis, not navigation — the reader should learn something from the bridge, not just be pointed elsewhere
- Bridge can come BEFORE the anchor ("For operators watching unit economics in adjacent markets, the [X Market](link) offers a direct benchmark — refrigerated CAGR has outpaced ambient by 3x.") or AFTER it ("...the [X Market](link) — where similar government procurement mandates have accelerated private investment by USD 2 billion over three years.")
- One bridge per link — do not write two-sentence bridges
- Intro paragraph links (Ken Research homepage + target report) are exempt from this rule — they serve as attribution, not analysis

**Self-check:** before saving, scan every `<a href=` tag in the body. For each one, confirm there is a bridge sentence in the same paragraph that explains the connection. If a link has no bridge → either write one or remove the link.

---

**ANCHOR TEXT RULES (CRITICAL):**

Anchor text must use search-intent words that match the target page topic. ONLY use these anchor word types:
- market, industry, sector
- growth, size, outlook, forecast
- trends, analysis
- competition, competitive landscape
- segmentation
- category, ingredients

Report link anchor text must be TRUNCATED — cut AT the first occurrence of the trigger word (include it, do not cut before it):
- Trigger words: `market`, `industry`, `sector`, `growth`, `size`, `outlook`, `forecast`, `trends`, `analysis`, `competition`, `segmentation`
- Include the trigger word in the anchor. Cut everything AFTER the trigger word.
- Do NOT use the full raw report title string as anchor text
- If the truncated portion still has no recognisable category word, append "Report"

**GOOD anchors (trigger word INCLUDED):**
- "Thailand Used Car Market Outlook to 2025" → **Thailand Used Car Market** ✅
- "UAE Used Car and Auto Classified Market Outlook to 2025" → **UAE Used Car and Auto Classified Market** ✅
- "Global Insurance Industry Report" → **Global Insurance Industry** ✅
- "India Investment Banking Market Outlook 2029" → **India Investment Banking Market** ✅
- "India InsurTech Market Size and Forecast" → **India InsurTech Market** ✅

**BAD anchors (trigger word DROPPED — this is wrong):**
- "Thailand Used Car" ❌ (dropped "Market")
- "Global Insurance" ❌ (dropped "Industry")
- "India Investment Banking" ❌ (dropped "Market")
- Full raw title "Thailand Used Car Market Outlook to 2025" ❌ (not truncated)

**Target report anchor rule:**
- Always: `{Market Name} Report` — e.g. "India Insurance Markets Report", "KSA Car Rental and Leasing Market Report"
- NEVER drop "Report" from the target report anchor
- NEVER prefix with "View the" — anchor is just the report name

Always derive anchor text from the actual report slug/title on kenresearch.com, truncated at the search-intent word.

---

**H2 HEADING RULES:**
- NO Ken Research name in any H2
- NO em dashes or en dashes — use colon or comma
- NO numbered headings (1., 2., etc.)
- **EVERY H2 must contain at least one data figure** (%, USD, CAGR, billion, million, a named year, or a named stat). A heading with no number is weak and not allowed.
  - BAD: `<h2>Key Players and Competitive Landscape</h2>` ❌
  - GOOD: `<h2>How CATL and BYD Captured 60% Market Share at Double-Digit CAGR</h2>` ✅
  - GOOD: `<h2>USD 8.7 Billion by 2028: The Forecast That Is Reshaping Investment</h2>` ✅
- Pattern C (question format) MUST end with `?` — e.g. `<h2>Why Is Colombia's Customs Brokerage Market Outpacing Regional Peers by 2026?</h2>`
- Mix patterns:
  - **A:** Data + Implication — `<h2>{Figure}: What It Means for {Market}</h2>`
  - **B:** Entity + Policy/Regulation name with figure — `<h2>{Player} Holds {%} Share Under {Policy Name}</h2>`
  - **C:** Question format with figure (ONE per blog, ends with ?) — `<h2>Why Is {Market} Growing at {CAGR}?</h2>`
  - **D:** Stat-led declarative — `<h2>{Figure} and {Implication}: The {Market} Shift</h2>`
  - **E:** Segment/player/geography deep-dive with figure — `<h2>{Geography} Leads at {%}: How {Players} Are Winning</h2>`
  - **F:** Forward-looking forecast framing with year — `<h2>{Market} Outlook to {year}: {Figure} and What Drives It</h2>`

---

**NO EM DASH RULE:** See Rule 5 at the top of this skill — zero em dashes (—, U+2014) and en dashes (–, U+2013) anywhere in any output field. Quick replacement guide:

| Em dash use case | Replacement |
|-----------------|-------------|
| Parenthetical aside | comma or parentheses |
| Strong break or pivot | colon or period (new sentence) |
| Range like "2014—2020" | "2014 to 2020" or "2014 through 2020" |
| Emphasis pause | comma, or "as" / "while" / "because" |

Plain hyphens in compound words stay (data-driven, e-commerce, FAME-II, 1-ton). The ban is only on — and – used as sentence punctuation. sanity-blog.md enforces this with a literal character scan before sheet write — if either character appears once, regenerate the sentence, do not patch.

---

**BOLDING RULES:**

Principle: a reader scanning only the bold text top to bottom must learn what the market is, how big it is, the main driver, the biggest risk, and where it is headed. Every rule serves that one job.

A **section** = one H2 plus its paragraph and bullets. The intro paragraph, the conclusion, and each FAQ Q+A pair also count as sections. CTA blocks, headings, and image alt text are NOT sections.

**Data bolds — bold every stat, with context (never the bare number):**
- `<strong>USD 8.7 billion in 2024</strong>`, `<strong>13.6% CAGR</strong>`, `<strong>36.7% market share</strong>`, `<strong>FAME India Scheme Phase II</strong>`, `<strong>7,432 charging stations</strong>`, `<strong>doubled in five years</strong>`
- Width: bold the minimum phrase that makes the stat understandable alone — number + unit + metric. Right: `36.7% market share`. Wrong: bare `36.7%` (no metric), or the whole sentence with subject and time.

**Editorial bolds — one per section, capturing the section's single biggest takeaway:**
- 5 to 10 words, no period inside, a specific claim. Right: `the window to capture market share is narrowing`. Wrong: `key insight`, `market is growing`.
- Max 1 editorial bold per section, in the paragraph OR one bullet, never both
- For a section with zero data bolds, the editorial bold goes in the last sentence of the paragraph (never a bullet)
- An anchor link can never BE the editorial bold — keep them in separate clauses

**Do NOT count toward any cap:** bullet labels `<strong>{Label}:</strong>`, link `<strong>` tags, the CTA anchor `<strong>`. Headings (H1/H2/H3) never get `<strong>` inside them.

**Caps:**
- Max 5 visible bolds per paragraph (data + editorial + link strongs combined) — restructure the paragraph if you hit the cap
- FAQ answers: max 2 data bolds, editorial bold optional (max 1). FAQ answers with no stats and no policy names stay unbolded.
- CTA blocks: only the anchor `<strong>` is allowed — nothing else, even if the wrapper sentence has a stat

**No-zero-bolds floor:** every body section (not FAQs, not CTAs) must have at least 1 visible bold. If a section has no stats and no policy names, add 1 editorial bold in the last sentence of the paragraph.

The scan test (reading only the bold text answers the 4 market questions) is enforced by sanity-blog.md Block 5.4.

---

**KEN RESEARCH MENTION RULES:**
- Mention Ken Research **3-5 times** in body as attribution/credibility — enough to establish authority, not so often it reads as brand stuffing
- Homepage link embedded in intro S2 inside the "As per Ken Research market modelling" attribution sentence (use UTM URL)
- Target report link in intro S3 (use UTM URL)
- NO Ken Research in H2 headings

---

**CTA RULES — Two CTAs, anchor text LOCKED:**

**LINKEDIN-SAFE FORMAT (mandatory):** LinkedIn Pulse strips all `<div>` tags, class attributes, and inline styles from pasted HTML. CTAs formatted as `<div class="cta-block">` will render as invisible plain text. Always use `<hr><blockquote><p>...</p></blockquote><hr>` — LinkedIn renders `<blockquote>` as a visible pull-quote.

**CTA 1** (mid-blog, after Section 2):
- Format: `<hr><blockquote><p>...</p></blockquote><hr>`
- Anchor: `Download Sample Report` (LOCKED — never change)
- URL: `{sample_report_UTM_url}` from Step 4
- Anchor must be wrapped in `<strong>` per LINK STYLE rule
- Wrapper sentence: Fresh, topic-specific hook + closing clause. NO boilerplate like "Looking for the complete picture"

**CTA 2** (after Section 4):
- Format: `<hr><blockquote><p>...</p></blockquote><hr>`
- Anchor: `{Market Name} Report` (LOCKED — truncated market name + "Report", NO "View the" prefix ever)
- URL: `{report_UTM_url}` from Step 4
- Anchor must be wrapped in `<strong>` per LINK STYLE rule
- Wrapper sentence: Fresh, topic-specific hook + closing clause. NO boilerplate like "Ready to make data-driven decisions"

---

**CONTENT RULES:**
- Word count: 1000-1300 words (body text only). Hard ceiling: 1300. Floor: 1000 — never pad thin-data topics.
- Section structure: EXACTLY 1 paragraph per section, then bullet points. NEVER write 2 paragraphs in one section.
- Paragraph length: MAX 3 sentences. Tight and punchy. No 4+ sentence blocks.

**PER-SECTION WORD BUDGET (follow this to hit 1000-1300 on the first draft — no trimming needed):**

| Section | Target words |
|---------|-------------|
| Intro paragraph (S1 + S2 + S3) | 70-85 words |
| Credibility italic line | 20-25 words |
| H2 Section 1 body paragraph | 90-110 words |
| H2 Section 1 bullets (3 bullets) | 45-60 words total (~15-20 per bullet) |
| H2 Section 2 body paragraph | 90-110 words |
| H2 Section 2 bullets (2-3 bullets) | 35-50 words total |
| H2 Section 3 body paragraph | 90-110 words |
| H2 Section 3 bullets (2-3 bullets) | 35-50 words total |
| Conclusion paragraph | 55-70 words |
| FAQ Q1 answer | 40-50 words |
| FAQ Q2 answer | 40-50 words |
| FAQ Q3 answer | 40-50 words |
| FAQ Q4 answer | 40-50 words |
| FAQ Q5 answer | 40-50 words |
| CTA blocks (2x) | 25-35 words each |
| **TOTAL** | **~1000-1300** |

**Rules to stay within budget on first draft:**
- Write bullet text as ONE tight sentence — never two sentences in a bullet
- FAQ answers: 2-3 sentences maximum, no background context, lead directly with the stat
- Intro: S1 = 1 sentence hook, S2 = 1 data sentence (with KR link), S3 = 1 report link sentence — never more than 3 sentences total in intro
- Conclusion: keep only 2 key figures as light context, then END on a sharp business takeaway — a strategic implication or a decision the reader must make, NOT a number recap. Close with the target report link. See the CONCLUSION RULE below.
- If data is thin for a market: write shorter sections and stop at 1000 words — do NOT invent filler sentences to reach a higher count

**DATA DENSITY RULE (the blog must be data-grounded throughout):**

Every body paragraph (intro + all sections + conclusion) and every FAQ answer must carry specific numbers, named figures, named policies, or named players. A reader scanning only the numbers must walk away with a clear picture of the market.

- **Per paragraph: floor 2 stats, ceiling 3.** Hitting only 1 is a failure; 4+ overcrowds — split across sections or move excess to bullets.
- **Per bullet: exactly 1 stat.** Per FAQ answer: floor 2, ceiling 3.
- **No two consecutive sentences both stat-free** — scan every paragraph sentence by sentence before saving.
- **A stat must appear in the first 2 sentences** of every paragraph — never open with 2 purely narrative sentences.
- Every section paragraph also carries at least one named player, named policy, or named regulation alongside numeric stats.

A "stat" is a number with context: currency + amount (USD 8.7 billion in 2026), percentage + metric (13.6% CAGR, 36.7% market share), named count (7,432 charging stations), named policy (FAME India Scheme Phase II), comparative figure (doubled in five years). NOT stats: bare years not tied to a value, vague "billions"/"millions", list counters.

If you cannot find 2 real figures for a paragraph from Step 2 research, run an additional targeted web search before writing that section. Never write a data-light paragraph.

**CURRENT YEAR RULE (applies to all body content, not just titles):**

- When making a statement about TODAY's market state, current trends, or present conditions: use **2026** as the reference year, not 2023, 2024, or any past year
- Historical figures (e.g. "the market was USD X billion in 2020") are fine as background context
- Forward-looking figures (e.g. "projected to reach USD Y billion by 2030") are fine as forecast
- What is BANNED: stating current/present conditions and anchoring them to a past year
  - BAD: "The market currently stands at USD 8.7 billion (2022)" ❌
  - BAD: "As of 2023, the sector employs 500,000 workers" ❌ (2023 is past, use 2026 framing)
  - GOOD: "By 2026, the market is estimated at USD 8.7 billion, driven by..." ✅
  - GOOD: "The sector has grown to over 500,000 workers as demand accelerates in 2026" ✅
- When the report only has old forecast data (e.g. forecast to 2022): reframe as historical baseline and state what is happening "today" using the Ken Research trend direction + your Step 2 web research for current figures

**FAQ QUESTION WRITING RULE (MANDATORY — search-intent format):**

FAQ questions must be written as direct search queries — phrased exactly the way a B2B buyer, analyst, or investor would type into Google or LinkedIn Search. Vague questions that nobody searches for are rejected.

**Mandatory search-intent question types (use these 5 patterns, one per FAQ):**
1. **Size/value:** `What is the size of the {Market Name}?` or `What is the {Market Name} market size in 2026?`
2. **Key players:** `Who are the key players in the {Market Name}?` or `Which companies lead the {Market Name}?`
3. **Technology/segment leader:** `Which {technology/segment/product} leads the {Market Name}?` or `What is the fastest-growing segment in {Market Name}?`
4. **Growth drivers:** `What is driving growth in the {Market Name}?` or `What are the key drivers of {Market Name}?`
5. **Policy/mandate impact:** `How does {regulation/mandate/policy} affect {Market Name}?` or `What is the impact of {regulation} on {Market Name}?`

**BAD FAQ questions (no one searches these):**
- "What factors are contributing to the development of the market?" ❌
- "How is the competitive landscape evolving?" ❌
- "What are the emerging trends?" ❌

**GOOD FAQ questions (direct search queries):**
- "What is the size of the Indonesia ADAS System Market?" ✅
- "Who are the key players in Indonesia's ADAS market?" ✅
- "Which sensor technology leads the Indonesia ADAS market?" ✅
- "What is driving growth in Indonesia's ADAS system market?" ✅
- "How does the 2028 AEB mandate affect OEM design-in cycles?" ✅

Every FAQ answer must: (1) open directly with a stat — no preamble, (2) contain minimum 2 stats, (3) stay within 40-50 words.

- 5 FAQs always — exactly 5, no more, no less
- 2-3 FAQs must have interlinks (not all 5, not just 1)
- 8-9 total links (KR + external combined) across the entire blog (planned in Step 6 before writing)
- NO em dashes or en dashes ANYWHERE in the output (see NO EM DASH RULE above) — use colon, comma, or rephrase
- NO source attribution line at bottom
- Acronyms always correctly capitalized: UAE, GCC, USA, UK, MENA, APAC, ASEAN, EMEA, LATAM, 3PL, 4PL, IoT, AI, GMP, GDP, FMCG, QSR, SME, MSME, OEM

---

## Step 7: Sanity Check (full validation gate)

Before writing to sheet, run the complete sanity validation.

**Read `skills/linkedin/sanity-blog.md` and run every check (all 6 blocks).** Pass these inputs: `h1`, `blogTitle`, `htmlContent`. (`seoDescription` and `blogCaption` are generated in Step 8 — after generating them, re-run sanity-blog.md Blocks 4.5 to 4.9 on those two fields for the em dash, length, and plain-text checks.)

- Fix EVERY `[FAIL]` CRITICAL item before proceeding. `[WARN]` items are logged, not blocking.
- After fixing, re-run sanity-blog.md from the top until zero CRITICAL failures remain.
- Collect every issue found into a `failedChecks` list (used by the repair loop if QA later fails).

**One extra check not in sanity-blog.md — character ceiling:**
- Count total characters of the full HTML string: `char_count = len(html_content)`
- Must be **strictly under 14,000 characters** (the sheet column silently truncates above this)
- If over: trim FAQ answers first, then bullet points, then verbose body clauses. Never cut stats or links. Recheck until under 14,000.

Log:
```
[7] Sanity: {n} CRITICAL fixed, {n} WARN | Chars: {n}/14000 {PASS/FAIL}
```

Only proceed to Step 7c when sanity has zero CRITICAL failures AND char count is under 14,000.

---

## Step 7c: QA Score (out of 100)

**Read `skills/linkedin/qa-blog.md` and score the blog.** Pass these inputs: `htmlContent`, `h1`, `blogTitle`, `targetUrl`. It returns a JSON object with `score`, `passed`, `critical_issues`, `must_fix_before_publish`, and `repair_instruction`.

Quality gate:
- **score >= 88 → PASS** — proceed to Step 8.
- **score 70-87 → FAIL** — trigger the repair loop (Step 7d).
- **score < 70 → REJECT** — trigger the repair loop (Step 7d); if still below 70 after 2 repairs, flag the row red.

Set `blogRating` = `round(score / 10)` — a 1-10 integer for the sheet `Rating` column.

Log:
```
[7c] QA score: {score}/100 | passed: {true/false} | critical: {n} issues
```

---

## Step 7d: Repair Loop (max 2 attempts)

Runs only if the Step 7c score is below 88.

**1. Build the repair input:**
- `htmlContent` — the HTML that failed QA
- `factBank` — the structured fact bank from Step 2 (repair uses ONLY these facts, never invents new data)
- `qaResult` — the full JSON from qa-blog.md (`critical_issues`, `must_fix_before_publish`, `repair_instruction`)
- `failedChecks` — the sanity issues list from Step 7
- `h1`, `blogTitle`

**2. Read `skills/linkedin/repair-blog.md`** and apply every fix in its priority order. It returns repaired HTML, repaired H1 and Blog Title, and a `changes_made` list.

**3. Re-run Step 7 sanity** on the repaired HTML — fix any new CRITICAL failures.

**4. Re-run Step 7c QA** → get the new `score`.

**5. Decision:**
- score >= 88 → PASS → proceed to Step 8
- score < 88 AND attempts < 2 → repeat the repair loop from step 1
- score < 88 AND attempts = 2 → write the best version to sheet anyway, then flag the Rating cell red:
  ```
  python scripts/sheet_write.py --sheet linkedin --row <row> --updates-file C:/tmp/li_blog_updates_{row}.json
  python scripts/sheet_write.py --sheet linkedin --row <row> --flag-red
  ```
  Red Rating cell = blog is saved but did not reach 88 after 2 repairs. Needs human review.

Log after each attempt:
```
[7d] Repair {attempt}/2: {old_score} -> {new_score} | Fixed: {list} | Still failing: {list}
```

---

## Step 7e: Log Repair to Blog Intelligence (runs only if Step 7d triggered)

If Step 7d ran (i.e. at least one repair attempt happened), call the `blog-intelligence` agent in **Learn mode** immediately after the repair loop completes — whether the blog passed or failed.

**What to pass to blog-intelligence Learn mode:**

```
Blog: {Blog Title}
Market: {marketName}
Initial QA Score: {qa-blog.md score before first repair, out of 100}
Final QA Score: {qa-blog.md score after repair loop, out of 100}
Repair Attempts: {1 or 2}
Result: passed | failed

Issues Found (from Step 7 sanity + Step 7c QA failedChecks):
- {check name}: {what failed, specific detail}
- e.g. "Em dashes: 3 found in sections 2 and 4"
- e.g. "Word count: 1521 — over limit by 121 words"
- e.g. "Blog Title: 97 chars — over 90 char limit"
- e.g. "Bare numbers: 8 unbolded stats in body paragraphs"
- e.g. "KR mentions: 7 — over the 3-5 range"

What Repair Agent Fixed:
- {exact change made per issue}
- e.g. "Replaced 3 em dashes with colons in sections 2 and 4"
- e.g. "Trimmed 130 words from section 3 bullet list"
- e.g. "Wrapped 8 bare stats in <strong> tags"

Patterns to note:
- {any recurring issue type worth flagging for future blogs}
- e.g. "Em dashes appearing in FAQ answers — agent adds them when writing Q&A flow"
- e.g. "Word count overshoots when section 3 has more than 4 bullets"
- e.g. "KR mentions spike when intro + conclusion both have full attribution sentences"
```

**blog-intelligence Learn mode will:**
- Update its Fix History with this repair entry
- Identify if this issue has appeared in previous blogs (pattern recognition)
- Update its variation blueprints to pre-empt this issue in future generation
- Keep a running count of which checks fail most often across all blogs

**If repair loop was skipped (rating ≥ 8 on first attempt) → skip Step 7e entirely.**

Log:
```
[7e] blog-intelligence Learn mode updated — {n} issues logged for {Blog Title}
```

---

## Step 8: Generate Blog Description + Caption

Generate these 2 fields after the HTML passes QA. Both are plain text, no HTML, no em dashes or en dashes (same ban as the blog body).

### 8a. Blog Description (max 160 chars)

- Used in LinkedIn article SEO settings and the Google snippet preview
- Plain text only, no HTML tags
- Must open with the market's biggest hook stat or most surprising finding
- Include at least one data figure and one driver or player
- Use current-year or forecast data, never lead with a historical figure
- Example: `South Africa's fintech payments market hit USD 2.5B in 2024. BNPL grows at 9.8% CAGR through 2030 as SARB deregulation opens non-bank clearing access.`

### 8b. Blog Caption (150-300 words)

- Professional LinkedIn post caption used when sharing the article
- Hook line first (1 sentence, standalone, the most contrarian or surprising insight)
- 3-4 bullet points (each starting with the white check-mark emoji) highlighting key article takeaways
- Closing CTA line ("Read the full article to see...")
- 5-7 relevant hashtags at the end
- Plain text only, no HTML

Caption example:
```
Thailand's used car market looks calm on the surface, but Carsome, Carro and iCar Asia are building a double-digit digital surge beneath it.

Ken Research just published the full breakdown of the Thailand Used Car Market.

✅ Why 1-ton pickup trucks dominate by both volume and value
✅ How Toyota Sure, Honda and online portals compete across 4 market channels
✅ What the 2025 outlook means for ASEAN auto investors and platform builders
✅ Bangkok vs Northeast: the regional hierarchy that shapes inventory flow

Read the full article to see Ken Research's complete competitive map.

#ThailandUsedCar #ASEANAutomotive #UsedCarMarket #MarketResearch #KenResearch
```

---

## Step 8c: Generate blogBatch Label

Before writing to sheet, generate the batch label for this blog:

```
blogBatch = "BLOG-{YYYY}-{MM}-{DD}-B{n}"
```

- `YYYY-MM-DD` = today's date in IST
- `B{n}` = sequential blog number within today's session (B1 for first blog, B2 for second, etc.)

Examples:
- First blog today → `BLOG-2026-05-15-B1`
- Third blog today → `BLOG-2026-05-15-B3`

Reset the counter to B1 at the start of each new day.

---

## Step 9: Write to Sheet

LinkedIn blog rows live in the shared **`Blogs`** tab (same tab as the legacy multi-platform blog flow). The Apps Script `blog-read` endpoint does NOT cover this tab. Read and write it directly via `scripts/sheet_write.py` and the Sheets API.

### 9a. Re-verify the target row is still empty (MANDATORY — every time)

Find the actual first empty data row in the `Blogs` tab right before writing. Use header lookup (NOT a hardcoded column index — `Blogs` headers may evolve):

```python
import sys; sys.path.insert(0, "scripts")
import sheet_write as sw

r = sw.sheets_get("/values/'Blogs'!A:Z")
rows = r.get("values", [])
headers = rows[0]
content_idx = headers.index("Blog Content")

last_filled_sheet_row = 1
for i, row in enumerate(rows[1:], start=2):  # i = sheet row number
    content = row[content_idx] if len(row) > content_idx else ""
    if isinstance(content, str) and len(content) > 50:
        last_filled_sheet_row = i

next_empty_data_row = last_filled_sheet_row  # data_row N -> sheet row N+1
print(f"Last filled sheet row: {last_filled_sheet_row} -> write to --row {next_empty_data_row}")
```

`sheet_write.py --row N` writes to sheet row N+1. The snippet returns the correct `--row` value as `next_empty_data_row` (if the last blog sits at sheet row 2, it returns 2, which writes to sheet row 3).

- If it matches your planned `target_row` → proceed.
- If different (another blog was written meanwhile) → use the new value.

### 9b. Write the blog (Python only — NEVER PowerShell ConvertTo-Json)

⚠️ PowerShell serializes file content as a PSObject with metadata that corrupts the Blog Content column. Always build the updates JSON with Python.

Build a JSON file with these columns (exact, case-sensitive — must match the `Blogs` headers):

| Column | Value |
|--------|-------|
| `targetUrl` | Ken Research report URL |
| `Title` | Report name only (capital T) |
| `Name` | Account nickname (leave blank if not assigned) |
| `Blog Title` | Hook + ` | Ken Research` — total 70-90 chars |
| `Blog Description` | Max 160 chars plain text — opens with the biggest hook stat |
| `Blog Caption` | 150-300 words plain text — hook + bullets + CTA + hashtags |
| `Blog Content` | Full raw HTML — starts with `<img src=...>` |
| `blogBatch` | `BLOG-YYYY-MM-DD-B{n}` |
| `Rating` | QA score normalized to 1-10 (round(qa_score / 10)) |

```python
import json
updates = {
    "targetUrl": "...", "Title": "...", "Name": "...",
    "Blog Title": "...", "Blog Description": "...",
    "Blog Caption": "...",
    "Blog Content": blog_html, "blogBatch": "BLOG-YYYY-MM-DD-B1", "Rating": blogRating,
}
json.dump(updates, open("C:/tmp/li_blog_updates_{row}.json", "w", encoding="utf-8"), ensure_ascii=False)
```

Then write:
```
python scripts/sheet_write.py --sheet linkedin --row <data_row> --updates-file C:/tmp/li_blog_updates_{row}.json
```

Success looks like: `{"ok": true, "sheet": "Blogs", "row": <n>, "updatedCells": N}`.

If `blogRating` is below 8 (QA score < 88) after 2 repair attempts, also flag the row:
```
python scripts/sheet_write.py --sheet linkedin --row <data_row> --flag-red
```

After writing, re-read the tab with the 9a snippet and confirm your row shows the blog with no ghost empty row left behind.

---

## Return

```
blogTitle: {Blog Title} ({char_count} chars, must be 70-90, always ends with | Ken Research)
h1Title: {H1} ({char_count} chars, must be 60-90, starts with market name, Ken Research at end)
totalLinks: {count} (KR + external combined, must be 8-9)
wordCount: {count}
sampleReportUrl: {url}
linkedinSeoDescription: {Blog Description} ({char_count} chars, max 160)
linkedinCaption: {word_count} words
rowNumber: {n}
status: generated
```
