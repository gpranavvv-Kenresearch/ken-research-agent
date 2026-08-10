# Local System — the "Vishal" fleet (this Windows machine)

> This repo runs **two completely different posting systems from the same code**.
> This file documents the **LOCAL** one. For the server, see [SYSTEM_VPS.md](SYSTEM_VPS.md).
> The single switch that makes the code behave differently is **`PREFER_ROW_NAME`**
> (set locally, never on the VPS).

## What it is, in one line
One worker (`WORKER_NAME=vishal`) reads **one sheet tab** whose **Name column lists 12 different people**, and posts each row **as that person's own account**, headless, from a PowerShell window on the laptop.

## VPS vs Local — at a glance
| | **Local (Vishal)** | VPS |
|---|---|---|
| Machine | this Windows laptop | Hostinger `srv1828409` |
| Started by | `npm run schedule` (a PowerShell window) | PM2 apps `post-rotation` + `blog-rotation` |
| Orchestrator | `scheduler-new.ts` — **5-stage narrowing** | `nightly-post-rotation.ts` — **per-agent rotation** |
| Schedule | **11:00 & 23:00 IST** | Post **08:00 IST** (2 rounds), Blog **00:00 IST** |
| Worker(s) | **1** (`vishal`) | **6** (sanya→meenakshi→vansh→sameeksha→hritika→vijay) |
| `PREFER_ROW_NAME` | **`true`** → the row's Name wins | **unset** → `WORKER_NAME` wins |
| Account picked | **bare name from the row** (`avdhesh`, `vansh`, …) | **numbered worker slot** (`sanya 1`, `sanya 2`, …) |
| Session path | **`.sessions/x/{name}`** (flat, per person) | `.sessions-{agent}/{platform}-{N}` |
| Sheet | **one** "Vishal Social/Blog" tab, Name varies per row | each agent's **own** personal sheet |
| `HEADLESS` | **`true`** (no windows) | `false` (headed via Xvfb `:99` for Cloudflare) |

## How to run it
```powershell
cd "C:\Users\N8N\Desktop\full team agent"
npm run schedule        # cron-only: waits, fires at 11:00 & 23:00 IST
npm run schedule:now    # fires a session immediately + keeps the crons
```
- Runs only while the PowerShell window is **open** (no PM2 here). Close window = it stops.
- `Ctrl+C` then re-run to pick up any `.env` change (dotenv loads once at startup).

## The flow, step by step
1. `npm run schedule` → `src/index.ts` → `scheduler-new.ts` `startCoordinatorDaemon`.
2. At 11:00/23:00 IST (or immediately with `:now`) it starts a **5-stage narrowing** session — Stage 1 = all platforms, narrowing to Stage 5 = X/FB/Google Sites, 30 min between stages.
3. For each platform it calls the batch in `masterCoordinator.ts` (e.g. `runXBatch`).
4. The batch reads unposted rows from **`Vishal Social`** (see Sheets below) and, for each row:
   - `selectAccountForPlatform(WORKER_NAME || row.name, 'x', row.name)`.
   - **Because `PREFER_ROW_NAME=true`**, `accountRotation.ts` ignores the worker and uses **`row.name`** → e.g. `Avdhesh`.
   - `getAccountByHandle('Avdhesh')` → the bare entry in `.accounts/accounts.json` → **`.sessions/x/avdhesh`**.
   - Logs into that session and posts, then writes the result back to that row.

## The sheet (the key difference)
- Sheet ID: **`1ZTgKCRs6Hcmi4pymYa6pZOerxX5cqT23FS1Z8c-RwJU`** (the shared "Team Distribution" book — vishal is **not** on a personal sheet).
- Tabs: **`Vishal Social`** and **`Vishal Blog`** (name comes from `WORKER_NAME`: `{Vishal} Social`).
- **Column C `Name` holds a rotating list of 12 people** per row: Vishal, Vansh, Meenakshi, Hritika, Sameeksha, Pranav, Shrey, Sanya, Shivani, Vijay, Abhinav, Avdhesh. That Name is what each row posts as.
- A blank Name falls back to `WORKER_NAME` (vishal).

## Accounts & sessions
- `.accounts/accounts.json` (X): 12 **bare** entries — `{ handle:"", nickname:"vansh", sessionDir:".sessions/x/vansh" }`, etc. No numbered slots.
- X sessions live at **`.sessions/x/{name}`** (flat, one folder per person). Other platforms resolve their own `sessionDir` from their registry (`.accounts/facebook-accounts.json`, etc.).
- **Each `.sessions/x/{name}` must be logged in** to that person's X account, or the row fails `LOGIN_REQUIRED:{name}`.

## Key env (`.env`, gitignored — LOCAL values)
```
WORKER_NAME=vishal        # selects the "Vishal Social/Blog" tabs
PREFER_ROW_NAME=true      # <-- makes account selection use the row's Name, not the worker
HEADLESS=true             # no browser windows
```
`PREFER_ROW_NAME` is the one flag that flips the whole account-selection behavior. It is **only** set here; the VPS never sets it.

## Headless notes
- `HEADLESS=true` runs X, Facebook, and all standard blog platforms headless (no windows).
- **4 platforms stay headed even so** — LinkedIn (`li_at` revoked headless), Calisthenics/Linkmate/Medium (Cloudflare Turnstile). They launch minimized. Forcing them headless makes them fail.

## Operating tips / gotchas
- **Browser-slot hang:** a Ctrl+C'd run leaves `.sessions/slots/*.lock`; the next run hangs silently on it (`MAX_BROWSERS=1`). Fix: `rm -f .sessions/slots/*.lock .sessions/slots/*/*.lock`.
- **`.env` changes need a restart** (dotenv loads once).
- Verify sessions are logged in before relying on a full rotation.

## Key files
| File | Role |
|---|---|
| `src/scheduler-new.ts` | 5-stage narrowing orchestrator (`npm run schedule`) |
| `src/coordinator/masterCoordinator.ts` | per-platform batches |
| `src/utils/accountRotation.ts` | `selectAccountForPlatform` (+ `PREFER_ROW_NAME` switch) |
| `src/sheets/sheets.ts` | sheet/tab resolution from `WORKER_NAME`; row → account mapping |
| `src/config/accounts.ts` | `getAccountByHandle` → session dir |
| `.accounts/accounts.json` | local X fleet (bare names → `.sessions/x/{name}`) |
