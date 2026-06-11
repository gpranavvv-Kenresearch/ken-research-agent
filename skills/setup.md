# Skill: Setup — New User Onboarding

Run this skill once after cloning the repo. It installs dependencies, saves browser sessions for chosen platforms, and verifies the sheet connection.

---

## Step 1: Prerequisites Check

Verify the following are installed:

```bash
node --version        # must be v18+
python --version      # must be 3.9+
npx ts-node --version # must be present
```

If missing:
- Node.js: https://nodejs.org (LTS)
- Python: https://python.org
- ts-node: `npm install -g ts-node typescript`

Install project dependencies:
```bash
npm install
pip install google-auth requests
```

---

## Step 2: Choose Your Platforms

Decide which platforms you want to post to. Write them down — you will use this list in Step 4 (session setup) and when filling the sheet.

**Social platforms:**
- `X` — Twitter/X posts
- `Facebook` — Facebook page/profile posts
- `LinkedIn` — LinkedIn feed posts

**Blog platforms:**
- `LinkedIn Pulse` — LinkedIn long-form articles
- `Notion` — Notion public pages
- `Medium` — Medium articles *(future)*
- `WordPress` — WordPress posts *(future)*

You do NOT need to enable all platforms. Only save sessions for the platforms you actually want to use.

---

## Step 3: Add Credentials to CLAUDE.md

Open `CLAUDE.md` and fill in your account rows under each platform's table. Each account needs a `Nickname` — this is what you write in the `Name` column of the sheet.

If you are a single user (not a team), add just one row per platform with a nickname like `admin` or your name.

---

## Step 4: Save Browser Sessions

For each platform you chose in Step 2, run the matching local-login script below. This opens a browser, lets you log in manually, and saves the session so future automated posts do not need to log in again.

### X (Twitter)
```bash
npx ts-node scripts/local-login.ts --platform x --nickname {your-nickname}
```
Browser opens → log in manually → close browser → session saved to `scripts/sessions/chrome-x-{nickname}/`

### Facebook
```bash
npx ts-node scripts/local-login.ts --platform facebook --nickname {your-nickname}
```

### LinkedIn (feed posts + LinkedIn Pulse)
```bash
npx ts-node scripts/local-login.ts --platform linkedin --nickname {your-nickname}
```
One saved session covers both LinkedIn feed posts and LinkedIn Pulse articles.

**Repeat for every account nickname listed in CLAUDE.md.**

---

## Step 5: Verify Sheet Connection

Run a quick read to confirm the Apps Script Web App is reachable:

```bash
curl "https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec?action=unposted"
```

Expected: JSON with `rows` array (may be empty if no unposted rows yet). If you get an HTML error page, check that the Web App is deployed as "Anyone" access.

---

## Step 6: Add a Test Row to the Sheet

Open the `Agentic Sheet` tab in the Google Sheet and add one row:

| Column | Value |
|--------|-------|
| `targetUrl` | Any Ken Research report URL |
| `title` | Report title |
| `Name` | Your nickname (must match Step 3) |
| `Platforms` | Comma-separated list of platforms from Step 2, e.g. `X,LinkedIn` |

Leave all status columns empty. The automation will fill them.

**For the blog sheet (`Agentic Blogs` tab):**

| Column | Value |
|--------|-------|
| `targetUrl` | Ken Research report URL |
| `title` | Report title |
| `Name` | Your nickname |
| `Platforms` | Blog platforms you want, e.g. `LinkedIn Pulse` or `LinkedIn Pulse,Notion` |

---

## Step 7: Run a Manual Test Batch

```bash
# In Claude Code terminal, run one batch manually:
# Read the run-batch skill and follow it for one row
```

Or trigger via the loop:
```
/loop
```
Claude will wake every minute, detect the next scheduled batch slot, and post the row.

---

## Step 8: Set Up Scheduled Automation (Optional)

To run automatically without keeping Claude open, set up a cron job or Windows Task Scheduler entry that runs the loop skill at each batch slot.

### Windows Task Scheduler
Create 8 triggers per day (one per batch slot):

| Slot | Time (IST = UTC+5:30) | UTC equivalent |
|------|-----------------------|----------------|
| B1 | 10:30 | 05:00 |
| B2 | 11:15 | 05:45 |
| B3 | 12:00 | 06:30 |
| B4 | 13:00 | 07:30 |
| B5 | 14:00 | 08:30 |
| B6 | 15:00 | 09:30 |
| B7 | 16:00 | 10:30 |
| B8 | 17:15 | 11:45 |

Action: `claude -p "Read skills/run-batch.md and execute one full batch now."`

### Linux/macOS cron
```cron
# Run batch at each IST slot (adjust UTC offset for your server timezone)
0 5 * * 1-5 cd /path/to/repo && claude -p "Read skills/run-batch.md and execute one full batch now."
```

---

## Platforms Column Reference (Quick Sheet Guide)

When filling the `Platforms` column in either sheet, use these exact values (case-insensitive, comma-separated):

**Social sheet (`Agentic Sheet`):**
```
X
Facebook
LinkedIn
X,Facebook
X,LinkedIn
Facebook,LinkedIn
X,Facebook,LinkedIn
```

**Blog sheet (`Agentic Blogs`):**
```
LinkedIn Pulse
Notion
LinkedIn Pulse,Notion
Medium
LinkedIn Pulse,Medium,Notion
```

If you leave `Platforms` empty, the automation posts to **all platforms** by default.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Session expired, login prompt during post | Re-run `local-login.ts` for that account |
| `Account 'X' not found in credentials` sheet error | Check `Name` column matches CLAUDE.md nickname exactly |
| Platform skipped even though status is empty | Check `Platforms` column — value must match the normalised list above |
| Sheet write fails | Run `pip install google-auth requests` and check `.accounts/google-service-account.json` exists |
| Apps Script returns HTML error | Re-deploy the Web App with "Execute as: Me" and "Who has access: Anyone" |
