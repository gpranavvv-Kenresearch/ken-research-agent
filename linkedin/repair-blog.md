# Skill: Repair Blog (LinkedIn Pulse — Post-QA Fix)

Repairs a LinkedIn Pulse article that scored below 88 on `qa-blog.md`.
Called from `generate-blog.md` Step 7d (repair loop).

**LinkedIn-specific rules apply.** These differ from the global article-repair agent.

---

## Inputs

- `htmlContent` — the original HTML that failed QA
- `factBank` — the structured JSON fact bank from Step 2 (article-researcher output)
- `qaResult` — the JSON output from `qa-blog.md`
- `h1` — the current H1 string
- `blogTitle` — the current Blog Title string

---

## Core Rule

**Never invent new facts.** All data in the repaired article must come from `factBank`.
If a fix requires a stat that is not in the fact bank, use the next-best stat already present — do not fabricate.

---

## Fix Priority Order

Apply fixes in this order — each fix may resolve multiple QA penalties:

### Priority 1 — Em/En Dash (CRITICAL, blocks everything)
- If `—` or `–` appears ANYWHERE: fix all occurrences first before any other change
- Replace: `—` → `:` or `,` or `.` (choose what reads naturally)
- Replace: `–` → `to` (for ranges) or `,` or `:` (for connectors)
- Re-check every field: H1, Blog Title, Blog Description, Blog Caption, all body text

### Priority 2 — H1 and Blog Title format
- **H1 not starting with market name:** rewrite using Style A or B from `generate-blog.md` Step 5a
  - Target: 60-90 chars, market name first, punchy hook in middle, Ken Research at END
  - Example: `{Market Name} Hits USD {X}B on {Driver Surge}: Ken Research`
- **H1 has no hook (flat "at USD X" with no action verb or urgency phrase):** rewrite the middle section with one of these hook patterns:
  - Action verb: "Hits", "Surges to", "Crosses", "Doubles on", "Jumps"
  - Named driver: "on MEMS Surge", "Fueled by ADAS Mandates", "on EV Boom", "Powered by Policy Push"
  - Tipping point: "Crosses USD XB Threshold", "at Inflection Point", "Accelerates Past USD XB"
  - Keep market name and Ken Research unchanged — only rewrite the hook phrase between them
- **H1 outside 60-90 chars:** trim or expand to fit — do not remove hook, data figure, or Ken Research
- **Blog Title outside 70-90 chars:** trim the hook clause; keep striking number + ` | Ken Research` suffix
- **Blog Title Ken Research not at end with pipe:** change to ` | Ken Research` at end
- Update the `<h1>` tag in `htmlContent` to match the fixed H1

### Priority 3 — CTA format (LinkedIn rendering blocker)
- **`<div class="cta-block">` found:** replace with `<hr><blockquote>` format:
```html
<hr>
<blockquote>
  <p>{topic-specific hook sentence}? <a href='{sample_report_UTM_url}' style='color:#0645AD; font-weight:700; text-decoration:underline;' target='_blank' rel='noopener'><strong>Download Sample Report</strong></a> {topic-specific closing clause}.</p>
</blockquote>
<hr>
```
- Apply same blockquote format to CTA 2
- CTA 1 anchor text must be exactly `Download Sample Report` inside `<strong>`
- CTA 2 anchor text is topic-specific — must be inside `<strong>` — no fixed phrase required
- Wrapper text must be topic-specific to this market (not generic "Want to learn more?")

### Priority 4 — Unbolded stats (zero tolerance)
- Scan every number, %, USD, INR, billion, million, CAGR, trillion, 4-digit year in HTML body
- Wrap each in `<strong>...</strong>` if not already wrapped
- Do NOT bold inside `<h1>`, `<h2>`, `<h3>` tags — headings must never have bold inside
- Do NOT add extra bold to CTA wrapper text (only anchor text inside `<a>` gets `<strong>`)

### Priority 5 — Link count (8-9 total KR + external combined)
- Count all `<a href=` tags
- If count < 8: add KR related report links in body sections or FAQs (from fact bank — use actual related report URLs with UTM)
- If count > 9: remove the least relevant KR interlinks first; never remove CTA links or intro links
- Ensure all KR links have `utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation`
- External links (if present): max 2; must have `target="_blank" rel="noopener noreferrer"`; must NOT be in CTA or FAQ

### Priority 6 — Data density (2-3 stats per paragraph)
- For each `<p>` with fewer than 2 data figures: add a stat from `factBank`
- For each `<p>` with more than 3 data figures: trim to the 3 most relevant
- Never add a stat not in `factBank`

### Priority 7 — Ken Research mentions (3-5 in body)
- Count `Ken Research` occurrences in stripped body text (excluding headings and CTA blocks)
- If < 3: add natural mentions in body paragraphs (e.g. "According to Ken Research..." or "Ken Research analysis reveals...")
- If > 5: remove the least natural mentions, keeping at least 1 in intro and 1 near CTA

### Priority 8 — Intro scroll-stopper (S1)
- If S1 is a raw data dump (starts with "The [market] is valued at..."):
  - Rewrite S1 as a contrarian insight or B2B pain point
  - Pattern: "The [fastest growth / biggest disruption] in [market] is not coming from [expected source], it is coming from [unexpected source]."
  - Use fact from `factBank` to ground the claim — do not invent
- S1 must have zero `<a href=` tags (contrarian hook only)
- S2 must have exactly 1 link: KR homepage embedded inside "As per Ken Research market modelling" — not a separate sentence
- S3 must have exactly 1 link: target report
- Remove any standalone "visit Ken Research" sentence from the intro

### Priority 9 — FAQ stats (minimum 2 per answer)
- For each FAQ answer with fewer than 2 stats: add a stat from `factBank`
- If no stat available in `factBank` for that FAQ: expand with a related market-level fact already in the article

### Priority 10 — Semantic B2B terms
- If fewer than 3 semantic B2B terms are found across H2s and body:
  - Identify 2-3 relevant terms from the market vertical (logistics: 3PL outsourcing, last-mile fulfillment; fintech: payment stack, regulatory compliance, etc.)
  - Weave into existing body sentences naturally — replace generic phrases
  - Never force a term if it sounds unnatural; replace with another from the same vertical

---

## Repair Output

After all fixes, return:

```json
{
  "repaired_html": "{full corrected HTML string}",
  "repaired_h1": "{corrected H1 string}",
  "repaired_blog_title": "{corrected Blog Title string}",
  "changes_made": [
    "Fix 1: {description of what changed and why}",
    "Fix 2: ...",
    ...
  ],
  "remaining_issues": [
    "{any issue that could not be fixed without new facts not in factBank}"
  ]
}
```

---

## After Repair — Re-run QA

After repair, the generate-blog pipeline will re-run `qa-blog.md` on the repaired HTML.
If score ≥ 88 → proceed to Step 8 and Step 9.
If score still < 88 → surface `remaining_issues` to the operator and flag the row red.

Maximum repair loops: 2. After 2 failed loops, write what exists to the sheet with `--flag-red` and move on.

---

## How to Use This Skill

This file is read directly with the Read tool — it is NOT the global `article-repair` agent.

```
Read skills/linkedin/repair-blog.md
```

Apply all fixes above in priority order. Return the JSON object.
