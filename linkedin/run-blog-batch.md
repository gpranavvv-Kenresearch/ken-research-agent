# Skill: Run Blog Batch

Orchestrator for generating and publishing blog articles. Reads the `Blogs` tab, generates blogs, and posts them to LinkedIn Pulse.

---

## When to Run
LinkedIn Pulse runs **once per day only** — at **13:00 IST (B4)**.
If run-batch calls this skill at any other batch → skip entirely, log "Pulse: not scheduled this batch."

---

## Sheet Write Helper

**All sheet writes use `sheet_write.py` — never use Apps Script for writes.**

```
python scripts/sheet_write.py --sheet linkedin --row <data_row> --updates '<json>'
```

For large payloads (Blog Content HTML), always use a temp file:
```
python scripts/sheet_write.py --sheet linkedin --row <data_row> --updates-file C:/tmp/blog_updates_{row}.json
```

---

## Phase 1: Generate Batch Label
Format: `BLOG-{YYYY-MM-DD}-B1` (always B1 since only one run per day)
Example: `BLOG-2026-04-27-B1`

---

## Phase 2: Read the Blogs Tab

LinkedIn blogs live in the shared **`Blogs`** tab (same tab as the legacy blog flow). The Apps Script `blog-unposted` endpoint does NOT cover it — read the tab directly via the Sheets API. Use range `A:Z` because the `Linkedin Pulse *` status columns live in the upper-letter range:

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
        unposted.append({"data_row": sheet_row - 1, "sheet_row": sheet_row,
                          "targetUrl": col(row, "targetUrl"), "Title": col(row, "Title"),
                          "Name": col(row, "Name"), "needs_gen": needs_gen, "needs_post": needs_post})
print(f"{len(unposted)} rows need work")
```

A row needs work if `Blog Content` is empty (needs generation) OR `Linkedin Pulse Status` is empty (needs posting).

If 0 rows → log "No unposted blog rows. Batch done." and stop.

---

## Phase 3: Assign Accounts

For each row, match `Name` to LinkedIn credentials in CLAUDE.md.

If Name not found → write error via sheet_write.py:
```
python scripts/sheet_write.py --sheet linkedin --row <row> --updates '{"Linkedin Pulse Status":"error","Linkedin Pulse Error":"Account not found"}'
```

---

## Phase 4: Process Each Row

### Step A: Generate Blog (if Blog Content is empty)
1. Follow `generate-blog.md` skill
2. Research market data from targetUrl
3. Generate full article
4. Write to sheet via `sheet_write.py` (Step 9 in generate-blog.md handles this)

If generation fails → write error:
```
python scripts/sheet_write.py --sheet linkedin --row <row> --updates '{"Linkedin Pulse Status":"error","Linkedin Pulse Error":"Blog generation failed: <reason>"}'
```

### Step B: Post to LinkedIn Pulse (if Linkedin Pulse Status is empty)
1. Run script:
   ```
   npx ts-node scripts/post-linkedin-pulse.ts --email {e} --password {p} --nickname {name} --title "{title}" --html-file {html_file} --caption "{caption}" --seo-title "{seo_title}" --seo-desc "{seo_desc}" --row {n} --batch {b}
   ```
2. **Exit 0** → done ✓
3. **Exit 1** → WATCHDOG:
   1. Read `scripts/artifacts/resume.json`
   2. Read `agents/linkedin-pulse-agent.md`
   3. Follow linkedin-pulse-agent.md exactly — complete article publish via MCP, fix script, update sheet

If posting succeeds → write result:
```
python scripts/sheet_write.py --sheet linkedin --row <row> --updates '{"Linkedin Pulse Status":"posted","Linkedin Pulse URL":"<url>","Linkedin Pulse Batch":"<batch>","lastPosted linkedin Pulse":"<IST timestamp>"}'
```

If posting fails → write error:
```
python scripts/sheet_write.py --sheet linkedin --row <row> --updates '{"Linkedin Pulse Status":"error","Linkedin Pulse Error":"<reason>"}'
```

---

## Phase 5: Summary

After processing all rows, log:
```
=== Blog Batch {label} Complete ===
Rows processed: {N}
Blogs generated: {count}
LinkedIn Pulse: {posted} posted, {errors} errors
```

---

## Phase 6: Blog Intelligence Update (runs ONLY after 50+ blogs written to sheet)

After Phase 5, check the total number of rows in the `Blogs` tab that have `Blog Content` filled (non-empty).

**If total blogs in sheet >= 50:**
- Call the blog-intelligence agent in **Learn mode**
- Pass: all blog titles generated in this batch + any fix patterns observed during generation (em dash fixes, title rewrites, bolding issues, etc.)
- The agent updates its Fix History and variation blueprints based on the new batch
- Log: `[blog-intelligence] Learn mode complete — {n} new blogs processed`

**If total blogs < 50:** skip Phase 6 entirely. Log: `[blog-intelligence] Skipped — {n} total blogs (threshold: 50)`

This keeps blog-intelligence up to date without slowing down individual blog generation.

---

## Tools Used

| Task | Tool |
|------|------|
| Read blog sheet | Apps Script Web App (GET only) |
| Write to blog sheet | `scripts/sheet_write.py` (direct Sheets API) |
| Scrape report pages | `firecrawl_scrape` |
| Market research | Web search |
| Blog generation | Agent (inline, no external tool) |
| Browser automation | Playwright MCP |

---

## Notes
- Each article = its own browser session
- Never reuse browser across accounts
- If blog generation fails → skip posting, write error to sheet
- If posting fails → keep the generated blog in sheet, only mark posting as error
- Max 15 blog articles per batch
