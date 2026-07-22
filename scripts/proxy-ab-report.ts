/**
 * proxy-ab-report.ts — daily A/B snapshot: do the PROXIED accounts get blocked
 * less than the un-proxied ones? Compares health across the wired platforms
 * (X / Facebook / Ameba / Note — the ones proxies actually affect).
 *
 * Run:  node --import=tsx scripts/proxy-ab-report.ts
 * Cron on the VPS appends its output to logs/proxy-ab-report.log daily.
 */
import { allAccounts } from '../src/health/accountHealth.js';
import { proxySummary } from '../src/health/proxyPool.js';

const WIRED = new Set(['X', 'Facebook', 'Ameba', 'Note']); // platforms proxies apply to

interface Agg { entries: number; active: number; cooldown: number; quarantined: number; dead: number; posts: number; fails: number; }
const blank = (): Agg => ({ entries: 0, active: 0, cooldown: 0, quarantined: 0, dead: 0, posts: 0, fails: 0 });

function add(a: Agg, h: any) {
  a.entries++;
  a[h.status as 'active']++;
  a.posts += h.totalPosts || 0;
  a.fails += h.totalFails || 0;
}
function failPct(a: Agg): string {
  const denom = a.posts + a.fails;
  return denom ? ((a.fails / denom) * 100).toFixed(1) + '%' : 'n/a';
}
function line(label: string, a: Agg): string {
  return `  ${label.padEnd(26)} entries=${a.entries}  active=${a.active} cooldown=${a.cooldown} quarantined=${a.quarantined} dead=${a.dead}  posts=${a.posts} fails=${a.fails}  fail%=${failPct(a)}`;
}

function main() {
  const proxied = new Set(proxySummary().accounts.map(s => s.toLowerCase()));
  const A = blank(); // proxied
  const B = blank(); // un-proxied
  for (const h of allAccounts()) {
    if (!WIRED.has(h.platform)) continue;
    add(proxied.has(h.nickname.toLowerCase()) ? A : B, h);
  }
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  console.log(`\n=== Proxy A/B — ${day} (X/FB/Ameba/Note) ===`);
  console.log(`  proxied nicks: ${[...proxied].join(', ') || '(none)'}`);
  if (A.entries + B.entries === 0) { console.log('  (no ledger data yet — accounts appear after they post)'); return; }
  console.log(line('PROXIED accounts', A));
  console.log(line('UN-PROXIED accounts', B));
  const bad = (a: Agg) => a.quarantined + a.dead;
  console.log(`  → proxied problems=${bad(A)} (fail% ${failPct(A)})   un-proxied problems=${bad(B)} (fail% ${failPct(B)})`);
}

main();
