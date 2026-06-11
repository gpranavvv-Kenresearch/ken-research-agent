# Skill: Run Batch — Full Multi-Platform Posting Cycle

This orchestrator runs one full batch: X + Facebook + LinkedIn for all assigned rows.

## When to Run
8 slots per day, 10:30–17:15 IST. Each platform runs on specific batches only:

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

---

## Phase 1: Setup
1. Note current IST time and date
2. Generate batch label: `YYYY-MM-DD-B{N}` (11:00=B1, 11:45=B2, 12:30=B3, 13:00=B4, 13:45=B5, 14:30=B6, 15:00=B7, 15:45=B8)

---

## Phase 2: Read Sheet
GET the Apps Script Web App:
```
https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec?action=unposted
```
Returns JSON with up to 15 unposted rows. Each row has `_dataRow`, `_pending` array.

If 0 rows → log "No unposted rows. Batch done." and stop.

---

## Phase 2.5: Resolve Per-Row Platform Selection

For each row, read the `Platforms` column (e.g. `X,Facebook` or `LinkedIn` or empty).

**Rules:**
- If `Platforms` is **empty** → treat as `X,Facebook,LinkedIn` (post to all, existing behaviour)
- If `Platforms` is set → parse as comma-separated list; normalise each token:
  - `x` / `X` / `twitter` / `Twitter` → **X**
  - `fb` / `FB` / `facebook` / `Facebook` → **Facebook**
  - `li` / `LI` / `linkedin` / `LinkedIn` → **LinkedIn**
- Store the resolved set for the row (e.g. `{X, Facebook}`).
- This is checked **before** the batch-schedule gate in Phase 4: if a platform is not in the row's set, skip it for that row regardless of batch schedule.

---

## Phase 3: Assign Accounts via Name Column

For each row, read `Name` column (e.g. "aniket"). Look up that nickname in each platform's credential list below.

**If Name found** → use those credentials for that platform.
**If Name empty or not found** → do NOT post to that platform. POST errors to Apps Script Web App:
```json
{"action":"x-error", "row":<row>, "error":"Account '{Name}' not found in X credentials"}
{"action":"fb-error", "row":<row>, "error":"Account '{Name}' not found in FB credentials"}
{"action":"li-error", "row":<row>, "error":"Account '{Name}' not found in LI credentials"}
```

### X Accounts:
1. aniket — username: aniket1829473 | password: anisandy070 | handle: aniket1829473
2. krishi — username: krishjr1546 | password: nEWKEN@0309 | handle: krishjr1546
3. sameeksha — username: SanayaThak6446 | password: Pranav@6096 | handle: SanayaThak6446
4. hritika — username: RahulShriv_1890 | password: Rahul_1890@ | handle: RahulShriv_1890
5. meenakshi — username: Vanshmeenaa | password: Pranav@6096 | handle: Vanshmeenaa
6. vansh — username: anshikabha17897 | password: Ken@1234 | handle: anshikabha17897
7. kamakshi — username: manangupta81885 | password: Ken@1234 | handle: manangupta81885
8. vishal — username: PranavGupta6096 | password: Pranav@6096 | handle: PranavGupta6096
9. pranav — username: Kenresearchh | password: Pranav@6096 | handle: kenresearchh
10. shrey — username: ShreyGupta81866 | password: Pranav@6096 | handle: ShreyGupta81866
11. sanya — username: Varsha_Jain1 | password: KKK@1234 | handle: Varsha_Jain1
12. shivani — username: Hritikasah12345 | password: Hritika@12345 | handle: Hritikasah12345
13. vijay — username: Ashi25396 | password: Pranav@6096 | handle: Ashi25396
14. avdhesh — username: SameekshaB58183 | password: Sam@692004 | handle: SameekshaB58183
15. abhinav — username: Shrey322220 | password: Ken@1234 | handle: shreyken10

### Facebook Accounts:
1. hritika — email: kamakshikenresearch@gmail.com | password: Kamakshikenresearch123$
2. vansh — email: Shivanimehr444@gmail.com | password: Shivani@123
3. meenakshi — email: meenakshi.kenresearch@gmail.com | password: Meenakshi@123
4. sameeksha — email: bhardwaj.sameekshaa@gmail.com | password: Sam@692004
5. aniket — email: aniketsanduja.ken@gmail.com | password: anisandy070
6. krishi — email: Narendarmodii.ken@gmail.com | password: Pranav@6096
7. vijay — email: vijaykumarab41@gmail.com | password: TyTt9@MhXBm77Zx
8. shrey — email: shreyken10@gmail.com | password: Ken@1234
9. shivani — email: vishalkenresearch@gmail.com | password: KKK@1234
10. vishal — email: vishalvaishken01@gmail.com | password: KKK@1234
11. sanya — email: suhani.st11@gmail.com | password: Kenresearch@0211
12. pranav — email: Pranavgupta.ken@gmail.com | password: Pranav@6096
13. abhinav — email: Pranavgupta2023@gmail.com | password: Pranav@6096
14. avdhesh — email: saksham.dm3@gmail.com | password: Sak.dm@0408
15. kamakshi — email: yashtiwari8182@gmail.com | password: Ken@1234

### LinkedIn Accounts:
1. vansh — email: vansh.meena.ken@gmail.com | password: Ken@1234
2. sameeksha — email: bhardwaj.sameekshaa@gmail.com | password: Sam@692004
3. krishi — email: krishjr1546@gmail.com | password: Hehehe@123
4. kamakshi — email: kamakshikenresearch@gmail.com | password: p5Ci+Bf_wH8$S;M
5. aniket — email: anisandy.ken@gmail.com | password: anisandy070
6. hritika — email: vidhi.y.research@gmail.com | password: Vidhi@1212
7. shivani — email: cutchersierra@gmail.com | password: Sierra@555
8. shrey — email: g.pranavvv@gmail.com | password: g.pranavvv@6096
9. vijay — email: textorraghav@gmail.com | password: Harshita9794457117
10. meenakshi — email: anishachauhan856@gmail.com | password: Anisha@5singh21
11. pranav — email: tanishakp3210@gmail.com | password: Tanishasharma@123456789
12. vishal — email: vishalvaishken01@gmail.com | password: KKK@1234
13. abhinav — email: vijukumar298@gmail.com | password: TyTt9@MhXBm77Zx
14. avdhesh — email: anisandy.ken@gmail.com | password: anisandy@070
15. sanya — email: Pranavgupta.ken@gmail.com | password: g.pranavvv@6096

---

## Phase 3.5: Generate Post Content per Row

For EACH row, before posting to any platform:

### Step A — Extract market name from URL
Take the last path segment of `targetUrl`, replace hyphens with spaces, keep all words including geo.
Example: `bahrain-aerogel-market` → `Bahrain aerogel market`

### Step B — Web search for market data
Search: `"{market name} market size CAGR 2024 2025 2030"`
Extract: market size (USD), CAGR %, key companies, dominant region.
Only use real numbers found — never invent stats.

### Step C — Generate X tweet using this prompt:

```
You are a market insights social media writer for X (Twitter).

Extract market name from URL (last path segment, hyphens → spaces, keep geo words).

Write the X post in this EXACT style:
Example A: "Aerogel market in Bahrain is gearing up for a game-changing outlook..."
Example B: "Global woodpulp market valued at $52B is set for a 4.2% CAGR..."
Example C: "Big shifts ahead in the oil gas epc services market..."

FORMAT RULES:
- ONE flowing block, no blank lines
- 1 or 2 sentences max, no em dashes
- Weave ONE specific number naturally if web data has CAGR/market size
- End with CTA phrase + colon + URL on same line, then 2 hashtags
- CTA rotation: "Explore the momentum building now:", "Full outlook:",
  "See what's driving the shift:", "Dive into the full picture:", etc.

POWER PHRASES (rotate):
- "game-changing outlook", "big shifts ahead", "surging demand",
  "exciting changes on the horizon", "gearing up for",
  "innovation accelerating growth", "industry momentum builds"

CHARACTER RULE: Text (excl. URL) must be ≤ 230 chars
OUTPUT: Only the tweet, no quotes, no emojis, no explanation
URL must be exactly: {targetUrl}?utm_source=x&utm_medium=social+organic&utm_campaign=Automation
```

### Step D — Generate Facebook post using this prompt:

```
You are a professional B2B content writer who acts as an independent
industry observer — NOT affiliated with Ken Research.

POST STRUCTURE (5 sections, one blank line between each):
1. Opening Hook — randomly pick 1 of 5 styles:
   Style 1: insight-driven with market size/CAGR figure
   Style 2: warning-tone "shifting faster than most suppliers realise"
   Style 3: striking number as standalone sentence "$X billion. That is..."
   Style 4: contrarian "Most coverage focuses on X. Real growth is elsewhere"
   Style 5: forward-looking "By [year], the [market] will look completely different"

2. Context & Scale — 2 sentences, specific numbers from web data
3. Key Highlights — exactly 4 bullet points "• [stat] — [insight]"
4. Future-Oriented Closing — 2 sentences on investment/demand trends
5. CTA (one of 5 approved variations, must say "Ken Research")
   + UTM URL on same line: {targetUrl}?utm_source=facebook&utm_medium=social+organic&utm_campaign=Automation
   + 6-10 hashtags on last line

RULES:
- No emojis, no bold, no markdown
- No "Ken Research" in body (only in CTA line)
- No "report", "study", "analysis" in body
- Only use numbers from web search data — never invent stats
- Output ONLY the post text
```

### Step E — Generate LinkedIn post using this prompt:

```
You are a senior B2B market strategist writing for procurement heads,
investors, and industry executives.

POST STRUCTURE (5 sections, one blank line between each):
1. Hook — randomly pick 1 of 6 styles:
   Style 1: "If you assume..." or "If your team still treats..." + market figure
   Style 2: striking number + "Leading procurement teams are already acting"
   Style 3: contrarian "Everyone is tracking X. Real value is elsewhere"
   Style 4: prediction "By [year], the [market] will be unrecognisable"
   Style 5: direct question "When [condition hits], which contracts do you have?"
   Style 6: declarative "The [market] is consolidating faster than most..."

2. Market reality — 2 sentences, exact USD figures + CAGR + dominant region
3. "What B2B leaders must watch" — exactly 4 bullet points:
   "• [stat or company name] — [one sharp insight]"
4. Strategic implication — 1-2 directly actionable sentences
5. Fixed CTA:
   "Full competitive benchmarking, segment forecasts, and regional breakdowns from Ken Research: {targetUrl}?utm_source=linkedin&utm_medium=social+organic&utm_campaign=Automation"
   + 4-6 B2B hashtags on last line

RULES:
- Independent expert voice, not affiliated with Ken Research
- No emojis, no bold, no markdown
- Only figures from web search data — never invent
- Output ONLY the post text
```

Store all three generated texts in memory for the row before opening any browser.

---

## Phase 4: Post Each Row

For each row, run platforms IN ORDER: X → Facebook → LinkedIn
**Check current batch label FIRST** — only run platforms scheduled for this batch:
- X runs every batch (B1–B8)
- Facebook runs B1, B3, B5, B7, B8 only (10:30, 12:00, 14:00, 16:00, 17:15)
- LinkedIn runs B1, B4, B7 only (10:30, 13:00, 16:00)

If current batch not in platform's schedule → skip that platform for ALL rows this batch.

### For each row:

**Before posting any platform for a row:** check the row's resolved platform set from Phase 2.5. If the platform is not in the set, skip it silently — do not write an error, just move on.

**4a. Post to X** (only if row's `X Status` is empty AND `X` is in row's platform set)
- Use the tweet generated in Phase 3.5 Step C
- Look up row's `Name` in X Accounts list → get username + password + handle
- If not found → POST x-error to Apps Script → skip
- Write tweet text to temp file `/tmp/x_post_row{n}.txt`, then run:
  ```
  npx ts-node scripts/post-x.ts --username {u} --password {p} --handle {h} --tweet-file /tmp/x_post_row{n}.txt --row {n} --batch {b} --nickname {name}
  ```
- **Exit 0** → done ✓
- **Exit 1** → WATCHDOG:
  1. Read `scripts/artifacts/resume.json`
  2. Read `agents/x-agent.md`
  3. Follow x-agent.md exactly — complete post via MCP, fix script, update sheet
  4. Continue to next platform

**4b. Post to Facebook** (only if row's `FB Status` is empty AND `Facebook` is in row's platform set AND current batch is B1, B3, B5, B7, or B8 — i.e. 10:30, 12:00, 14:00, 16:00, 17:15)
- Use the Facebook post generated in Phase 3.5 Step D
- Look up row's `Name` in Facebook Accounts list → get email + password
- If not found → POST fb-error to Apps Script → skip
- Write post text to temp file `/tmp/fb_post_row{n}.txt`, then run:
  ```
  npx ts-node scripts/post-facebook.ts --email {e} --password {p} --nickname {name} --post-file /tmp/fb_post_row{n}.txt --row {n} --batch {b}
  ```
- **Exit 0** → done ✓
- **Exit 1** → WATCHDOG:
  1. Read `scripts/artifacts/resume.json`
  2. Read `agents/facebook-agent.md`
  3. Follow facebook-agent.md exactly — complete post via MCP, fix script, update sheet
  4. Continue to next platform

**4c. Post to LinkedIn** (only if row's `LI Status` is empty AND `LinkedIn` is in row's platform set AND current batch is B1, B4, or B7 — i.e. 10:30, 13:00, 16:00)
- Use the LinkedIn post generated in Phase 3.5 Step E
- Look up row's `Name` in LinkedIn Accounts list → get email + password
- If not found → POST li-error to Apps Script → skip
- Write post text to temp file `/tmp/li_post_row{n}.txt`, then run:
  ```
  npx ts-node scripts/post-linkedin.ts --email {e} --password {p} --nickname {name} --post-file /tmp/li_post_row{n}.txt --row {n} --batch {b}
  ```
- **Exit 0** → done ✓
- **Exit 1** → read `scripts/artifacts/resume.json` → MCP fallback via `skills/post-linkedin.md`
- On login failure → error must include email

**On any failure:** write error to sheet via sheet.py, close browser, move on — never stop batch.

---

## Phase 5: Batch Summary

```
=== Batch {label} Complete ===
Rows processed: {N}
X:  {posted} posted, {errors} errors
FB: {posted} posted, {errors} errors
LI: {posted} posted, {errors} errors
```

---

## Tools Used

| Task | Tool |
|------|------|
| Read/write sheet | Apps Script Web App (HTTP GET/POST) |
| Browser automation | Playwright MCP (`browser_navigate`, `browser_snapshot`, `browser_type`, `browser_click`, `browser_close`, `browser_press_key`, `browser_take_screenshot`) |
| Web research | Web search or `firecrawl_scrape` |

**Web App URL:** `https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec`

## Notes
- Always update sheet immediately after each platform post via Web App POST
- Each post = its own browser session (navigate → post → close)
- Never reuse browser across accounts or platforms
- If sheet read fails → stop and report
- Max 15 rows × 3 platforms = 45 posts per batch
- **Fallback:** If Web App is down, use `python sheet.py` commands
