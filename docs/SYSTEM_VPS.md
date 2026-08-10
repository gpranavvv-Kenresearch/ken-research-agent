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
| Started by | **PM2**: `post-rotation` + `blog-rotation` (persistent) | `npm run schedule` (a window) |
| Orchestrator | `nightly-post-rotation.ts` / `nightly-blog-rotation.ts` — **per-agent rotation** | `scheduler-new.ts` — 5-stage narrowing |
| Schedule | Post **08:00 IST** (2 rounds, 1 h gap); Blog **00:00 IST** (2 cycles, 5 blogs each) | 11:00 & 23:00 IST |
| Worker(s) | **6**: sanya → meenakshi → vansh → sameeksha → hritika → vijay (sequential, never concurrent) | 1 (`vishal`) |
| `PREFER_ROW_NAME` | **unset** → `WORKER_NAME` wins | `true` → row's Name wins |
| Account picked | **numbered worker slot** (`sanya 1`, `sanya 2`, round-robin) | bare name from the row |
| Session path | **`.sessions-{agent}/{platform}-{N}`** (e.g. `.sessions-sanya/x-1`) | `.sessions/x/{name}` |
| Sheet | **each agent's own personal sheet**, `{Agent} Social/Blog` tab | one shared "Vishal Social" tab |
| `HEADLESS` | **`false`** — headed via Xvfb `:99` (needed for Cloudflare) | `true` |

## Deprecated: the old `scheduler`
The PM2 app **`scheduler`** (`scheduler-new.ts`, the 5-stage cycle) is **stopped/deprecated on the VPS**. It is *not* how the VPS posts. (It **is** what the laptop uses.) Don't read its logs to reason about VPS behavior.

## How it runs (PM2, under the `deploy` user)
```bash
sudo -u deploy pm2 list                 # post-rotation, blog-rotation, login-api, xvfb/vnc/fluxbox
sudo -u deploy pm2 restart post-rotation
```
- `post-rotation` → `scripts/nightly-post-rotation.ts` (long-lived, waits for 08:00 IST, then runs).
- `blog-rotation` → `scripts/nightly-blog-rotation.ts` (waits for 00:00 IST).
- Headed browsers run on the **Xvfb `:99`** virtual display (with `fluxbox`/`x11vnc`), so Cloudflare-protected platforms work without a real screen.

## Posting flow, step by step
1. `nightly-post-rotation.ts` holds `AGENTS = [sanya, meenakshi, vansh, sameeksha, hritika, vijay]`.
2. At **08:00 IST** it loops the agents **sequentially** — waits for each agent's whole cycle to finish before the next (never two at once).
3. For each agent it calls `startPostCycle(agent, counts)` → spawns `run-post-cycle-once.ts` with **`WORKER_NAME={agent}`** → `runCountedPostCycle` in `masterCoordinator.ts`.
4. Counts per round: X 2, FB 2, LinkedIn 2; blog platforms 1 each; **LinkedIn Pulse round 1 only, Medium round 2 only**. 2 rounds/day (1 h apart).
5. Each batch reads the agent's own sheet and, for each row:
   - `selectAccountForPlatform(WORKER_NAME || row.name, 'x', row.name)`.
   - **`PREFER_ROW_NAME` is unset**, so `WORKER_NAME` (e.g. `sanya`) wins.
   - `accountRotation.ts` picks the **numbered slot**: `sanya 1` (or round-robins `sanya 1`..`sanya N` if several are registered), persisted in a rotation file so cycles keep advancing.
   - That resolves to the session **`.sessions-sanya/x-1`** and posts.

## Blog flow
`nightly-blog-rotation.ts`: same 6 agents, **00:00 IST**, **2 cycles/day**, **5 blogs each**, via `run-blog-generator.ts` (WORKER_NAME per agent). Fills the day; posting rotation handles the social side.

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
`/opt/ken/repo` (git clone) → `git pull` → `rsync -a --delete /opt/ken/repo/src/ /home/deploy/full-team-agent/src/` (src only; never over `.env`/`.accounts`/`.sessions*`). PM2 runs under the **`deploy`** user. Restart rotation apps only when **idle** (never mid-cycle).

## Key files
| File | Role |
|---|---|
| `scripts/nightly-post-rotation.ts` | the 6-agent posting rotation (08:00 IST) |
| `scripts/nightly-blog-rotation.ts` | the 6-agent blog rotation (00:00 IST) |
| `src/login-portal/postCycle.ts` | `startPostCycle` → spawns a run with `WORKER_NAME={agent}` |
| `scripts/run-post-cycle-once.ts` | one agent's counted cycle |
| `src/coordinator/masterCoordinator.ts` | per-platform batches |
| `src/utils/accountRotation.ts` | `selectAccountForPlatform` (numbered slots when no `PREFER_ROW_NAME`) |
