# Skill: Sanity Article (Seo-li v1.2 Quality Gate)

Validates a generated v1.2 LinkedIn Article against all 17 Search Everywhere Optimization flags + structural rules before sheet write.

Called from `Seo-li/generate-blog.md` Step 8.

---

## Inputs

- `h1` — the H1 string (plain text, not wrapped in tags)
- `articleTitle` — LinkedIn article title (same as H1 typically)
- `seoDescription` — Blog Description string (plain text, max 160 chars)
- `caption` — LinkedIn feed caption string (plain text)
- `htmlContent` — full raw HTML of the article body
- `factBank` — structured JSON from Step 2 (used for entity counting and duplicate-similarity check)

---

## How to Run

Work through every block below in order. For each check write:

```
[PASS] Check name
[FAIL] Check name — reason       (CRITICAL, blocks save)
[WARN] Check name — reason       (logged only, does not block)
```

CRITICAL failures block writing to sheet and MUST be fixed.

---

## PRE-CHECK: EM DASH / EN DASH SCAN (RUN FIRST)

Before anything else, scan EVERY input for `—` (U+2014) and `–` (U+2013):

1. `h1` — any `—` or `–`?
2. `articleTitle` — any `—` or `–`?
3. `seoDescription` — any `—` or `–`?
4. `caption` — any `—` or `–`?
5. `htmlContent` — any `—` or `–` anywhere?

**ANY occurrence anywhere → CRITICAL FAIL, regenerate the offending sentence, then re-scan.** Zero tolerance.

---

## BLOCK 1 — Title Checks

### 1.1 H1 length (60-90 chars)
- `len(h1)` must be in [60, 90]
- Log: `[PASS] H1 length: {n} chars` or `[FAIL] H1 length: {n} chars (must be 60-90)`

### 1.2 H1 starts with market name
- The first 6-10 words of H1 must contain the market name (not "Ken Research", not a question word)
- `[FAIL]` if it starts with "How", "What", "Why", "Ken Research", or any other non-market opener

### 1.3 H1 contains forecast year or current year
- Must contain a year (current year or forecast year, e.g. `2024`, `2030`, or a span like `2024-2030`)
- No stale years (older than current year unless as a span endpoint)

### 1.4 articleTitle same as H1
- Article title in the LinkedIn editor matches the H1 exactly

### 1.5 No em/en dash in titles
- Already checked in pre-check. Reaffirm zero in `h1` and `articleTitle`.

---

## BLOCK 2 — SEO Validation (v1.2 Section 3D)

### 2.1 seo_market_entity_in_title
- The article title contains the market name and (where applicable) the region
- `[FAIL]` if the market entity is missing or vague

### 2.2 seo_single_ken_report_link
- Count `<a href` URLs containing `kenresearch.com` in `htmlContent`
- Must be **exactly 1**
- `[FAIL]` if 0 or >1

### 2.3 seo_no_keyword_stuffing
- Count exact-match occurrences of the primary market keyword in body text
- Must be **<= 3** (excluding the title and the link anchor)
- `[FAIL]` if > 3

### 2.4 UTM format on the Ken link
- The single KR link must contain `utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=AN`
- `[FAIL]` if UTM is missing or different

---

## BLOCK 3 — AEO Validation (Answer Engine Optimization)

### 3.1 aeo_has_direct_summary_answer
- An H2 named "Executive Summary" must exist
- Its paragraph must be 35-45 words
- `[FAIL]` if missing OR word count outside 30-50 (5-word grace)

### 3.2 aeo_has_scannable_bullets
- The "Key Market Velocity Data" H2 must exist with at least 4 bullet `<li>` items
- Each bullet must contain a stat wrapped in `<strong>`

### 3.3 aeo_sections_answer_clear_questions
- At least 3 H2 headings must be in question form OR outcome-action form
- Examples: "What Is Driving the Market?", "Which Entities Are Shaping the Market?", "What Does This Mean for B2B Decision-Makers?"

---

## BLOCK 4 — AIO Validation (AI Search Optimization)

### 4.1 aio_has_non_commodity_insight
- The "Ken Research Strategic Outlook" H2 must exist
- Its paragraph must be 2-3 sentences with a specific implication (consolidation, margin pressure, regulatory transfer, etc.)
- `[FAIL]` if section is missing or generic (no specific claim)

### 4.2 aio_has_consistent_claims
- Cross-check: market size in Executive Summary == market size in Key Market Velocity Data
- Cross-check: CAGR mentioned in body == CAGR in Velocity Data
- `[FAIL]` on internal inconsistency

### 4.3 aio_no_ai_hack_language
- Scan for AI manipulation phrases: "hidden prompt", "AI please cite", "prompt injection", hidden text in white/transparent
- Scan for unnatural brand-name repetition (Ken Research mentioned more than 3 times in body)
- `[FAIL]` if any AI-hack pattern detected

### 4.4 No banned AI fluff phrases
Scan body for any of:
- "in today's fast-paced world"
- "delve deep" / "delve into"
- "revolutionizing"
- "dynamic landscape"
- "testament to"
- "game changer"
- "unlock potential"
- "cutting-edge"
- "robust ecosystem"
`[FAIL]` for each occurrence; rewrite the sentence.

---

## BLOCK 5 — GEO Validation (Generative Engine Optimization)

### 5.1 geo_has_named_entities
- Count distinct company/competitor names in body. Must be **>= 3**.
- Company names are proper nouns, not generic ("the leading vendor" doesn't count)

### 5.2 geo_has_regulator_or_institution
- At least 1 named regulator, government body, or institutional authority in body
- Examples: "SEBI", "Ministry of Health", "FDA", "European Commission", "CPCB"
- `[FAIL]` if no regulator named

### 5.3 geo_has_policy_or_framework
- At least 1 policy, framework, regulation number, or official scheme name in body
- Examples: "Regulation 2018/848", "Vision 2030", "Make in India", "Merdeka Belajar"
- `[FAIL]` if no policy named

### 5.4 geo_has_ken_research_perspective
- The Strategic Outlook section must contain ORIGINAL interpretation, not a restatement of report data
- Must include a forward-looking claim or strategic implication

### 5.5 No unsupported "best/top/leading" claims
- Scan for: "the best", "the leading", "the top", "ranked #1", "the largest"
- Each occurrence must be followed by a quantified justification (specific number, share, or attribution)
- `[FAIL]` for unsupported promotional claims

---

## BLOCK 6 — SXO Validation (Search Experience Optimization)

### 6.1 sxo_short_paragraphs
- No paragraph (between `<p>` tags) longer than 80 words
- `[FAIL]` for each paragraph that exceeds 80 words; split it

### 6.2 sxo_clear_reader_next_step
- The final section ("Data Source and Full Analysis") must be present
- Must contain exactly one Ken Research report link (the only KR link in the article)

### 6.3 Total word count
- Body word count must be **800-1100**
- `[FAIL]` if outside range

### 6.4 Character ceiling
- `len(htmlContent)` must be **< 14000**
- Sheet column silently truncates above this
- `[FAIL]` if >= 14000

---

## BLOCK 7 — Search Everywhere + Fan-Out

### 7.1 search_everywhere_platform_fit_confirmed
- This article is a LinkedIn Article (manual confirmation)
- Auto-pass if metadata says `platform: linkedin_article`

### 7.2 fanout_covers_at_least_5_angles
Count how many of the 8 fan-out angles are covered:

1. **market_definition** — Executive Summary present and clear
2. **market_size** — Velocity Data has current value and projected value
3. **growth_drivers** — "What Is Driving the Market?" H2 with at least 1 named driver
4. **regional_dynamics** — region named in Velocity Data or body
5. **competitive_landscape** — >= 3 companies named
6. **regulatory_context** — >= 1 regulator + >= 1 policy named
7. **buyer_implication** — "What Does This Mean..." H2 with named stakeholder actions
8. **future_outlook** — Strategic Outlook H2 with forward-looking claim

`[FAIL]` if fewer than 5 angles covered.

### 7.3 duplicate_similarity_below_threshold (ENFORCED)
- Compare the new article body against every prior `.md` file in `outputs/linkedin_articles/**/*.md` (exclude `_caption.md`)
- Use token-set Jaccard similarity (lightweight, no embedding model required):
  ```python
  import glob, re, os
  from pathlib import Path
  def tokens(text):
      text = re.sub(r'<[^>]+>', ' ', text)  # strip HTML
      text = re.sub(r'---[\s\S]*?---', ' ', text)  # strip YAML frontmatter
      return set(re.findall(r'[a-z]{4,}', text.lower()))
  new_t = tokens(open('C:/tmp/li_blog_updates_{row}.html', encoding='utf-8').read())
  max_sim, max_path = 0.0, None
  for p in glob.glob('outputs/linkedin_articles/**/*.md', recursive=True):
      if p.endswith('_caption.md'): continue
      old_t = tokens(open(p, encoding='utf-8').read())
      if not old_t: continue
      sim = len(new_t & old_t) / max(len(new_t | old_t), 1)
      if sim > max_sim: max_sim, max_path = sim, p
  print(f'max_similarity={max_sim:.3f} vs {max_path}')
  ```
- Jaccard similarity vs nearest neighbour must be **< 0.55** (token-set Jaccard is stricter than cosine; 0.55 ≈ cosine 0.85)
- `[FAIL]` (CRITICAL) if `>= 0.55` — repair must inject new angle/entities/region pivot
- Record the score to be written to the `Duplicate Similarity Score` sheet column

---

## BLOCK 8 — Data Density + Bolding

### 8.1 All numbers bolded
- Scan body for any bare number pattern (`%`, `USD`, `INR`, `billion`, `million`, `CAGR`, 4-digit year) NOT wrapped in `<strong>`
- `[FAIL]` for each unbolded number; wrap it.

### 8.2 Per-paragraph stat density
- Every body paragraph must contain **>= 2** data figures
- `[FAIL]` for each paragraph with < 2 figures

### 8.3 No two consecutive stat-free sentences
- Within each paragraph, no two consecutive sentences may both be stat-free
- `[FAIL]` if found

---

## BLOCK 9 — Caption Validation

### 9.1 Caption word count
- `len(caption.split())` must be **<= 150**
- `[FAIL]` if > 150

### 9.2 Caption em/en dash
- Already checked in pre-check. Reaffirm zero.

### 9.3 Caption banned phrases
Scan caption for any of:
- "link in comments"
- "full analysis linked in comments"
- "check comments for the full report"
- "download the full analysis now"
`[FAIL]` for each. v1.2 explicitly bans these CTAs.

### 9.4 Caption has one specific question
- Caption must contain exactly one `?`
- `[WARN]` if 0 or >1

### 9.5 Caption has hashtags
- Caption must contain **>= 5** hashtags (`#` prefix)
- `[WARN]` if fewer

### 9.6 Caption LINE 1 contains a hard data figure (CRITICAL)
- Extract line 1 = text up to first `\n`
- Must contain at least one of: `USD`, `INR`, `EUR`, `%`, a 4-digit year (2024-2035), `Nx` multiplier, `billion`, `million`, `trillion`, or a bare numeric ≥ 2 digits
- `[FAIL]` if line 1 has no hard figure — the LinkedIn preview window (first ~200 chars) loses the hook

### 9.7 Caption LINE 1 + LINE 2 inside 200-char preview window (CRITICAL)
- Extract lines 1 and 2 (joined). Total length must be <= 210 characters
- `[FAIL]` if > 210 — the hook gets cut off by LinkedIn's "...see more" truncation

### 9.8 Caption LINE 2 contains a second stat OR an urgency/deadline marker (CRITICAL)
- Line 2 must contain either: a second hard figure (per 9.6 patterns) OR an urgency marker (`by 2026`, `by 2030`, `lands in`, `closes in`, `before`, `now`, `ticking`, `from 202[4-9]`, etc.)
- `[FAIL]` if line 2 carries neither

### 9.9 No conceptual / brand-led openers (CRITICAL)
- Line 1 must NOT start with any of these patterns (case-insensitive):
  - `Did you know`, `Have you ever`, `Let me`, `Imagine`
  - `[X]'s next big`, `The real story`, `Everyone is watching`, `Most people think`
  - `At Ken Research`, `Our latest`, `We are excited`, `In our new`
  - `In today's`
- `[FAIL]` if matched — these openers bury the stat

---

## BLOCK 10 — SEO Description

### 10.1 SEO description length
- `len(seoDescription)` must be **<= 160** chars
- `[FAIL]` if > 160

### 10.2 SEO description plain text
- Must contain no HTML tags (`<` or `>`)
- `[FAIL]` if any tag present

### 10.3 SEO description em/en dash
- Already in pre-check.

### 10.4 SEO description opens with hook stat
- First sentence must contain at least one number or named entity
- `[WARN]` if not

---

## DECISION LOG

After all blocks, summarize:

```
[SANITY] CRITICAL failures: {n} | WARNs: {n} | Status: {PASS/FAIL}
```

If status = PASS → proceed to QA (Step 9).
If status = FAIL → fix every CRITICAL, then re-run sanity from PRE-CHECK.

Repeat until status = PASS (max 2 sanity-fix loops, then QA repair handles the rest).

---

## QUICK PYTHON SANITY HELPER

For mechanical checks, run this snippet on the saved HTML file:

```python
import re
html = open('C:/tmp/li_blog_updates_{row}.html', encoding='utf-8').read()
text = re.sub(r'<[^>]+>', '', html); text = re.sub(r'\s+', ' ', text).strip()
em = html.count(chr(8212)); en = html.count(chr(8211))
words = len(text.split())
links = re.findall(r"href='([^']+)'", html)
kr_links = [u for u in links if 'kenresearch.com' in u]
non_utm_kr = [u for u in kr_links if 'utm_campaign=AN' not in u]
chars = len(html)
h2_count = html.count('<h2>')
print(f'em/en: {em+en} | words: {words} | chars: {chars} | KR links: {len(kr_links)} (must=1) | UTM violations: {len(non_utm_kr)} | H2 count: {h2_count}')
```

Expected output for a clean article:
- em/en: 0
- words: 800-1100
- chars: <14000
- KR links: 1
- UTM violations: 0
- H2 count: 7 (Executive Summary, Key Market Velocity Data, What Is Driving, Which Entities, What Does This Mean, Strategic Outlook, Data Source)
