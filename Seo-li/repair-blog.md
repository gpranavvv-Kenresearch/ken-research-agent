# Skill: Repair Article (Seo-li v1.2 Post-QA Fix)

Repairs a v1.2 LinkedIn Article that scored below 88 on `Seo-li/qa-blog.md`. Called from `Seo-li/generate-blog.md` Step 9 (repair loop).

**Max 2 repair attempts per article.** If still below 88 after 2 repairs, write to sheet anyway and paint the Rating cell red for manual review.

---

## Inputs

- `htmlContent` — the HTML that failed QA
- `articleTitle`, `h1`
- `factBank` — the structured fact bank from Step 2 (repair uses ONLY these facts, never invents new data)
- `qaResult` — the full JSON returned by `Seo-li/qa-blog.md` (contains `critical_issues`, `must_fix_before_publish`, `repair_instruction`, `penalties_applied`)
- `failedChecks` — sanity issues list from `Seo-li/sanity-blog.md`
- `seoDescription`, `caption`

---

## Priority Order for Fixes

Fix issues in this exact priority. Higher-priority issues block lower-priority ones from being resolved.

### Priority 1 — REJECT-level issues (CRITICAL, blocks everything else)

#### 1.1 More than 1 Ken Research link
- Count `<a href` URLs containing `kenresearch.com`
- Keep ONLY the link in the final "Data Source and Full Analysis" section
- DELETE all other KR links (inline mentions in body, intro KR homepage link, sample report link, related report links, branding paragraph link)
- The deleted text stays — only the `<a>` wrapper is removed (text becomes plain)

#### 1.2 Em/En dash anywhere
- Scan h1, articleTitle, htmlContent, seoDescription, caption for `—` (U+2014) and `–` (U+2013)
- Replace per the playbook:
  - Parenthetical → comma or parentheses
  - Strong break → colon or period (new sentence)
  - Range "2014—2020" → "2014 to 2020"
  - Emphasis → comma, or "as" / "while" / "because"
- Re-scan every field after fixes

#### 1.3 Missing Strategic Outlook OR generic restatement
- The `<h2>Ken Research Strategic Outlook</h2>` section MUST exist with 2-3 sentences of ORIGINAL interpretation
- If missing: write a new section using factBank — consolidation thesis, margin pressure, regulatory transfer, regional pivot, or supply concentration
- If generic (restates Velocity Data): rewrite to a forward-looking strategic claim that is NOT already stated earlier in the article
- Original interpretation = a claim an LLM could summarize as Ken Research's distinct view

#### 1.4 Insufficient entity mapping
- Confirm body contains:
  - >= 3 named companies (from factBank.competitor_entities)
  - >= 1 named regulator (from factBank.regulatory_entities)
  - >= 1 named policy/framework (from factBank.regulatory_frameworks)
- If missing: pull from factBank and weave naturally into "Which Entities Are Shaping the Market?" section
- Do NOT invent companies, regulators, or policies. Only use factBank values.

#### 1.5 Banned promotional claims
- Scan for "best", "top", "leading", "ranked #1", "the largest" without quantified evidence
- Either add a specific number/share to support the claim, OR remove the claim entirely
- Each occurrence must be followed by data, not just by adjectives

#### 1.6 "Link in comments" / banned CTA phrases in caption
- Replace with an approved soft CTA from `Seo-li/generate-caption.md`
- Examples: "I've broken this down in the full LinkedIn Article" / "I've mapped the key growth signals inside the article"

---

### Priority 2 — Structural fixes

#### 2.1 H1 length outside 60-90 chars
- If too short: add the forecast year span or a sharper hook
- If too long: trim filler ("Comprehensive", "Detailed", "Analysis of") or use the alternative format `{Market} Outlook {Year-Year}: {Hook}`
- Re-check: starts with market name, has year, no em dash

#### 2.2 Executive Summary missing or wrong length
- Must be 35-45 words
- Must directly answer: what is changing in this market and why now?
- Open with the shift, name the driver, no fluff

#### 2.3 Key Market Velocity Data missing/incomplete
- Must have 5 bullets: Current Market Value, Projected Market Value, CAGR, Dominant Regional Hub, Primary Growth Catalyst
- Each value must be in `<strong>` tags
- Pull values from factBank

#### 2.4 Question-style H2s missing
- At least 3 H2 headings must be in question form OR outcome-action form
- Rewrite generic H2s to: "What Is Driving the Market?", "Which Entities Are Shaping the Market?", "What Does This Mean for B2B Decision-Makers?"

#### 2.5 Fan-out angles below 5
- Add the missing angles into the relevant sections. Use factBank — do not invent data.
- The 8 angles map to specific sections (see `Seo-li/generate-blog.md` query fan-out table)

---

### Priority 3 — Data and bolding

#### 3.1 Unbolded numbers
- Scan body for unbolded numbers (%, USD, INR, billion, million, CAGR, 4-digit years tied to values)
- Wrap each in `<strong>` tags

#### 3.2 Stat density below floor
- Per body paragraph: must have >= 2 data figures
- Add a second stat from factBank to any paragraph that has only 1
- If no fact is available, restructure the paragraph or merge with a neighbour

#### 3.3 Two consecutive stat-free sentences
- Within each paragraph, no two consecutive sentences may both be stat-free
- Embed a figure into the second sentence, or rewrite to combine

#### 3.4 Internal inconsistency
- Cross-check: market size in Executive Summary == market size in Key Market Velocity Data
- Cross-check: CAGR mentioned in body == CAGR in Velocity Data
- Pick one set of values from factBank as canonical and align everything to it

---

### Priority 4 — Length and char limit

#### 4.1 Word count outside 800-1100
- If under 800: expand "What Does This Mean for B2B Decision-Makers?" with one more stakeholder action bullet
- If over 1100: trim by removing verbose connective phrases first, then merge short sentences. Never cut a section heading.

#### 4.2 HTML char count >= 14000
- Trim by paragraph in this order:
  1. Verbose connective phrases ("It is important to note that...", "What this means is that...")
  2. Redundant context sentences
  3. Bullet items beyond the minimum required (Velocity Data must keep all 5 bullets)
  4. Strategic Outlook should NEVER be trimmed
- Re-check until char count < 14000

---

### Priority 5 — AI fluff and tone

#### 5.1 Banned AI fluff phrases
- "in today's fast-paced world", "delve deep", "revolutionizing", "dynamic landscape", "testament to", "game changer", "cutting-edge", "unlock potential", "robust ecosystem"
- Rewrite each occurrence with a direct, specific sentence using factBank data
- Do not just remove — replace with a sentence that adds value

#### 5.2 Brand stuffing
- Ken Research mentioned > 3 times in body
- Keep at most 3 mentions: typically (1) credibility/source attribution, (2) Strategic Outlook section, (3) Data Source link
- Remove other inline mentions

---

### Priority 6 — Caption fixes

#### 6.1 Caption > 150 words
- Trim opener, tighten paragraphs, remove redundant questions

#### 6.2 Caption missing question
- Add exactly 1 specific question that invites expert opinion ("Where do you see the biggest unlock?", "Which segment will consolidate first?")

#### 6.3 Caption hashtags < 5
- Add hashtags from factBank — market name, vertical, region, key entity, "MarketResearch", "KenResearch"

#### 6.4 Caption banned CTAs
- Replace any "link in comments" variant with an approved soft CTA

---

### Priority 7 — SEO description

#### 7.1 SEO description > 160 chars
- Trim filler words first, then shorten the lead-in
- Must still open with a hook stat or named entity

#### 7.2 SEO description has HTML tags
- Strip all tags. Plain text only.

---

## Process

1. Read the QA result JSON.
2. Group failures by priority.
3. Fix Priority 1 first. After all P1 fixes, re-scan for em dashes and re-count KR links.
4. Fix Priority 2-7 in order.
5. Re-run `Seo-li/sanity-blog.md` on the repaired HTML.
6. Re-run `Seo-li/qa-blog.md` to get a new score.
7. Return the repaired HTML, repaired articleTitle, repaired seoDescription, repaired caption, and a `changes_made` list.

---

## Output

```json
{
  "repaired_html": "...",
  "repaired_article_title": "...",
  "repaired_seo_description": "...",
  "repaired_caption": "...",
  "changes_made": [
    "Removed 4 extra Ken Research links, kept only the final source link",
    "Replaced 2 em dashes with periods in body paragraphs 2 and 5",
    "Rewrote Strategic Outlook from generic restatement to a consolidation thesis",
    "Added 'Ministry of X' regulator reference to Which Entities section",
    "Wrapped 6 unbolded stats in <strong> tags",
    "Trimmed body from 1234 to 1067 words to fit 800-1100 target",
    "Replaced 'link in comments' in caption with approved soft CTA"
  ]
}
```

---

## Rules

- Never invent facts. Only use values present in `factBank` from Step 2 research.
- Never add a second Ken Research link. The link discipline is ONE.
- Never change the v1.2 article structure (Exec Summary + Velocity bullets + 4 question H2s + Strategic Outlook + 1 Ken link). If the structure is missing, build it.
- Never delete the Strategic Outlook section to save words. It is mandatory.
- Preserve the cover image `<img>` tag at the top of the HTML.
- After repair, the article must pass sanity + score >= 88 on QA. If not, the repair has failed; return what you have and let the controller decide (max 2 repair attempts).
