# Blog Intelligence — Living Knowledge File

Maintained by the `blog-intelligence` agent.
Read by: article-writer (before writing), blog-intelligence (before generating blueprint).
Updated by: blog-intelligence agent after every fix and every approval.

**Last updated:** —
**Approved blogs so far:** 0
**Total fixes logged:** 0

---

## FIX HISTORY

Every mistake caught and corrected is logged here so it never happens again.

### Format
```
### Fix #N — {Market Name} — {YYYY-MM-DD HH:MM IST}
**QA score before fix:** {X}/100
**QA score after fix:** {X}/100

**Problem:**
[Exact symptom — what the HTML/text looked like, which rule it violated, QA penalty incurred]

**Changes made in detail:**
- [Specific change 1 — e.g. "Wrapped CTA1 anchor text in <strong>: changed `<a href="...">text</a>` to `<a href="..."><strong>text</strong></a>`"]
- [Specific change 2]
- [Specific change 3 if applicable]

**Steps taken to solve:**
1. [First action — e.g. "Identified all CTA blocks in the HTML"]
2. [Second action — e.g. "Checked each <a> tag for presence of <strong> child"]
3. [Third action — e.g. "Applied wrap, re-ran QA to confirm penalty removed"]

**Final output:**
[What the corrected element looks like — include the fixed code snippet or final state]

**Lesson:**
[The rule, generalized beyond this specific market — one sentence]
```

_No fixes logged yet._

---

## APPROVED SECTION LIBRARY

Approved blogs and their strongest section approaches. Blueprint mode reads this to assign reference approaches to new blogs.

### Format
```
### Approved: {Market Name} — {YYYY-MM-DD}
**File:** output/approved-blogs/{slug}.html
**Market type tags:** [comma-separated tags from Market Type Signal Guide]

**Section N ({approach name}):**
Opening: "{exact opening sentence used}"
Strength: [what made this opening work — narrative technique, tension built, framing used]
```

_No approved blogs yet._

---

## MARKET TYPE SIGNAL GUIDE

Used by blueprint mode to classify new markets before assigning section approaches.

| Market Signal in Fact Bank | Tag |
|---------------------------|-----|
| Tourist arrivals in millions, airport corridors, resort routes, visa policy | `tourism-heavy` |
| Corporate fleet leasing CAGR, office rents, multinational expansion, managed fleet demand | `corporate-heavy` |
| EV VAT cuts, EV presidential mandates, domestic EV brand, charging infrastructure | `EV-policy` |
| Government transport regulations, licensing frameworks, online rental formalisation | `regulatory` |
| Online booking share %, internet user base, digital platform penetration | `digital-adoption` |
| Named operators with fleet size, market share, revenue data | `operator-data` |
| Infrastructure projects (metro, roads, megaprojects) creating workforce fleet demand | `infrastructure-driven` |
| Middle-class formation, investable asset thresholds, retail fund penetration | `wealth-formation` |
| FDI inflows, foreign institutional allocation, cross-border capital flows | `fdi-driven` |
| ESG mandates, sustainability-linked assets, green bond issuance | `ESG-driven` |

_Add new tags here as new market types appear in blogs._

---

## VARIATION LOG

Tracks which section approach combinations have been used. Blueprint mode checks this to avoid repeating the same angle in consecutive blogs.

### Format
```
**Blog #N ({Market Name} — row {X}, {batchID}):**
Report: {full report title}
Blog Title: "{Blog Title column value}"
S1={angle} + S2={angle} + S3={angle} + S4={angle} + S5={angle}
Sheet written: {YYYY-MM-DD}, sheetRow {N} confirmed
```

_No blogs logged yet._

---

## OPERATOR DATA POLICY

Controls whether named operators (companies, competitors) appear in blog body sections.

| Decision | Markets |
|----------|---------|
| Include operator data (public disclosures only) | _(none yet)_ |
| Market-level data only, no operator names | _(none yet)_ |

**Default when unknown:** Include operator data only if it is verifiable public data (disclosed fleet size, public earnings, press releases). Always flag the approach used in blueprint output.

---

## STANDING RULES

Rules that are never to be violated. They overrule any other instruction.
Each rule here must trace back to at least one Fix History entry or explicit user instruction.

### Format
```
**Rule #N** — {short title}
{One sentence rule statement.}
Source: Fix #{N} or User instruction on {date}
```

_No rules logged yet._
