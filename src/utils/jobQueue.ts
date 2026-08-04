import fs from 'fs';
import path from 'path';

/**
 * Cross-process, cross-agent job queue with visible position/ETA.
 *
 * browserSlots.ts already caps how many Chrome browsers run at once, but its
 * pools are per-agent — different agents never block each other there. This
 * module adds a box-wide capacity cap ON TOP of that, for whole long-running
 * jobs (a full blog-generation pass, a full posting cycle), with a waiting
 * list so a queued caller can be told "you are #2, X is running (~10 min)."
 *
 * Same atomic-file-create pattern as browserSlots.ts's tryTake: openSync
 * 'wx' is atomic on both Linux and Windows, so only one process ever wins
 * a given slot index.
 *
 * ponytail: hand-rolled lockfile dir, no dep — matches browserSlots.ts.
 */

const POLL_MS = 3000;
const NOTIFY_THROTTLE_MS = 20 * 1000; // don't log/callback every 3s while queued

export const CATEGORIES: Record<string, { max: number; avgMs: number; ttlMs: number }> = {
  // Rough static fallback ETAs (not measured from history) — good enough for
  // "roughly N minutes," not meant to be precise.
  'blog-gen':   { max: 2, avgMs: 10 * 60 * 1000, ttlMs: 12 * 60 * 60 * 1000 },
  'post-cycle': { max: 1, avgMs: 20 * 60 * 1000, ttlMs: 6 * 60 * 60 * 1000 },
};

function baseDir(category: string): string { return path.resolve('.sessions/queue', category); }
function waitDir(category: string): string { return path.join(baseDir(category), 'waiting'); }
function slotFile(category: string, i: number): string { return path.join(baseDir(category), `slot-${i}.json`); }
function extraFile(category: string, agent: string): string {
  return path.join(baseDir(category), `extra-${agent}-${process.pid}.json`);
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (e: any) { return e.code === 'EPERM'; } // EPERM = exists but not ours
}

function readJson(f: string): any {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

/** Remove a slot/ticket file if its holder is dead or past TTL. */
function pruneIfStale(file: string, ttlMs: number): any {
  const data = readJson(file);
  if (!data) return null;
  if ((data.pid && !isAlive(data.pid)) || Date.now() - data.ts > ttlMs) {
    try { fs.rmSync(file, { force: true }); } catch { /* noop */ }
    return null;
  }
  return data;
}

/** Try to atomically claim `file` for `agent`. Reclaims it first if stale. */
function tryClaim(file: string, agent: string, ttlMs: number): (() => void) | null {
  pruneIfStale(file, ttlMs);
  try {
    const fd = fs.openSync(file, 'wx');
    fs.writeSync(fd, JSON.stringify({ agent, pid: process.pid, ts: Date.now() }));
    fs.closeSync(fd);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      try { fs.rmSync(file, { force: true }); } catch { /* noop */ }
    };
  } catch { return null; }
}

export interface QueueStatus {
  running: { agent: string; startedAt: number }[];
  waiting: { agent: string; joinedAt: number; position: number }[];
  capacity: number;
}

export function getQueueStatus(category: string): QueueStatus {
  const cat = CATEGORIES[category];
  fs.mkdirSync(baseDir(category), { recursive: true });
  fs.mkdirSync(waitDir(category), { recursive: true });

  const running: QueueStatus['running'] = [];
  for (let i = 0; i < cat.max; i++) {
    const data = pruneIfStale(slotFile(category, i), cat.ttlMs);
    if (data) running.push({ agent: data.agent, startedAt: data.ts });
  }
  for (const f of fs.readdirSync(baseDir(category))) {
    if (!f.startsWith('extra-')) continue;
    const data = pruneIfStale(path.join(baseDir(category), f), cat.ttlMs);
    if (data) running.push({ agent: data.agent, startedAt: data.ts });
  }

  const waiting: { agent: string; joinedAt: number }[] = [];
  for (const f of fs.readdirSync(waitDir(category))) {
    const p = path.join(waitDir(category), f);
    const data = pruneIfStale(p, cat.ttlMs);
    if (data) waiting.push({ agent: data.agent, joinedAt: data.ts });
  }
  waiting.sort((a, b) => a.joinedAt - b.joinedAt);

  return {
    running,
    waiting: waiting.map((w, i) => ({ ...w, position: i + 1 })),
    capacity: cat.max,
  };
}

export function estimateWaitMs(category: string, position: number): number {
  const cat = CATEGORIES[category];
  return Math.ceil(position / cat.max) * cat.avgMs;
}

export interface JobQueueOpts {
  waitMs?: number;
  /** Claim an extra slot beyond `max`, skip the queue entirely. */
  force?: boolean;
  /** Called on first wait, then throttled to ~once/20s, with this caller's live position. */
  onWaiting?: (status: QueueStatus, myPosition: number) => void;
}

/**
 * Block until a "category" job slot is free, then return a release() to call
 * when the job is fully done. Registers a waiting ticket the whole time so
 * getQueueStatus() can report this caller's position/ETA to onWaiting.
 */
export async function acquireJobSlot(category: string, agent: string, opts?: JobQueueOpts): Promise<() => void> {
  const cat = CATEGORIES[category];
  if (!cat) throw new Error(`[jobQueue] unknown category "${category}"`);
  fs.mkdirSync(baseDir(category), { recursive: true });
  fs.mkdirSync(waitDir(category), { recursive: true });

  if (opts?.force) {
    const release = tryClaim(extraFile(category, agent), agent, cat.ttlMs);
    if (release) return release;
    // Extremely unlikely collision (same agent, same pid, same category) — retry once with a fresh name.
    const fallback = path.join(baseDir(category), `extra-${agent}-${process.pid}-${Date.now()}.json`);
    const retry = tryClaim(fallback, agent, cat.ttlMs);
    if (retry) return retry;
    throw new Error(`[jobQueue] could not claim a forced "${category}" slot`);
  }

  const myTs = Date.now();
  const ticketFile = path.join(waitDir(category), `${agent}-${process.pid}-${myTs}.json`);
  fs.writeFileSync(ticketFile, JSON.stringify({ agent, pid: process.pid, ts: myTs }));
  let ticketDropped = false;
  const dropTicket = () => {
    if (ticketDropped) return;
    ticketDropped = true;
    try { fs.rmSync(ticketFile, { force: true }); } catch { /* noop */ }
  };

  const waitMs = opts?.waitMs ?? 90 * 60 * 1000;
  const deadline = Date.now() + waitMs;
  let lastNotify = 0;

  try {
    for (;;) {
      for (let i = 0; i < cat.max; i++) {
        const release = tryClaim(slotFile(category, i), agent, cat.ttlMs);
        if (release) { dropTicket(); return release; }
      }

      if (opts?.onWaiting && Date.now() - lastNotify > NOTIFY_THROTTLE_MS) {
        lastNotify = Date.now();
        const status = getQueueStatus(category);
        const mine = status.waiting.find((w) => w.agent === agent && w.joinedAt === myTs);
        opts.onWaiting(status, mine?.position ?? (status.waiting.length || 1));
      }

      if (Date.now() > deadline) { dropTicket(); throw new Error(`[jobQueue] timed out waiting for a "${category}" slot`); }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } catch (e) {
    dropTicket();
    throw e;
  }
}
