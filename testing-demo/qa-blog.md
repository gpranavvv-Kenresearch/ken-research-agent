# Skill: QA Blog (LinkedIn Pulse — Quality Scoring)

Scores a LinkedIn Pulse article out of 100. Returns JSON only.
Called from `generate-blog.md` Step 7c (rating check) and optionally as a standalone quality gate before publishing.

**LinkedIn-specific rules apply here.** These differ from the global article-qa agent.

---

## Inputs

- `htmlContent` — full raw HTML of the blog body
- `h1` — H1 string (plain text)
- `blogTitle` — Blog Title string
- `targetUrl` — the Ken Research report URL this blog is based on

---

## Scoring Rubric

| Area | Max Marks |
|------|-----------|
| Freshness and current-year relevance | 15 |
| Data density and factual support | 20 |
| Original insight and expert analysis | 15 |
| Search intent alignment | 10 |
| Link relevance and interlink quality | 10 |
| Readability and natural flow | 10 |
| CTA quality and lead-generation value | 10 |
| FAQ quality | 5 |
| Source transparency / Ken Research branding | 5 |

**Total: 100**

---

## Hard Penalties (apply strictly)

- **H1 does not start with market name** → freshness score -5, search intent score -3
- **H1 outside 60-90 chars** → freshness score -5
- **H1 starts with "Ken Research"** → freshness score -5
- **H1 has no hook (flat "at USD X" or "valued at USD X" with no action verb, disruption signal, or urgency phrase)** → original insight score -5, readability score -3 (hook is mandatory — a data label is not a hook)
- **Blog Title outside 70-90 chars** → readability score -3
- **Fewer than 5 strong data points in body** → data score below 12
- **Any unbolded number/stat/percentage found** → data score -3 per instance
- **Em dash (—) or en dash (–) found anywhere** → readability score -5 per instance
- **Exact primary keyword repeated more than 3 times** → readability score -3
- **Fewer than 8 interlinks (KR + external combined)** → link score -4
- **More than 9 interlinks (KR + external combined)** → link score -2
- **KR links missing UTM parameters** → link score -3 per link
- **External authority links > 2** → link score -3 per excess link
- **External authority link inside CTA or FAQ** → link score -2
- **Stale forecast years in H1 or Blog Title** → freshness score -5
- **Generic SEO filler sentences with no data** → original insight score -2 per instance
- **FAQ answers with fewer than 2 stats** → FAQ score -1 per answer
- **Missing CTA** → CTA score = 0
- **CTA uses `<div class="cta-block">` format** → CTA score -5 (LinkedIn strips div/class — article renders broken)
- **CTA anchor not in `<strong>` tags** → CTA score -3
- **S1 intro is a raw data dump (not contrarian insight or B2B pain point)** → original insight score -3
- **Ken Research mentions outside 3-5 range** → readability score -2
- **Fewer than 3 semantic B2B terms in H2s/body** → search intent score -3
- **Research Basis section present** → source transparency score = 0 (article must end with Ken Research branding paragraph, never a Research Basis section)

---

## What to Check

1. **H1** — starts with exact market name, contains data figure, 60-90 chars, no em dash, Ken Research at END
2. **Blog Title** — 70-90 chars total, ends with ` | Ken Research`, no em dashes, has striking number
3. **Interlinks** — count ALL `<a href` tags (KR + external combined); must be 8-9; check UTM on all KR links
4. **External links** — 0-2 max; official sources only (World Bank, IMF, gov ministries, official industry associations); NOT in CTAs or FAQs; plain `<a>` style (no `<strong>` wrap)
5. **Bolding** — scan every number, %, USD, billion, million, CAGR in the HTML body — each must be in `<strong>`; zero tolerance
6. **Em dashes** — literal search for `—` and `–` characters anywhere
7. **Data density** — every body paragraph has 2-3 stats (floor 2, ceiling 3); every bullet has 1 stat; every FAQ has minimum 2 stats
8. **CTA format** — must use `<hr><blockquote>` not `<div class="cta-block">` — LinkedIn strips div/class completely
9. **FAQs** — exactly 5, each answer has minimum 2 stats
10. **CTAs** — exactly 2, use `<hr><blockquote>` format, anchor text in `<strong>`, topic-specific wrapper text
11. **Intro scroll-stopper** — S1 must be a contrarian insight or B2B pain point (0 links); S2 must have exactly 1 link (KR homepage embedded inside "As per Ken Research market modelling" attribution) plus at least 1 bolded stat; S3 = target report link; no standalone "visit Ken Research" sentence in intro
12. **Keyword repetition** — count exact primary keyword occurrences; flag if more than 3
13. **Ken Research mentions** — count in body; must be 3-5; flag if under 3 or over 5
14. **Semantic B2B terms** — check that at least 3 of 4-5 operational B2B terms relevant to the market vertical are woven naturally across H2s and body

---

## Passing Rule

- Score ≥ 88 → `"passed": true`, rating "Good" or "Excellent"
- Score 70-87 → `"passed": false`, rating "Needs Repair"
- Score < 70 → `"passed": false`, rating "Reject"

---

## Output Format

Return ONLY this JSON — no explanation, no markdown:

```json
{
  "score": 0,
  "rating": "Excellent | Good | Needs Repair | Reject",
  "passed": false,
  "section_scores": {
    "freshness": 0,
    "data_density": 0,
    "original_insight": 0,
    "search_intent": 0,
    "link_quality": 0,
    "readability": 0,
    "cta_value": 0,
    "faq_quality": 0,
    "source_transparency": 0
  },
  "critical_issues": [],
  "penalties_applied": [],
  "must_fix_before_publish": [],
  "repair_instruction": ""
}
```

Where:
- `critical_issues` — list of issues that caused FAIL or Reject
- `penalties_applied` — list of `"area: -N (reason)"` strings for every deduction
- `must_fix_before_publish` — list of specific fixes required if score < 88
- `repair_instruction` — one paragraph telling the repair agent exactly what to fix and how

---

## How to Use This Skill

This file is read directly with the Read tool — it is NOT the global `article-qa` agent.

```
Read skills/linkedin/qa-blog.md
```

Apply all rules above to score the article. Return only the JSON object.
