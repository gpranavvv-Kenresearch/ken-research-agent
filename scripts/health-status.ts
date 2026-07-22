/**
 * health-status.ts — print the account-health ledger.
 * Usage: node --import=tsx scripts/health-status.ts [--attention] [--reactivate <platform> <nickname>]
 */
import fs from 'fs';
import path from 'path';
import { summary, reactivate } from '../src/health/accountHealth.js';

const args = process.argv.slice(2);

if (args[0] === '--reactivate' && args[1] && args[2]) {
  reactivate(args[1], args[2]);
  console.log(`Reactivated ${args[1]}/${args[2]} → active.`);
  process.exit(0);
}

const LEDGER = process.env.HEALTH_LEDGER_FILE || path.join(process.cwd(), '.accounts', 'health.json');
const s = summary();
console.log(`\nAccount Health — ${s.total} accounts tracked  (${LEDGER})`);
console.log(`  active: ${s.byStatus.active}   cooldown: ${s.byStatus.cooldown}   quarantined: ${s.byStatus.quarantined}   dead: ${s.byStatus.dead}\n`);

if (s.needsAttention.length) {
  console.log('NEEDS ATTENTION (quarantined / dead — fix the account, then --reactivate):');
  for (const h of s.needsAttention.sort((a, b) => a.platform.localeCompare(b.platform))) {
    console.log(`  [${h.status.toUpperCase()}] ${h.platform}/${h.nickname} — ${h.note} (score ${h.healthScore}, ${h.totalFails} fails)`);
  }
} else if (fs.existsSync(LEDGER)) {
  console.log('No accounts need attention. 🎉');
} else {
  console.log('(ledger not created yet — it appears after the first batch runs)');
}
console.log('');
