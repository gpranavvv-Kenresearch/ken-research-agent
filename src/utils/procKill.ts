import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getLinkedInAccounts } from '../browser/linkedin/login.js';

/**
 * Graceful-kill every process whose command line contains `needle` (a fixed
 * string), SIGTERM first then SIGKILL only for whatever's still alive after a
 * real grace window, on Linux/macOS.
 *
 * Implemented with `ps | grep -F | grep -v grep | awk | kill` rather than
 * `pkill -f`, on purpose: `pkill -f <pattern>` also matches the shell running
 * pkill (its own argv contains the pattern) and SIGTERMs it mid-escalation — so
 * the follow-up SIGKILL never fires and a stuck browser survives. Every process
 * in THIS pipeline that carries the needle also carries the literal "grep" and
 * is removed by `grep -v grep`, so the pipeline never signals itself.
 *
 * Polls for each PID's actual exit (up to 3s) instead of a blind fixed sleep —
 * this used to sleep exactly 2s then force-kill UNCONDITIONALLY, even a process
 * that had already exited cleanly, or one that was 200ms from flushing on its
 * own. Chrome batches cookie writes to its on-disk SQLite DB rather than
 * flushing on every set, so a forced SIGKILL mid-flush can throw away a
 * just-completed login's cookies before they ever reach disk. This mirrors the
 * proven-safe teardown the login portal already uses (displayPool.ts
 * killChromeGracefully) — poll for real exit, only escalate what's still alive.
 * Real-world impact: this is the kill used before every posting-time browser
 * launch (killChromeForProfile), including LinkedIn's fallback-index wrapping
 * that reuses the same few real accounts across many sheet rows in one batch —
 * so the SAME session directory could get killed and relaunched repeatedly
 * within a single run, and every one of those kills used to risk wiping a
 * session's login cookie via this unsafe force-kill.
 */
export function gracefulKillByNeedle(needle: string): void {
  if (process.platform === 'win32') {
    // No SIGTERM/SIGKILL distinction on Windows for a GUI process like Chrome —
    // this is already a last-resort sweep called after a normal .close() was
    // tried, so a straight force-kill of every chrome.exe whose command line
    // carries the needle (its --user-data-dir) is the direct equivalent.
    const q = needle.replace(/'/g, "''");
    try {
      execSync(
        `Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | ` +
          `Where-Object { $_.CommandLine -like '*${q}*' } | ` +
          `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        { stdio: 'pipe', timeout: 10000, shell: 'powershell.exe' }
      );
    } catch {
      // best-effort — never throw into a caller's control flow
    }
    return;
  }
  const q = needle.replace(/'/g, `'\\''`); // safe single-quote for the shell
  try {
    execSync(
      `pids=$(ps -eo pid=,args= | grep -F -- '${q}' | grep -v grep | awk '{print $1}'); ` +
        `if [ -n "$pids" ]; then ` +
        `echo "$pids" | xargs -r kill -TERM 2>/dev/null; ` +
        `alive="$pids"; ` +
        `for i in 1 2 3 4 5 6; do ` +
        `sleep 0.5; ` +
        `next=""; ` +
        `for p in $alive; do kill -0 "$p" 2>/dev/null && next="$next $p"; done; ` +
        `alive="$next"; ` +
        `[ -z "$alive" ] && break; ` +
        `done; ` +
        `if [ -n "$alive" ]; then echo "$alive" | xargs -r kill -KILL 2>/dev/null; fi; ` +
        `fi; true`,
      { stdio: 'pipe', timeout: 10000, shell: '/bin/bash' }
    );
  } catch {
    // best-effort — never throw into a caller's control flow
  }
}

/** Same sanitization browser/linkedin/login.ts's sessionDirFor() applies to a
 * username before using it as a folder name — needed here to reconstruct the
 * exact li-sessions/<safe> path for a nickname's fallback (no explicit
 * sessionDir) LinkedIn account, without exporting/importing that private helper. */
function sanitizeForFolder(s: string): string {
  return String(s || 'default').replace(/[^a-z0-9_-]/gi, '_') || 'default';
}

/** This worker's own LinkedIn li-sessions/<safe> folders only — never every
 * agent's. Matches accounts whose nickname is exactly `worker`, or fleet-style
 * `worker <number>` (e.g. "abhinav 7"), same convention rebalanceFleetNames()
 * already uses elsewhere in this codebase. Accounts with an explicit sessionDir
 * (not under li-sessions/) are skipped — this sweep only exists for the legacy
 * fallback path, so it never even builds a directory for those. */
function thisWorkersLiSessionDirs(worker: string): string[] {
  const norm = worker.toLowerCase();
  try {
    return getLinkedInAccounts()
      .filter(a => {
        const nick = (a.nickname || '').toLowerCase().trim();
        return nick === norm || new RegExp(`^${norm}\\s*\\d+$`).test(nick);
      })
      .filter(a => !a.sessionDir) // only the li-sessions/ fallback path applies here
      .map(a => path.resolve('li-sessions', sanitizeForFolder(a.email)));
  } catch { return []; }
}

/**
 * Stage-boundary safety net for the posting path.
 *
 * The posting model is strictly sequential today: only one platform's browser
 * should be alive at a time. In practice browsers leak — a batch that times out
 * (scheduler `withTimeout` only rejects the promise, it never closes the
 * browser), a `context.close()` that hangs, or a platform driven inline (Ameba,
 * Calisthenics) that bypasses the browserTools singletons. Live inspection found
 * 50+ Chrome processes piled up with orphans lingering 25+ minutes.
 *
 * `killPostingChrome()` is called at each platform boundary to graceful-kill any
 * Chrome still holding a POSTING profile dir for this worker. It targets ONLY
 * the posting session roots, so it never touches the ChatGPT blog-gen profile
 * (`.sessions-cookies/`) — which is stopped during posting anyway. The trailing
 * slash on each root means `.sessions/` won't also match `.sessions-abhinav/`
 * or `.sessions-cookies/`.
 *
 * Agent isolation (needed now that different agents can post concurrently, see
 * browserSlots.ts's per-agent locking): `.sessions/` is abhinav's OWN
 * unsuffixed profile root — it must only be swept when THIS worker is the
 * flat-convention one actually using it, never unconditionally, or a
 * sanya/vansh teardown would also kill a live flat-worker's Chrome. "Flat
 * convention" = no `.sessions-{worker}/` directory of its own (same check
 * masterCoordinator.ts's capToLiveAccounts() uses) — originally only true for
 * abhinav, but any flat-style worker (e.g. vishal) qualifies the same way, so
 * this checks directory existence instead of hardcoding a name. LinkedIn's
 * fallback profiles all live flatly under one shared `li-sessions/` root with
 * no per-agent subfolder, so a blind sweep of the whole root previously killed
 * every agent's LinkedIn Chrome, not just this worker's — fixed by killing
 * only this worker's own resolved li-sessions/<safe> folders
 * (thisWorkersLiSessionDirs) instead of the root.
 */
export function killPostingChrome(): void {
  const worker = process.env.WORKER_NAME || 'abhinav';
  const cwd = process.cwd();
  const isFlatConventionWorker = !fs.existsSync(path.join(cwd, `.sessions-${worker}`));
  const roots = [
    ...(isFlatConventionWorker ? [path.join(cwd, '.sessions') + path.sep] : []),
    path.join(cwd, `.sessions-${worker}`) + path.sep,
    // LinkedIn's persistent profiles live under their own root ('li-sessions',
    // see browser/linkedin/login.ts) — NOT under .sessions/, so the roots above
    // never reap a hung LinkedIn Chrome. Sweep only THIS worker's own folders.
    ...thisWorkersLiSessionDirs(worker).map(d => d + path.sep),
  ];
  for (const root of roots) {
    gracefulKillByNeedle(`--user-data-dir=${root}`);
  }
}
