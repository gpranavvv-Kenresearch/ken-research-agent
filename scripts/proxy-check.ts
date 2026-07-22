/**
 * proxy-check.ts — CLI wrapper around src/health/proxyCheck.ts.
 *
 * Usage:
 *   node --import=tsx scripts/proxy-check.ts --direct            # baseline: the box's own IP
 *   node --import=tsx scripts/proxy-check.ts aniket krishi vansh # test these accounts' proxies
 */
import { checkProxies } from '../src/health/proxyCheck.js';
import { proxiesConfigured } from '../src/health/proxyPool.js';

async function main() {
  const args = process.argv.slice(2);
  const direct = args.includes('--direct');
  const nicks = args.filter(a => !a.startsWith('--'));

  if (!direct && !proxiesConfigured()) {
    console.log('No proxies configured (.accounts/proxies.json absent/empty). Use --direct for a baseline.');
    return;
  }
  if (!direct && !nicks.length) {
    console.log('Pass account nicknames, e.g.:  node --import=tsx scripts/proxy-check.ts aniket krishi');
    return;
  }

  const { baseline, results } = await checkProxies(direct ? [] : nicks);
  console.log(`\nBaseline (box's own egress): ${baseline.ok ? `${baseline.ip} [${baseline.country}] ${baseline.ms}ms` : 'FAILED ' + baseline.error}\n`);
  if (direct) return;

  console.log('nick            status  exit-ip           cc   latency  note');
  console.log('----            ------  -------           --   -------  ----');
  let dead = 0, notRouting = 0;
  for (const r of results.sort((a, b) => a.nick.localeCompare(b.nick))) {
    let note = '';
    if (!r.ok) { dead++; note = 'DEAD: ' + (r.error || ''); }
    else if (r.notRouting) { notRouting++; note = '⚠ NOT ROUTING (== box IP)'; }
    console.log(`${r.nick.padEnd(15)} ${(r.ok ? 'ok' : 'FAIL').padEnd(6)} ${(r.ip || '-').padEnd(17)} ${(r.country || '-').padEnd(4)} ${((r.ms ?? 0) + 'ms').padEnd(8)} ${note}`);
  }
  console.log(`\n${results.length} tested · ${results.length - dead - notRouting} healthy · ${dead} dead · ${notRouting} not-routing`);
  if (dead || notRouting) process.exitCode = 1;
}

main().catch(e => { console.error('proxy-check error:', e.message); process.exit(1); });
