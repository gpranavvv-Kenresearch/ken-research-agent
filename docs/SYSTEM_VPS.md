# VPS System — the Hostinger server (`srv1828409`)

> This repo runs **two completely different posting systems from the same code**.
> This file documents the **VPS** one. For the laptop, see [SYSTEM_LOCAL_VISHAL.md](SYSTEM_LOCAL_VISHAL.md).
> The VPS **never sets `PREFER_ROW_NAME`**, so account selection always follows the
> per-worker numbered-slot logic (opposite of local).

## What it is, in one line
A daily rotation that runs **6 separate agents one after another** (each as its own `WORKER_NAME`), where each agent posts from **its own personal sheet** using its **numbered account slots**, headed on a virtual display.

## VPS vs Local — at a glance
| | **VPS** | Local (Vishal) |
|---|---|---|
| Machine | Hostinger `srv1828409` (`root@200.97.170.123`) | the Windows laptop |
| Started by | PM2 apps `social-rotation` + `blogpost-rotation` (daily, wait for their IST start) + cron/`flock` watchdog for `nightly-blog-rotation.ts` (continuous) | `npm run schedule` (a window) |
| Orchestrator | `nightly-social-rotation.ts` / `nightly-blogpost-rotation.ts` / `nightly-blog-rotation.ts` — **per-agent rotation** | `scheduler-new.ts` — 5-stage narrowing |
| Schedule | Social **08:00 IST** (per-account passes, 4 batches); Blog-platform posting **08:30 IST** (per-account passes, 2 batches); Blog generation **continuous**, 1 blog per person per turn | 11:00 & 23:00 IST |
| Worker(s) | **6**: vijay → hritika → sanya → meenakshi → vansh → sameeksha (each rotation walks them in this order; the two posting rotations run as independent processes but their cycles serialize through the box-wide post-cycle job slot) | 1 (`vishal`) |
| `PREFER_ROW_NAME` | **unset** → `WORKER_NAME` wins | `true` → row's Name wins |
| Account picked | **numbered worker slot** (`sanya 1`, `sanya 2`): social rotation pins it per pass via `POST_ACCOUNT_INDEX`; blog-platform posting and "Post Now" round-robin | bare name from the row |
| Session path | **`.sessions-{agent}/{platform}-{N}`** (e.g. `.sessions-sanya/x-1`) | `.sessions/x/{name}` |
| Sheet | **each agent's own personal sheet**, `{Agent} Social/Blog` tab | one shared "Vishal Social" tab |
| `HEADLESS` | **`false`** — headed via Xvfb `:99` (needed for Cloudflare) | `true` |

## Deprecated: the old `scheduler`
The PM2 app **`scheduler`** (`scheduler-new.ts`, the 5-stage cycle) is **stopped/deprecated on the VPS**. It is *not* how the VPS posts. (It **is** what the laptop uses.) Don't read its logs to reason about VPS behavior.

## How it runs (three independent processes, under the `deploy` user)
| Process | Runs as | What |
|---|---|---|
| `scripts/nightly-social-rotation.ts` | PM2 `social-rotation` (`bash -c "npx tsx scripts/nightly-social-rotation.ts"`) | X / FB / LinkedIn post / Mastodon / Tumblr, daily from **08:00 IST**, per-account passes |
| `scripts/nightly-blogpost-rotation.ts` | PM2 `blogpost-rotation` | Medium / Pulse / WordPress / Notion / … , daily from **08:30 IST**, per-account passes × 2 batches |
| `scripts/nightly-blog-rotation.ts` | cron `*/15 * * * *` + `flock -n /tmp/blog-rotation.lock` watchdog (starts it only if not already running) | blog **generation**, continuous, 1 blog per person per turn |

- The two posting processes never share state. Every child post cycle takes the **box-wide `post-cycle` job slot** (`run-post-cycle-once.ts` → `jobQueue.ts`), so cycles from the two processes interleave, never overlap. If both want the **same agent** at once, `runPostCycleToCompletion` (`postCycle.ts`) waits for the running one and then runs its own — never skips.
- Headed browsers run on the **Xvfb `:99`** virtual display (PM2: `xvfb`/`fluxbox`/`x11vnc`), so Cloudflare-protected platforms work without a real screen. `login-api` is also PM2.
- `scripts/rotation-health-check.ts` (cron, every 2 h) reads each process's log (`/tmp/nightly-social-rotation.log`, `/tmp/nightly-blogpost-rotation.log`, `/tmp/nightly-blog-rotation.log`) → `.sessions/rotation-health.json` → admin dashboard "Scheduled runs" pills.
- **Manual single-agent run:** `DISPLAY=:99 WORKER_NAME=<agent> POST_CYCLE_COUNTS='{"x":1}' POST_ACCOUNT_INDEX=2 node --import=tsx scripts/run-post-cycle-once.ts` (post 1 on X from that agent's account #2) or `... scripts/run-blog-generator.ts --name <agent> --limit 1 --image-prompt 1` (one blog).
- **Dry run of today's plan (posts nothing):** `npx tsx scripts/nightly-social-rotation.ts --plan` / `npx tsx scripts/nightly-blogpost-rotation.ts --plan`. The pass/batch/step engine both share is `src/rotation/accountPasses.ts`.

## Social posting flow, step by step
1. `nightly-social-rotation.ts` holds `AGENTS = [vijay, hritika, sanya, meenakshi, vansh, sameeksha]` and the quota **per account per day**: `x 4 · fb 4 · lipost 3 · mastodon 2 · tumblr 2` (same for everyone; `SOCIAL_DAILY_TARGET` overrides).
2. At **08:00 IST** it reads `.accounts/account-counts.json` (the "Accounts" number each member typed per platform on their dashboard page) and builds the day:
   - **Account pass 1** (everyone's account #1): batch 1 — each agent in order posts 1 on x, fb, lipost, mastodon, tumblr → batch 2 — same again (mastodon/tumblr now at 2, drop out) → batch 3 — x, fb, lipost (lipost at 3, drops out) → batch 4 — x, fb (at 4, done).
   - **Account pass 2** — the same 4 batches, only for agents who declared an account #2 on that platform; everyone else is skipped, nothing posted. Then pass 3, … up to the highest declared count.
3. One step = one agent × one batch × one account → `startPostCycle(agent, {x:1, fb:1, …}, {POST_ACCOUNT_INDEX: N})` → `run-post-cycle-once.ts` with **`WORKER_NAME={agent}`** → `runCountedPostCycle` = one round, then it exits.
4. Each batch reads the agent's own sheet and, for the row it picks: `selectAccountForPlatform(WORKER_NAME, 'x', …)` → **`POST_ACCOUNT_INDEX=N` pins `"{agent} N"`** (no round-robin, rotation state untouched) → session **`.sessions-{agent}/x-N`** → post.
5. A row counts as "Posted" on a platform once, whichever account posted it — 2 X accounts need 8 fresh X-eligible rows a day. A dry sheet logs "No rows available" and the step just completes.

## Blog-platform posting flow
`nightly-blogpost-rotation.ts`: same agents, **08:30 IST**, the same per-account-pass engine as social. Quota **per account per day: 2 on every blog platform, 1 on Medium and LinkedIn Pulse**. Each pass = **batch 1** (Medium lead: `medium, googlepost, <5 rotated pairs>`) then **batch 2** (Pulse lead: `lipulse, googlepost, <5 rotated pairs>`), each agent in order posting 1 per platform on which they declared an account #N. Medium and Pulse must stay in different batches: blog platforms claim a row's 2 slots in adjacent pairs (2-slot claim model, pair lead rotated via `.cache/blog-pair-rotation.json`), and both are paired with Google Sites. The account is pinned per pass with `POST_ACCOUNT_INDEX`; the dashboard's "Post Now" keeps using round-robin.

## Blog generation flow
`nightly-blog-rotation.ts`: same agents in the same order, **continuous** — each person's turn generates **1 blog** (`run-blog-generator.ts --limit 1`, written to their own sheet immediately, using their own ChatGPT session), 10 min break, next person; 1 h break after a full lap. Sanity checks / preferred-source CTA / brand check run per blog before the sheet write.

## Sheets
- Migrated agents each have a **personal spreadsheet** (`PERSONAL_SHEET_ID` in `sheets.ts` / `sheet_read.py` / `sheet_write.py` / dashboard `userConfig.ts`): **sanya, meenakshi, hritika, vansh, sameeksha, vijay**.
- Tab names come from `WORKER_NAME`: `{Sanya} Social`, `{Sanya} Blog`.
- Agents not migrated read the shared book's `{Name} Social/Blog` tabs.

## Accounts & sessions
- Registries hold **numbered slots** created via the dashboard's session-only login (`registerFleetAccount`): `sanya 1`, `abhinav 1`..`abhinav 12`, etc.
- Sessions live per-agent: **`.sessions-{agent}/{platform}-{N}`** — e.g. `.sessions-abhinav/x-1`, `.sessions-sanya/fb-1`, `.sessions-vijay/note-1`.
- `.sessions-cookies/` holds cookie snapshots.

## Key env (VPS `.env`)
```
WORKER_NAME=abhinav       # base identity; post-rotation OVERRIDES it per agent at spawn
HEADLESS=false            # headed, on Xvfb :99 (Cloudflare needs a real browser)
# PREFER_ROW_NAME is NOT set  -> per-worker numbered-slot selection
```
The base `WORKER_NAME=abhinav` only matters when nothing overrides it (blog-gen default). During the rotation, `startPostCycle` sets `WORKER_NAME={agent}` for each child.

## System services also present
Redis (idle), nginx (fronts login-api on :8080→:8090), Tailscale Funnel (`agent-login.taildbacce.ts.net`) exposes the dashboard API. Docker disabled. 4 GB swap added. See the memory notes for the ops history.

## Deploy path (no auto-sync)
`/opt/ken/repo` (git clone) → `git pull` → `rsync -a --delete /opt/ken/repo/src/ /home/deploy/full-team-agent/src/` and `rsync -a /opt/ken/repo/scripts/ /home/deploy/full-team-agent/scripts/` (code only; never over `.env`/`.accounts`/`.sessions*`). PM2 runs under the **`deploy`** user. Restart the rotation apps only when **idle** (never mid-cycle) — they post nothing until their next IST start, so restarting after today's run is safe.

## Key files
| File | Role |
|---|---|
| `scripts/nightly-social-rotation.ts` | the 6-agent SOCIAL posting rotation, per-account passes (08:00 IST) |
| `scripts/nightly-blogpost-rotation.ts` | the 6-agent BLOG-PLATFORM posting rotation, per-account passes × 2 batches (08:30 IST) |
| `src/rotation/accountPasses.ts` | the shared pass → batch → agent → step engine (plan, `--plan` dump, run) |
| `scripts/nightly-blog-rotation.ts` | the 6-agent blog GENERATION rotation (continuous, 1 blog/person/turn) |
| `scripts/rotation-health-check.ts` | did each rotation run today? → `.sessions/rotation-health.json` |
| `src/login-portal/postCycle.ts` | `startPostCycle` → spawns a run with `WORKER_NAME={agent}` |
| `scripts/run-post-cycle-once.ts` | one agent's counted cycle |
| `src/coordinator/masterCoordinator.ts` | per-platform batches |
| `src/utils/accountRotation.ts` | `selectAccountForPlatform` (numbered slots when no `PREFER_ROW_NAME`; `POST_ACCOUNT_INDEX=N` pins account #N) |
