# PRD — Ken Research Distribution Platform
**Version:** 2.0  
**Author:** Pranav Gupta  
**Status:** Active  
**Last Updated:** 2026-06-05

---

## 1. Overview

Ken Research has 11 team members who distribute market research reports across 14+ platforms. This PRD defines a fully automated, team-facing platform where:

- Any team member opens the dashboard, selects their profile, submits a report URL
- The system auto-generates a blog in the chosen format (Format 1/2/3) using Claude
- The system auto-posts to all selected platforms using that person's saved browser session
- The team member tracks real-time status from the same dashboard

**Core principle: The existing pipeline (Claude Code skills + TypeScript posting scripts) stays exactly as-is. It just moves from running on Pranav's PC to running on a free Oracle Cloud VM.**

---

## 2. Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────┐
│         Frontend — Vercel (free)            │
│         Next.js Dashboard                   │
│         Any team member opens from anywhere │
│         Selects profile → submits URL       │
│         Tracks status in real time          │
└──────────────────┬──────────────────────────┘
                   │ Writes to Google Sheet
┌──────────────────▼──────────────────────────┐
│         Google Sheets (free)                │
│         22 tabs — 11 Social + 11 Blog       │
│         Source of truth for everything      │
└──────────────────┬──────────────────────────┘
                   │ Watched by Oracle VM
┌──────────────────▼──────────────────────────┐
│         Oracle Cloud Always Free VM         │
│         4 CPU cores, 24GB RAM, 200GB disk   │
│         Ubuntu 22.04 ARM — free forever     │
│                                             │
│  Process 1: claude /loop                   │
│  └── skills/watch-and-generate.md          │
│      Reads all 11 Blog tabs every 2 min    │
│      Finds empty Blog Content rows         │
│      Generates blog by Format 1/2/3        │
│      Writes back to sheet                  │
│                                             │
│  Process 2: npm run schedule               │
│  └── src/scheduler-new.ts                  │
│      Reads all 11 Blog tabs                │
│      Matches Name → session folder         │
│      Posts via Playwright + Chrome         │
│      Writes URLs + status back to sheet    │
│                                             │
│  scripts/sessions/                         │
│  └── chrome-linkedin-krishi/               │
│  └── chrome-medium-sameeksha/              │
│  └── chrome-x-aniket/                      │
│  └── ... (one per account per platform)    │
└─────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
1. Team member opens dashboard (Vercel)
2. Selects their name (e.g. Krishi)
3. Submits: URL + Title + Format + Platforms
4. Dashboard writes row to "Krishi Blog" tab in Google Sheet
5. Oracle VM — claude /loop wakes up (every 2 min)
   → Sees new row with empty Blog Content
   → Reads Format column (e.g. "Format 2")
   → Generates blog using Format 2 prompt template
   → Writes Blog Title + Blog Content + Rating to sheet
6. Oracle VM — npm run schedule fires at batch time
   → Reads "Krishi Blog" tab
   → Finds generated but unposted rows
   → Looks up "Krishi" session in scripts/sessions/
   → Opens Chrome with Krishi's saved session
   → Posts to each selected platform
   → Writes post URLs + status back to sheet
7. Dashboard auto-refreshes → team member sees all statuses live
```

---

## 3. What Stays the Same (No Changes)

| Component | Status |
|-----------|--------|
| `skills/generate-blog.md` | Unchanged — same generation logic |
| `scripts/sessions/` | Unchanged — same Chrome session folders |
| `src/browser/*/` | Unchanged — same Playwright posting scripts |
| `src/scheduler-new.ts` | Minor update — reads new tabs |
| `dashboard/` | Minor update — Socket.io for real-time |
| All account credentials | Unchanged |
| Google Sheet structure | Unchanged |

---

## 4. What Needs to Be Built

### 4.1 Generation Watcher (`skills/watch-and-generate.md`)

New Claude Code skill that runs in `/loop` mode on the Oracle VM.

**Behaviour on every wake (every 2 minutes):**
1. Read all 11 Blog tabs from Google Sheet
2. Collect rows where `targetUrl` is not empty AND `Blog Content` is empty
3. Sort by `Submitted At` (oldest first)
4. Take the first pending row
5. Read `Format` column — route to correct prompt:
   - `Format 1` → `skills/prompts/format1.md` (SEO-Li, data-heavy)
   - `Format 2` → `skills/prompts/format2.md` (LinkedIn Pulse, editorial)
   - `Format 3` → `skills/prompts/format3.md` (Testing Demo, tables/FAQs)
6. Run generation (same quality gate as existing `generate-blog.md`)
7. Write `Blog Title`, `Blog Content`, `Blog Description`, `Rating`, `Cover Image URL` to that user's tab
8. Log result → move to next pending row if time allows
9. Sleep → wake again in 2 minutes

### 4.2 Format Prompt Templates

Three prompt files defining how each format is generated:

**`skills/prompts/format1.md`** — SEO-Li style
- 1200–1400 words
- Data-heavy: CAGR, market size, key players
- Blue theme HTML with Cloudinary cover image
- 10–12 interlinks to kenresearch.com
- Structure: H1 → intro stat → 4-5 H2 sections → FAQs → CTA

**`skills/prompts/format2.md`** — LinkedIn Pulse style
- 900–1200 words
- Editorial narrative, professional tone
- Indigo theme HTML
- Shorter paragraphs, more personal insight
- Structure: Hook → context → 3–4 key findings → implications → CTA

**`skills/prompts/format3.md`** — Testing Demo style
- 1000–1300 words
- Driver/restraint tables, FAQ section
- Teal theme HTML
- Structured data presentation
- Structure: Overview → market drivers table → restraints table → segments → FAQs

### 4.3 Posting Engine Update (`src/scheduler-new.ts`)

**Current behaviour:** reads from single `Agentic Sheet` tab

**New behaviour:** reads from all 11 `{Name} Blog` tabs
- Loop through all 11 Blog tabs
- For each tab: find rows where `Blog Content` is filled AND platform status is empty
- Match `Name` column → load that person's session from `scripts/sessions/`
- Post using existing `src/browser/` scripts (unchanged)
- Write results back to the same tab row

### 4.4 Oracle VM Setup (One-Time)

```bash
# Install dependencies
sudo apt update
sudo apt install -y nodejs npm git
sudo npm install -g ts-node @anthropic-ai/claude-code

# Install Chrome for Playwright
npx playwright install chromium
npx playwright install-deps

# Install local Redis (for any future queuing needs)
sudo apt install -y redis-server

# Clone repo
git clone <repo-url> ~/agents
cd ~/agents && npm install

# Copy sessions from PC (one time)
scp -r ./scripts/sessions/ user@<oracle-ip>:~/agents/scripts/sessions/

# Set environment variables
export ANTHROPIC_API_KEY=...
export GOOGLE_SERVICE_ACCOUNT_JSON=...
export OPENROUTER_API_KEY=...   # already have 15 keys

# Authenticate Claude Code
claude login

# Start processes (use PM2 to keep alive)
npm install -g pm2
pm2 start "claude" --name "generation" -- --loop   # generation watcher
pm2 start "npm run schedule" --name "posting"       # posting scheduler
pm2 save
pm2 startup   # auto-restart on VM reboot
```

---

## 5. Tech Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Next.js 16 on Vercel | Free |
| Database | Google Sheets API v4 | Free |
| Generation | Claude Code CLI + Anthropic API | Existing subscription |
| Posting | Playwright + Chromium | Free |
| Sessions | Local folder on Oracle VM | Free |
| Process manager | PM2 | Free |
| Server | Oracle Cloud Always Free ARM VM | Free forever |
| **Total** | | **₹0/month** |

---

## 6. Oracle Cloud Free Tier Details

| Resource | Allocation | Notes |
|----------|-----------|-------|
| CPU | 4 ARM cores | More than enough |
| RAM | 24 GB | Runs 4–5 Chrome instances simultaneously |
| Storage | 200 GB | All sessions + repo + logs |
| Network | 10 TB/month | No limit for this use case |
| Cost | ₹0 forever | Not a trial — permanent free tier |
| Signup | cloud.oracle.com | Needs credit card for identity, never charged |

---

## 7. Implementation Roadmap

### Phase 1 — Generation Watcher (Week 1)
**Goal:** Submitted URLs auto-generate blogs without any manual action

| Task | Details |
|------|---------|
| 1.1 | Write `skills/prompts/format1.md` — SEO-Li prompt template |
| 1.2 | Write `skills/prompts/format2.md` — LinkedIn Pulse prompt template |
| 1.3 | Write `skills/prompts/format3.md` — Testing Demo prompt template |
| 1.4 | Write `skills/watch-and-generate.md` — watcher skill, reads all 11 tabs |
| 1.5 | Test locally: submit URL → watcher picks it up → generates → writes to sheet |
| 1.6 | Verify format routing works (Format 1/2/3 produce different HTML styles) |

**Test:** Submit a URL from dashboard → blog appears in sheet within 5 minutes

---

### Phase 2 — Oracle VM Setup (Week 1–2)
**Goal:** Pipeline runs on Oracle VM, not on Pranav's PC

| Task | Details |
|------|---------|
| 2.1 | Create Oracle Cloud account + ARM VM (Ubuntu 22.04, 4 cores, 24GB) |
| 2.2 | Install Node.js, Chrome, Playwright, ts-node, Claude Code CLI |
| 2.3 | Clone agents/ repo onto VM |
| 2.4 | Transfer `scripts/sessions/` from PC to VM via scp |
| 2.5 | Set all environment variables |
| 2.6 | Authenticate Claude Code on VM (`claude login`) |
| 2.7 | Install PM2, start both processes, configure auto-restart |
| 2.8 | Verify: VM generates blogs + posts without PC being on |

**Test:** Turn off PC → submit URL from dashboard → blog generates + posts from VM

---

### Phase 3 — Posting Engine Update (Week 2)
**Goal:** Posting reads from all 11 user tabs, matches correct session per person

| Task | Details |
|------|---------|
| 3.1 | Update `src/scheduler-new.ts` to loop through all 11 Blog tabs |
| 3.2 | Add Name → session folder mapping |
| 3.3 | Add Name → credential lookup (X, FB, LI accounts from CLAUDE.md) |
| 3.4 | Test: Krishi submits → Krishi's session used for posting |
| 3.5 | Test: multiple users submit → each uses their own session |
| 3.6 | Verify results written back to correct user's tab |

**Test:** Sameeksha submits URL → Sameeksha's accounts post on all platforms

---

### Phase 4 — Dashboard Polish (Week 3)
**Goal:** Dashboard gives team full visibility without needing to open sheet

| Task | Details |
|------|---------|
| 4.1 | Show generation status per row (Pending / Generating / Generated / Failed) |
| 4.2 | Show posting status per platform with clickable URLs |
| 4.3 | Add queue indicator — how many rows pending generation |
| 4.4 | Add error display — if generation or posting fails, show why |
| 4.5 | Keep SWR polling every 15s (no need for WebSockets — sheet is source of truth) |

**Test:** Submit URL → dashboard shows every step without refreshing manually

---

## 8. Session Management

Sessions are Chrome profile folders that contain saved cookies — already logged into each platform.

```
scripts/sessions/
├── chrome-x-aniket/              ← aniket's X session
├── chrome-x-krishi/
├── chrome-facebook-hritika/
├── chrome-linkedin-vansh/
├── chrome-medium-krishi/
├── chrome-devto-sameeksha/
└── ... (one per account per platform)
```

**First-time setup per account:**
1. Run login script locally on PC (already exists)
2. Session saved to `scripts/sessions/`
3. Copy folder to Oracle VM — works immediately (cookies transferred)
4. Never need to log in again unless session expires

**If session expires:**
1. VM detects login failure
2. Writes error to sheet
3. Pranav logs into that account on PC
4. Copies fresh session to VM
5. Job retries automatically

---

## 9. Batch Schedule (Unchanged)

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

Generation runs continuously (every 2 min) so by the time a batch fires, the blog is already ready.

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Time from URL submit to blog generated | < 5 minutes |
| Time from generation to all platforms posted | Next batch slot |
| Team interaction required | Zero — just submit URL |
| Pranav's PC required | No |
| Monthly cost | ₹0 |

---

## 11. Open Questions

1. Should generation run for ALL pending rows back-to-back, or one per wake cycle?
2. If a session expires mid-batch, skip that platform or retry next batch?
3. Should Format be locked per user (e.g. Krishi always Format 1) or always let them choose?
