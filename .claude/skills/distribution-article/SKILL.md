---
description: Generate a high-quality LinkedIn Pulse article using research, fact bank, writing, QA scoring, and repair pipeline. Targets 88+ quality score for indexing and lead generation. Keeps full interlink structure.
---

# Distribution Article Skill

Generates a LinkedIn Pulse article for a Ken Research report through a 6-step quality pipeline: research → fact bank → write → QA → repair → output.

## Input Format

```
/distribution-article {Market Title} | {Report URL} | sample: {Sample Report URL}
```

Example:
```
/distribution-article Russia Car Rental Market | https://www.kenresearch.com/industry-reports/russia-car-rental-market | sample: https://www.kenresearch.com/sample-report/russia-car-rental-market
```

---

## Step 1: Parse Input

From `$ARGUMENTS` extract:
- `market_title` — e.g. "Russia Car Rental Market"
- `primary_keyword` — same as market_title
- `report_url` — main Ken Research report page
- `sample_report_url` — sample report page (infer from slug if not given: `https://www.kenresearch.com/sample-report/{slug}`)
- `platform` — default: `linkedin-pulse`

Secondary keywords: generate 4 natural variations of the primary keyword (e.g. "Russia car rental industry", "Russia carsharing market", "Russia rental mobility sector", "car rental operators in Russia")

---

## Step 2: Research and Fact Bank

Use the **article-researcher** agent.

Pass:
- `market_title`
- `primary_keyword`
- `report_url`

The researcher fetches the report page + 4-6 external sources and returns a structured fact bank JSON.

Minimum required in fact bank before proceeding:
- At least 2 market size facts
- At least 1 CAGR/growth fact
- At least 1 forecast fact
- At least 3 demand driver facts
- At least 2 company facts

If fact bank is below minimums → run an additional web search and retry before proceeding to Step 3.

---

## Step 3: Find Related Ken Research Report URLs (Interlinks)

Fetch all 7 Ken Research product sitemaps in parallel:

```
https://www.kenresearch.com/productv0-sitemap.xml
https://www.kenresearch.com/productv1-sitemap.xml
https://www.kenresearch.com/productv0pointone-sitemap.xml
https://www.kenresearch.com/productv0pointone-sitemap.xml?p=2
https://www.kenresearch.com/productv0pointone-sitemap.xml?p=3
https://www.kenresearch.com/productv0pointone-sitemap.xml?p=4
https://www.kenresearch.com/productv0pointone-sitemap.xml?p=5
```

Combine all URLs into one pool. From the pool, select 8-10 related report URLs:
- Same country first
- Same industry/sector second
- Adjacent markets third

Build UTM URL for each:
```
{related_url}?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation
```

Also build UTM URLs for:
- `report_utm` = `{report_url}?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation`
- `sample_utm` = `{sample_report_url}?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation`
- `homepage_utm` = `https://www.kenresearch.com/?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation`

---

## Step 4: Write Article

Use the **article-writer** agent.

Pass:
- `market_title`
- `primary_keyword`
- `secondary_keywords`
- `report_utm`
- `sample_utm`
- `homepage_utm`
- `related_report_utms` (8-10 URLs with anchor texts)
- `fact_bank` (from Step 2)

The writer produces clean HTML using only fact bank data, following all Ken Research blog rules (interlinks, bolding, H1/H2 rules, no em dashes, FAQs, CTAs, Research Basis section).

---

## Step 5: QA Score

Use the **article-qa** agent.

Pass the article HTML and fact bank.

Minimum publishable score: **88**.

If score ≥ 88 → proceed to Step 7.
If score < 88 → proceed to Step 6.

---

## Step 6: Repair (if score < 88)

Use the **article-repair** agent.

Pass:
- Article HTML
- QA result JSON
- Fact bank

Repair and re-score. Maximum 2 repair attempts.

If score still < 88 after 2 attempts → output the article with a FAILED status and the list of remaining issues. Do not silently approve a failing article.

---

## Step 7: Final Output

Return:

```
STATUS: PASSED | FAILED
QA SCORE: {score}/100
REPAIR ATTEMPTS: {n}

--- ARTICLE HTML ---
{final_html}

--- SOURCES USED ---
{source list}

--- QA ISSUES FIXED ---
{list of fixes made}

--- REMAINING ISSUES (if FAILED) ---
{list}
```
