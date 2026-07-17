/**
 * blogCycle.ts — Start/stop control for the continuous blog-generation loop.
 *
 * Only one cycle can run system-wide at a time: every agent's generation
 * shares the same ChatGPT browser profile (.sessions-cookies/chatgpt-profile),
 * so two agents generating simultaneously would fight over the same Chrome
 * profile lock (the exact bug this repo hit earlier with Medium sessions).
 *
 * State is persisted to a PID file, not just an in-memory variable — login-api
 * gets restarted often during deploys, and an in-memory-only tracker would
 * "lose" a running cycle on restart, making it un-stoppable via the API even
 * though the process is still alive and burning the shared ChatGPT session.
 */

import { spawn } from 'child_process';
import fs from 'fs';

const PID_FILE = '/tmp/blog-cycle.json';
const LOG_FILE_FOR = (agent: string) => `/tmp/blog-cycle-${agent}.log`;

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

export function cycleStatus(): { running: boolean; agent?: string; startedAt?: number; log?: string } {
  const state = readState();
  if (!state) return { running: false };
  let log = '';
  try {
    log = fs.readFileSync(LOG_FILE_FOR(state.agent), 'utf-8').trim().split('\n').filter(Boolean).slice(-15).join('\n');
  } catch { /* no log yet */ }
  return { running: true, agent: state.agent, startedAt: state.startedAt, log };
}

/** Start the loop for an agent. Throws if one is already running (any agent). */
export function startCycle(agent: string): void {
  const existing = readState();
  if (existing) {
    throw new Error(`Blog cycle already running for "${existing.agent}" — stop it first (only one can run at a time, shared ChatGPT session)`);
  }

  const logFile = LOG_FILE_FOR(agent);
  fs.appendFileSync(logFile, `\n=== cycle started for ${agent} @ ${new Date().toISOString()} ===\n`);

  const child = spawn('npx', ['tsx', 'scripts/run-blog-generator.ts', '--name', agent, '--limit', '5', '--loop', '--interval', '1800'], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', WORKER_NAME: agent, BLOG_LOG: logFile },
  });
  child.unref();

  writeState({ agent, pid: child.pid!, startedAt: Date.now() });

  // If the loop process ever exits on its own (crash, or the loop somehow
  // ends), clear the state so the button correctly shows "stopped" again.
  child.on('exit', () => {
    const current = readState();
    if (current?.pid === child.pid) writeState(null);
  });
}

/** Stop whichever cycle is running. No-op (not an error) if none is running. */
export function stopCycle(): { stopped: boolean; agent?: string } {
  const state = readState();
  if (!state) return { stopped: false };
  try { process.kill(-state.pid, 'SIGTERM'); } catch { /* group gone */ }
  try { process.kill(state.pid, 'SIGTERM'); } catch { /* proc gone */ }
  writeState(null);
  return { stopped: true, agent: state.agent };
}
