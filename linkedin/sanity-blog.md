# Skill: Sanity Blog (Blog Quality Gate)

Validates a generated blog against all rules before it is written to the sheet.
Called from `generate-blog.md` between Step 7 and Step 9.

---

## Inputs

- `h1` — the H1 string (plain text, not wrapped in tags)
- `blogTitle` — Blog Title string (Step 5b output)
- `seoDescription` — Blog Description string (plain text, max 160 chars)
- `blogCaption` — Blog Caption string (plain text)
- `htmlContent` — full raw HTML of the blog body

---

## How to Run

Work through every check below in order.
For each check, write the result inline as either:

```
[PASS] Check name
[FAIL] Check name — reason
[WARN] Check name — reason
```

CRITICAL failures block writing to sheet and MUST be fixed.
WARN items are logged but do not block.

---

## PRE-CHECK: EM DASH / EN DASH SCAN (RUN FIRST — BEFORE ALL OTHER CHECKS)

⚠️ THIS MISTAKE HAS HAPPENED BEFORE AND IS UNACCEPTABLE ⚠️

Before running any other check, scan EVERY input for the em dash character `—` (U+2014) and en dash character `–` (U+2013).

Check ALL of the following:
1. `h1` — any `—` or `–`?
2. `blogTitle` — any `—` or `–`?
3. `seoDescription` — any `—` or `–`?
4. `blogCaption` — any `—` or `–`?
5. `htmlContent` — any `—` or `–` anywhere?

**If ANY em dash or en dash is found anywhere in ANY field:**
```
[FAIL] PRE-CHECK: Em/En dash found — STOP. Do not run any further checks.
Fix every occurrence first. Replace with colon, comma, period, or rephrase.
Then restart the full sanity check from scratch.
```

**Only if ALL fields are em/en dash-free:**
```
[PASS] PRE-CHECK: Zero em/en dashes confirmed — proceed to Block 1.
```

This pre-check is **non-negotiable**. A blog with even one em dash or en dash must not be written to the sheet.

---

## TWO TITLES CONCEPT

Every blog produces two separate title strings, each serving a completely different job. They must never be identical or near-identical to each other.

| Title | Where it lives | Job | Length |
|-------|---------------|-----|--------|
| **H1** | Inside `<h1>` tag in the HTML body | Frames the article — analytical, thesis-driven. MUST start with the exact market name. Ken Research at END only, never in middle, never at start. | 60-90 chars |
| **Blog Title** | Sheet `Blog Title` column, CMS/LinkedIn header | Hooks the reader — catchy, punchy, number-led. Stops the scroll. Uses striking numbers and catchy words. Ken Research at END with ` \| Ken Research` suffix, never at start. | 70-90 chars |

**The core difference:**
- H1 = analytical frame — "here is what the blog is about and why it matters"
- Blog Title = marketing hook — "here is why you must click this right now"

Both must include Ken Research (not at the start), at least one striking number, and zero stale years. They must be genuinely different in wording, angle, and emotional register.

Reusing the same title for both jobs means one job is done badly. The sanity checks below enforce that both are genuinely different.

---

## BLOCK 1: Title Checks

### 1.1 H1 length
- Count every character in `h1` (spaces included)
- **CRITICAL:** must be between 60 and 90 characters (inclusive)
- Log: `[PASS] H1 length: {n} chars` or `[FAIL] H1 length: {n} chars (must be 60-90)`

### 1.2 H1 starts with exact market name
- Check: does `h1` start with the exact market name (first 2-5 words match the primary market keyword)?
- **CRITICAL:** H1 MUST start with the market name — never a question word, never "Ken Research", never "What", "Why", "How", "Is"
- Log: `[PASS] H1 starts with market name` or `[FAIL] H1 does not start with market name — rewrite required`

### 1.3 H1 contains Ken Research at END only
- Check: does `h1` contain "Ken Research"?
- **CRITICAL:** H1 must include "Ken Research" — but ONLY at or near the end (last 20 chars), not in the middle
- Log: `[PASS] Ken Research present in H1 (at end)` or `[FAIL] H1 has no Ken Research mention` or `[FAIL] Ken Research found in middle of H1 — must be at end`

### 1.4 H1 contains a data figure
- Check: does `h1` contain at least one of: `%`, `USD`, `INR`, `billion`, `million`, `CAGR`?
- **CRITICAL:** if none → FAIL
- Log: `[PASS] H1 has data figure` or `[FAIL] H1 has no data figure`

### 1.5 H1 em/en dash check
- Scan `h1` for `—` (U+2014) and `–` (U+2013)
- **CRITICAL:** zero allowed
- Log: `[PASS] H1 no em/en dashes` or `[FAIL] H1 contains em/en dash`

### 1.6 Blog Title length
- Count every character in `blogTitle`
- **CRITICAL:** must be between 70 and 90 characters (inclusive)
- Log: `[PASS] Blog Title length: {n} chars` or `[FAIL] Blog Title length: {n} chars (must be 70-90)`

### 1.7 Blog Title does not start with "Ken Research"
- Check: does `blogTitle` start with the exact string `Ken Research`?
- **CRITICAL:** if yes → FAIL
- Log: `[PASS] Blog Title does not start with Ken Research` or `[FAIL] Blog Title starts with Ken Research — rewrite required`

### 1.8 Blog Title contains Ken Research in middle or end (pipe format at end)
- Check: does `blogTitle` contain "Ken Research" anywhere?
- **CRITICAL:** Blog Title must include "Ken Research" — but not at the start
- Additionally check: if "Ken Research" appears at the END of the Blog Title, it must be preceded by ` | ` (space-pipe-space), e.g. `...outcome | Ken Research`
- **CRITICAL:** Ken Research at end without pipe → FAIL
- Log: `[PASS] Ken Research present in Blog Title (not at start, pipe format correct)` or `[FAIL] Blog Title has no Ken Research mention` or `[FAIL] Ken Research at end of Blog Title but missing pipe separator — must be "... | Ken Research"`

### 1.9 Both titles distinct
- Compare `h1` and `blogTitle` (case-insensitive)
- **CRITICAL:** must be different in wording and angle
- Log: `[PASS] H1 and Blog Title are distinct` or `[FAIL] H1 and Blog Title are identical or near-identical`

### 1.10 Blog Title em/en dash check
- Scan `blogTitle` for `—` and `–`
- **CRITICAL:** zero allowed
- Log: `[PASS] Blog Title no em/en dashes` or `[FAIL] Blog Title contains em/en dash`

### 1.11 Blog Title contains a striking number
- Check: does `blogTitle` contain at least one of: `%`, `USD`, `INR`, `billion`, `million`, `CAGR`, a currency value (e.g. `KWD`, `AED`, `BRL`)?
- **CRITICAL:** if none → FAIL
- Log: `[PASS] Blog Title has a striking number` or `[FAIL] Blog Title has no number — add a CAGR, size figure, or currency value`

### 1.11b Blog Title uses catchy/punchy language
- Check: does `blogTitle` contain at least one catchy word from this list: `Surge`, `Race`, `Explode`, `Reshape`, `Dominate`, `Unlock`, `Hidden`, `Untapped`, `Fastest`, `Biggest`, `Outpace`, `Rewrite`, `Skyrocket`, `Collapse`, `Underrated`, `Double`, `Triple`, `Boom`, `Pouring`, `Climbing`, `Rewritten`, `Reveals`, `Maps`, `Tracks`, `Finds`?
- **WARN** if none found (not critical but signals a weak hook)
- Log: `[PASS] Blog Title has catchy/punchy language` or `[WARN] Blog Title lacks catchy words — consider adding a scroll-stopping verb or modifier`

### 1.12 Blog Title is not a question
- Check: does `blogTitle` end with `?`
- **CRITICAL:** question format is reserved for H1 or H3 FAQs — Blog Title must be declarative
- Log: `[PASS] Blog Title is not a question` or `[FAIL] Blog Title ends with ? (must be declarative)`

### 1.13 No stale years in H1 or Blog Title
- Check both `h1` and `blogTitle` for:
  - CAGR ranges like `(2012-2017)`, `(2015-2020)` — any parenthesized year range → FAIL
  - Forecast years already past (any year < 2026) used as the primary forward-looking figure → FAIL
  - Examples of FAIL: "through 2022", "Outlook to 2023", "forecast to 2021", "CAGR (2012-2017)"
- **CRITICAL:** zero stale years in any title
- Log: `[PASS] No stale years in titles` or `[FAIL] Stale year found in {H1/Blog Title}: "{offending phrase}"`

### 1.14 Two titles serve genuinely different angles (angle check)
This is a judgment check. Compare H1 and Blog Title and ask:

- Does H1 read like a story hook? (narrative, tension or surprise, 100-130 chars)
- Does Blog Title read like a crisp content label? (direct, figures-first, 70-100 chars)

If both titles feel interchangeable (same structure, same words rearranged) → FAIL.

**Example of two titles serving different angles (GOOD):**
```
H1 (starts with market name, analytical, 60-90 chars):
  India Vital Wheat Gluten Market Hits 5.5% CAGR: Ken Research
  (62 chars — market name first, data figure, Ken Research at end)

Blog Title (hook, catchy, number-led, 70-90 chars):
  India's Wheat Gluten Sector Surging at 5.5% CAGR | Ken Research
  (65 chars — scroll-stopping, punchy, different angle)
```

**Example of titles that are NOT genuinely different (BAD):**
```
H1:         India Vital Wheat Gluten Market Growth at 5.5% CAGR: Ken Research
Blog Title: India Vital Wheat Gluten Market Is Growing at 5.5% CAGR | Ken Research
```
(Same words rearranged, no hook energy in Blog Title — fails angle check)

- **CRITICAL** if both titles are near-identical in structure and meaning
- Log: `[PASS] Two titles serve genuinely different angles` or `[FAIL] Titles are near-identical in angle — rewrite required`

---

## BLOCK 2: HTML Structure Checks

### 2.1 Cover image present
- Check: does `htmlContent` contain `<img src=`?
- **CRITICAL:** must be present and must NOT be a placeholder like `placeholder` or `YOUR_IMAGE`
- Log: `[PASS] Cover image present` or `[FAIL] Cover image missing or placeholder`

### 2.2 H1 tag present
- Check: does `htmlContent` contain `<h1>` and `</h1>`?
- **CRITICAL:** exactly one H1 tag
- Log: `[PASS] H1 tag present` or `[FAIL] H1 tag missing`

### 2.3 H1 tag matches h1 input
- Extract text between `<h1>` and `</h1>` — compare to `h1` input
- **CRITICAL:** they must match (trimmed)
- Log: `[PASS] H1 tag content matches` or `[FAIL] H1 tag content differs from Step 5a h1`

### 2.4 FAQ section present
- Check: does `htmlContent` contain `<h2>Frequently Asked Questions</h2>`?
- **CRITICAL:** must be present
- Log: `[PASS] FAQ section present` or `[FAIL] FAQ section missing`

### 2.5 Exactly 5 FAQ questions
- Count `<h3>` tags that appear after the `<h2>Frequently Asked Questions</h2>` marker
- **CRITICAL:** must be exactly 5
- Log: `[PASS] Exactly 5 FAQs` or `[FAIL] FAQ count: {n} (must be 5)`

### 2.6 Two CTA blocks present in blockquote format
- Count occurrences of `<blockquote>` in `htmlContent` (LinkedIn-safe CTA format uses `<hr><blockquote>`, not `<div class="cta-block">`)
- **CRITICAL:** must be exactly 2 `<blockquote>` tags
- Also check: zero occurrences of `class="cta-block"` — if found, CTA format is wrong (LinkedIn strips div/class)
- Log: `[PASS] 2 CTA blockquotes` or `[FAIL] CTA blockquote count: {n} (must be 2)` or `[FAIL] Found div.cta-block — must use <hr><blockquote> format`

### 2.7 Pattern C heading ends with ?
- Find all `<h2>` tags in `htmlContent`
- At least one must end with `?` (before the `</h2>` tag)
- **CRITICAL:** exactly one question-format H2
- Log: `[PASS] Pattern C H2 found (ends with ?)` or `[FAIL] No question-format H2 found`

### 2.8 No `<strong>` inside H2/H3 tags
- Check: no `<h2>...<strong>...</h2>` or `<h3>...<strong>...</h3>` patterns
- **CRITICAL:** headings must never have bold tags inside
- Log: `[PASS] No strong tags in headings` or `[FAIL] strong tag found inside H2 or H3`

### 2.9 No `<strong>` inside H1 tag
- Check: no `<h1>...<strong>...</h1>` pattern
- **CRITICAL:** H1 must not have bold inside
- Log: `[PASS] No strong tag in H1` or `[FAIL] strong tag found inside H1`

---

## BLOCK 3: Link Checks

### 3.1 Total link count (KR + external combined)
- Count all `<a href=` occurrences in `htmlContent`
- **CRITICAL:** total must be between 8 and 9 (this includes ALL links: KR target report + KR homepage + KR related reports + sample report + external authority links combined)
- Log: `[PASS] Link count: {n}` or `[FAIL] Link count: {n} (must be 8-9 total KR + external combined)`

### 3.2 All links have UTM parameters
- For every link URL found in `<a href=...>` tags, check it contains `utm_source=`
- **CRITICAL:** zero links without UTM allowed
- Log: `[PASS] All {n} links have UTM` or `[FAIL] {n} links missing UTM: {list of bare URLs}`

### 3.3 KR anchors have LINK STYLE; external anchors are plain
- For every `<a href=` tag pointing to `kenresearch.com`: verify it contains both:
  - `font-weight:700` (or `font-weight: 700`)
  - A `<strong>` tag wrapping the anchor text
- For external authority links (World Bank, IMF, gov portals, official industry associations): plain `<a>` is correct — do NOT require `<strong>` or `font-weight:700` on these
- **CRITICAL:** every KR anchor must have both; external anchors must NOT have `<strong>` wrap
- Log: `[PASS] KR anchors have LINK STYLE; external anchors are plain` or `[FAIL] {n} KR anchors missing font-weight:700 or <strong> wrap` or `[FAIL] External anchor incorrectly wrapped in <strong>`

### 3.4 CTA 1 anchor text is "Download Sample Report"
- Find CTA block 1 — check its anchor text is exactly `Download Sample Report`
- **CRITICAL:** must match exactly
- Log: `[PASS] CTA 1 anchor correct` or `[FAIL] CTA 1 anchor: "{actual}" (must be "Download Sample Report")`

### 3.5 CTA 2 anchor text is wrapped in `<strong>`
- Find CTA block 2 (second `<blockquote>`) — check its anchor text is wrapped in `<strong>` tags inside the `<a>` tag
- The anchor text itself is topic-specific (no fixed phrase required for CTA 2)
- **CRITICAL:** anchor text must be inside `<strong>` — if anchor has no `<strong>` child → FAIL
- Log: `[PASS] CTA 2 anchor has <strong> wrap` or `[FAIL] CTA 2 anchor missing <strong> wrap — text: "{actual}"`

### 3.6 Intro anchor placement — sentences 1 and 2 are anchor-free
- Extract the first `<p>` tag content in `htmlContent`
- Split into sentences by `.` (period-space or period-end-of-sentence)
- Check sentences 1 and 2 contain ZERO `<a href=` tags
- **CRITICAL:** if any anchor exists in sentence 1 or 2 → FAIL
- Log: `[PASS] Intro sentences 1+2 are anchor-free` or `[FAIL] Intro sentence {1 or 2} contains an anchor link`

### 3.7 Ken Research homepage linked in intro
- Check intro paragraph (`<p>` 1) contains a link to `kenresearch.com` homepage (NOT a report URL — the base domain only)
- **CRITICAL:** must be present
- Log: `[PASS] KR homepage linked in intro` or `[FAIL] KR homepage link missing from intro`

### 3.8 Target report linked in intro
- Check intro paragraph (`<p>` 1) contains at least one link to the targetUrl report path
- **CRITICAL:** must be present
- Log: `[PASS] Target report linked in intro` or `[FAIL] Target report link missing from intro`

### 3.9 External authority link count (0-2 max)
- Count links in `htmlContent` pointing to non-KR domains (World Bank, IMF, national statistics bureaus, government ministry portals, official industry associations)
- **CRITICAL:** must be 0, 1, or 2 — never more than 2
- If 0: PASS (external links are optional — do not force them)
- If 1-2: check each is from an official source only; check it has `target="_blank" rel="noopener noreferrer"`; check it is NOT inside a CTA block or FAQ
- **WARN** if external link appears in CTA or FAQ (wrong placement)
- Log: `[PASS] External authority links: {n} (0-2 OK)` or `[FAIL] External links count: {n} (must be 0-2)` or `[WARN] External link placed in CTA or FAQ — should be in body text only`

---

## BLOCK 4: Content Checks

### 4.1 Word count
- Strip all HTML tags from `htmlContent`, collapse whitespace, split on spaces
- **CRITICAL:** word count must be 1000-1300
- Log: `[PASS] Word count: {n}` or `[FAIL] Word count: {n} (must be 1000-1300)`

### 4.2 Ken Research mention count
- Count occurrences of `Ken Research` (case-sensitive) in stripped text
- **CRITICAL:** must be 3-5
- Log: `[PASS] Ken Research mentions: {n}` or `[FAIL] Ken Research mentions: {n} (must be 3-5)`

### 4.3 Em dash check (HTML body)
- Scan full `htmlContent` for `—` (U+2014)
- **CRITICAL:** zero allowed anywhere
- Log: `[PASS] No em dashes in HTML` or `[FAIL] Em dashes found in HTML — must remove all`

### 4.4 En dash check (HTML body)
- Scan full `htmlContent` for `–` (U+2013)
- **CRITICAL:** zero allowed anywhere
- Log: `[PASS] No en dashes in HTML` or `[FAIL] En dashes found in HTML — must remove all`

### 4.5 Em/en dash check (Blog Description)
- Scan `seoDescription` for `—` and `–`
- **CRITICAL:** zero allowed
- Log: `[PASS] No em/en dashes in Blog Description` or `[FAIL] Em/en dash in Blog Description`

### 4.6 Em/en dash check (Blog Caption)
- Scan `blogCaption` for `—` and `–`
- **CRITICAL:** zero allowed
- Log: `[PASS] No em/en dashes in Blog Caption` or `[FAIL] Em/en dash in Blog Caption`

### 4.7 Blog Description length
- Count characters in `seoDescription`
- **CRITICAL:** must be 160 chars or fewer
- Log: `[PASS] Blog Description length: {n} chars` or `[FAIL] Blog Description length: {n} chars (must be max 160)`

### 4.8 Blog Description plain text
- Check `seoDescription` contains no HTML tags (`<` or `>`)
- **CRITICAL:** plain text only
- Log: `[PASS] Blog Description is plain text` or `[FAIL] Blog Description contains HTML tags`

### 4.9 Blog Caption has hashtags
- Check `blogCaption` contains at least 3 `#` characters
- **WARN** (not critical): missing hashtags reduce LinkedIn reach
- Log: `[PASS] Blog Caption has hashtags` or `[WARN] Blog Caption missing hashtags`

### 4.10 Banned phrases check
- Scan stripped text for: `Check out`, `Read more`, `Excited to share`, `Deep dive`, `Delve into`, `I am pleased`, `Looking for the complete picture`, `Ready to make data-driven decisions`
- **WARN** for each found
- Log: `[PASS] No banned filler phrases` or `[WARN] Banned phrase found: "{phrase}"`

### 4.11 No attribution line at bottom
- Check: `htmlContent` does NOT end with a line like `Source:`, `Data source:`, `References:`, or `All data from`
- **WARN**
- Log: `[PASS] No attribution line` or `[WARN] Attribution/source line found at bottom`

### 4.12 Every body paragraph contains at least TWO data figures
- Strip HTML tags and split `htmlContent` into paragraphs (by `<p>` tags, excluding CTA blocks)
- For each paragraph: count occurrences of: `%`, `USD`, `INR`, a currency code, `billion`, `million`, `trillion`, `CAGR`, a 4-digit year, a named count (any number followed by a unit or noun)
- **CRITICAL:** any paragraph with fewer than 2 data figures → FAIL (1 stat is not enough — blog must be data-heavy)
- Log: `[PASS] All paragraphs contain 2+ data figures` or `[FAIL] Paragraph(s) with fewer than 2 data figures: {excerpt of offending paragraph(s)} (count: {n})`

### 4.13 Every H2 heading contains at least one data figure
- Extract all `<h2>` tag text from `htmlContent` (excluding `<h2>Frequently Asked Questions</h2>` and `<h2>Conclusion</h2>`)
- For each H2: check it contains at least one of: `%`, `USD`, `billion`, `million`, `CAGR`, a 4-digit year, a number
- **CRITICAL:** any H2 without a data figure → FAIL
- Log: `[PASS] All H2 headings contain data figures` or `[FAIL] H2 without data figure: "{heading text}"`

### 4.14 No stale year used as current/present state in body
- Scan `htmlContent` for patterns like `"as of 202[0-3]"`, `"currently.*202[0-3]"`, `"in 202[0-3].*market (is|stands|sits|has)"`, `"202[0-3] market size"` — any sentence stating current conditions anchored to 2023 or earlier
- **CRITICAL:** present-state claims must use 2026, not past years
- Log: `[PASS] No stale current-year references` or `[FAIL] Stale year used for present state: "{offending sentence}"`

### 4.15 Intro scroll-stopper (S1 is contrarian insight or B2B pain point)
- Extract the first `<p>` tag content and isolate sentence 1 (S1)
- S1 must NOT be a raw data dump (e.g. "The [Market] is valued at USD X billion") — that is a failed intro
- S1 MUST frame a contrarian insight, B2B pain point, or market shift. Pattern check: does S1 reference a shift, disruption, tension, unexpected source, or operational problem?
- **WARN** if S1 reads as a straight data statement with no narrative tension (not critical but signals weak engagement before the LinkedIn "See more" fold)
- Log: `[PASS] S1 is a contrarian insight or B2B pain point` or `[WARN] S1 appears to be a data dump — rewrite as a market tension or B2B pain point`

### 4.16 Semantic B2B terms present (4-5 topical support keywords)
- Based on the market vertical, identify 4-5 expected semantic B2B terms (e.g. for logistics: supply chain consolidation, 3PL outsourcing, last-mile fulfillment, freight forwarding margins)
- Scan H2 headings and body paragraphs for at least 3 of these terms
- **WARN** if fewer than 3 semantic B2B terms found across the article (signals thin topical authority)
- Log: `[PASS] Semantic B2B terms found: {list}` or `[WARN] Fewer than 3 semantic B2B terms found — article may lack topical depth`

---

## BLOCK 5: Bolding Checks

### 5.1 No bolds inside headings
- Already covered in 2.8 and 2.9 — skip if already passed

### 5.2 CTA blockquotes contain only anchor `<strong>`
- For each `<blockquote>` CTA block: count all `<strong>` occurrences
- Count `<strong>` tags INSIDE `<a>` tags separately
- **CRITICAL:** `<strong>` tags OUTSIDE `<a>` in a CTA blockquote must be zero (only anchor text gets bold wrap)
- Log: `[PASS] CTA blockquotes have no extra bolds` or `[FAIL] CTA blockquote {1 or 2} has non-anchor <strong> tag`

### 5.3 No paragraph exceeds 5 total visible bolds
- For each `<p>` tag: count all `<strong>` occurrences (including those inside `<a>`)
- **WARN** if any paragraph has more than 5
- Log: `[PASS] No paragraph over 5 bolds` or `[WARN] Paragraph(s) exceed 5 bolds: {details}`

### 5.4 Scan test (manual review prompt)
- This check cannot be automated — it requires judgment
- Print a prompt to the agent:

```
SCAN TEST (manual):
Read only the bold text below top-to-bottom (skip link strongs and bullet labels):
{list all <strong> text values from htmlContent that are NOT inside <a> tags and NOT bullet labels}

Answer these 4 questions:
1. Can you tell what the market is and how big it is?
2. Can you tell the main growth driver?
3. Can you tell the biggest risk or shift?
4. Can you tell where the market is headed?

If yes to all 4 → [PASS] Scan test
If no to any → [FAIL] Scan test — bolding does not tell the story
```

### 5.5 All figures/numbers are bold
- Scan the stripped `htmlContent` (outside headings and CTA blocks) for numeric data figures: any token matching a number followed or preceded by `%`, `USD`, `INR`, `billion`, `million`, `CAGR`, `trillion`, or a standalone 4-digit year (20XX)
- Each such figure must be wrapped in `<strong>...</strong>`
- Examples that MUST be bold: `<strong>USD 4.5 billion</strong>`, `<strong>12% CAGR</strong>`, `<strong>2028</strong>`
- **CRITICAL:** any unbolded figure → FAIL
- Log: `[PASS] All data figures are bold` or `[FAIL] Unbolded figures found: {list of unbolded tokens}`

---

## BLOCK 6: Fix Protocol

After running all checks, categorize results:

### If zero CRITICAL failures:
```
SANITY RESULT: PASS
All critical checks passed. {n} warnings noted.
Proceed to Step 9 (write to sheet).
```

### If any CRITICAL failures:
```
SANITY RESULT: FAIL
{list of all CRITICAL FAIL items}

Fix all items above before proceeding.
Do NOT write to sheet until all critical checks pass.
Re-run sanity after fixing.
```

**Fix protocol for common failures:**

| Failure | Fix |
|---------|-----|
| H1 does not start with market name | Rewrite H1 using Style A/B/F from Step 5a — market name in position 1 |
| H1 too short (< 60) | Add a data hook or CAGR after the market name |
| H1 too long (> 90) | Trim: remove sub-clauses, shorten "Ken Research" suffix to just those two words |
| H1 Ken Research not at end | Move Ken Research to the final position in the H1 |
| H1 has no Ken Research | Add ": Ken Research" at the end of H1 |
| Blog Title starts with Ken Research | Rewrite to open with market name, stat, or catchy hook — Ken Research goes at end with pipe: `... | Ken Research` |
| Blog Title has no Ken Research | Add ` | Ken Research` at the end of Blog Title |
| Ken Research at end without pipe | Change `: Ken Research` or `, Ken Research` at end to ` | Ken Research` |
| Blog Title has no striking number | Add a CAGR percentage, USD/local currency size, or forecast figure |
| Blog Title too short (< 70) | Expand with a catchy sub-clause, additional market context, or punchy modifier |
| Blog Title too long (> 90) | Trim the hook — keep the number and ` | Ken Research` suffix, compress the middle |
| Blog Title lacks catchy words | Add a punchy verb or modifier: Surge, Race, Reveals, Rewritten, Boom, Unlock, Fastest, etc. |
| Blog Title is a question | Convert to declarative statement |
| Two titles not distinct | Rewrite Blog Title with a completely different hook — H1 frames, Blog Title sells the click |
| Stale year found in title | Remove or replace with "growing at X% CAGR" without anchoring to a past year |
| Titles not genuinely different angles | H1 → market name + data hook + Ken Research; Blog Title → punchy verb + catchy angle + pipe + Ken Research |
| Em/en dash found | Replace with colon, comma, or rephrase (per replacement playbook) |
| Link count wrong | Add or remove interlinks in body sections or FAQs — target 8-9 total (KR + external combined) |
| Links missing UTM | Append `?utm_source={platform}&utm_medium=Referral&utm_campaign=Automation` to bare KR URLs |
| External links > 2 | Remove excess external links — keep only 1-2 for macro/demographic/regulatory claims where official source adds genuine reader value |
| CTA uses div.cta-block | Replace `<div class="cta-block">...</div>` with `<hr><blockquote><p>...</p></blockquote><hr>` — LinkedIn strips all div/class attributes |
| CTA blockquote count wrong | Add or remove `<hr><blockquote>` CTA blocks to reach exactly 2 |
| Word count too high (> 1300) | Trim bullet points to single sentences, shorten FAQ answers — hard ceiling, no exceptions |
| Word count too low (< 1000) | Expand one body section with an additional data point — do NOT pad if data is thin, 1000 is acceptable floor |
| Intro S1 has anchor link | Remove link from S1 — contrarian hook must be anchor-free |
| Intro S2 missing KR homepage link | Embed KR homepage UTM link inside "As per Ken Research market modelling" phrase in S2 |
| Intro has standalone "visit Ken Research" sentence | Remove that sentence — KR homepage link belongs in S2 attribution, not a separate line |
| FAQ count wrong | Add or remove FAQ Q+A pairs to reach exactly 5 |
| CTA 1 anchor text wrong | Replace anchor text with exactly "Download Sample Report" inside `<strong>` |
| CTA 2 anchor missing `<strong>` | Wrap anchor text in `<strong>...</strong>` inside the `<a>` tag |
| Blog Description too long | Trim, counting character by character (must be max 160) |
| Unbolded figures found | Wrap each unbolded numeric figure in `<strong>...</strong>` — check every `%`, `USD`, `billion`, `million`, `CAGR`, year |
| Ken Research mentions out of range | Add or remove mentions from body paragraphs — target 3-5 (not header, not CTA) |
| Paragraph has fewer than 2 data figures | Add a second stat from Step 2 research — CAGR, market size, player share, count, or named policy |
| H2 has no data figure | Rewrite heading to include a %, USD figure, CAGR, year, or named stat |
| Stale year for present state | Replace "as of 2022" / "currently in 2023" with 2026 framing: "By 2026..." or "In 2026..." |
| S1 is a data dump | Rewrite S1 as contrarian insight or B2B pain point — use pattern: "The [fastest growth / biggest disruption] in [market] is not coming from [expected source], it is coming from [unexpected source]" |

---

## Summary Output

After completing all checks and any fixes, output:

```
=== SANITY REPORT ===
H1:              {h1} ({n} chars — must be 60-90)
Blog Title:      {blogTitle} ({n} chars — must be 70-90)
Blog Desc:       {n} chars (must be 160-180)
Word Count:      {n} words (must be 1000-1300)
Links:           {n} total KR+external (must be 8-9) | UTM on all KR: yes/no
External Links:  {n} (must be 0-2)
KR Mentions:     {n} (must be 3-5)
Em Dashes:       {found/none}
En Dashes:       {found/none}
Stale Years:     {found/none}
FAQs:            {n} (must be 5)
CTA Blockquotes: {n} (must be 2)
CTA Format:      blockquote / div.cta-block (must be blockquote)
Scroll-Stopper:  S1 pass/warn

CRITICAL FAILURES: {n}
WARNINGS:          {n}
RESULT: PASS / FAIL
```
