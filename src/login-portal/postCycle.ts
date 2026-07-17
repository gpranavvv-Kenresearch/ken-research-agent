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
 * Caveat inherent to running independently: if the live scheduler happens to be
 * mid-post on the same platform/account at the same moment, both processes
 * would try to open the same Chrome profile at once (the SingletonLock issue
 * this repo has hit before). Rare in practice, not engineered around here.
 *
 * State is persisted to a PID file (not just in-memory) for the same reason as
 * blogCycle.ts: login-api restarts often during deploys, and an in-memory-only
 * tracker would "lose" a running cycle on restart.
 */

import { spawn } from 'child_process';
import fs from 'fs';

const PID_FILE = '/tmp/post-cycle.json';
const LOG_FILE_FOR = (agent: string) => `/tmp/post-cycle-${agent}.log`;
const STATUS_FILE_FOR = (agent: string) => `/tmp/post-cycle-status-${agent}.json`;

interface CycleState {
  agent: string;
  pid: number;
  startedAt: number;
}

function readState(): CycleState | null {
  try {
    const state = JSON.parse(fs.readFileSync(PID_FILE, 'utf-8')) as CycleState;
    // Confirm the process is actually still alive — a stale PID file (e.g. the
    // server was killed before it could clean up) shouldn't block new starts.
    process.kill(state.pid, 0);
    return state;
  } catch {
    return null;
  }
}

function writeState(state: CycleState | null): void {
  if (state) fs.writeFileSync(PID_FILE, JSON.stringify(state), 'utf-8');
  else { try { fs.unlinkSync(PID_FILE); } catch { /* already gone */ } }
}

export function postCycleStatus(): {
  running: boolean; agent?: string; startedAt?: number; log?: string; detail?: Record<string, unknown>;
} {
  const state = readState();
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

/** Start a one-off post cycle for an agent. Throws if one is already running. */
export function startPostCycle(agent: string): void {
  const existing = readState();
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
    },
  });
  child.unref();

  writeState({ agent, pid: child.pid!, startedAt: Date.now() });

  // Clear state once the one-off run finishes on its own, so the button
  // correctly flips back to "Post Now" instead of staying stuck on "running".
  child.on('exit', () => {
    const current = readState();
    if (current?.pid === child.pid) writeState(null);
  });
}

/** Stop whichever post cycle is running. No-op (not an error) if none is running. */
export function stopPostCycle(): { stopped: boolean; agent?: string } {
  const state = readState();
  if (!state) return { stopped: false };
  try { process.kill(-state.pid, 'SIGTERM'); } catch { /* group gone */ }
  try { process.kill(state.pid, 'SIGTERM'); } catch { /* proc gone */ }
  writeState(null);
  return { stopped: true, agent: state.agent };
}
