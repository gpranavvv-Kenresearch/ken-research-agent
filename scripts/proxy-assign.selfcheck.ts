/** Run: node --import=tsx scripts/proxy-assign.selfcheck.ts */
import assert from 'assert';
import fs from 'fs';
import { parseProxyLine, assign } from './proxy-assign.js';

// 1. parse the three accepted formats
assert.deepEqual(parseProxyLine('1.2.3.4:8000:bob:pw', 'http'), { server: 'http://1.2.3.4:8000', username: 'bob', password: 'pw' });
assert.deepEqual(parseProxyLine('bob:pw@1.2.3.4:8000', 'http'), { server: 'http://1.2.3.4:8000', username: 'bob', password: 'pw' });
assert.deepEqual(parseProxyLine('1.2.3.4:8000', 'http', 'shared', 'sp'), { server: 'http://1.2.3.4:8000', username: 'shared', password: 'sp' });
assert.equal(parseProxyLine('# comment', 'http'), null);
assert.equal(parseProxyLine('', 'http'), null);
console.log('✓ parseProxyLine handles all formats');

// 2. assign zips proxies↔nicks, writes byNickname, PRESERVES sessionTemplate
const F = '/tmp/proxy-assign-selfcheck.json';
try { fs.rmSync(F, { force: true }); } catch {}
fs.writeFileSync(F, JSON.stringify({ sessionTemplate: { server: 'http://gate:7000', username: 'u-{nick}', password: 'p' } }));
const r = assign(
  ['10.0.0.1:8000:u1:p1', '10.0.0.2:8000:u2:p2', '10.0.0.3:8000:u3:p3'],
  ['aniket', 'krishi'],
  { geo: { timezoneId: 'Asia/Kolkata', locale: 'en-IN' }, poolFile: F },
);
const out = JSON.parse(fs.readFileSync(F, 'utf8'));
assert.equal(r.assigned, 2);
assert.equal(r.skipped, 1, 'third proxy has no nick → unassigned');
assert.ok(out.sessionTemplate, 'sessionTemplate preserved');
assert.equal(out.byNickname.aniket.server, 'http://10.0.0.1:8000');
assert.equal(out.byNickname.aniket.geo.timezoneId, 'Asia/Kolkata');
assert.equal(out.byNickname.krishi.username, 'u2');
console.log('✓ assign zips + preserves sessionTemplate + attaches geo');

// 3. re-assign warns and overwrites the same nick
const r2 = assign(['10.0.0.9:8000:u9:p9'], ['aniket'], { poolFile: F });
assert.deepEqual(r2.reassigned, ['aniket']);
assert.equal(JSON.parse(fs.readFileSync(F, 'utf8')).byNickname.aniket.server, 'http://10.0.0.9:8000');
console.log('✓ re-assign flagged + overwrites');

fs.rmSync(F, { force: true });
console.log('\nALL PROXY-ASSIGN CHECKS PASSED');
