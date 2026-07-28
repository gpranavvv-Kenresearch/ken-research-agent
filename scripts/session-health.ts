/**
 * session-health.ts — read-only fleet session health diagnostic.
 *
 * Answers one question production keeps asking: "which accounts are logged out?"
 * so a human can re-login only the dead ones. Does NOT log anyone in (that needs
 * credentials/CAPTCHA) and does NOT open a browser — it reuses sessionResolver's
 * cheap cookie-DB check via listAgentStatus().
 *
 * Run on the VPS (where .sessions-* dirs live):
 *   npx tsx scripts/session-health.ts                 # all agents, all platforms
 *   npx tsx scripts/session-health.ts --agent abhinav # one agent
 *   npx tsx scripts/session-health.ts --platform x    # one platform, all agents
 */

import fs from 'fs';
import path from 'path';
import { listAgentStatus, FleetAccountStatus } from '../src/login-portal/sessionResolver.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Discover agents from `.sessions-<agent>/` dirs in repo root. `.sessions-cookies`
 *  holds the shared ChatGPT engine profiles, not a fleet agent — skip it. */
function discoverAgents(): string[] {
  const root = process.cwd();
  return fs
    .readdirSync(root)
    .map((e) => e.match(/^\.sessions-([a-z0-9-]+)$/i))
    .filter((m): m is RegExpMatchArray => !!m && m[1].toLowerCase() !== 'cookies')
    .map((m) => m[1].toLowerCase())
    .sort();
}

const onlyPlatform = arg('platform');
const oneAgent = arg('agent');
const agents = oneAgent ? [oneAgent.toLowerCase()] : discoverAgents();

interface DeadEntry { agent: string; platform: string; index: number; nickname: string; }
const reloginList: DeadEntry[] = [];
let grandTotal = 0;
let grandLoggedIn = 0;

if (!agents.length) {
  console.log('No .sessions-* directories found in repo root. Are you on the VPS?');
  process.exit(0);
}

for (const agent of agents) {
  const status = listAgentStatus(agent);
  // Flatten to the platforms we're reporting, dropping empties.
  const rows: Array<{ platform: string; accounts: FleetAccountStatus[] }> = [];
  for (const [platform, accounts] of Object.entries(status.platforms)) {
    if (onlyPlatform && platform !== onlyPlatform) continue;
    if (!accounts.length) continue;
    rows.push({ platform, accounts });
  }

  if (!rows.length) {
    console.log(`\n=== ${agent} ===  (no sessions${onlyPlatform ? ` for platform "${onlyPlatform}"` : ''})`);
    continue;
  }

  console.log(`\n=== ${agent} ===`);
  console.log(`  ${'platform'.padEnd(14)} ${'total'.padStart(5)} ${'live'.padStart(5)} ${'DEAD'.padStart(5)}  dead accounts`);
  for (const { platform, accounts } of rows) {
    const dead = accounts.filter((a) => !a.ready);
    const live = accounts.length - dead.length;
    grandTotal += accounts.length;
    grandLoggedIn += live;
    for (const d of dead) reloginList.push({ agent, platform, index: d.index, nickname: d.nickname });
    const deadNames = dead.map((d) => `${d.nickname} DEAD`).join(', ');
    console.log(
      `  ${platform.padEnd(14)} ${String(accounts.length).padStart(5)} ${String(live).padStart(5)} ${String(dead.length).padStart(5)}  ${deadNames}`,
    );
  }
}

const grandDead = grandTotal - grandLoggedIn;
console.log('\n========================================');
console.log(`SUMMARY: ${grandTotal} accounts | ${grandLoggedIn} logged-in | ${grandDead} DEAD`);

if (reloginList.length) {
  console.log('\nRE-LOGIN LIST (human action — one per line):');
  reloginList.sort((a, b) => a.platform.localeCompare(b.platform) || a.agent.localeCompare(b.agent) || a.index - b.index);
  for (const d of reloginList) {
    // `<agent> <index>` is exactly the sheet Name cell / nickname to re-login.
    console.log(`  ${d.platform.padEnd(14)} ${path.basename(`.sessions-${d.agent}`)}/${d.platform}-${d.index}   (nickname: "${d.nickname}")`);
  }
} else {
  console.log('\nAll discovered sessions are logged in. Nothing to re-login.');
}

process.exit(0);
