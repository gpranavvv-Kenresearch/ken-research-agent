# Skill: Generate Blog (HTML Microblog)

Generates a 1200-1400 word HTML microblog from a Ken Research report URL.
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
- Are NOT already present in the Blogs sheet `targetUrl` column
- Are logged immediately to `data/already_posted.json` to prevent re-use

The picked log persists across all sessions. Once a URL is picked it will never be picked again unless the log is manually reset.

**If cache file is missing:** run `python scripts/sitemap_cache.py` first, then pick.
**If pick_urls.py returns fewer than N:** cache may be exhausted — run `python scripts/sitemap_cache.py` to refresh.

### Rule 2: Row Targeting in Blogs Sheet
- Always find the **first empty row** in the Blogs sheet (`Blog Content` column empty or < 50 chars)
- Fill from that row onward — never overwrite a row that already has Blog Content
- Write: `targetUrl`, `Title`, `Name` before starting generation if not already present

### Rule 3: Sequential Processing (ONE AT A TIME)
- Generate ONE complete blog (image + HTML + sanity + sheet write)
- Only after sheet write confirms `ok: true` → move to next blog
- Never start next blog while current is still in progress

### Rule 5: ZERO EM DASHES AND ZERO EN DASHES — ANYWHERE, EVER (HARD RULE, NON-NEGOTIABLE)

⚠️ THIS MISTAKE HAS HAPPENED BEFORE AND IS UNACCEPTABLE ⚠️

The characters `—` (U+2014 em dash) and `–` (U+2013 en dash) are COMPLETELY BANNED from every single field in the output:
- H1 title
- Blog Title
- Blog Description
- LinkedIn Caption
- Every paragraph in the HTML body
- Every H2 and H3 heading
- Every bullet point
- Both CTA blocks
- All 5 FAQ questions and answers
- The Conclusion

**Before typing a single word of content:** internalize this ban. Every time you would naturally write `—` or `–`, stop and use one of these instead:
- Colon `:` for pivots and pivots ("Market grows fast: here is why")
- Comma `,` for parenthetical asides
- Period `.` to start a new sentence
- The word `as`, `while`, `because`, `and` for connective flow
- Parentheses `()` for true parenthetical content

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
- `targetUrl` — Ken Research report URL (from URLs sheet, then written to Blogs sheet)
- `rowNumber` — Blogs sheet data row number (1-based, find first empty)
- `postingPlatform` — which platform (default: `linkedin-pulse`)

---

## Step 1: Pick URLs + Scrape Report Pages

### 1a. Pick URLs
Before doing anything else, run:
```
python scripts/pick_urls.py --count <N>
```
Where N = number of blogs the user asked to generate.

This returns N fresh `targetUrl` values from the sitemap cache. These are your blog targets for this session. Do NOT read targetUrl from the Blogs sheet.

### 1b. Scrape Each Target Report Page
For each `targetUrl` returned, fetch the page and extract:
- **title** — `<h1>` or `<title>` text
- **meta_description** — `<meta name="description">` content
- **page_content** — first 8000 chars of visible text (strip nav/footer/scripts)
- **sample_report_url** — usually at `https://www.kenresearch.com/sample-report/{slug}`. Fetch to confirm it exists. If it 404s, use `https://www.kenresearch.com/sample-report/` as fallback.

### 1c. Find Target Row in Blogs Sheet
After picking a URL, find the **first empty row** in the Blogs sheet (Blog Content column empty or < 50 chars). Write `targetUrl`, `title`, and `Name` to that row before starting generation.

### ⚡ 1d. FIRE IMAGE PROMPT IMMEDIATELY — BEFORE RESEARCH (HARD RULE)

As soon as the URL is picked and the market name is known, send the image prompt to ChatGPT RIGHT NOW. Do NOT wait for Step 2 research. You only need the market name and sector from the URL slug — no research data needed.

1. Derive `marketName` from the URL slug (hyphens → title case, e.g. `indonesia-tortilla-market` → `Indonesia Tortilla Market`)
2. Derive `sector` from the slug keywords (food, healthcare, finance, logistics, real estate, etc.)
3. Build the full image prompt (follow `skills/generate-image.md` Steps 1-4 using `marketName` and `sector`)
4. Navigate to `https://chatgpt.com` via `browser_navigate`
5. Confirm login via `browser_snapshot` — if not logged in, write error and stop
6. Click the chat input, type the full image prompt, press Send
7. **DO NOT wait for generation to finish** — once the prompt is sent, immediately proceed to Step 2 (research)

The image generates in the background while Step 2 + Step 3 + article writing run. You retrieve it in Step 2b after writing is done.

**Why:** Image generation takes 60-90 seconds. Research + writing takes 3-5 minutes. By sending the image prompt first, the image is ready (or nearly ready) by the time the article is written — zero idle wait.

---

## Step 2: Research Market Data

**DATA PRIORITY RULE — READ CAREFULLY:**
- Ken Research's OWN scraped page = SOURCE OF TRUTH for: market size, CAGR, forecast figures, segmentation shares, historical CAGR
- Do NOT use Grand View, IMARC, Mordor, Statista, or other firms' numbers to replace Ken Research figures
- External research ONLY supplements: policy names, named players, recent deals, regulations, developments

Run exactly 3 web searches (no more):
1. `"{market name} market size CAGR {country} 2024 2025 forecast billion"` — confirm/enrich numbers
2. `"{market name} key players companies market share deals"` — named players + deals
3. `"{market name} government policy regulation {country} 2024 2025"` — policies + regulatory bodies

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

The image prompt was already sent to ChatGPT at the end of Step 2. This step polls for the result and uploads to Cloudinary. Step 3 ran while ChatGPT was generating — by now the image should be ready or nearly ready.

**Poll for the generated image (up to 5 minutes from when prompt was sent):**
- Take a `browser_snapshot` to check for a new `<img>` element with `src` containing `oaidalleapiprodscus` OR `oaiusercontent`, width > 100px, not in `knownSrcsBefore`
- If not yet visible, wait 15 seconds and poll again
- Check for error text: `"can't create images"`, `"content policy"`, `"generation limit"`, `"something went wrong"` → if found, write error and stop
- Once image found: do visual check for Ken Research branding — if present, clear chat, resend prompt with branding ban prepended, wait again

After image confirmed clean:
- Download as base64, save to temp file, upload to Cloudinary (follow `skills/generate-image.md` Steps 5h–6)
- Navigate `browser → https://chatgpt.com/new` (never close browser, never use about:blank)
- Set `cloudinaryUrl` = the Cloudinary secure_url

If image generation succeeds:
- Set `coverImageUrl` = `cloudinaryUrl` from skill output
- Log: `[image] Cover URL: {coverImageUrl}`

If image generation fails (ChatGPT error, login issue, Cloudinary error):
- Log the error
- STOP the blog generation for this row
- Write to sheet: `{"action":"blog-update","row":<n>,"updates":{"LinkedIn Pulse Status":"error","LinkedIn Pulse Error":"Image generation failed: {error message}"}}`
- Do NOT write placeholder image into the blog
- Move on to the next row

The `{coverImageUrl}` variable is used in Step 6 HTML template `<img src='{coverImageUrl}'>`.

---

## Step 3: Find Related Ken Research Report URLs (MANDATORY — for 10-12 interlinks)

This step is critical. The blog must have 10-12 total interlinks spread across body + FAQs.

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
| **H1** | Inside `<h1>` tag in HTML | 100-130 chars | MIDDLE or END — NEVER at start | Frames and drives the blog content — the thesis of the article |
| **Blog Title** | Sheet `Blog Title` column, CMS/LinkedIn header | 70-90 chars | MIDDLE or END — NEVER at start | Hook for discovery — catchy, number-led, emotionally engaging |

---

### 5a. Write the H1 Title

**H1 rules (STRICT):**
- Length: between **100 and 130 characters** (minimum 100, maximum 130). Count every character before finalizing.
- **NEVER start H1 with "Ken Research"** — H1 must start with the market name, country, a stat, or a question word (Why, What, How, Is, etc.)
- Must include at least one data figure (market size, CAGR, forecast value, or a key stat from the report)
- Derive base from the report title — truncate at the FIRST occurrence of: `market`, `industry`, `sector`, `growth`, `size`, `outlook`, `forecast`, `trends`, `analysis`, `competition`, `segmentation` (keep that word). Do NOT use the full raw sheet title as-is.
  - Example: Sheet title = "Thailand Used Car Market Outlook To 2025" → base = "Thailand Used Car Market" → H1 = "Thailand Used Car Market: What Ken Research Found Will Reframe ASEAN Auto Retail as Online Portals Surge Double Digits" (118 chars)
  - Example: Sheet title = "Colombia Customs Brokerage Market" → base = "Colombia Customs Brokerage Market" → H1 = "Colombia's Brokerage Sector Just Hit USD 320M: Ken Research Breaks Down the VUCE and E-Commerce Forces Rewriting Trade" (118 chars)
- Ken Research appears in the **MIDDLE or END** — as a contextual actor doing something meaningful
- Avoid comma-heavy structures — max 2 commas in the entire H1
- Sometimes use a question format for higher engagement (ends with ?)
- Must have a strong hook — surprising angle, tension, or forward-looking urgency
- Use USD unless Ken Research's page publishes figures exclusively in local currency
- **NEVER use em dashes or en dashes** — use colon or "as" or "while" instead
- **NEVER start** with generic openers like "The X Market", "Exploring", "Understanding"

**The core principle: Ken Research must be CONTEXTUAL, not a tag**

Ken Research should feel like a natural part of the sentence — an actor doing something meaningful (revealing, finding, mapping, tracking, showing). It should NEVER feel like a suffix or label bolted on.

**BAD H1 (starts with Ken Research — FORBIDDEN):**
- "Ken Research Reveals Colombia's USD 320M Brokerage Sector..." ❌
- "Ken Research Finds India's Vital Wheat Gluten Market Is Booming..." ❌
- "Ken Research Maps India's INR 178 Bn Infotainment Race..." ❌

**GOOD H1 (Ken Research in middle or end):**
- "What Ken Research Found in Colombia's USD 320M Customs Market Will Change How You Think About LATAM Trade" ✅ (106 chars)
- "Colombia's Brokerage Sector Just Hit USD 320M: Ken Research Breaks Down the VUCE-Driven Transformation Underway" ✅ (111 chars)
- "Is Colombia's USD 320M Customs Brokerage Market the Biggest Underrated Play in LATAM? Ken Research Has the Answer" ✅ (113 chars)
- "Why Is India's Infotainment Market Hitting 8.7% CAGR? Ken Research Finds the Answer Inside the OEM Supply Chain" ✅ (110 chars)
- "India's Premium Cockpit Tech Is Getting a USD 178 Bn Upgrade by 2029: Here Is What Ken Research's Data Shows" ✅ (108 chars)
- "India's Vital Wheat Gluten Market Is Growing at 5.5% CAGR: What Ken Research Found About Bakery and Noodle Demand Dynamics" ✅ (122 chars)

**Ken Research as an actor — use these verb patterns (in middle or end):**
- ...What Ken Research Found in...
- ...: Ken Research Breaks Down the...
- ...Ken Research Has the Answer (at end, after a question)
- ...: Here Is What Ken Research's Data Shows
- ...: Ken Research's Analysis Reveals...
- ...as Ken Research Maps the...

**H1 style patterns — rotate across blogs (all must have Ken Research in MIDDLE or END):**

- **Style A:** Market hook + Ken Research mid: `"Colombia's Brokerage Sector Just Hit USD 320M: Ken Research Breaks Down the VUCE-Driven Transformation Underway"` ✅
- **Style C:** Question hook + Ken Research at end: `"Is Colombia's USD 320M Customs Brokerage Market the Biggest Underrated Trade Play in LATAM? Ken Research Has the Answer"` ✅
- **Style D:** "What Ken Research Found" opener: `"What Ken Research Found in Colombia's USD 320M Customs Market Will Surprise Every LATAM Trade Investor Today"` ✅
- **Style E:** "Why/How" question + Ken Research mid: `"Why Is India's Infotainment Market Hitting 8.7% CAGR? Ken Research Finds the Answer Inside the OEM Supply Chain"` ✅
- **Style F:** Market statement + Ken Research data shows: `"India's Premium Cockpit Tech Is Getting a USD 178 Bn Upgrade by 2029: Here Is What Ken Research's Data Shows"` ✅

**H1 rules summary:**
- NEVER starts with "Ken Research" — hard rule, no exceptions
- Ken Research must be doing something — not just a label
- Length: 100-130 characters (hard floor and ceiling)
- Max 2 commas in the full H1
- Always include at least one number (USD/INR/CAGR/%/forecast year)
- No em dashes or en dashes
- No stale years — never use CAGR ranges like "(2012-2017)" or outdated forecast years (see YEAR MODERNIZATION RULE)
- Rotate styles across blogs — never repeat the same pattern twice in a row

---

### 5b. Write the Blog Title

The Blog Title is the **hook** shown in article lists, CMS, and LinkedIn article headers. Its job is to STOP the scroll — make someone click. It must be a **completely different angle** from the H1, with catchy words, striking numbers, and Ken Research in the middle or end.

**The difference between H1 and Blog Title:**
- **H1** = frames the article — it tells readers what thesis or finding the blog explores. More analytical, drives what the blog is about.
- **Blog Title** = hooks the reader — it uses punchy language, surprising numbers, and emotional triggers to make someone want to click. More marketing, less analytical.

**Blog Title rules (STRICT):**
- **ALWAYS ends with ` | Ken Research`** — this is a hard requirement, no exceptions. The pipe + brand suffix is the standard format for ALL blog titles.
- Length: **85-115 characters total** (hook + " | Ken Research"). The hook portion (before the pipe) should be 70-100 chars. Count every character including the " | Ken Research" suffix.
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

**Examples (85-115 chars total including "| Ken Research" — punchy hook + brand suffix):**
- `"Vietnam's Probiotics Sector Races to USD 350M as Plant-Based Products Explode at 31% Growth | Ken Research"` (107 chars) ✅
- `"India Wheat Gluten Surges at 5.5% CAGR on Rising Bakery Demand | Ken Research"` (78 chars) ✅
- `"Colombia's Customs Market Hits USD 320M as VUCE Rewrites Trade Rules | Ken Research"` (84 chars) ✅
- `"Indonesia's Hospitality Boom: USD 16.5 Billion and Surging Past Bali by 2030 | Ken Research"` (91 chars) ✅
- `"Kuwait Education at 6% CAGR on KWD 2 Billion Government Spend | Ken Research"` (77 chars) ✅

---

## Step 6: Write the HTML Microblog

**INTERLINK DISTRIBUTION PLAN (plan before writing):**

Before writing, assign interlinks across the blog. Follow these rules exactly:

**Rule A — Intro paragraph: exactly 2 links**
- Link 1: Ken Research homepage (`kenresearch.com`) — naturally woven as attribution or credibility signal
- Link 2: Target report — woven as the primary source reference
- Both must appear in sentence 3 or later (sentences 1 and 2 are anchor-free — see INTRO ANCHOR PLACEMENT RULE)
- Both must be in **separate sentences** — never in the same sentence
- Both must feel natural in the prose — not bolted on as a label

**Rule B — Each body paragraph (H2 sections): exactly 1 link**
- Maximum **1 related report link per paragraph** — no exceptions
- **NEVER place 2 links within the same paragraph or in back-to-back consecutive paragraphs**
- If you have more related URLs than body paragraphs, move the overflow into FAQ answers (see Rule C)
- The link must be contextually relevant to that paragraph's topic — not a filler link

**Rule C — FAQs: 1 link in 2-3 of the 5 FAQs**
- FAQ answers that naturally reference a related market get 1 link each
- This is where overflow links from body paragraphs are placed
- FAQs with no natural fit for a related link stay link-free

**Rule D — CTAs: 1 link each**
- CTA 1: sample report link
- CTA 2: target report link

**Rule E — Branding paragraph: 1-2 links**
- Ken Research homepage (if not already used in branding para context)
- 1 optional related report link — must be a thematically adjacent market, not a repeat of body links

**Total: 10-12 unique Ken Research links across the full blog**

**Back-to-back link check (MANDATORY before saving):**
Scan the full HTML. If any two `<a href=` tags appear within 3 lines of each other outside the intro/CTA/branding blocks → redistribute. Move the second link to a FAQ answer or remove it.

---

**INTRO ANCHOR PLACEMENT RULE (strict)**

Sentences 1 and 2 of the intro paragraph must contain ZERO anchor links. All anchors in the intro must appear in sentence 3 or later.

**Why:** the first two sentences are where the reader decides whether to keep reading. Adding clickable links there gives them an exit ramp before the hook has landed. Holding the first two sentences for pure narrative and data lets the reader commit to the article before any link friction.

**What goes in sentences 1 and 2:**
- Sentence 1: market hook with the headline data figure (the "what is happening" sentence)
- Sentence 2: the structural narrative or thesis (the "why it matters" sentence)
- Both sentences are pure prose. Stats can be bolded (per STATS DENSITY RULE), but no `<a>` tags.

**What goes in sentence 3 and sentence 4 (BOTH MANDATORY, SEPARATE SENTENCES):**
- Sentence 3: target report UTM link — e.g. `...see the <strong>{Market Name} Report</strong> for the full breakdown.`
- Sentence 4: Ken Research homepage UTM link — e.g. `This analysis is published by <strong>Ken Research</strong>, a leading market intelligence firm covering {sector} across {region}.`
- **NEVER put both links in the same sentence** — they must be in separate sentences
- **NEVER write an intro with only 1 link** — both are mandatory

**Self-check:** before saving, look at the intro paragraph. Confirm (1) every `<a href=` tag appears AFTER the second sentence-ending period, and (2) the two intro links are in different sentences. If both links share a sentence, split them.

---

**FACT PRESENTATION RULE (CRITICAL — makes data feel reported, not invented):**

Raw numbers without context read like a spreadsheet. Every key data figure must be presented with a source signal and an implication — not just stated.

**Three-part fact pattern (apply to every major stat):**
1. **Signal** — a brief inline source tag that tells the reader where the number comes from: *"as per government production data"*, *"based on operator fleet disclosures"*, *"according to industry association estimates"*, *"as tracked by Ken Research market modelling"*
2. **Figure** — the bolded stat itself
3. **Implication** — one clause that tells the reader what this number means for operators, investors, or buyers

**BAD (stat dump — no signal, no implication):**
"Global production exceeded **40 million metric tons** in 2025."

**GOOD (signal + figure + implication):**
"As per global agricultural production surveys, output crossed **40 million metric tons** in 2025 — a threshold that signals supply consolidation is outpacing demand growth in mainstream varieties."

**Rules:**
- Every paragraph's PRIMARY stat (the biggest or most surprising number) must use this three-part pattern
- Supporting stats in the same paragraph can be stated more concisely — signal + figure is enough
- Source signals must be specific to the data type: use *"government data"* for policy/regulation figures, *"industry surveys"* for production/capacity, *"operator disclosures"* for market share, *"Ken Research modelling"* for CAGR/forecast figures
- Never use *"third-party estimates"* alone — always pair it with a sector qualifier: *"third-party agriculture-sector estimates"* → replace with *"independent crop production surveys"*
- The implication clause does not need to be long — one clause or phrase is enough. Its job is to make the reader feel the number, not just read it.

---

**NARRATIVE FLOW RULE (CRITICAL — prevents mechanical "generated" tone):**

Every section must follow this structure. Never write stat → link → stat → CTA → stat → link.

**CORRECT flow per section:**
1. **Problem or market shift** — open with a tension, shift, or gap (1 sentence, no stats)
2. **Evidence** — the facts and stats that prove it (2-3 stats max)
3. **Implication** — what this means for operators, investors, or buyers (1 sentence)

**BAD (sounds generated):**
"Russia's carsharing market exceeded 60 billion rubles in 2024, up from 44 billion rubles in 2023, at a projected 40% CAGR..."

**GOOD (sounds like analysis):**
"The fastest growth in Russia's rental sector is not coming from traditional self-drive — it is coming from app-based platforms consolidating faster than operators anticipated. Russia's carsharing market exceeded 60 billion rubles in 2024, up from 44 billion rubles in 2023, at a projected 40% CAGR through 2028. For fleet investors, this signals a platform-capture dynamic that will narrow entry windows within two years."

Apply this narrative arc to every section. Stats serve the story. The story does not serve the stats.

---

**CREDIBILITY LINE RULE (MANDATORY):**

Immediately after the intro paragraph and before the first H2, insert this credibility line:

```html
<p><em>This analysis is based on Ken Research market modelling, operator fleet disclosures, [sector] indicators, and third-party [sector]-sector estimates.</em></p>
```

Replace `[sector]` with the relevant sector (e.g. tourism, logistics, education, healthcare). This builds reader trust before they reach the Research Basis section at the end.

---

**LOCKED HTML STRUCTURE:**

```html
<img src='{coverImageUrl}' alt='{topic}'>
<h1>{H1 title — 100-130 chars, never starts with Ken Research, see Step 5a rules}</h1>

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

<div class="cta-block">
  <p>{topic-specific hook sentence}? <a href='{sample_report_UTM_url}' style="color:#0645AD; font-weight:700; text-decoration:underline;" target="_blank" rel="noopener"><strong>Download Sample Report</strong></a> {topic-specific closing clause}.</p>
</div>

<h2>{SEGMENT 3 HEADING — Pattern C, MUST be a question, MUST end with ?}</h2>
<p>{paragraph with 1-2 related report interlinks}</p>

<h2>{SEGMENT 4 HEADING — Pattern F, forward-looking}</h2>
<p>{paragraph with 1 related report interlink}</p>
<ul>
  <li>...</li>
</ul>

<div class="cta-block">
  <p>{topic-specific hook}? <a href='{report_UTM_url}' style="color:#0645AD; font-weight:700; text-decoration:underline;" target="_blank" rel="noopener"><strong>{Market Name} Report</strong></a> {topic-specific closing clause}.</p>
</div>

<h2>Conclusion</h2>
<p>{conclusion — MUST include target report UTM link — never write a link-free conclusion}</p>

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

Always use SINGLE QUOTES for img src and alt to avoid JSON escaping issues:
```html
<img src='{url}' alt='{topic}'>
```

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

**NO EM DASH RULE (STRICT — APPLIES TO ENTIRE OUTPUT):**

Zero em dashes (—, U+2014) and zero en dashes (–, U+2013) anywhere in the output. This is a hard, non-negotiable rule that covers every part of every field written to the sheet:
- H1 title
- All H2 and H3 headings
- Every body paragraph
- Every bullet point (including the bold label and the content after it)
- Both CTA wrapper sentences
- All 5 FAQ questions and answers
- Conclusion
- Image alt text
- Blog Description (SEO portion)
- LinkedIn Caption (after `, caption-`)

**Replacement playbook (apply consistently):**

| Em dash use case | Replacement |
|-----------------|-------------|
| Parenthetical aside | comma or parentheses |
| Strong break or pivot | colon or period (start a new sentence) |
| Range like "2014—2020" | "2014 to 2020" or "2014 through 2020" |
| Emphasis pause | comma, or "as" / "while" / "because" |

**These are NOT em dashes and remain allowed:**
- Hyphens in compound modifiers: double-digit, data-driven, forward-looking, mid-blog, e-commerce, 1-ton
- Hyphens in product/policy names: FAME-II, make-in-India
- Hyphens in number compounds: 8.7%-CAGR-trajectory

The ban is on em dash (—) and en dash (–) used as sentence punctuation. Plain hyphens (-) in compound words stay.

**Enforcement gate before writing to sheet:** do a literal character match across the full HTML + Blog Description + LinkedIn Caption for the em dash character (—, U+2014) and en dash (–, U+2013). If either character appears even once anywhere, the row fails the self-check and must be regenerated, not patched.

---

**BOLDING RULES:**

The principle: Bolding lets a CFO scan the blog in 30 seconds and walk away knowing the market. If a reader looks only at the bold text top to bottom, they should understand: what the market is, how big it is, the main growth driver, the biggest risk, and where it is headed. Nothing else. Every rule below serves that one job.

**Definitions**

A **section** is one H2 heading plus the paragraph and bullets under it, ending at the next H2.

These also count as sections:
- The intro paragraph (above any H2)
- The conclusion
- Each FAQ question + answer pair (one section per Q+A)

These are NOT sections (they have their own rules):
- CTA blocks
- Headings (H1, H2, H3)
- Image alt text

**CATEGORY A: Data bolds**

Bold every stat in the paragraph or bullet. Context is required, the bare number is never bolded.

Bold-worthy stats (same definitions as STATS DENSITY RULE):
- Currency + context: `<strong>USD 8.7 billion in 2024</strong>`
- Percentage + context: `<strong>13.6% CAGR</strong>`, `<strong>36.7% market share</strong>`
- Named policy or law: `<strong>FAME India Scheme Phase II</strong>`
- Count + what is counted: `<strong>7,432 charging stations</strong>`
- Comparative stat: `<strong>doubled in five years</strong>`, `<strong>up from 18% to 31%</strong>`

No per-paragraph cap is needed at this layer. The STATS DENSITY RULE in CONTENT RULES already caps stats at 3 per paragraph, 1 per bullet content, and 2 per FAQ answer. Because density is controlled at the writing stage, every stat that survives into the final draft gets bolded without breaking visual signal. If you find yourself wanting to skip bolding on a stat to manage density, the right move is to rewrite the paragraph to carry fewer stats, not to leave one unbolded.

**Width of the bold (how much to include):**

Bold the minimum phrase that makes the stat understandable on its own. Test: if you read only the bold, do you know what is being measured?
- Right: `36.7% market share` ✅ (number + metric)
- Right: `USD 8.7 billion in 2024` ✅ (number + unit + time tied to the stat)
- Wrong: `36.7%` ❌ (no metric, the bold is meaningless on its own)
- Wrong: `Maharashtra captured 36.7% market share in 2024` ❌ (over-bolded, includes subject and time)

The default is number + unit + metric. Drop the subject and the time qualifier unless either is essential to meaning.

**CATEGORY B: Editorial bolds**

One phrase per section that captures the section's single biggest takeaway. Length: 5 to 10 words. No periods inside the bold.

Right:
- `<strong>consolidation is already underway across the value chain</strong>` (9 words)
- `<strong>the window to capture market share is narrowing</strong>` (9 words)
- `<strong>digital reforms are the real growth engine</strong>` (8 words)

Wrong:
- `<strong>key insight</strong>` ❌ (vague, no claim)
- `<strong>not a cyclical spike. It is structural realignment.</strong>` ❌ (period inside the bold)
- `<strong>market is growing</strong>` ❌ (no specific claim)

Hard cap: maximum 1 editorial bold per section, total. Goes either in the paragraph or in one bullet, never both.

Where the editorial bold goes when the section has zero data bolds: it lands in the paragraph, ideally in the last sentence. Never in a bullet for stat-free sections.

**Four things that don't count toward any bolding cap:**
- Bullet labels: the `<strong>{Label}:</strong>` at the start of each bullet
- Link `<strong>` tags: the bold inside `<a>` tags
- The CTA anchor `<strong>`: same as the link rule
- Headings: H1, H2, H3 are already visually distinct, never add bolds inside them

**Total paragraph density cap:**

Across data bolds + editorial bold + link strongs combined, maximum 5 visible bolds per paragraph. If you hit 5 and still want to add another, restructure the paragraph instead of squeezing.

**Editorial bold and anchor links never overlap:**

An anchor link can never BE the editorial bold. Keep them in separate clauses or separate sentences.

**FAQ rules (each Q+A is one section):**
- Maximum 2 data bolds per FAQ answer
- Editorial bold optional, maximum 1 if used
- No-zero-bolds floor does NOT apply to FAQs. If a FAQ answer has no stats and no policy names, leave it unbolded.
- Reminder: link `<strong>` tags inside the answer do not count toward the cap

**CTA rules (CTA blocks are not sections):**
- Only the anchor `<strong>` is allowed (mandatory, per the LINK STYLE rule)
- No other bolds anywhere in the wrapper sentence, even if it contains a stat
- The locked anchor is the ONLY bold permitted in a CTA block

**No-zero-bolds floor (body sections only, not FAQs or CTAs):**

Every body section must have at least one visible bold (data, editorial, or policy name). Enforced section by section.

If a section has no stats and no policy names: add 1 editorial bold (5 to 10 words) in the last sentence of the paragraph.

**The scan test before saving:**

Read only the bold text in the blog, top to bottom, ignoring link strongs and bullet labels. Ask:
1. Can I tell what the market is and how big it is?
2. Can I tell the main growth driver?
3. Can I tell the biggest risk or shift?
4. Can I tell where the market is headed?

If yes to all four → bolding is doing its job. If no → either you bolded the wrong things, or you bolded too many things and the signal got buried. Rewrite, do not patch.

---

**KEN RESEARCH MENTION RULES:**
- Mention Ken Research 5-7 times in body as attribution/credibility
- Homepage link in intro paragraph (use UTM URL)
- Report link in intro paragraph (use UTM URL)
- NO Ken Research in H2 headings

---

**CTA RULES — Two CTAs, anchor text LOCKED:**

**CTA 1** (mid-blog, after Section 2):
- Anchor: `Download Sample Report` (LOCKED — never change)
- URL: `{sample_report_UTM_url}` from Step 4
- Anchor must be wrapped in `<strong>` per LINK STYLE rule
- Wrapper: Fresh, topic-specific hook + closing clause. NO boilerplate like "Looking for the complete picture"

**CTA 2** (after Section 4):
- Anchor: `{Market Name} Report` (LOCKED — truncated market name + "Report", NO "View the" prefix ever)
- URL: `{report_UTM_url}` from Step 4
- Anchor must be wrapped in `<strong>` per LINK STYLE rule
- Wrapper: Fresh, topic-specific hook + closing clause. NO boilerplate like "Ready to make data-driven decisions"

---

**CONTENT RULES:**
- Word count: 1200-1400 words (body text only)
- Section structure: EXACTLY 1 paragraph per section, then bullet points. NEVER write 2 paragraphs in one section. One para + bullets is the locked pattern for every section.
- Paragraph length: MAX 3 sentences in that single paragraph. Tight and punchy. No 4+ sentence blocks.

**MANDATORY DATA DENSITY RULE (HARD RULE — ENTIRE BLOG MUST BE DATA-HEAVY):**

The blog must be data-heavy throughout. Every paragraph, every bullet, every FAQ answer must carry specific numbers, named figures, named policies, or named players. No sentence should exist purely as narrative without an anchoring data point. A reader scanning only the numbers must walk away with a complete picture of the market.

Every body paragraph (intro + all 4 sections + conclusion) MUST contain at least **3 data figures minimum**. The old floor of 2 is no longer acceptable. Paragraphs with only 2 stats must be rewritten to add a third figure before saving.

- **Minimum 3 stats per paragraph** — hard floor, no exceptions for any body paragraph
- **No more than 1 consecutive sentence without a stat** — if sentence N and sentence N+1 both carry zero numbers, rewrite one of them to embed a figure. A paragraph with 5 sentences and only 2 stats buried at the start fails this rule regardless of the total count.
- **Every paragraph must have a stat in the first 2 sentences** — never open with 2 purely narrative sentences before the first number appears
- **Every bullet must carry its own stat** — minimum 1 stat per bullet (not across the list, per individual bullet). A bullet with no number is a weak bullet and must be rewritten.
- **FAQ answers: minimum 2 stats per FAQ answer** — if the primary figure + one supporting figure cannot be found, go back to Step 2 research and find them. A single-stat FAQ answer is not acceptable.
- Every section paragraph must also carry at least one named player, named policy, or named regulation in addition to numeric stats where available.

If you cannot find 2 real figures for any paragraph from Step 2 research: run an additional web search before writing that section. Do not write a data-light paragraph. The report page and web research must supply at least 2 figures for every body paragraph.

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

**STATS DENSITY RULE (controls the range — floor from MANDATORY DATA DENSITY RULE above):**

**Floor: 3 stats per paragraph, 1 stat per bullet, 2 stats per FAQ answer.**
**Ceiling: 4 stats per paragraph, 1 stat per bullet, 3 stats per FAQ answer.**

The blog must be data-heavy throughout. Every paragraph must sit within this 3-4 range. Hitting only 2 is the old floor and is now a failure. Hitting 5+ causes overcrowding — split or move excess to bullets. Additionally: no two consecutive sentences may both be stat-free — scan every paragraph sentence by sentence before saving.

A "stat" is a number with context. The following count as stats:
- Currency + amount: USD 8.7 billion in 2026
- Percentage + metric: 13.6% CAGR, 36.7% market share
- Named count: 62 million SMEs, 7,432 charging stations
- Named policy or regulation: FAME India Scheme Phase II
- Comparative figure: doubled in five years, three times higher than 2023 levels

The following do NOT count as stats and don't trigger the cap:
- Bare years (2026, 2030) when not tied to a value
- Generic references to "billions" or "millions" without a specific figure
- Section numbers, list counters, ordinal references

If a paragraph wants to carry more than 3 stats, split across sections, move to bullets, or rewrite some as plain narrative.

- 5 FAQs always — exactly 5, no more, no less
- 2-3 FAQs must have interlinks (not all 5, not just 1)
- 10-12 total interlinks across the entire blog (planned in Step 6 before writing)
- NO em dashes or en dashes ANYWHERE in the output (see NO EM DASH RULE above) — use colon, comma, or rephrase
- NO source attribution line at bottom
- Acronyms always correctly capitalized: UAE, GCC, USA, UK, MENA, APAC, ASEAN, EMEA, LATAM, 3PL, 4PL, IoT, AI, GMP, GDP, FMCG, QSR, SME, MSME, OEM

---

## Step 7: Self-Check Before Saving

Run through this checklist before writing to sheet:

- [ ] H1 is between 100 and 130 characters (count every character — hard floor and ceiling)
- [ ] H1 does NOT start with "Ken Research" — starts with market name, question word, or stat
- [ ] H1 has Ken Research in MIDDLE or END as a contextual ACTOR (not a label/tag)
- [ ] H1 has zero em dashes and zero en dashes
- [ ] H1 contains zero stale years — no CAGR ranges like "(2012-2017)", no outdated forecast years
- [ ] Blog Title ends with ` | Ken Research` (pipe + brand suffix — always, no exceptions)
- [ ] Blog Title is 85-115 chars total including " | Ken Research" — count every character
- [ ] Blog Title does NOT start with "Ken Research"
- [ ] Blog Title has Ken Research in MIDDLE or END as a contextual ACTOR
- [ ] Blog Title contains at least one striking number (CAGR, USD size, forecast figure)
- [ ] Every body link (except intro attribution links) has a bridge sentence explaining why the linked report is relevant — scan every `<a href=` tag
- [ ] Every paragraph's primary stat uses the three-part pattern: source signal + bolded figure + implication clause
- [ ] Blog Title uses catchy/punchy language — emotionally engaging, scroll-stopping
- [ ] Blog Title is a DIFFERENT angle from H1 — different words, different emotional register
- [ ] Blog Title contains zero stale years — same YEAR MODERNIZATION RULE as H1
- [ ] Blog Title is not a question (declarative only)
- [ ] Both titles (H1 and Blog Title) are distinct — not near-identical in structure or meaning
- [ ] Every link has UTM parameters
- [ ] Every anchor uses the locked LINK STYLE (inline font-weight:700 + `<strong>` wrap)
- [ ] Ken Research homepage linked in intro (with UTM)
- [ ] Target report linked in intro (with UTM)
- [ ] Intro paragraph: sentences 1 and 2 contain ZERO anchor links (INTRO ANCHOR PLACEMENT RULE)
- [ ] Both intro anchors appear in sentence 3 or later
- [ ] Sample report URL fetched and confirmed; used in CTA 1 (with UTM)
- [ ] Both CTA anchors wrapped in `<strong>`
- [ ] Pattern C heading ends with `?`
- [ ] Exactly 5 FAQs
- [ ] 2-3 FAQs have interlinks
- [ ] Total interlinks count = 10-12
- [ ] Zero em dashes (—) and zero en dashes (–) anywhere — literal character match across HTML + Blog Description + LinkedIn Caption
- [ ] No double quotes `"text"` used inside HTML paragraph body — rephrase or use single quotes to avoid `""artifact""` rendering in the sheet
- [ ] No Research Basis section present — article ends with Ken Research branding paragraph
- [ ] Ken Research branding paragraph is the LAST element after FAQs
- [ ] Conclusion contains target report UTM link — never a link-free conclusion
- [ ] Both intro links are in SEPARATE sentences (not the same sentence)
- [ ] CTA2 anchor does NOT start with "View the" — anchor is just "{Market Name} Report"
- [ ] All related report anchors include the trigger word (market/industry/sector) — "Global Insurance Industry" not "Global Insurance"
- [ ] FAQs are numbered Q1/Q2/Q3/Q4/Q5 in H3 tags
- [ ] All ranges written as "X to Y" or "X through Y", never "X–Y" or "X—Y"
- [ ] Compound-word hyphens preserved (these are fine and expected)
- [ ] Word count is 1200-1400 words
- [ ] Ken Research mentioned 5-7 times
- [ ] Every body paragraph has at least 3 data figures (MANDATORY DATA DENSITY RULE — 2 is the old floor, now a failure)
- [ ] No two consecutive sentences in any paragraph are both stat-free — scan sentence by sentence
- [ ] Every H2 heading contains at least one data figure (%, USD, CAGR, billion, year, named stat)
- [ ] No paragraph uses a past year (2023 or earlier) as the current/present state reference — present conditions use 2026
- [ ] Historical figures (old years as background context) are fine — only "current state" must use 2026
- [ ] Every body section has at least 1 visible bold (data, editorial, or policy)
- [ ] Every paragraph has 2-3 stats (floor 2, ceiling 3 — STATS DENSITY RULE)
- [ ] Every individual bullet has at least 1 stat and max 1 stat (STATS DENSITY RULE)
- [ ] Every FAQ answer has at least 2 stats and max 2 stats (STATS DENSITY RULE)
- [ ] **RULE 5 CHECK: Every single number, percentage, currency, or statistic anywhere in the HTML is wrapped in `<strong>` tags — scan the entire HTML and verify not a single bare number remains. This includes paragraph text, bullet content, FAQ answers, intro, and conclusion. Zero tolerance for unbolded numbers.**
- [ ] Every stat in the output is bolded as a data bold (no unbolded stats survived into the final draft)
- [ ] Each section has at most 1 editorial bold (in paragraph OR a bullet, not both)
- [ ] Every editorial bold is between 5 and 10 words with no period inside
- [ ] No paragraph exceeds 5 total visible bolds (data + editorial + link strongs combined)
- [ ] Stat-free sections have the editorial bold in the last sentence of the paragraph (not in bullets)
- [ ] No editorial bold doubles as an anchor link (and no anchor link doubles as the editorial bold)
- [ ] FAQ answers with no stats and no policy names are left unbolded (no forced editorial bold)
- [ ] CTA blocks contain exactly one bold (the anchor `<strong>`), nothing else
- [ ] Headings (H1, H2, H3) have no `<strong>` tags inside them
- [ ] Data bolds use minimum-phrase width: number + unit + metric, dropping subject and time qualifier unless essential
- [ ] Scan test passes: reading only the bold text top to bottom answers all 4 questions (what is the market, how big, main driver, where headed)

---

## Step 7b: Inline Critical Checks (6 checks — do not read external skill file)

Run these 6 checks inline. Fix immediately if any fail. Do NOT write to sheet until all pass.

**Check 1 — Em/En dash scan:** Search the full HTML + Blog Title + Blog Description for `—` (U+2014) and `–` (U+2013). If found even once → rewrite that sentence, then re-scan. Zero tolerance.

**Check 2 — Link count:** Count all `<a href=` in the HTML. Must be 10-12. If under 10 → add interlinks to FAQs or body bullets. If over 12 → remove the weakest ones.

**Check 3 — Word count:** Strip HTML tags, count words. Must be 1200-1400. If under → expand one body section. If over → trim bullet points.

**Check 4 — FAQ count:** Count `<h3>` tags after `<h2>Frequently Asked Questions</h2>`. Must be exactly 5.

**Check 5 — Unbolded numbers:** Scan the HTML body (outside headings and CTAs) for any bare number pattern (`%`, `USD`, `billion`, `million`, `CAGR`, 4-digit year) NOT wrapped in `<strong>`. If found → wrap each one.

**Check 6 — Character count (STRICT HARD LIMIT):** Count total characters in the full HTML string including all tags. Must be **strictly under 14,000 characters**. If over → trim FAQ answers first, then bullet points, then body paragraph verbose clauses. Do NOT cut stats or links. Recheck after every trim until under 14,000.

```python
char_count = len(html_content)
# Must be < 14000. No exceptions. Sheet column silently truncates above this.
```

Log result:
```
[7b] Em dashes: PASS/FAIL | Links: {n} PASS/FAIL | Words: {n} PASS/FAIL | FAQs: {n} PASS/FAIL | Bolds: PASS/FAIL | Chars: {n} PASS/FAIL
```

Collect all FAIL items into a `failedChecks` list. Proceed to Step 7c regardless of pass/fail — the rating step decides what happens next.

---

## Step 7c: Rate the Blog (out of 10)

Run all 13 checks below. Each check is pass (1) or fail (0), except check 1 which is worth 2 points. Sum raw points, then normalize to a 10-point score:

```
blogRating = round(raw_points / 13 × 10)   minimum: 1
```

### Structural Checks

| # | Check | Raw pts |
|---|-------|---------|
| 1 | Zero em dashes (—) and zero en dashes (–) found anywhere in HTML + Blog Title + Blog Description | 2 |
| 2 | Word count is 1200-1400 words | 1 |
| 3 | Total interlinks are 10-12 | 1 |
| 4 | Exactly 5 FAQs present | 1 |
| 5 | All stats/numbers in HTML are wrapped in `<strong>` (no bare numbers found) | 1 |
| 6 | Every body paragraph has at least 3 data figures | 1 |
| 7 | H1 is 100-130 chars AND Blog Title is 70-90 chars (both must pass for 1 point) | 1 |
| 8 | Both CTAs present with correct locked anchor text | 1 |
| 9 | Ken Research mentioned 5-7 times in the blog body | 1 |

### B2B Audience Checks

| # | Check | Raw pts |
|---|-------|---------|
| 10 | **Implication density:** At least 3 body paragraphs contain a business implication clause after a stat. Signal phrases: "signals", "underpins", "creates a", "reflects", "validates", "reshaping", "directly", "rewards", "accelerating". A paragraph that only dumps stats without stating the business consequence = FAIL. | 1 |
| 11 | **Source attribution density:** At least 5 source citation signals appear in the blog body. Valid phrases: "as per Ken Research", "as per government", "as tracked by", "as recorded in", "as per operator disclosures", "as per official", "as per independent surveys". B2B readers cite these internally — no source = no credibility. | 1 |
| 12 | **Decision-framer H2s:** At least 2 of the 4 body H2 headings use interrogative framing (Why/How/What) OR outcome-action verbs (Reshaping, Unlocking, Racing, Draws, Signals, Drives, Splits, Mapping, Marks). Generic H2s ("Overview", "Key Players", "Market Size", "Background") = 0. | 1 |

**Raw total: 13 points max → normalized to 10**

Example: 11/13 raw → round(11/13 × 10) = round(8.46) = **8/10**

No half points on individual checks. Normalize only at the end.

Set `blogRating` = normalized score (integer 1-10).

Log:
```
[7c] Rating: {blogRating}/10 (raw: {raw}/13) | Em dash: {pass/fail} | Words: {n} | Links: {n} | FAQs: {n} | Bolds: {pass/fail} | Data density: {pass/fail} | Titles: {pass/fail} | CTAs: {pass/fail} | KR mentions: {n} | Implication: {pass/fail} | Sources: {n} | H2 framing: {pass/fail}
```

---

## Step 7d: Quality Gate + Repair Loop

**`blogRating` ≥ 8 → PASS** — proceed directly to Step 8.

**`blogRating` < 8 → FAIL** — trigger repair loop (max 2 attempts).

### Repair Loop

**1. Build repair feedback packet from all failed checks:**
```
FAILED CHECKS:
- Em dashes: found {n} — location and fix instruction
- Word count: {n} words — trim or expand which section
- Interlinks: {n} links — remove weakest or add bridge links
- Blog Title: {n} chars — shorten/lengthen to 70-90
- Bare numbers: {n} unbolded stats — wrap each in <strong>
- FAQs: {n} found — add/remove to reach exactly 5
- CTAs: missing or wrong anchor text — fix
- KR mentions: {n} — add/remove to reach 5-7
- Data density: which paragraph is below 3 stats
- Implication density: {n} paragraphs with implication clause (need ≥3) — add "signals/underpins/creates a/validates" clause to stat sentences
- Source attribution: {n} source signals found (need ≥5) — add "as per [source]" before or after bare stats
- H2 framing: {n} decision-framer H2s (need ≥2) — rewrite generic H2s to Why/How/What questions or outcome-action statements
```

**2. Call `article-repair` agent with:**
- Full blog HTML
- Blog Title
- `failedChecks` feedback list
- Fact bank from Step 2 (repair agent uses ONLY these facts — never invents new data)

Repair agent fixes ONLY the failed items and returns repaired HTML + list of changes made.

**3. Re-run Step 7b checks on repaired HTML → collect new `failedChecks`**

**4. Re-run Step 7c scoring → get new `blogRating`**

**5. Decision:**
- `blogRating` ≥ 8 → PASS → proceed to Step 8
- `blogRating` < 8 AND attempts < 2 → repeat repair loop from step 1
- `blogRating` < 8 AND attempts = 2 → write the blog to sheet anyway (best version after repairs), then paint the Rating cell red:
  ```
  # Write blog content normally (same as Step 9)
  python scripts/sheet_write.py --sheet blog --row <row> --updates-file C:/tmp/blog_updates_{row}.json

  # Paint Rating cell red to flag for manual review
  python scripts/sheet_write.py --sheet blog --row <row> --flag-red
  ```
  Red Rating cell = blog is in the sheet but did not reach 8/10 after 2 repairs. Needs human review.

Log after each attempt:
```
[7d] Repair {attempt}/2: {old_rating} → {new_rating} | Fixed: {list} | Still failing: {list}
```

---

## Step 7e: Log Repair to Blog Intelligence (runs only if Step 7d triggered)

If Step 7d ran (i.e. at least one repair attempt happened), call the `blog-intelligence` agent in **Learn mode** immediately after the repair loop completes — whether the blog passed or failed.

**What to pass to blog-intelligence Learn mode:**

```
Blog: {Blog Title}
Market: {marketName}
Initial Rating: {rating before first repair}
Final Rating: {rating after repair loop}
Repair Attempts: {1 or 2}
Result: passed | failed

Issues Found (from Step 7b + 7c failedChecks):
- {check name}: {what failed, specific detail}
- e.g. "Em dashes: 3 found in sections 2 and 4"
- e.g. "Word count: 1521 — over limit by 121 words"
- e.g. "Blog Title: 97 chars — over 90 char limit"
- e.g. "Bare numbers: 8 unbolded stats in body paragraphs"
- e.g. "KR mentions: 11 — over the 5-7 range"

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

## Step 8: Generate Blog Description + Caption (combined field)

The `Blog Description` column stores TWO things in one field, separated by `, caption-`:

```
[SEO description], caption- [LinkedIn caption]
```

**Part 1 — SEO Description (before the comma):**
- 160-180 characters (count carefully)
- Use current year or forecasted year data ONLY — do NOT lead with historical figures
- Only include past year data if needed as comparison (e.g., "up from X in 2020 to Y by 2025")
- Must open with a hook (surprising insight, market tension, or forward-looking stat)
- Include at least one data figure (forecast CAGR, projected size, or forecast year)
- Name at least one key player or driver
- Plain text only — no HTML tags
- No em dashes or en dashes — same strict rule as the blog body

**Part 2 — LinkedIn Caption (after `, caption-`):**
- 150-300 words
- Engaging, professional LinkedIn tone
- Hook line first (1 sentence standalone paragraph)
- 3-4 bullet points (✅ emoji) highlighting key article takeaways
- Closing CTA line ("Read the full article...")
- 5-7 relevant hashtags at the end
- Plain text only
- No em dashes or en dashes — same strict rule as the blog body

**Combined format example:**
```
Thailand's online used car segment is surging at double-digit CAGR through 2025: Ken Research maps how Carsome, Carro and pickup truck dominance are reshaping ASEAN auto retail., caption- Thailand's used car market looks calm on the surface, but Carsome, Carro and iCar Asia are building a double-digit digital surge beneath it.

Ken Research just published the full breakdown of the Thailand Used Car Market 👇

✅ Why 1-ton pickup trucks dominate by both volume and value
✅ How Toyota Sure, Honda and online portals compete across 4 market channels
✅ What the 2025 outlook means for ASEAN auto investors and platform builders
✅ Bangkok vs Northeast: the regional hierarchy that shapes inventory flow

Read the full article to see Ken Research's complete competitive map.

#ThailandUsedCar #ASEANAutomotive #UsedCarMarket #MarketResearch #KenResearch #AutomotiveTrends
```

**Bad example — historical-first (leads with old data):**
"Thailand's used car CAGR of 1.8% during 2014-2020 masks a digital surge: Ken Research maps..." ❌

**Bad example — em dash in caption:**
"Thailand's used car market looks calm on the surface — but Carsome..." ❌ (em dash, must use comma)

---

## Step 8b: Generate blogBatch Label

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

### 9a. Re-verify the target row is still empty (MANDATORY — do this first, every time)

Before writing anything, fetch `blog-read` and re-scan the sheet to find the actual last filled row:

```python
import requests

url = "https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec"
resp = requests.get(url + "?action=blog-read", timeout=30, allow_redirects=True)
rows = resp.json().get("rows", [])

# Find last row that has Blog Content filled
last_filled = None
for r in rows:
    content = r.get("Blog Content", "")
    if isinstance(content, str) and len(content) > 50:
        last_filled = r["_row"]

next_empty = (last_filled + 1) if last_filled else 2  # data rows start at 2

print(f"Last filled row: {last_filled}, will write to row: {next_empty}")
```

- If `next_empty` matches your `target_row` → proceed normally
- If `next_empty` is **different** (e.g., another blog was written in the meantime) → update `target_row = next_empty` and use that row for all writes

This prevents overwriting existing blogs or leaving ghost rows when multiple blogs are generated back-to-back.

---

⚠️ **HARD RULE: ALWAYS use Python to write blog content — NEVER PowerShell ConvertTo-Json.**
PowerShell serializes file content as a PSObject with metadata properties (PSPath, PSParentPath, PSProvider, etc.) that corrupt the Blog Content column in the sheet. Python reads the file as a plain string and writes it cleanly.

### Correct column names (exact, case-sensitive)

| Column | Value |
|--------|-------|
| `targetUrl` | Ken Research report URL (e.g. `https://www.kenresearch.com/industry-reports/india-green-energy-market`) |
| `Title` | Report name only (e.g. `India Green Energy Market`) — capital T |
| `Name` | Account nickname (e.g. `pranav`) |
| `Blog Title` | Hook + ` | Ken Research` suffix — always. Total 85-115 chars. |
| `Blog Description` | 2-3 sentence plain-text meta summary |
| `Blog Content` | Full raw HTML — must start with `<img src=...>` |
| `blogBatch` | Format: `BLOG-YYYY-MM-DD-B{n}` |
| `Rating` | Normalized score out of 10 — always written regardless of pass/fail |

**Rating rule on sheet write:**
- `blogRating` ≥ 8 → write normally, Rating cell shows the score
- `blogRating` < 8 after 2 repair attempts → write blog anyway, Rating cell written + **painted red** via `python scripts/sheet_write.py --sheet blog --row <n> --flag-red`

### Write method (Python only)

```python
import json, requests

with open("path/to/blog.html", "r", encoding="utf-8") as f:
    blog_content = f.read()

payload = {
    "action": "blog-update",
    "row": <data_row>,
    "updates": {
        "targetUrl": "<report URL>",
        "Title": "<Report Name>",
        "Blog Title": "<70-90 char title>",
        "Blog Description": "<2-3 sentence plain text>",
        "Blog Content": blog_content,
        "blogBatch": "BLOG-YYYY-MM-DD-B{n}",
        "Rating": <blogRating>
    }
}

url = "https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec"
resp = requests.post(url, json=payload, allow_redirects=True, timeout=60)
print(resp.json())
```

Success looks like:
```json
{"ok": true, "sheetRow": 4}
```

If `ok` is false, log the error and mark the row as error in the sheet.

---

## Return

```
blogTitle: {Blog Title} ({char_count} chars, must be 85-115, always ends with | Ken Research)
h1Title: {H1} ({char_count} chars, must be 100-130, Ken Research in middle or end)
totalInterlinks: {count}
wordCount: {count}
sampleReportUrl: {url}
rowNumber: {n}
status: generated
```
