/**
 * proxy-assign.ts — map a provider's static-IP proxy list to account nicknames
 * and write them into .accounts/proxies.json `byNickname` (one sticky IP each).
 *
 * The proxy list is what an ISP/residential provider hands you — one proxy per
 * line, any of these formats:
 *     host:port:user:pass
 *     user:pass@host:port
 *     host:port              (with shared --user / --pass)
 *
 * Usage:
 *   node --import=tsx scripts/proxy-assign.ts --proxies proxies.txt --nicks aniket,krishi,vansh
 *   node --import=tsx scripts/proxy-assign.ts --proxies list.txt --nicks-file nicks.txt \
 *        --geo Asia/Kolkata:en-IN --user SHARED_USER --pass SHARED_PASS
 *
 * Existing sessionTemplate and other byNickname entries are PRESERVED (merge, not
 * overwrite). Warns if reassigning an account or if counts don't match.
 */
import fs from 'fs';
import path from 'path';

const POOL_FILE = process.env.PROXY_POOL_FILE || path.join(process.cwd(), '.accounts', 'proxies.json');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export interface ParsedProxy { server: string; username?: string; password?: string; }

export function parseProxyLine(line: string, scheme: string, sharedUser?: string, sharedPass?: string): ParsedProxy | null {
  const s = line.trim();
  if (!s || s.startsWith('#')) return null;
  let host = '', port = '', user = sharedUser, pass = sharedPass;
  if (s.includes('@')) {
    const [creds, hostport] = s.split('@');
    [user, pass] = creds.split(':');
    [host, port] = hostport.split(':');
  } else {
    const p = s.split(':');
    if (p.length >= 4) { [host, port, user, pass] = p; }
    else if (p.length === 2) { [host, port] = p; }
    else return null;
  }
  if (!host || !port) return null;
  return { server: `${scheme}://${host}:${port}`, username: user, password: pass };
}

export function assign(proxyLines: string[], nicks: string[], opts: {
  scheme?: string; user?: string; pass?: string; geo?: { timezoneId: string; locale: string }; poolFile?: string;
}): { assigned: number; skipped: number; reassigned: string[] } {
  const scheme = opts.scheme || 'http';
  const proxies = proxyLines.map(l => parseProxyLine(l, scheme, opts.user, opts.pass)).filter(Boolean) as ParsedProxy[];
  const file = opts.poolFile || POOL_FILE;

  let json: any = {};
  try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* fresh file */ }
  json.byNickname = json.byNickname || {};

  const n = Math.min(proxies.length, nicks.length);
  const reassigned: string[] = [];
  for (let i = 0; i < n; i++) {
    const nick = nicks[i].toLowerCase().trim();
    if (json.byNickname[nick]) reassigned.push(nick);
    json.byNickname[nick] = { ...proxies[i], ...(opts.geo ? { geo: opts.geo } : {}) };
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
  return { assigned: n, skipped: Math.max(0, Math.max(proxies.length, nicks.length) - n), reassigned };
}

function main() {
  const proxiesFile = arg('proxies');
  if (!proxiesFile) { console.error('--proxies <file> required'); process.exit(1); }
  const nicks = arg('nicks')?.split(',').map(s => s.trim()).filter(Boolean)
    || (arg('nicks-file') ? fs.readFileSync(arg('nicks-file')!, 'utf8').split(/\s+/).filter(Boolean) : []);
  if (!nicks.length) { console.error('--nicks a,b,c  or  --nicks-file <file> required'); process.exit(1); }

  const geoArg = arg('geo'); // "Asia/Kolkata:en-IN"
  const geo = geoArg ? { timezoneId: geoArg.split(':')[0], locale: geoArg.split(':')[1] || 'en-IN' } : undefined;
  const lines = fs.readFileSync(proxiesFile, 'utf8').split('\n');

  const r = assign(lines, nicks, { scheme: arg('scheme'), user: arg('user'), pass: arg('pass'), geo });
  console.log(`Assigned ${r.assigned} proxies → accounts in ${POOL_FILE}`);
  if (r.skipped) console.log(`  ⚠ ${r.skipped} left unassigned (proxy/nick count mismatch)`);
  if (r.reassigned.length) console.log(`  ⚠ reassigned existing: ${r.reassigned.join(', ')}`);
  console.log('Next: verify them →  node --import=tsx scripts/proxy-check.ts ' + nicks.join(' '));
}

if (/[\\/]proxy-assign\.(ts|js)$/.test(process.argv[1] || '')) main();
