# Mission Five Thousand

**Scaling strategy: 1,000-1,100 posts/day → 5,000 posts/day**

This document is a truth-based capacity and cost assessment, not a commitment or a code
change. Everything below is either confirmed live on the running production VPS, confirmed by
reading the actual source code (file:line citations included), or sourced from a live pricing
search (cited). Genuine estimates are labeled as estimates, not presented as fact.

---

## Where things stand today

- 2 agents (abhinav, krishi), each running an independent 5-stage posting scheduler on one
  Hostinger VPS, firing twice daily (11 AM and 11 PM IST).
- Combined real output: **~1,000-1,100 posts/day**.
- Target: **5,000 posts/day** — roughly a 4.5-5x increase.

---

## Part 1 — Ground truth (what's confirmed right now)

### The VPS is already at its ceiling with just ONE agent running
- 2 vCPUs (AMD EPYC 9354P slice), 7.7GB RAM, 96GB disk (30% used — disk is not a constraint).
- With only abhinav's scheduler active, load average climbed from ~2.0 (already ~100% of
  2-core capacity) to **6-8** within a few hours — a 3-4x overload, observed directly via
  `uptime`/`top`/`ps aux` on the live box.
- Root cause isolated: it is **not** just heavy legitimate load. Browser processes for
  platforms the scheduler had already *finished* (HackMD, Calisthenics) were still running
  live minutes/hours later, confirmed via `ps aux` — a genuine zombie-process accumulation
  bug, not just "the work is slow."

### Why browsers don't die cleanly
- `retryOnSelectorTimeout` (`src/utils/retry.ts:21-39`) does up to 3 attempts, and **each
  retry relaunches a brand-new browser** rather than reusing state — every failed attempt can
  leave its own orphan behind.
- Platforms like Medium/WordPress/Notion/Devto/GoogleSite/Substack/HackMD **do** correctly
  wrap browser close in a `finally` block (e.g. `src/browser/medium/login.ts:42-48`), but
  these launch the **real system Chrome** (`headless:false`, real `chrome.exe`/`google-chrome`
  binary) via `chromium.launchPersistentContext`, not Playwright's managed bundled Chromium.
  A correctly-executed `finally` calling `context.close()` does **not** guarantee the
  OS-level Chrome process tree (main + GPU + renderer + utility, several processes per
  "one" browser) actually exits — exactly matching the live HackMD/Calisthenics observation.
- `scheduler-new.ts`'s `withTimeout()` (:97-104) abandons the *promise* after 5 minutes
  (`PLATFORM_TIMEOUT_MS`) but never kills the underlying browser — it just stops waiting.
  The automation keeps running in the background indefinitely.
- This repo already has the *right* pattern for this problem, just not applied here:
  `src/login-portal/cdpLoginPool.ts`'s `killChromeGracefully`/`killGroup` (SIGTERM, poll,
  SIGKILL fallback) — but that pool spawns Chrome itself and holds a real PID; the 17
  `src/browser/*/login.ts` files call `launchPersistentContext` directly, which exposes no
  PID/process handle on the returned `Browser`/`BrowserContext` (confirmed against
  Playwright's own type definitions) — the exact kill function can't be reused verbatim
  without a bigger refactor.

### Zero concurrency governance exists anywhere
- Posting is strictly sequential *within* one scheduler (`runStage()`,
  `scheduler-new.ts:128-138` — a plain `for` loop over platforms).
- But there is **no coordination between processes**: a repo-wide search for
  semaphore/queue/concurrency-limiting code found nothing related to browser launching.
  Two scheduler processes (differentiated only by a `WORKER_NAME` env var) already run fully
  independently today with zero shared awareness — confirmed live: krishi's scheduler had to
  be stopped specifically because a manual login session for krishi caused visible lag while
  abhinav's scheduler was mid-post, on just this one box.

### Per-account daily "ban avoidance" caps are 100% descriptive, 0% enforced
- `CLAUDE.md` documents X=8/day, FB=5/day, LI=3/day per account "to avoid bans," with batch
  timing designed around that.
- `masterCoordinator.ts` **does** define the scaffolding (`BatchCounters`, `ZERO_COUNTERS`,
  `getCounters`/`saveCounters`/`resetBatchCounters`, :154-196) — but nothing in the codebase
  ever increments a counter per post or checks one against a cap before posting.
  `resetBatchCounters()` is called only by a midnight cron that zeroes the (unused) file.
  **There is currently no code-level protection against over-posting a single account.**

### Account inventory is better than initially feared, but still a real constraint
- Verified live: abhinav's fleet already has **11 working X accounts, 12 working Facebook
  accounts, 8 working LinkedIn accounts** (fleet-style `"abhinav 1"`–`"abhinav 12"`, all
  confirmed `ready`). Krishi's equivalents are still being built out.
- Verified live: `Abhinav Social` sheet tab already uses these fleet-style nicknames
  exclusively (not an older flat 15-name registry) — so there's **no cross-agent account
  collision today** for abhinav, since fleet nicknames are agent-prefixed by construction.
  This resolves what would otherwise be a real double-posting/ban risk.
- If X/FB/LI caps were actually enforced (they aren't yet — see above), abhinav's current
  accounts alone support at most: X 11×8=88/day, FB 12×5=60/day, LI 8×3=24/day ≈ **172/day**
  from just these 3 platforms. Getting materially past that requires proportionally more
  accounts, not just more server power — this is a hard, physics-of-bans constraint, not a
  compute one.

### Long-form blog generation has a hard, structural ceiling (accepted, not being changed)
- `scripts/generate_blog_chatgpt.ts` drives real ChatGPT via browser automation:
  12-15 min per article, `blogCycle.ts` runs 5 articles then a 30-min pause, in a loop.
- Math: 5 × (12-15 min) = 60-75 min work + 30 min pause ≈ 90-105 min per cycle →
  13.7-16 cycles/day → **~68-80 articles/day per agent, running continuously** — the
  theoretical max; today it only runs during the gap between posting sessions, so real
  throughput is lower.
- **Decision: this stays as-is.** 5,000/day is reached mainly through the faster
  short-form/social platforms, not by pushing blog-article volume.

### What is NOT a bottleneck
- Short-form content generation (tweets, FB posts, LI posts) is already fast: direct HTTP
  API calls to OpenRouter/NVIDIA NIM (`contentAgentNew.ts:136-179`), seconds not minutes,
  19-key rotation pool. Scales easily, no change needed.
- Google Sheets API usage (~2+3N calls per batch run, exponential-backoff retry already
  implemented) is not expected to bind before much higher volume than 5,000/day.
- Row-picker exhaustion is graceful (`pickNextSequentialBlogRows`,
  `src/sheets/sheets.ts:1481-1531` — returns fewer rows, never errors). This means hitting
  5,000/day also requires enough actual report URLs queued in the sheets — a content/ops
  requirement running in parallel with the technical fixes, not a code problem.

---

## Part 2 — What's wrong / what can't be done as-is

1. **This box cannot safely run more than ~1 agent concurrently today.** Adding a second
   scheduler on top without a fix makes the already-observed overload materially worse.
2. **Naively raising row-limits or adding more agents right now is actively dangerous**, not
   just slow: with zero per-account cap enforcement, more volume on the same accounts risks
   real bans, which would set usable capacity back further than any server constraint would.
3. **The zombie-process bug will keep degrading any deployment over time**, agent count aside
   — needs fixing regardless of the 5,000/day goal, purely to keep today's baseline stable.
4. **2 vCPU is a hard ceiling for concurrent real-Chrome automation.** Confirmed, not
   theoretical — one scheduler alone drove load to 4x capacity. No tuning fixes this; it
   needs more compute.
5. **1,000-1,100/day → 5,000/day is roughly a 4.5-5x increase**, and every lever that gets
   there (accounts, compute, content) needs to move by roughly that same factor together —
   moving only one will not get there on its own, and moving one without the others is
   actively risky.

---

## Part 3 — The Strategy: three tracks, moved together

Reaching 5,000/day safely requires three tracks to scale roughly in proportion —
reliability, accounts/content, and compute. None alone gets there; skipping any one caps or
endangers the other two.

### Track 1 — Reliability fixes (prerequisite for everything else)
Three specific engineering fixes, independent of scale target — needed just to keep today's
2-agent baseline stable, let alone a bigger one:
- **Zombie-process cleanup** — reuse the graceful-kill pattern already proven elsewhere in
  this codebase (`cdpLoginPool.ts`'s `killChromeGracefully`), applied after every browser
  close and after each failed retry attempt.
- **A system-wide concurrency governor** — nothing today stops multiple schedulers (or a
  scheduler + a manual dashboard login) from launching browsers simultaneously and
  overloading the box. Fix: a simple slot-based cap, tunable per box size.
- **Real per-account daily posting caps** — wire the existing-but-unused `BatchCounters`
  scaffolding so it actually enforces X=8/day, FB=5/day, LI=3/day per account. This is the
  fix that actually protects accounts as volume grows, rather than relying on luck.

### Track 2 — Accounts and content, scaled in proportion
- Reaching higher volume on the ban-sensitive platforms (X, FB, LinkedIn) requires
  proportionally more distinct accounts — a platform-ban constraint, not a technical one.
  Abhinav alone already has 11 working X, 12 working Facebook, 8 working LinkedIn accounts;
  at documented safe caps that's already ~172/day from just those 3 platforms for one agent.
- The other ~13 blog-syndication platforms (Medium, Notion, Substack, HackMD, Dev.to,
  WordPress, Blogger, Google Sites, etc.) are less ban-sensitive and mostly capped by
  **content availability** (report URLs queued in the sheet), not account scarcity — these
  can grow fastest once content supply keeps up.
- Practically: budget for roughly **5x today's total account count** across agents by full
  scale, built out gradually alongside Track 3's compute rollout.
- The fleet system already in place (`.sessions-{agent}/{platform}-{index}`, agent-prefixed
  nicknames) scales to any number of agents/accounts with no code changes and already
  prevents cross-agent account collisions.

### Track 3 — Horizontal compute scaling
- Confirmed: 2 vCPU already overloads under just ~1 concurrent real-Chrome session. Real
  headed-Chrome automation needs roughly 1.5-2 vCPU of headroom per concurrent browser
  session, plus 1-2 vCPU baseline for OS/Node/cron/Sheets-API overhead.
- **Recommended: several smaller VPS boxes, not one giant one.** Each box is fully
  self-contained — own concurrency cap, own exclusive slice of agents/accounts, no
  cross-machine coordination ever required. Also bounds blast radius: one box overloading
  never drags the others down.
- Concretely: plan for **4-6 boxes** at a mid-size tier, added incrementally as Track 2's
  account count actually grows — no need to buy it all upfront.

### Explicitly out of scope
- Long-form blog article generation stays on ChatGPT-in-browser, keeping its ~68-80
  articles/day/agent ceiling. 5,000/day is reached mainly through the faster short-form
  platforms.
- One low-risk idea worth knowing about even though it's out of scope: the cover-image step
  already uses DALL-E 3 through ChatGPT's browser UI — swapping that one step for a direct
  OpenAI Images API call (same model, no quality tradeoff) would free up a Chrome-session's
  worth of concurrency budget per article.

---

## Cost Breakdown

Infrastructure pricing below is from a live search (cited), not memorized. Figures marked
"estimate" are genuine estimates, not sourced quotes.

### Compute (VPS hosting)
- Current box tier: ~2 vCPU / 8GB — Hostinger's closest published match is **KVM 2** at
  **$8.99/month** (2 vCPU, 8GB RAM, 100GB NVMe, 8TB bandwidth).
- Recommended scale-up tier: **KVM 4** at **$14.99/month** (4 vCPU, 16GB RAM, 200GB NVMe).
- **4-6 boxes × $14.99/month = $59.96–$89.94/month** for the full horizontal compute layer —
  a genuinely small number relative to the 5x volume target; compute is not where the real
  cost of this scale-up lives.
- **Caveat**: Hostinger VPS renewal pricing (after the first 12/24-month promotional term)
  is reported to jump 140-232% above the first-term rate — budget for the renewal rate, not
  just the intro price, on any 12+ month plan.
- Sources: [Hostinger VPS pricing](https://www.hostinger.com/vps-hosting),
  [smarthostfinder.com breakdown](https://smarthostfinder.com/hostinger-vps-pricing/)

### Ban-risk mitigation: proxies (recommended, not currently in use)
- Running many more accounts from the same handful of VPS IPs raises automated-behavior
  detection risk as account count grows — today's setup uses no proxies at all.
- Real 2026 market pricing for residential proxies: roughly **$1-4/GB** at
  mid-to-enterprise volume tiers (budget options $0.70-1/GB, premium/mobile $5-15/GB).
- Estimate: a lightly-active automation account likely uses ~0.5-2GB/month. At ~60-100
  total accounts once Track 2 is built out, that's roughly **50-200GB/month →
  ~$50-800/month** depending on provider tier — get a real quote before budgeting a firm
  number.
- Sources: [Databay proxy pricing breakdown](https://databay.com/blog/how-much-do-residential-proxies-cost),
  [DataImpulse pricing comparison](https://dataimpulse.com/blog/residential-proxy-pricing-comparison/)

### Accounts
- Credentials/accounts are being provided directly rather than acquired through this plan,
  so account acquisition itself isn't priced here. If any accounts need fresh phone/SMS
  verification during setup, that's typically well under $2-3/number via existing
  verification-number services.

### Engineering effort (Track 1 fixes)
- Not a cash cost, but worth sizing: the three Track 1 fixes are each moderate-sized,
  well-scoped changes reusing patterns already proven elsewhere in this repo — realistically
  a handful of focused engineering sessions, not a multi-week rebuild.

### What does NOT add new cost
- Short-form content generation already runs on largely free-tier OpenRouter/NVIDIA NIM API
  keys — expected to keep scaling fine at 5x volume.
- Blog-article generation (ChatGPT-in-browser) stays as-is — no new API spend.
- Google Sheets API usage is free at this scale, even at 5x.

### Rough total monthly cost estimate at full 5,000/day scale
| Item | Estimate |
|---|---|
| Compute (4-6 VPS boxes) | ~$60-90/month (sourced) |
| Proxies (recommended, optional) | ~$50-800/month (wide estimate) |
| Everything else | No material new recurring cost identified |

This is a small number in absolute terms — the real cost of this initiative is mostly
**account acquisition/management and engineering time for Track 1**, not server bills.

---

## Timeline (rough, sequenced by dependency — not a committed schedule)

1. **Track 1 fixes first** — before touching scale at all. Everything else is unsafe to
   build on top of an unfixed baseline.
2. **Track 2 (accounts/content) and Track 3 (compute) grow together, incrementally** — add a
   box, add accounts to fill it, verify stability, repeat. Avoid provisioning all compute or
   all accounts upfront before the other is ready to use it.
3. **Re-check the numbers at each doubling** (~2,000/day, then ~3,500/day, then 5,000/day)
   rather than jumping straight to the end target — empirical load-testing (watching real
   `uptime`/`ps aux` output) is cheap and already caught one serious bug; keep using it at
   each step rather than trusting the math alone.

---

## Risks to keep in view

1. **Ban risk is the real ceiling, not compute.** Even with unlimited servers, posting past
   safe per-account limits risks losing accounts faster than new ones can be onboarded —
   this is why Track 1's cap enforcement has to land before Track 2/3 scale up.
2. **Renewal pricing shock** on VPS boxes (140-232% jump after the first term) — budget for
   the renewal rate, not just the attractive intro price, when sizing a 12+ month total cost.
3. **Content supply is a silent cap.** The row-picker simply returns fewer rows if there
   isn't enough queued content — under-delivery here looks like "the system isn't working"
   when it's actually "there's nothing left to post," a different problem with a different fix.
4. **Proxy cost is the least-certain number in this document** — real and sourced as a
   range, but actual usage depends on provider choice and real account activity — get a
   quote before treating it as a firm budget line.
