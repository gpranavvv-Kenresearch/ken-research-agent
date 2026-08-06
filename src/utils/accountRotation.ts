/**
 * accountRotation.ts — strict round-robin account selection for social
 * posting, for agents with more than one logged-in account on a platform
 * (e.g. Vansh has 2 X accounts, 3 Facebook accounts). Builds entirely on
 * the existing fleet-account layout (`.sessions-{agent}/{platform}-{index}`,
 * `listAgentStatus()`) — no new session/login mechanism, just a persisted
 * cursor deciding which ready account goes next.
 */
import fs from 'fs';
import path from 'path';
import { listAgentStatus } from '../login-portal/sessionResolver.js';

const ROTATION_FILE = path.resolve('.accounts/rotation-state.json');

function loadState(): Record<string, number> {
  try { return JSON.parse(fs.readFileSync(ROTATION_FILE, 'utf8')); }
  catch { return {}; }
}

function saveState(state: Record<string, number>): void {
  try {
    fs.mkdirSync(path.dirname(ROTATION_FILE), { recursive: true });
    fs.writeFileSync(ROTATION_FILE, JSON.stringify(state, null, 2));
  } catch { /* non-critical — worst case, rotation restarts from account 1 next call */ }
}

/**
 * Pick which account to post from for `agent` on `platformKey`.
 * - No fleet accounts logged in for this agent+platform → `fallbackNickname`
 *   unchanged (today's single-account behavior, zero change).
 * - Exactly one ready fleet account → that account, no rotation.
 * - 2+ ready fleet accounts → strict round-robin (1 → 2 → 3 → 1 → ...),
 *   persisted across process restarts so consecutive posting cycles keep
 *   advancing instead of always starting over at account 1.
 */
export function selectAccountForPlatform(agent: string, platformKey: string, fallbackNickname: string): string {
  const status = listAgentStatus(agent);
  const ready = (status.platforms[platformKey] || [])
    .filter((a) => a.ready)
    .sort((a, b) => a.index - b.index);

  if (ready.length === 0) return fallbackNickname;
  if (ready.length === 1) return ready[0].nickname;

  const key = `${agent}:${platformKey}`;
  const state = loadState();
  const lastIndex = state[key] ?? 0;

  const indices = ready.map((a) => a.index);
  const next = indices.find((i) => i > lastIndex) ?? indices[0];

  state[key] = next;
  saveState(state);

  return ready.find((a) => a.index === next)!.nickname;
}
