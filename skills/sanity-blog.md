# Skill: Sanity Blog (Blog Quality Gate)

Validates a generated blog against all rules before it is written to the sheet.
Called from `generate-blog.md` between Step 7 and Step 9.

---

## Inputs

- `h1` — the H1 string (plain text, not wrapped in tags)
- `blogTitle` — Blog Title string (Step 5b output)
- `blogDescription` — SEO description string (plain text, 160-180 chars)
- `blogCaption` — LinkedIn caption string (plain text)
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
3. `blogDescription` — any `—` or `–`?
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
| **H1** | Inside `<h1>` tag in the HTML body | Frames the article — analytical, thesis-driven. Sets up what the blog explores. Ken Research as contextual actor in MIDDLE or END, never at start. | 100-130 chars |
| **Blog Title** | Sheet `Blog Title` column, CMS/LinkedIn header | Hooks the reader — catchy, punchy, number-led. Stops the scroll. Uses striking numbers and catchy words. Ken Research in MIDDLE or END, never at start. | 100-120 chars |

**The core difference:**
- H1 = analytical frame — "here is what the blog is about and why it matters"
- Blog Title = marketing hook — "here is why you must click this right now"

Both must include Ken Research (not at the start), at least one striking number, and zero stale years. They must be genuinely different in wording, angle, and emotional register.

Reusing the same title for both jobs means one job is done badly. The sanity checks below enforce that both are genuinely different.

---

## BLOCK 1: Title Checks

### 1.1 H1 length
- Count every character in `h1` (spaces included)
- **CRITICAL:** must be between 100 and 130 characters (inclusive)
- Log: `[PASS] H1 length: {n} chars` or `[FAIL] H1 length: {n} chars (must be 100-130)`

### 1.2 H1 does not start with "Ken Research"
- Check: does `h1` start with the exact string `Ken Research`?
- **CRITICAL:** if yes → FAIL
- Log: `[PASS] H1 does not start with Ken Research` or `[FAIL] H1 starts with Ken Research — rewrite required`

### 1.3 H1 contains Ken Research in middle or end
- Check: does `h1` contain "Ken Research" anywhere?
- **CRITICAL:** H1 must include "Ken Research" — but not at the start
- Log: `[PASS] Ken Research present in H1 (not at start)` or `[FAIL] H1 has no Ken Research mention`

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
- **CRITICAL:** must be between 100 and 120 characters (inclusive)
- Log: `[PASS] Blog Title length: {n} chars` or `[FAIL] Blog Title length: {n} chars (must be 100-120)`

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
H1 (frames content, analytical):
  India's Vital Wheat Gluten Market Is Growing at 5.5% CAGR: What Ken Research Found About Bakery and Noodle Demand Dynamics
  (122 chars — thesis-driven, sets up the article)

Blog Title (hook, catchy, number-led):
  India's Wheat Gluten Sector Is Surging at 5.5% CAGR on Bakery and Noodle Boom: Ken Research Reveals the Supply Risk
  (116 chars — scroll-stopping, punchy, different angle)
```

**Example of titles that are NOT genuinely different (BAD):**
```
H1:         India Vital Wheat Gluten Market Growth at 5.5% CAGR: Ken Research Analysis
Blog Title: India Vital Wheat Gluten Market Is Growing at 5.5% CAGR: Ken Research
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

### 2.6 Two CTA blocks present
- Count occurrences of `class="cta-block"` or `class='cta-block'` in `htmlContent`
- **CRITICAL:** must be exactly 2
- Log: `[PASS] 2 CTA blocks` or `[FAIL] CTA block count: {n} (must be 2)`

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

### 3.1 Total link count
- Count all `<a href=` occurrences in `htmlContent`
- **CRITICAL:** must be between 10 and 12
- Log: `[PASS] Link count: {n}` or `[FAIL] Link count: {n} (must be 10-12)`

### 3.2 All links have UTM parameters
- For every link URL found in `<a href=...>` tags, check it contains `utm_source=`
- **CRITICAL:** zero links without UTM allowed
- Log: `[PASS] All {n} links have UTM` or `[FAIL] {n} links missing UTM: {list of bare URLs}`

### 3.3 All anchors have LINK STYLE
- For every `<a href=` tag, verify it contains both:
  - `font-weight:700` (or `font-weight: 700`)
  - A `<strong>` tag wrapping the anchor text
- **CRITICAL:** every anchor must have both
- Log: `[PASS] All anchors have LINK STYLE` or `[FAIL] {n} anchors missing font-weight:700 or <strong> wrap`

### 3.4 CTA 1 anchor text is "Download Sample Report"
- Find CTA block 1 — check its anchor text is exactly `Download Sample Report`
- **CRITICAL:** must match exactly
- Log: `[PASS] CTA 1 anchor correct` or `[FAIL] CTA 1 anchor: "{actual}" (must be "Download Sample Report")`

### 3.5 CTA 2 anchor text starts with "View the"
- Find CTA block 2 — check its anchor text starts with `View the`
- **CRITICAL:** must start with "View the"
- Log: `[PASS] CTA 2 anchor correct` or `[FAIL] CTA 2 anchor: "{actual}" (must start with "View the")`

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

---

## BLOCK 4: Content Checks

### 4.1 Word count
- Strip all HTML tags from `htmlContent`, collapse whitespace, split on spaces
- **CRITICAL:** word count must be 1400-1800
- Log: `[PASS] Word count: {n}` or `[FAIL] Word count: {n} (must be 1400-1800)`

### 4.2 Ken Research mention count
- Count occurrences of `Ken Research` (case-sensitive) in stripped text
- **CRITICAL:** must be 5-7
- Log: `[PASS] Ken Research mentions: {n}` or `[FAIL] Ken Research mentions: {n} (must be 5-7)`

### 4.3 Em dash check (HTML body)
- Scan full `htmlContent` for `—` (U+2014)
- **CRITICAL:** zero allowed anywhere
- Log: `[PASS] No em dashes in HTML` or `[FAIL] Em dashes found in HTML — must remove all`

### 4.4 En dash check (HTML body)
- Scan full `htmlContent` for `–` (U+2013)
- **CRITICAL:** zero allowed anywhere
- Log: `[PASS] No en dashes in HTML` or `[FAIL] En dashes found in HTML — must remove all`

### 4.5 Em/en dash check (Blog Description)
- Scan `blogDescription` for `—` and `–`
- **CRITICAL:** zero allowed
- Log: `[PASS] No em/en dashes in Blog Description` or `[FAIL] Em/en dash in Blog Description`

### 4.6 Em/en dash check (Blog Caption)
- Scan `blogCaption` for `—` and `–`
- **CRITICAL:** zero allowed
- Log: `[PASS] No em/en dashes in Blog Caption` or `[FAIL] Em/en dash in Blog Caption`

### 4.7 Blog Description length
- Count characters in `blogDescription`
- **CRITICAL:** must be 160-180 chars
- Log: `[PASS] Blog Description length: {n} chars` or `[FAIL] Blog Description length: {n} chars (must be 160-180)`

### 4.8 Blog Description plain text
- Check `blogDescription` contains no HTML tags (`<` or `>`)
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

---

## BLOCK 5: Bolding Checks

### 5.1 No bolds inside headings
- Already covered in 2.8 and 2.9 — skip if already passed

### 5.2 CTA blocks contain only anchor `<strong>`
- For each `cta-block` div: count all `<strong>` occurrences
- Count `<strong>` tags INSIDE `<a>` tags separately
- **CRITICAL:** `<strong>` tags OUTSIDE `<a>` in a CTA block must be zero
- Log: `[PASS] CTA blocks have no extra bolds` or `[FAIL] CTA block {1 or 2} has non-anchor <strong> tag`

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
| H1 starts with Ken Research | Rewrite H1 using Style A/C/D/E/F from Step 5a |
| H1 too short (< 100) | Expand with context or a sub-clause |
| H1 too long (> 130) | Trim the sub-clause or rephrase more concisely |
| H1 has no Ken Research | Add Ken Research as a contextual actor in middle or end |
| Blog Title starts with Ken Research | Rewrite to open with market name, stat, or catchy hook — Ken Research goes in middle or at end with pipe: `... | Ken Research` |
| Blog Title has no Ken Research | Add Ken Research in middle (sentence flow) or at end with pipe: `... | Ken Research` |
| Ken Research at end without pipe | Change `: Ken Research` or `, Ken Research` at end to ` | Ken Research` |
| Blog Title has no striking number | Add a CAGR percentage, USD/local currency size, or forecast figure |
| Blog Title too short (< 100) | Expand with a catchy sub-clause, additional market context, or punchy modifier |
| Blog Title too long (> 120) | Trim a sub-clause or rephrase more concisely |
| Blog Title lacks catchy words | Add a punchy verb or modifier: Surge, Race, Reveals, Rewritten, Boom, Unlock, Fastest, etc. |
| Blog Title is a question | Convert to declarative statement |
| Two titles not distinct | Rewrite Blog Title with a completely different hook — H1 frames, Blog Title sells the click |
| Stale year found in title | Remove or replace with "growing at X% CAGR" without anchoring to a past year |
| Titles not genuinely different angles | H1 → analytical frame driving blog content; Blog Title → punchy hook with catchy words and numbers |
| Em/en dash found | Replace with colon, comma, or rephrase (per replacement playbook) |
| Link count wrong | Add or remove interlinks in body sections or FAQs |
| Links missing UTM | Append `?utm_source={platform}&utm_medium=Referral&utm_campaign=Automation` to bare URLs |
| Word count too high (> 1100) | Trim bullet points to single sentences, shorten FAQ answers |
| Word count too low (< 900) | Expand one body section with an additional data point |
| Intro has anchor in sentence 1 or 2 | Move both intro anchors into sentence 3 or rewrite intro |
| FAQ count wrong | Add or remove FAQ Q+A pairs to reach exactly 5 |
| CTA anchor text wrong | Replace anchor text with exact locked values |
| CTA block has extra bolds | Remove non-anchor `<strong>` from CTA wrapper text |
| Blog Description too long/short | Trim or expand, counting character by character |
| Unbolded figures found | Wrap each unbolded numeric figure in `<strong>...</strong>` — check every `%`, `USD`, `billion`, `million`, `CAGR`, year |
| Ken Research mentions out of range | Add or remove mentions from body paragraphs |
| Paragraph has fewer than 2 data figures | Add a second stat from Step 2 research — CAGR, market size, player share, count, or named policy. Every paragraph needs minimum 2. |
| H2 has no data figure | Rewrite heading to include a %, USD figure, CAGR, year, or named stat |
| Stale year for present state | Replace "as of 2022" / "currently in 2023" with 2026 framing: "By 2026..." or "In 2026..." |

---

## Summary Output

After completing all checks and any fixes, output:

```
=== SANITY REPORT ===
H1:         {h1} ({n} chars)
Blog Title: {blogTitle} ({n} chars)
Blog Desc:  {n} chars
Word Count: {n} words
Links:      {n} (all UTM: yes/no)
KR Mentions:{n}
Em Dashes:  {found/none}
En Dashes:  {found/none}
Stale Years:{found/none}
FAQs:       {n}
CTA Blocks: {n}

CRITICAL FAILURES: {n}
WARNINGS:          {n}
RESULT: PASS / FAIL
```
