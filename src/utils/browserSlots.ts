import fs from 'fs';
import path from 'path';

/**
 * Cross-process browser-slot governor.
 *
 * The box runs more than one process that launches real Chrome: the posting
 * scheduler AND the login portal (login-api). Nothing coordinated them, so both
 * could drive headed Chrome at once and overload the 2-vCPU box (observed load
 * 6-8). An in-process counter can't fix this — the two are separate processes.
 *
 * This is an N-slot lock backed by sentinel files under `.sessions/slots/`.
 * Acquire = atomically create the first free `slot-<i>.lock` (openSync 'wx' is
 * atomic on both Linux and Windows). Release = delete it. A slot whose holder
 * PID is dead, or that is older than TTL, is reclaimed (crash safety). N is
 * `MAX_BROWSERS` (default 1).
 *
 * Agent-scoped pools: pass `{ agent }` and the lock moves to its own
 * subdirectory (`.sessions/slots/<agent>/`) instead of the flat shared pool —
 * so two different agents each get their own independent N-slot pool and never
 * block each other, while MAX_BROWSERS still caps concurrency WITHIN one
 * agent's pool (default 1 = that agent never has more than one browser open at
 * once). Callers that omit `agent` keep the original box-wide pool untouched —
 * this is what the login-portal's bulk-onboarding path still uses on purpose,
 * since it deliberately caps TOTAL box-wide Chrome regardless of which account
 * is logging in. IMPORTANT: MAX_BROWSERS' meaning now depends on whether the
 * caller passes `agent` — "box-wide cap" with no agent, "per-agent cap" with
 * one. Re-read this note before changing how any caller uses either function.
 *
 * ponytail: hand-rolled lockfile, no dep. Ceiling — the reclaim (rm-then-create)
 * has a small TOCTOU window if two processes reclaim the same stale slot at the
 * same instant; the atomic 'wx' create still lets only one win, so worst case is
 * one wasted retry, never a double-hold. Upgrade to `proper-lockfile` only if
 * lock churn ever shows up in profiling.
 */

const TTL_MS = 15 * 60 * 1000; // a posting platform holds ≤5min + teardown; 15min = safely stale
const POLL_MS = 2000;

function slotsDir(agent?: string): string {
  return agent ? path.resolve('.sessions/slots', agent) : path.resolve('.sessions/slots');
}

function maxSlots(): number {
  const n = parseInt(process.env.MAX_BROWSERS || '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (e: any) { return e.code === 'EPERM'; } // EPERM = exists but not ours
}

/** Try to take one slot file atomically; reclaim it first if stale. Returns true on success. */
function tryTake(file: string): boolean {
  try {
    const { pid, ts } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if ((pid && !isAlive(pid)) || (Date.now() - ts > TTL_MS)) {
      fs.rmSync(file, { force: true }); // stale holder — reclaim
    }
  } catch { /* missing or unreadable — fall through and try to create */ }
  try {
    const fd = fs.openSync(file, 'wx'); // atomic: throws EEXIST if another holder won
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
    fs.closeSync(fd);
    return true;
  } catch { return false; }
}

function makeRelease(file: string): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try { fs.rmSync(file, { force: true }); } catch { /* best-effort */ }
  };
}

/** Poll for a free slot until `waitMs` elapses. Returns a release fn or null on timeout. */
async function poll(waitMs: number, agent?: string): Promise<(() => void) | null> {
  const dir = slotsDir(agent);
  fs.mkdirSync(dir, { recursive: true });
  const n = maxSlots();
  const deadline = Date.now() + waitMs;
  for (;;) {
    for (let i = 0; i < n; i++) {
      const f = path.join(dir, `slot-${i}.lock`);
      if (tryTake(f)) return makeRelease(f);
    }
    if (Date.now() > deadline) return null;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

export interface BrowserSlotOpts {
  agent?: string;
  waitMs?: number;
}

/**
 * Block until a browser slot is free, then return a release() to call when the
 * browser is fully closed. Fail-OPEN: if no slot frees within `waitMs`, proceed
 * anyway rather than deadlock a posting session (matches the scheduler's "one
 * stuck platform must never block the rest" philosophy). For the scheduler.
 * Pass `{ agent }` to use that agent's own independent slot pool instead of the
 * box-wide one — see the file header note on what this does to MAX_BROWSERS.
 */
export async function acquireBrowserSlot(label = 'browser', opts?: BrowserSlotOpts): Promise<() => void> {
  const waitMs = opts?.waitMs ?? 20 * 60 * 1000;
  const release = await poll(waitMs, opts?.agent);
  if (release) return release;
  console.warn(`   ⚠️ [slots] no free browser slot after ${Math.round(waitMs / 60000)}m — proceeding without one (${label}${opts?.agent ? `, agent=${opts.agent}` : ''})`);
  return () => {};
}

/**
 * Non-blocking variant for the interactive login portal: try briefly, then give
 * up and return null so the caller can tell the user "box busy, try again"
 * rather than hang an HTTP request. Fail-CLOSED.
 */
export async function tryAcquireBrowserSlot(_label = 'login', opts?: BrowserSlotOpts): Promise<(() => void) | null> {
  return poll(opts?.waitMs ?? 3000, opts?.agent);
}
