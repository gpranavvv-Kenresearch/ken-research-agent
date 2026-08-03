/**
 * postCycle.ts — Start/stop control for a manual, one-off "Post Now" run.
 *
 * Runs the full 5-cycle narrowing sequence once through (15 → 13 → 8 → 5 → 2
 * platforms, 30 min between each cycle) in a completely
 * separate process from the live `scheduler` daemon — its own status file, its
 * own PID tracking — so it never interferes with the running scheduler's cycle
 * position or timing. This is the deliberate, agreed design: a manual run
 * alongside the scheduler, not synced with it.
 *
 * Per-agent, not global: state (PID file, log, status) is keyed by agent, same
 * convention as blogCycle.ts — so two different agents (e.g. sanya and vansh)
 * can each run their own post cycle at the same time; only starting a SECOND
 * cycle for the SAME agent while one is already running gets refused. Real
 * browser concurrency is governed by browserSlots.ts's agent-scoped slot lock
 * (via WORKER_NAME, set in this child's env below, flowing into
 * scheduler-new.ts's acquireBrowserSlot calls) — the old SingletonLock race
 * this file used to caveat (two processes for the SAME agent opening the same
 * Chrome profile at once) is resolved by that shared per-agent slot as long as
 * both processes resolve their agent identity from WORKER_NAME consistently.
 *
 * State is persisted to a PID file (not just in-memory) for the same reason as
 * blogCycle.ts: login-api restarts often during deploys, and an in-memory-only
 * tracker would "lose" a running cycle on restart.
 */

import { spawn } from 'child_process';
import fs from 'fs';

const PID_FILE_FOR = (agent: string) => `/tmp/post-cycle-${agent}.json`;
const LOG_FILE_FOR = (agent: string) => `/tmp/post-cycle-${agent}.log`;
const STATUS_FILE_FOR = (agent: string) => `/tmp/post-cycle-status-${agent}.json`;

interface CycleState {
  agent: string;
  pid: number;
  startedAt: number;
}

function readState(agent: string): CycleState | null {
  try {
    const state = JSON.parse(fs.readFileSync(PID_FILE_FOR(agent), 'utf-8')) as CycleState;
    // Confirm the process is actually still alive — a stale PID file (e.g. the
    // server was killed before it could clean up) shouldn't block new starts.
    process.kill(state.pid, 0);
    return state;
  } catch {
    return null;
  }
}

function writeState(agent: string, state: CycleState | null): void {
  if (state) fs.writeFileSync(PID_FILE_FOR(agent), JSON.stringify(state), 'utf-8');
  else { try { fs.unlinkSync(PID_FILE_FOR(agent)); } catch { /* already gone */ } }
}

export function postCycleStatus(agent: string): {
  running: boolean; agent?: string; startedAt?: number; log?: string; detail?: Record<string, unknown>;
} {
  const state = readState(agent);
  if (!state) return { running: false };
  let log = '';
  try {
    log = fs.readFileSync(LOG_FILE_FOR(state.agent), 'utf-8').trim().split('\n').filter(Boolean).slice(-15).join('\n');
  } catch { /* no log yet */ }
  let detail: Record<string, unknown> | undefined;
  try {
    detail = JSON.parse(fs.readFileSync(STATUS_FILE_FOR(state.agent), 'utf-8'));
  } catch { /* no status yet */ }
  return { running: true, agent: state.agent, startedAt: state.startedAt, log, detail };
}

/** Start a one-off post cycle for an agent. Throws if this SAME agent already has one running.
 * `counts`, if given, switches this run from the fixed 5-stage sequence to the
 * counted, round-based cycle (see scheduler-new.ts's runCountedPostCycle) —
 * a per-platform post count for this cycle only. Omit for the old behavior. */
export function startPostCycle(agent: string, counts?: Record<string, number>): void {
  const existing = readState(agent);
  if (existing) {
    throw new Error(`Post cycle already running for "${existing.agent}" — stop it first, or wait for it to finish.`);
  }

  const logFile = LOG_FILE_FOR(agent);
  const statusFile = STATUS_FILE_FOR(agent);
  fs.appendFileSync(logFile, `\n=== post cycle started for ${agent} @ ${new Date().toISOString()} ===\n`);
  try { fs.unlinkSync(statusFile); } catch { /* fine if it doesn't exist yet */ }

  const child = spawn('npx', ['tsx', 'scripts/run-post-cycle-once.ts'], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ':99',
      WORKER_NAME: agent,
      POST_CYCLE_LOG: logFile,
      POST_CYCLE_STATUS: statusFile,
      ...(counts ? { POST_CYCLE_COUNTS: JSON.stringify(counts) } : {}),
    },
    shell: process.platform === 'win32', // Windows resolves `npx` to npx.cmd only through a shell
  });
  child.unref();

  writeState(agent, { agent, pid: child.pid!, startedAt: Date.now() });

  // Clear state once the one-off run finishes on its own, so the button
  // correctly flips back to "Post Now" instead of staying stuck on "running".
  child.on('exit', () => {
    const current = readState(agent);
    if (current?.pid === child.pid) writeState(agent, null);
  });
}

/** Stop this agent's post cycle. No-op (not an error) if it isn't running. */
export function stopPostCycle(agent: string): { stopped: boolean; agent?: string } {
  const state = readState(agent);
  if (!state) return { stopped: false };
  try { process.kill(-state.pid, 'SIGTERM'); } catch { /* group gone */ }
  try { process.kill(state.pid, 'SIGTERM'); } catch { /* proc gone */ }
  writeState(agent, null);
  return { stopped: true, agent: state.agent };
}
