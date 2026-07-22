/** Run: PROXY_POOL_FILE=<f> PROXY_ROTATION_FILE=<g> node --import=tsx src/health/proxyRotate.selfcheck.ts */
import assert from 'assert';
import fs from 'fs';
import { getProxy, rotateProxy, _resetForTest } from './proxyPool.js';

const F = process.env.PROXY_POOL_FILE!;
const G = process.env.PROXY_ROTATION_FILE!;
fs.writeFileSync(F, JSON.stringify({
  sessionTemplate: { server: 'http://g:7000', username: 'u-{nick}', password: 'p' },
  byNickname: { staticguy: { server: 'http://1.2.3.4:9000', username: 'fixeduser', password: 'x' } },
}));
try { fs.rmSync(G, { force: true }); } catch {}
_resetForTest();

// sticky session account rotates → new session token → new sticky IP
assert.equal(getProxy('aniket')!.username, 'u-aniket');
const r1 = rotateProxy('aniket');
assert.equal(r1.rotated, true);
assert.equal(r1.rotation, 1);
assert.equal(r1.proxy!.username, 'u-aniket-r1');
assert.equal(getProxy('aniket')!.username, 'u-aniket-r1', 'getProxy reflects rotation after');
assert.equal(rotateProxy('aniket').proxy!.username, 'u-aniket-r2', 'rotates again');
console.log('✓ sessionTemplate account rotates to a new sticky token');

// static IP account (no {nick}) cannot rotate — reported, not mutated
const rs = rotateProxy('staticguy');
assert.equal(rs.rotated, false);
assert.match(rs.reason!, /static/i);
assert.equal(getProxy('staticguy')!.username, 'fixeduser', 'static account unchanged');
console.log('✓ static IP account correctly refuses to rotate');

console.log('\nALL PROXY-ROTATE CHECKS PASSED');
