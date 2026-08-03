/**
 * blogCycle.ts — Start/stop control for the continuous blog-generation loop.
 *
 * Locking is per-agent, not system-wide: each agent generates through its own
 * ChatGPT browser profile (see sessionResolver.ts's chatgptProfileDir — one
 * profile per agent, "abhinav" keeping the original un-suffixed dir), so two
 * different agents CAN generate concurrently without fighting over a Chrome
 * profile lock. Only the SAME agent starting a second cycle is rejected.
 *
 * State is persisted to a PID file per agent, not just an in-memory variable —
 * login-api gets restarted often during deploys, and an in-memory-only tracker
 * would "lose" a running cycle on restart, making it un-stoppable via the API
 * even though the process is still alive and burning its ChatGPT session.
 */

import { spawn } from 'child_process';
import fs from 'fs';

const PID_FILE_FOR = (agent: string) => `/tmp/blog-cycle-${agent}.json`;
const LOG_FILE_FOR = (agent: string) => `/tmp/blog-cycle-${agent}.log`;

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

export function cycleStatus(agent: string): { running: boolean; agent?: string; startedAt?: number; log?: string } {
  const state = readState(agent);
  if (!state) return { running: false };
  let log = '';
  try {
    log = fs.readFileSync(LOG_FILE_FOR(state.agent), 'utf-8').trim().split('\n').filter(Boolean).slice(-15).join('\n');
  } catch { /* no log yet */ }
  return { running: true, agent: state.agent, startedAt: state.startedAt, log };
}

/** Start the loop for an agent. Throws if THIS agent already has one running. */
export function startCycle(agent: string): void {
  const existing = readState(agent);
  if (existing) {
    throw new Error(`Blog cycle already running for "${agent}" — stop it first`);
  }

  const logFile = LOG_FILE_FOR(agent);
  fs.appendFileSync(logFile, `\n=== cycle started for ${agent} @ ${new Date().toISOString()} ===\n`);

  const child = spawn('npx', ['tsx', 'scripts/run-blog-generator.ts', '--name', agent, '--limit', '5', '--loop', '--interval', '1800'], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', WORKER_NAME: agent, BLOG_LOG: logFile },
    shell: process.platform === 'win32', // Windows resolves `npx` to npx.cmd only through a shell
  });
  child.unref();

  writeState(agent, { agent, pid: child.pid!, startedAt: Date.now() });

  // If the loop process ever exits on its own (crash, or the loop somehow
  // ends), clear the state so the button correctly shows "stopped" again.
  child.on('exit', () => {
    const current = readState(agent);
    if (current?.pid === child.pid) writeState(agent, null);
  });
}

/** Stop this agent's cycle. No-op (not an error) if none is running. */
export function stopCycle(agent: string): { stopped: boolean; agent?: string } {
  const state = readState(agent);
  if (!state) return { stopped: false };
  try { process.kill(-state.pid, 'SIGTERM'); } catch { /* group gone */ }
  try { process.kill(state.pid, 'SIGTERM'); } catch { /* proc gone */ }
  writeState(agent, null);
  return { stopped: true, agent: state.agent };
}
