# Skill: run-serp-schedule

## WHAT THIS SKILL DOES — NOTHING ELSE
1. Fetch URLs from sheet
2. Check SERP ranking
3. Decide P1/P2/P3
4. Generate X post + FB post + LinkedIn post
5. Write to Social Media tab
6. Repeat for next URL

## WHAT THIS SKILL MUST NEVER DO
- NO images
- NO browser / Playwright
- NO Python scripts
- NO file creation
- NO HTTP servers
- NO Cloudinary
- NO LinkedIn posting
- NO blog publishing
- NO reading other skills
- NO parallel execution / background jobs / bash loops
- NO changing sheet columns or structure
- NO confirmation prompts
- STOP after writing to sheet. Do not do anything else.

---

## Apps Script URL
`https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec`

---

## Step 1 — Fetch URLs (one curl call)

```bash
curl -sL "https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec?action=urls-unpicked"
```
Take first 75 rows.

---

## Step 2 — Bulk mark picked (one curl call)

```bash
curl -sL -X POST -H "Content-Type: application/json" \
  -d '{"action":"urls-mark-picked-bulk","rows":[2,3,4,...]}' \
  "https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec"
```

---

## Step 3 — Check trending topics (one WebSearch, reuse for all URLs)

```
WebSearch: "trending topics today news"
```
Note 5–10 themes.

---

## Step 4 — For each URL one by one (NO parallelism):

### 4a. SERP check
Clean title: strip "Outlook to YYYY", "Dataset YYYY-YYYY", year ranges.
```
WebSearch: "{cleaned title}"
```
Find kenresearch.com position → rank N or -1.

### 4b. Priority
```
title matches trend  → P1 (trending)
rank -1 or >= 61     → P1
rank 31-60           → P2
rank 1-30            → P3
```

### 4c. postDate
Monday of current week = base.
```
P1: Monday + [0,1,2,3,4][p1_count % 5]
P2: Monday + [0,2,4][p2_count % 3]
P3: Monday + [0,3][p3_count % 2]
```
Increment counter for that priority after assigning.

### 4d. Generate content (text only, write yourself)

UTM URLs:
- X:  `{url}?utm_source=X&utm_medium=social_organic&utm_campaign=Automation`
- FB: `{url}?utm_source=Facebook&utm_medium=social_organic&utm_campaign=Automation`
- LI: `{url}?utm_source=Linkedin&utm_medium=social_organic&utm_campaign=Automation`

**GLOBAL RULES — apply to ALL three posts:**
- Never use em dashes (—). Replace with colon (:), comma, or rewrite.
- No emojis.
- Every bullet must contain a real number or specific fact. No vague bullets.
- Vary sentence openers — never start two posts the same way.

---

**X post format:**
```
{1 punchy sentence with biggest stat — market size or CAGR}. {1 sentence CTA like "Dive into the full picture:" or "Explore the data:"}
{X_UTM_URL}
#{Hashtag1} #{Hashtag2}
```
Body (excluding URL) max 230 chars. No em dashes, no emojis.

---

**FB post format:**
```
{Opening paragraph: 2-3 sentences. Lead with the projected market value or key stat. Set the business context — what is happening in this market and why it matters now.}

{Second line: the top-level number. "The market is expected to grow at X% CAGR through YYYY, driven by [key driver]. [Largest segment] alone is set to reach $X, reflecting a Y% CAGR..."}

• {Stat 1: specific number + what it signals for investors/operators}
• {Stat 2: recent company move or product launch + market implication}
• {Stat 3: policy, regulation, or guideline + business impact}
• {Stat 4: regional or segment spike with exact figure}

{Closing paragraph: 2-3 sentences of actionable insight. Who should act, what they should do, and why now. Frame as procurement, investment, or supply chain advice.}

{Full competitive benchmarking, segment forecasts, and regional breakdowns from Ken Research:}
{FB_UTM_URL}

#{6 to 10 relevant hashtags}
```

---

**LI post format:**
```
{Opening question: frame a procurement, investment, or strategic challenge that the market data answers. Use the key stat in the question itself.}

{Context paragraph: 2-3 sentences. State the market size, CAGR, and the business dynamic — fragmented landscape, competitive pressure, regulatory deadline, or structural shift.}

• {Stat 1: growth figure + what it pressures or drives in operations}
• {Stat 2: specific company move + how it reshapes vendor/investor dynamics}
• {Stat 3: ESG, compliance, or policy deadline + demand it creates}
• {Stat 4: segment or revenue CAGR contrast + strategic implication}

{Strategic recommendation paragraph: 2-3 sentences. Tell the reader exactly what to do — lock in suppliers, negotiate terms, prioritise partnerships, monitor policy shifts. Tie each action to a specific number from the data.}

Full competitive benchmarking, segment forecasts, and regional breakdowns from Ken Research: {LI_UTM_URL}

#{4 to 6 B2B-focused hashtags}
```

### 4e. Write to sheet (one curl call)

```bash
curl -sL -X POST -H "Content-Type: application/json" \
  -d '{
    "action":"social-media-write",
    "updates":{
      "targetUrl":     "https://www.kenresearch.com/...",
      "title":         "...",
      "priority":      "2026-05-05: P1",
      "seoIndexed":    "2026-05-05: No",
      "postDate":      "2026-05-05: 2026-05-07",
      "X Post":        "2026-05-05: {tweet}",
      "FB Post":       "2026-05-05: {fb post}",
      "LinkedIn Post": "2026-05-05: {li post}"
    }
  }' \
  "https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec"
```

Confirm `{"ok":true}` → move to next URL. STOP. Do not post anywhere. Do not open browser.

---

## Step 5 — Log summary when all done

```
╔══ SERP Schedule — {date} ══╗
   Processed: 75
   P1: X  P2: Y  P3: Z
   Written to Social Media tab.
╚════════════════════════════╝
```

**DONE. This skill ends here.**
