import { execSync } from 'child_process';
import path from 'path';

/**
 * Graceful-kill every process whose command line contains `needle` (a fixed
 * string), SIGTERM first then SIGKILL after a short grace, on Linux/macOS.
 *
 * Implemented with `ps | grep -F | grep -v grep | awk | kill` rather than
 * `pkill -f`, on purpose: `pkill -f <pattern>` also matches the shell running
 * pkill (its own argv contains the pattern) and SIGTERMs it mid-escalation — so
 * the follow-up SIGKILL never fires and a stuck browser survives. Every process
 * in THIS pipeline that carries the needle also carries the literal "grep" and
 * is removed by `grep -v grep`, so the pipeline never signals itself. The sleep
 * is skipped entirely when nothing matched (callers on the happy path pay
 * nothing). SIGTERM-first lets Chrome flush cookies on its normal shutdown path.
 */
export function gracefulKillByNeedle(needle: string): void {
  if (process.platform === 'win32') return;
  const q = needle.replace(/'/g, `'\\''`); // safe single-quote for the shell
  try {
    execSync(
      `pids=$(ps -eo pid=,args= | grep -F -- '${q}' | grep -v grep | awk '{print $1}'); ` +
        `if [ -n "$pids" ]; then echo "$pids" | xargs -r kill -TERM 2>/dev/null; sleep 2; ` +
        `echo "$pids" | xargs -r kill -KILL 2>/dev/null; fi; true`,
      { stdio: 'pipe', timeout: 8000, shell: '/bin/bash' }
    );
  } catch {
    // best-effort — never throw into a caller's control flow
  }
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
 * NOTE (concurrency): this is a whole-worker sweep and is correct only while the
 * posting path is sequential. When Step 4 introduces across-platform concurrency,
 * teardown must become per-platform (kill only the finished platform's profile),
 * or a still-running sibling platform's browser would be killed mid-post.
 */
export function killPostingChrome(): void {
  if (process.platform === 'win32') return;
  const worker = process.env.WORKER_NAME || 'abhinav';
  const cwd = process.cwd();
  const roots = [
    path.join(cwd, '.sessions') + path.sep,
    path.join(cwd, `.sessions-${worker}`) + path.sep,
  ];
  for (const root of roots) {
    gracefulKillByNeedle(`--user-data-dir=${root}`);
  }
}
