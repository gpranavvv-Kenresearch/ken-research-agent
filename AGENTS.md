# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

---

## Architecture Overview

This is an autonomous social media posting and blog publishing agent for Ken Research. It reads market report URLs from a Google Sheet, generates platform-specific content, posts it across X/Facebook/LinkedIn, and writes results back to the sheet.

### Two parallel pipelines

**Social posting pipeline** (`skills/run-batch.md`)
- Reads unposted rows from the `Agentic Sheet` tab via Apps Script Web App (GET)
- Generates X tweet, Facebook post, and LinkedIn post per row using web-searched market data
- Runs TypeScript scripts (`scripts/post-x.ts`, `scripts/post-facebook.ts`, `scripts/post-linkedin.ts`) to post via Playwright browser automation
- Falls back to Playwright MCP manually if a script exits 1, using `scripts/artifacts/resume.json` for context
- Writes results back using `scripts/sheet_write.py` (service account, direct REST API)

**Blog pipeline** (`skills/run-blog-batch.md` + `skills/generate-blog.md`)
- Picks fresh Ken Research report URLs from `data/sitemap_urls.json` using `scripts/pick_urls.py`
- Generates a 1200–1400 word HTML article per URL, including a ChatGPT DALL-E cover image uploaded to Cloudinary
- Quality gates: self-check checklist → 13-point rating (must score ≥8/10) → optional repair loop → sheet write
- Publishes to LinkedIn Pulse via `scripts/post-linkedin-pulse.ts`

### Key files

| Path | Purpose |
|------|---------|
| `skills/run-batch.md` | Social posting orchestrator — read this to run a batch |
| `skills/generate-blog.md` | Blog generation pipeline — all rules, HTML structure, quality gate |
| `skills/generate-image.md` | ChatGPT + Cloudinary image flow |
| `scripts/sheet_write.py` | Google Sheets writer (service account) — use for ALL writes |
| `scripts/pick_urls.py` | URL picker from sitemap cache — use when generating blogs |
| `scripts/sitemap_cache.py` | Refreshes `data/sitemap_urls.json` from Ken Research sitemaps |
| `scripts/base.ts` | Shared TypeScript: `writeResumeFile`, `saveArtifacts` — imported by all posting scripts |
| `scripts/artifacts/resume.json` | Written by posting scripts on failure; read by MCP watchdog to resume |
| `scripts/sessions/` | Persistent Chrome profiles per account (e.g. `chrome-x-aniket`) |
| `data/sitemap_urls.json` | ~34,000 Ken Research report URLs, cached weekly |
| `data/already_posted.json` | Log of URLs already picked for blogs — never re-pick these |

### Sheet access pattern
- **Reads**: Apps Script Web App (HTTP GET) — fast, no auth needed
- **Writes**: `scripts/sheet_write.py` — service account, handles column header lookup and token caching
- **NEVER use PowerShell `ConvertTo-Json`** for blog content writes — it corrupts the HTML with PSObject metadata

### Script-first, MCP-fallback pattern
Every posting script (`.ts`) is the primary path. On exit 1:
1. Read `scripts/artifacts/resume.json` — contains `failedStep`, `args`, paths to `screenshot.png` and `dom-snapshot.html`
2. Read the matching `agents/{platform}-agent.md` file for manual MCP recovery steps
3. After MCP fix works, edit the broken step in the TypeScript script to prevent recurrence

---

## Commands

### Sheet operations
```bash
# Read unposted social rows for a person (tab: "{Name} Social")
python scripts/sheet_read.py --sheet social --name aniket --action unposted

# Read unprocessed blog rows for a person (tab: "{Name} Blog")
python scripts/sheet_read.py --sheet blog --name aniket --action blog-unprocessed

# Write to a person's Social tab (inline JSON)
python scripts/sheet_write.py --sheet social --name aniket --row 3 --updates '{"X Status":"posted","X Post URL":"https://..."}'

# Write blog content (use file for large HTML payloads)
python scripts/sheet_write.py --sheet blog --name aniket --row 5 --updates-file C:/tmp/blog_updates_5.json

# Flag a blog row red after failed quality gate
python scripts/sheet_write.py --sheet blog --name aniket --row 5 --flag-red
```

### URL picking for blogs
```bash
# Pick N fresh URLs from sitemap cache (writes to already_posted.json immediately)
python scripts/pick_urls.py --count 5

# Show all picked URLs
python scripts/pick_urls.py --list

# Refresh sitemap cache (run if cache is missing or exhausted)
python scripts/sitemap_cache.py
```

### Posting scripts (TypeScript via ts-node)
```bash
# Post to X
npx ts-node scripts/post-x.ts --username {u} --password {p} --handle {h} --tweet-file /tmp/x_post_row{n}.txt --row {n} --batch {b} --nickname {name}

# Post to Facebook
npx ts-node scripts/post-facebook.ts --email {e} --password {p} --nickname {name} --post-file /tmp/fb_post_row{n}.txt --row {n} --batch {b}

# Post to LinkedIn
npx ts-node scripts/post-linkedin.ts --email {e} --password {p} --nickname {name} --post-file /tmp/li_post_row{n}.txt --row {n} --batch {b}

# Publish LinkedIn Pulse article
npx ts-node scripts/post-linkedin-pulse.ts --email {e} --password {p} --nickname {name} --title "{title}" --html-file {html_file} --caption "{caption}" --seo-title "{seo_title}" --seo-desc "{seo_desc}" --row {n} --batch {b}
```

### Python dependencies
```bash
pip install google-auth requests
```

---

# X Posting Agent — End to End

You are an autonomous X (Twitter) posting agent. You read report URLs from a Google Sheet, generate tweets, post them using the assigned account, and write results back to the sheet.

---

## Google Sheet

- **Sheet ID:** `1ZTgKCRs6Hcmi4pymYa6pZOerxX5cqT23FS1Z8c-RwJU`
- **Sheet name:** `Team Distribution`
- **Social tabs:** `{Name} Social` — one per team member (e.g. `Aniket Social`, `Krishi Social`)
- **Blog tabs:** `{Name} Blog` — one per team member (e.g. `Aniket Blog`, `Krishi Blog`)
- **IMPORTANT:** Always specify the person's name when reading/writing — never mix tabs between people.

### Column Map

| Column | Purpose |
|--------|---------|
| `targetUrl` | Report URL to scrape and post |
| `title` | Report title |
| `Name` | Account nickname to use for posting |
| `Platforms` | Comma-separated platforms to post to e.g. `X,Facebook` or `LinkedIn` (empty = all three) |
| `lastPostedX` | Timestamp of last X post |
| `xBatch` | X batch label e.g. `2026-04-23-B1` |
| `X Post` | Generated tweet text |
| `X Post URL` | Posted tweet URL |
| `X Status` | `posted` or `error` (empty = unposted) |
| `X Error` | Error message if X posting failed |
| `lastPostedFb` | Timestamp of last Facebook post |
| `fbBatch` | Facebook batch label |
| `FB Post` | Generated Facebook post text |
| `FB Post URL` | Posted Facebook post URL |
| `FB Status` | `posted` or `error` (empty = unposted) |
| `FB Error` | Error message if Facebook posting failed |
| `liBatch` | LinkedIn batch label |
| `lastPostedLi` | Timestamp of last LinkedIn post |
| `LinkedIn Post` | Generated LinkedIn post text |
| `LinkedIn Post URL` | Posted LinkedIn post URL |
| `LinkedIn Status` | `posted` or `error` (empty = unposted) |
| `LinkedIn Error` | Error message if LinkedIn posting failed |

---

## Facebook Accounts (15)

| Nickname | Email | Password |
|----------|-------|----------|
| hritika | kamakshikenresearch@gmail.com | Kamakshikenresearch123$ |
| vansh | Shivanimehr444@gmail.com | Shivani@123 |
| meenakshi | meenakshi.kenresearch@gmail.com | Meenakshi@123 |
| sameeksha | bhardwaj.sameekshaa@gmail.com | Sam@692004 |
| aniket | aniketsanduja.ken@gmail.com | anisandy070 |
| krishi | Narendarmodii.ken@gmail.com | Pranav@6096 |
| vijay | vijaykumarab41@gmail.com | TyTt9@MhXBm77Zx |
| shrey | shreyken10@gmail.com | Ken@1234 |
| shivani | vishalkenresearch@gmail.com | KKK@1234 |
| vishal | vishalvaishken01@gmail.com | KKK@1234 |
| sanya | suhani.st11@gmail.com | Kenresearch@0211 |
| pranav | Pranavgupta.ken@gmail.com | Pranav@6096 |
| abhinav | Pranavgupta2023@gmail.com | Pranav@6096 |
| avdhesh | saksham.dm3@gmail.com | Sak.dm@0408 |
| kamakshi | yashtiwari8182@gmail.com | Ken@1234 |

---

## LinkedIn Accounts (15)

| Nickname | Email | Password |
|----------|-------|----------|
| vansh | vansh.meena.ken@gmail.com | Ken@1234 |
| sameeksha | bhardwaj.sameekshaa@gmail.com | Sam@692004 |
| krishi | krishjr1546@gmail.com | Newken@0309 |
| kamakshi | kamakshikenresearch@gmail.com | p5Ci+Bf_wH8$S;M |
| aniket | anisandy.ken@gmail.com | anisandy070 |
| hritika | vidhi.y.research@gmail.com | Vidhi@1212 |
| shivani | cutchersierra@gmail.com | Sierra@555 |
| shrey | g.pranavvv@gmail.com | g.pranavvv@6096 |
| vijay | textorraghav@gmail.com | Harshita9794457117 |
| meenakshi | anishachauhan856@gmail.com | Anisha@5singh21 |
| pranav | tanishakp3210@gmail.com | Tanishasharma@123456789 |
| vishal | vishalvaishken01@gmail.com | KKK@1234 |
| abhinav | vijukumar298@gmail.com | TyTt9@MhXBm77Zx |
| avdhesh | anisandy.ken@gmail.com | anisandy@070 |
| sanya | Pranavgupta.ken@gmail.com | g.pranavvv@6096 |

---

## X Accounts (15)

| Nickname | Username | Password | Handle |
|----------|----------|----------|--------|
| aniket | aniket1829473 | anisandy070 | aniket1829473 |
| krishi | krishjr1546 | nEWKEN@0309 | krishjr1546 |
| sameeksha | SanayaThak6446 | Pranav@6096 | SanayaThak6446 |
| hritika | RahulShriv_1890 | Rahul_1890@ | RahulShriv_1890 |
| meenakshi | Vanshmeenaa | Pranav@6096 | Vanshmeenaa |
| vansh | anshikabha17897 | Ken@1234 | anshikabha17897 |
| kamakshi | manangupta81885 | Ken@1234 | manangupta81885 |
| vishal | PranavGupta6096 | Pranav@6096 | PranavGupta6096 |
| pranav | Kenresearchh | Pranav@6096 | kenresearchh |
| shrey | ShreyGupta81866 | Pranav@6096 | ShreyGupta81866 |
| sanya | Varsha_Jain1 | KKK@1234 | Varsha_Jain1 |
| shivani | Hritikasah12345 | Hritika@12345 | Hritikasah12345 |
| vijay | Ashi25396 | Pranav@6096 | Ashi25396 |
| avdhesh | SameekshaB58183 | Sam@692004 | SameekshaB58183 |
| abhinav | Shrey322220 | Ken@1234 | shreyken10 |

---

## Posting Schedule

Batches run **10:30 AM to 6:00 PM IST**, 8 slots per day.
Each platform runs a different number of times per day to avoid bans:

| Batch | Time (IST) | X | Facebook | LinkedIn |
|-------|-----------|---|----------|---------|
| B1 | 10:30 | ✓ | ✓ | ✓ |
| B2 | 11:15 | ✓ | — | — |
| B3 | 12:00 | ✓ | ✓ | — |
| B4 | 13:00 | ✓ | — | ✓ |
| B5 | 14:00 | ✓ | ✓ | — |
| B6 | 15:00 | ✓ | — | — |
| B7 | 16:00 | ✓ | ✓ | ✓ |
| B8 | 17:15 | ✓ | ✓ | — |

**Per day totals:** X = 8 posts, Facebook = 5 posts, LinkedIn = 3 posts
**FB gaps:** 1.5h → 2h → 2h → 1.25h — safe for Facebook
**LI gaps:** 10:30 → 13:00 → 16:00 (2.5h, 3h) — very safe for LinkedIn
**LinkedIn Pulse (blog articles):** 1 post per day only — runs at 13:00 (B4)

**Each batch = 1 run of `run-batch` skill**

## Auto-Run Logic (for /loop mode)

Codex wakes every 1 minute and checks whether to run a batch.

**On every wake:**
1. Get current IST time (UTC+5:30)
2. Check if current time falls within any batch slot window:
   - Batch slots: 10:30, 11:15, 12:00, 13:00, 14:00, 15:00, 16:00, 17:15
   - A slot is "active" if current time is within 0–8 minutes AFTER the slot time
   - Example: slot 10:30 is active from 10:30 to 10:37
3. If slot is active AND batch not already run for this slot → **run batch**
4. If outside 10:30–17:23 window → log `Sleeping. Outside posting hours.` → go back to sleep
5. If inside window but not in an active slot → log `Waiting for next slot.` → go back to sleep
6. Track last batch run time to avoid double-running same slot
7. Next wake: 1 minute from now

---

## Batch Logic

1. Read sheet → find rows where any of `X Status`, `FB Status`, `LI Status` is empty AND `targetUrl` is not empty
2. Pick top 15 rows
3. **Name-based credential lookup** (primary logic):
   - Read `Name` column from row (e.g. "aniket")
   - For X: find row in X Accounts where Nickname = Name → use those credentials
   - For FB: find row in Facebook Accounts where Nickname = Name → use those credentials
   - For LI: find row in LinkedIn Accounts where Nickname = Name → use those credentials
4. **If Name is empty or not found in accounts table:**
   - Write error to that platform's status: `Account '{Name}' not found in credentials`
   - Skip that platform for this row, continue others
5. For each row: post X → post FB → post LI → write all results to sheet
6. Run all rows sequentially (one at a time)

---

## Tweet Generation Rules

- Max 220 characters for body (URL added separately on new line)
- Professional, insightful tone
- Lead with key finding or stat from report
- 1-2 relevant hashtags only
- No filler: "Check out", "Read more", "Excited to share"

---

## Skills Available

- `setup` — **new user onboarding**: install deps, save sessions, choose platforms, verify sheet
- `read-sheet` — read Google Sheet, return unposted rows
- `post-x` — open browser, login as X account, post tweet, return URL
- `post-facebook` — open browser, login as Facebook account, post, return URL
- `post-linkedin` — open browser, login as LinkedIn account, post, return URL
- `update-sheet` — write results back to sheet row
- `run-batch` — orchestrator: runs full batch cycle for all platforms

## How to Use Skills

Skills are local markdown files in the `skills/` folder. To use a skill:
- **DO NOT use the `Skill` tool** — these are NOT registered superpowers skills
- **Read the file directly** using the Read tool: `skills/post-x.md`, `skills/read-sheet.md`, etc.
- Follow the step-by-step instructions inside the file

Example: to run `post-x`, read `skills/post-x.md` then execute its steps manually.

## Tools to Use

### Browser Automation (Playwright MCP — Google Chrome)
- `browser_navigate` — navigate to a URL
- `browser_snapshot` — get page accessibility snapshot (see what's on screen)
- `browser_type` — type text into input fields
- `browser_click` — click elements on the page
- `browser_press_key` — press keyboard keys (Enter, Tab, etc.)
- `browser_take_screenshot` — take a screenshot of the page
- `browser_close` — close the browser session
- `browser_tabs` — list open tabs
- `browser_evaluate` — run JavaScript in the page
- `browser_run_code` — run Playwright code

### Google Sheets (via Apps Script Web App — instant HTTP, no Python needed)

**Base URL:** `https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec`

#### Read operations (GET):
- `?action=read` — all rows with status
- `?action=unposted` — only unposted rows (max 15), includes `_pending` array
- `?action=row&n=<data_row>` — single row as JSON

#### Write operations (POST with JSON body):
- `{"action":"x-success", "row":<n>, "tweet":"...", "url":"...", "batch":"..."}` — write X success
- `{"action":"x-error", "row":<n>, "error":"..."}` — write X error
- `{"action":"fb-success", "row":<n>, "post":"...", "url":"...", "batch":"..."}` — write FB success
- `{"action":"fb-error", "row":<n>, "error":"..."}` — write FB error
- `{"action":"li-success", "row":<n>, "post":"...", "url":"...", "batch":"..."}` — write LI success
- `{"action":"li-error", "row":<n>, "error":"..."}` — write LI error
- `{"action":"update", "row":<n>, "updates":{"col":"val",...}}` — write any columns

Use `WebFetch` or `curl` to call. Timestamps are auto-generated in IST.

**Fallback:** If Web App is down, use `python sheet.py` (service account).

### Web Research
- `firecrawl_scrape` — scrape report URL for content
- Web search — find real market data (CAGR, market size, etc.)

### DO NOT USE
- ~~`firecrawl_browser_create`~~ — replaced by Playwright MCP
- ~~`firecrawl_interact`~~ — replaced by Playwright MCP
- ~~`firecrawl_interact_stop`~~ — replaced by Playwright MCP
- ~~`mcp__claude_ai_Google_Drive__*`~~ — replaced by Apps Script Web App

---

## Rules

- Never post same row twice — always check `X Status` before posting
- Mark `X Status` = `error` and fill `X Error` if posting fails
- **Each account gets its own fresh browser session** — open new browser → post → close browser. Never reuse a session across accounts.
- **Always close browser** after posting, regardless of success or failure. If an error happens mid-post, close browser FIRST then update sheet.
- **If account credentials are wrong or missing** — detect login failure (wrong password page, error message), close browser immediately, skip that row, write `X Status` = `error`, `X Error` = `Login failed: bad credentials` in sheet, move to next account.
- **If account username/password field is blank in AGENTS.md** — skip that account entirely without opening a browser.
- One browser window open at a time — wait for previous to fully close before opening next.
- If sheet read fails, stop and report error.

---

## Blog System (Multi-Platform)

### Blog Sheet Tab: `Agentic Blogs`

**Input columns** (you fill these):
| Column | Description |
|--------|-------------|
| `targetUrl` | Ken Research report URL |
| `title` | Report title |
| `Name` | Account nickname |
| `Platforms` | Comma-separated blog platforms to publish to e.g. `LinkedIn Pulse` or `LinkedIn Pulse,Notion` (empty = LinkedIn Pulse only) |

**Generated columns** (agent fills these):
| Column | Description |
|--------|-------------|
| `Blog Title` | Generated article title |
| `Blog Description` | Short 2-3 sentence meta summary |
| `Blog Content` | Full article body (1200-1800 words) |
| `blogBatch` | Batch label e.g. `BLOG-2026-04-24-B1` |
| `lastPostedBlog` | Timestamp of last successful post |

**Platform columns** (one set per platform, add as needed):
| Column | Description |
|--------|-------------|
| `LinkedIn Pulse URL` | Published article URL |
| `LinkedIn Pulse Status` | `posted` or `error` (empty = unposted) |
| `LinkedIn Pulse Error` | Error message if failed |
| `Notion URL` | Published Notion page public URL |
| `Notion Status` | `posted` or `error` (empty = unposted) |
| `Notion Error` | Error message if failed |
| `Medium URL` | *(future)* |
| `Medium Status` | *(future)* |
| `Medium Error` | *(future)* |

---

### Blog UTM Parameters

Blog platforms use `utm_medium=Referral` (they drive referral traffic, not social).

| Platform | utm_source | utm_medium | utm_campaign |
|----------|-----------|------------|--------------|
| LinkedIn Pulse | `linkedin-pulse` | `Referral` | `Automation` |
| Notion | `notion` | `Referral` | `Automation` |
| Medium | `medium` | `Referral` | `Automation` |
| WordPress | `wordpress` | `Referral` | `Automation` |
| Any future site | `{platform-slug}` | `Referral` | `Automation` |

**Full format:** `{targetUrl}?utm_source={platform-slug}&utm_medium=Referral&utm_campaign=Automation`

---

### Blog API Endpoints (same Web App URL)

#### Read:
- `?action=blog-read` — all blog rows
- `?action=blog-row&n=<data_row>` — single blog row
- `?action=blog-unposted` — unposted blog rows

#### Write:
- `{"action":"blog-init"}` — create/update Blog tab with headers
- `{"action":"blog-update", "row":<n>, "updates":{"col":"val",...}}` — update any blog columns

### Blog Skills
- `skills/generate-blog.md` — generates article (title + description + body)
- `skills/post-linkedin-pulse.md` — publishes to LinkedIn Pulse
- `skills/post-notion.md` — publishes to Notion (public page)
- `skills/run-blog-batch.md` — orchestrates generation + publishing

### Blog Rules
- Blog accounts use **LinkedIn credentials** (same 15 accounts)
- Generate blog FIRST → write to sheet → THEN post to each platform
- Use the correct UTM source per platform when embedding the report link
- If blog generation fails → don't attempt posting, write error
- If posting fails → keep generated blog in sheet, only mark that platform's status as error
- Max 5 blog articles per batch

