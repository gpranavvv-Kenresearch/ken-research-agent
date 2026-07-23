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
 * `MAX_BROWSERS` (default 1 — never more than one headed Chrome box-wide).
 *
 * ponytail: hand-rolled lockfile, no dep. Ceiling — the reclaim (rm-then-create)
 * has a small TOCTOU window if two processes reclaim the same stale slot at the
 * same instant; the atomic 'wx' create still lets only one win, so worst case is
 * one wasted retry, never a double-hold. Upgrade to `proper-lockfile` only if
 * lock churn ever shows up in profiling.
 */

const SLOTS_DIR = path.resolve('.sessions/slots');
const TTL_MS = 15 * 60 * 1000; // a posting platform holds ≤5min + teardown; 15min = safely stale
const POLL_MS = 2000;

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
async function poll(waitMs: number): Promise<(() => void) | null> {
  fs.mkdirSync(SLOTS_DIR, { recursive: true });
  const n = maxSlots();
  const deadline = Date.now() + waitMs;
  for (;;) {
    for (let i = 0; i < n; i++) {
      const f = path.join(SLOTS_DIR, `slot-${i}.lock`);
      if (tryTake(f)) return makeRelease(f);
    }
    if (Date.now() > deadline) return null;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

/**
 * Block until a browser slot is free, then return a release() to call when the
 * browser is fully closed. Fail-OPEN: if no slot frees within `waitMs`, proceed
 * anyway rather than deadlock a posting session (matches the scheduler's "one
 * stuck platform must never block the rest" philosophy). For the scheduler.
 */
export async function acquireBrowserSlot(label = 'browser', waitMs = 20 * 60 * 1000): Promise<() => void> {
  const release = await poll(waitMs);
  if (release) return release;
  console.warn(`   ⚠️ [slots] no free browser slot after ${Math.round(waitMs / 60000)}m — proceeding without one (${label})`);
  return () => {};
}

/**
 * Non-blocking variant for the interactive login portal: try briefly, then give
 * up and return null so the caller can tell the user "box busy, try again"
 * rather than hang an HTTP request. Fail-CLOSED.
 */
export async function tryAcquireBrowserSlot(_label = 'login', waitMs = 3000): Promise<(() => void) | null> {
  return poll(waitMs);
}
