# Skill: Run Article Batch (Seo-li v1.2)

Orchestrator for generating v1.2 LinkedIn Articles. Reads the shared `Blogs` Google Sheet tab (same tab as the legacy `linkedin/` flow), generates articles using the v1.2 Search Everywhere Optimization pipeline, and prepares them for **manual browser publishing**.

**Differences from the older `linkedin/` Pulse pipeline:**
- v1.2 article structure (Executive Summary + Velocity bullets + 4 question H2s + Strategic Outlook + 1 Ken link)
- ONE Ken Research link only (not 8-9)
- UTM campaign = `AN` (not `Automation`)
- Same `Blogs` sheet tab + Blog Title/Description/Content/Caption columns as linkedin/ (one schema)
- Output also writes markdown files to `outputs/linkedin_articles/`
- Publishing is MANUAL via browser, not automated via `post-linkedin-pulse.ts`
- Adds 17 SEO/AEO/AIO/GEO/SXO sanity flags + fan-out 5-of-8 requirement

---

## When to Run

This pipeline is invoked when the user says "generate N articles" (Seo-li v1.2 flow), as opposed to "generate N blogs" (older linkedin/ Pulse flow).

The two pipelines coexist. The `linkedin/` folder pipeline stays untouched and continues to handle Pulse microblogs. Seo-li handles full LinkedIn Articles.

---

## Sheet Write Helper

All sheet writes use `scripts/sheet_write.py` via the `linkedin` or `seoli` alias (both resolve to the shared `Blogs` tab):

```
python scripts/sheet_write.py --sheet linkedin --row <data_row> --updates '<json>'
```

For large payloads (Blog Content HTML), use a temp file:
```
python scripts/sheet_write.py --sheet linkedin --row <data_row> --updates-file C:/tmp/li_blog_updates_{row}.json
```

---

## Phase 1: Generate Batch Label

Format: `ARTICLE-{YYYY-MM-DD}-B{n}` where n increments through the day if multiple batches.
Example: `ARTICLE-2026-05-25-B1`

---

## Phase 2: Read the Blogs Tab

LinkedIn Articles live in the shared `Blogs` Google Sheet tab. Read it directly via the Sheets API:

```python
import sys; sys.path.insert(0, "scripts")
import sheet_write as sw

r = sw.sheets_get("/values/'Blogs'!A:Z")
rows = r.get("values", [])
headers = rows[0]
def col(row, name):
    i = headers.index(name)
    return row[i] if i < len(row) else ""

unposted = []
for sheet_row, row in enumerate(rows[1:], start=2):
    content = col(row, "Blog Content")
    status = col(row, "Linkedin Pulse Status")
    needs_gen = not (isinstance(content, str) and len(content) > 50)
    needs_post = not str(status).strip()
    if needs_gen or needs_post:
        unposted.append({
            "data_row": sheet_row - 1,
            "sheet_row": sheet_row,
            "targetUrl": col(row, "targetUrl"),
            "Title": col(row, "Title"),
            "Name": col(row, "Name"),
            "needs_gen": needs_gen,
            "needs_post": needs_post,
        })

print(f"{len(unposted)} rows need work")
```

A row needs work if `Blog Content` is empty (needs generation) OR `Linkedin Pulse Status` is empty (needs publishing).

If 0 rows → log `No unposted Blogs rows. Batch done.` and stop.

---

## Phase 3: Assign Accounts

For each row, match `Name` to LinkedIn credentials in CLAUDE.md.

If `Name` is empty or not found:
```
python scripts/sheet_write.py --sheet linkedin --row <row> --updates '{"Linkedin Pulse Status":"error","Linkedin Pulse Error":"Account not found"}'
```

---

## Phase 4: Process Each Row — Full Pipeline (every step MANDATORY)

When the user says "generate N articles", run THIS exact sequence per article. Image generation is a first-class step, never skipped, never replaced with a placeholder URL in the final sheet write.

### Step A.0: Resolve target row (CRITICAL — prevents off-by-one writes)

Before any write, find the **first empty data_row** in the `Blogs` tab using header lookup. Then ALWAYS pass that `data_row` value to `sheet_write.py --row <data_row>` (the tool adds 1 internally to get sheet_row).

```python
import sys; sys.path.insert(0, "scripts")
import sheet_write as sw
r = sw.sheets_get("/values/'Blogs'!A:Z")
rows = r.get("values", [])
headers = rows[0]
content_idx = headers.index("Blog Content")
last_filled = 1
for i, row in enumerate(rows[1:], start=2):
    c = row[content_idx] if len(row) > content_idx else ""
    if isinstance(c, str) and len(c) > 50:
        last_filled = i
target_sheet_row = last_filled + 1     # the first empty sheet row
target_data_row = target_sheet_row - 1  # what sheet_write.py expects
```

**Hard rule:** never hardcode a row number. Always re-resolve target_data_row inside the same Step A.0 block immediately before the Step A.6 write. If another batch wrote to that row meanwhile, re-resolve and use the new value.

### Step A.1: Pick URL + Scrape

Run `Seo-li/generate-blog.md` Step 1a (pick URL via `scripts/pick_urls.py`) and Step 1b (scrape report via WebFetch).

### Step A.2: FIRE IMAGE PROMPT IMMEDIATELY (MANDATORY)

Run `Seo-li/generate-blog.md` Step 1d → invokes `Seo-li/generate-image.md` Steps 1-5e. Image fires to ChatGPT in the background. Do NOT wait for it.

**Hard rule:** if ChatGPT is not logged in OR the prompt cannot be sent, STOP this article, log the failure, move to the next URL in the batch. Do NOT proceed with research and writing only to use a placeholder.

### Step A.3: Research + Write

Run Steps 2-6: 3 parallel WebSearch queries, build fact bank, write H1, write article body 800-1100 words, wrap into HTML template. The HTML uses `{coverImageUrl}` as a temporary placeholder string at the `<img src='...'>` tag — it will be replaced in Step A.4.

### Step A.4: RETRIEVE IMAGE + UPLOAD TO CLOUDINARY (MANDATORY)

Run Step 7 → invokes `Seo-li/generate-image.md` Steps 5f through 6:
1. Poll for the generated image (up to 5 min)
2. Visual branding check — REJECT and regen if "Ken Research" or any brand text is visible
3. Download base64, save to `generated_images/{slug}_{timestamp}.png`
4. Upload to Cloudinary, parse `secure_url`
5. Replace `{coverImageUrl}` placeholder in the HTML with the Cloudinary `secure_url`
6. Navigate browser to `https://chatgpt.com/new` (keep session alive)

**Hard rule:** after Step A.4 the HTML img tag MUST contain a Cloudinary `secure_url`. If image generation failed (ChatGPT error, branding violation after 2 regen attempts, Cloudinary upload error), STOP this article, log the failure, move to the next URL. Do NOT write the article to the sheet with a placeholder.

### Step A.5: Sanity + QA + Caption

Run Step 8 (sanity-blog.md 17 flags + Jaccard dedup), Step 9 (qa-blog.md score >= 88, repair if 70-87 with max 2 attempts), Step 10 (generate-caption.md).

### Step A.6: Write to Sheet + Save Markdown Files (uses target_data_row from A.0)

Build the JSON payload and write — pass target_data_row from Step A.0:

```bash
python scripts/sheet_write.py --sheet seoli --row <target_data_row> --updates-file C:/tmp/seoli_payload_<slug>.json
```

Columns written: `Title`, `targetUrl`, `Name`, `Blog Title`, `Blog Description`, `Blog Caption`, `Blog Content` (HTML with real Cloudinary URL), `blogBatch`, `Rating`.

Save markdown to `outputs/linkedin_articles/{vertical-slug}/{report-slug}.md` and caption to `outputs/linkedin_articles/{vertical-slug}/{report-slug}_caption.md`. The markdown frontmatter must include `cover_image_url: <cloudinary secure_url>` — never a placeholder.

### Pipelining for batches with N > 1

For batches of N articles, pipeline the image gen with research and writing to save ~90s per article:

```
Article 1 → A.2 (fire image) → A.3 (research+write) → A.2 fires Article 2 image early →
            A.4 (retrieve Article 1 image) → A.5-A.6 (sanity, QA, sheet write)
Article 2 → A.3 (research+write while image 2 is generating) → A.4 → A.5 → A.6
... and so on
```

Each article's image MUST be retrieved before that article's sheet write. Never write Article N to the sheet using Article M's image URL.

### If generation fails for an article

Log the failure and skip — do NOT write a placeholder to the sheet. Track failed URLs in the batch summary at Phase 5. The Linkedin Pulse Status / Error columns are NOT used by Seo-li (generate-only mode).

### Step B: Publishing (out of scope — generate-only mode)

Seo-li v1.2 in current setup is **generate-only**. Publishing is handled separately by the operator outside this pipeline. The pipeline ends at Step A.6 (sheet write + markdown save). Do not write to `Linkedin Pulse *` status columns during the batch.

---

## Phase 5: Summary

After processing all rows, log:
```
=== Seo-li Article Batch {label} Complete (Blogs tab) ===
Rows processed: {N}
Articles generated: {count}
Articles awaiting manual publish: {posted_count}
Errors: {errors}
Average word count: {avg}
Average QA rating: {avg}/10
```

---

## Phase 6: Discovery Tracking (manual, optional)

After 24-72 hours of manual publishing, the operator can manually verify discovery via Google search operators:

1. `site:linkedin.com/pulse "Exact Blog Title"` → confirms LinkedIn indexed the article
2. `"Exact Blog Title"` → confirms general Google indexing
3. `"Ken Research" "Market Name" "LinkedIn"` → confirms brand+market visibility

These checks are directional only. The shared `Blogs` tab schema does NOT include dedicated monitoring columns (Indexed / GSC / GA4 / AI Overview) — track those externally if needed. Per v1.2 §3, no automated indexing API is used for LinkedIn Articles.

---

## Tools Used

| Task | Tool |
|------|------|
| Read Blogs tab | `scripts/sheet_write.py` `sheets_get()` (direct Sheets API) |
| Write to Blogs tab | `scripts/sheet_write.py --sheet linkedin` |
| Scrape report pages | WebFetch tool |
| Market research | WebSearch tool (3 parallel queries) |
| Article generation | `Seo-li/generate-blog.md` (this is the article generator despite the legacy filename) |
| Sanity validation | `Seo-li/sanity-blog.md` |
| QA scoring | `Seo-li/qa-blog.md` |
| Repair | `Seo-li/repair-blog.md` |
| Caption | `Seo-li/generate-caption.md` |
| Cover image | `Seo-li/generate-image.md` (ChatGPT DALL-E via Playwright + Cloudinary) |
| Browser automation for image gen | Playwright MCP |
| Publishing | MANUAL via browser (not automated) |

---

## Notes

- Image generation reuses the existing logged-in ChatGPT browser session. Never close it. Navigate to `https://chatgpt.com/new` between articles.
- All Ken Research links use UTM: `?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=AN`
- The Seo-li flow does NOT use `post-linkedin-pulse.ts`. Publishing is manual.
- Max 15 articles per batch (same cap as the older blog flow, to manage rate limits and image generation queue).
- Seo-li and linkedin/ pipelines share the same `Blogs` Google Sheet tab. No first-run tab setup is required — the tab already exists.

---

## Comparison to the Old Pipeline

| Aspect | Old (`linkedin/`) | New (`Seo-li/`) v1.2 |
|---|---|---|
| Article structure | H1 + intro + 3 body H2s + 2 CTAs + 5 FAQs + branding para | Executive Summary + Velocity bullets + 4 question H2s + Strategic Outlook + 1 Ken link |
| Ken Research links | 8-9 | exactly 1 |
| Word count | 1000-1300 | 800-1100 |
| FAQs | 5 mandatory | none (question-style H2 subheads instead) |
| UTM campaign | `Automation` | `AN` |
| Output | HTML in sheet + auto-publish via `post-linkedin-pulse.ts` | HTML in sheet + markdown files + manual browser publish |
| Validation rules | sanity (6 blocks) + qa (100 pts) | sanity (17 SEO/AEO/AIO/GEO/SXO flags) + qa (100 pts v1.2 rubric) |
| Caption rule | 150-300w with bullets | <=150w curiosity-gap, no "link in comments" |
| Image generation | yes (ChatGPT + Cloudinary) | yes (same) |
| Sheet tab | `Blogs` | `Seo-li` |

Both pipelines coexist. Use Seo-li for v1.2 articles. Use linkedin/ for legacy Pulse microblogs.
