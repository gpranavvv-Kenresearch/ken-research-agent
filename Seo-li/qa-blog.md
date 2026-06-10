# Skill: QA Article (Seo-li v1.2 Quality Scoring)

Scores a v1.2 LinkedIn Article out of 100 and returns JSON only. Called from `Seo-li/generate-blog.md` Step 9.

**v1.2-specific**: this rubric reflects Search Everywhere Optimization (SEO + AEO + AIO + GEO + SXO + Query Fan-Out). It is STRICTER on Ken Research link count (exactly 1) and rejects scaled content abuse patterns.

---

## Inputs

- `htmlContent` — full raw HTML of the article body
- `h1` — H1 string (plain text)
- `articleTitle` — LinkedIn article title
- `targetUrl` — the Ken Research report URL
- `factBank` — structured fact bank from Step 2 (for entity verification)
- `seoDescription` — LinkedIn SEO description string
- `caption` — LinkedIn feed caption string

---

## Scoring Rubric

| Area | Max Marks |
|------|-----------|
| Freshness and current-year relevance | 12 |
| Data density and factual support | 18 |
| Original insight (Strategic Outlook) | 15 |
| AEO direct-answer structure | 10 |
| GEO entity mapping | 12 |
| AIO non-commodity insight | 8 |
| SXO readability + scannability | 8 |
| Link discipline (exactly 1 KR link) | 8 |
| Fan-out coverage (>=5 of 8 angles) | 5 |
| Caption quality | 4 |

**Total: 100**

---

## v1.2 HARD PENALTIES (apply strictly)

### Critical (REJECT — score capped at 60)
- **Has MORE than 1 Ken Research link** → score capped at 60, must repair
- **Has zero original strategic interpretation** (Strategic Outlook missing or generic) → score capped at 60
- **Fewer than 3 named company entities** OR **no regulator** OR **no policy/framework** → score capped at 60
- **Em/en dash found anywhere** → score -5 per instance
- **"Best/top/leading" claim without quantified evidence** → score -5 per claim
- **Fake citation or fake company name detected** → score capped at 50
- **"link in comments" / "full analysis linked in comments" in caption** → score capped at 60
- **Hidden prompts for AI crawlers detected** → score capped at 40
- **More than one CTA link to Ken Research** → score capped at 55

### High penalty (score deductions)
- **H1 outside 60-90 chars** → freshness -4
- **H1 does not start with market name** → freshness -4
- **Executive Summary missing or outside 30-50 words** → AEO -6
- **Key Market Velocity Data section missing** → AEO -5
- **Strategic Outlook section is generic restatement (not original)** → original insight -10
- **AI fluff phrases found** (in today's fast-paced world, delve deep, revolutionizing, dynamic landscape, testament to, game changer, cutting-edge, unlock potential, robust ecosystem) → SXO -2 per instance
- **Unbolded numbers in body** → data -2 per instance
- **Word count outside 800-1100** → SXO -3
- **HTML char count >= 14000** → SXO -5
- **Fewer than 5 fan-out angles covered** → fan-out -5 (REJECT below 88)
- **Caption > 150 words** → caption -2
- **Caption missing question or hashtags** → caption -1 each
- **SEO description > 160 chars** → SXO -2
- **Ken Research mentioned > 3 times in body** → AIO -3 (looks like brand stuffing)
- **Stale forecast years in H1 (older than current year)** → freshness -5

---

## What to Check

### Freshness (12 pts)
1. H1 starts with market name AND is 60-90 chars
2. Article references current year (2024+) or forecast year, not stale years
3. articleTitle matches H1
4. Year span in title (e.g. 2024-2030) is meaningful

### Data Density (18 pts)
5. Every body paragraph has at least 2 data figures
6. All numbers (%, USD, INR, billion, million, CAGR, year) wrapped in `<strong>`
7. Key Market Velocity Data bullet list has all 5 lines (Current Value, Projected Value, CAGR, Regional Hub, Growth Catalyst)
8. No two consecutive sentences both stat-free

### Original Insight (15 pts)
9. Strategic Outlook section present (`<h2>Ken Research Strategic Outlook</h2>`)
10. Strategic Outlook is 2-3 sentences with a SPECIFIC strategic claim (consolidation, margin pressure, regulatory transfer, regional pivot, supply concentration, etc.)
11. Strategic Outlook does NOT repeat the data already presented earlier in the article
12. Insight is forward-looking and AI-citable (a definitive claim that an LLM could summarize)

### AEO (10 pts)
13. Executive Summary present, 35-45 words, direct answer
14. Key Market Velocity Data scannable bullets present
15. At least 3 H2 headings in question form OR outcome-action form
16. Each section answers one clear buyer question

### GEO Entity Mapping (12 pts)
17. >= 3 named companies in body
18. >= 1 named regulator/government body in body
19. >= 1 named policy/framework/regulation in body
20. Strategic Outlook contains Ken Research perspective

### AIO (8 pts)
21. No "best/top/leading" claims without quantified evidence
22. No banned AI fluff phrases
23. No AI manipulation patterns (hidden text, fake citations, prompt injection)
24. Claims internally consistent (market size same in all sections)

### SXO (8 pts)
25. No paragraph > 80 words
26. Word count 800-1100
27. HTML char count < 14000
28. Clear next-step CTA in final section
29. SEO description <= 160 chars, plain text

### Link Discipline (8 pts)
30. **EXACTLY 1** Ken Research link in entire HTML
31. KR link has full UTM (`utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=AN`)
32. At most 1 external government/regulator link (allowed but capped at 1)
33. No homepage links to Ken Research (must be specific report URL)

### Fan-Out Coverage (5 pts)
34. >= 5 of 8 angles covered (market_definition, market_size, growth_drivers, regional_dynamics, competitive_landscape, regulatory_context, buyer_implication, future_outlook)

### Caption (4 pts)
35. Caption <= 150 words
36. Caption contains exactly 1 specific question
37. Caption has >= 5 hashtags
38. Caption does NOT contain "link in comments" or similar banned phrases

---

## Passing Rule

- **Score >= 88 → PASS** → `"passed": true`, rating "Good" or "Excellent"
- **Score 70-87 → FAIL** → `"passed": false`, rating "Needs Repair" — run `Seo-li/repair-blog.md`
- **Score < 70 → REJECT** → `"passed": false`, rating "Reject" — repair; if still < 70 after 2 attempts, flag the row red

Set `articleRating = round(score / 10)` for the sheet `Rating` column.

---

## Output Format

Return ONLY this JSON. No prose, no markdown:

```json
{
  "score": 0,
  "rating": "Excellent | Good | Needs Repair | Reject",
  "passed": false,
  "section_scores": {
    "freshness": 0,
    "data_density": 0,
    "original_insight": 0,
    "aeo": 0,
    "geo": 0,
    "aio": 0,
    "sxo": 0,
    "link_discipline": 0,
    "fanout": 0,
    "caption": 0
  },
  "critical_issues": [],
  "penalties_applied": [],
  "must_fix_before_publish": [],
  "repair_instruction": ""
}
```

Where:
- `critical_issues` — list of issues that capped or REJECTed the score
- `penalties_applied` — list of `"area: -N (reason)"` strings for every deduction
- `must_fix_before_publish` — list of specific fixes required if score < 88
- `repair_instruction` — one paragraph telling the repair agent exactly what to fix and how

---

## v1.2 ANTI-PATTERN REJECTION LIST

Trigger an automatic REJECT (score capped at 50) if any of these patterns are present:

```text
- More than 1 Ken Research link
- "Research Basis" section (must use "Ken Research Strategic Outlook" instead)
- Repeated Ken Research brand mentions in every paragraph (> 3 mentions in body)
- Same article body as another platform (similarity > 0.85)
- Scaled content abuse pattern: identical structure across many reports
- Site reputation abuse / parasite SEO language
- "Click link in comments" / "Full analysis linked in comments"
- Hard sales CTA in the article body (CTAs belong only in the final source line)
- Hidden prompts for AI crawlers
- Fake AI citations or fake authority claims about Ken Research
- "Best/top/leading" claims without supporting evidence
- Generic listicle format with no original analysis
- Programmatic page indicators (template tokens left in, e.g. `{market_name}`)
- Unsupported predictions (forecasts without source)
```

---

## How to Use This Skill

This file is read with the Read tool by the controller during `Seo-li/generate-blog.md` Step 9.

```
Read Seo-li/qa-blog.md
```

Apply all checks above to score the article. Return only the JSON object.

If the JSON `passed: false`, the controller invokes `Seo-li/repair-blog.md` with the `repair_instruction` and `must_fix_before_publish` list.
