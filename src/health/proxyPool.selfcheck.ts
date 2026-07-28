/** Run: PROXY_POOL_FILE=/tmp/p.json node --import=tsx src/health/proxyPool.selfcheck.ts */
import assert from 'assert';
import fs from 'fs';
import { getProxy, getLaunchIdentity, identityLaunchOverrides, proxiesConfigured, markProxyBorn, _resetForTest } from './proxyPool.js';

const F = '/tmp/proxy-selfcheck.json';
process.env.PROXY_POOL_FILE = F;

// 1. No file ⇒ safe no-op (no proxy), but a stable fingerprint is still returned.
try { fs.rmSync(F, { force: true }); } catch {}
_resetForTest();
assert.equal(proxiesConfigured(), false);
assert.equal(getProxy('aniket'), undefined);
const idA = getLaunchIdentity('aniket');
assert.equal(idA.proxy, undefined);
assert.ok(idA.userAgent.includes('Chrome'));
assert.deepEqual(getLaunchIdentity('aniket').viewport, idA.viewport, 'fingerprint must be stable per account');
console.log('✓ no config ⇒ no proxy, stable fingerprint');

// 2. sessionTemplate ⇒ sticky per-account username substitution.
fs.writeFileSync(F, JSON.stringify({
  sessionTemplate: {
    server: 'http://gate.provider.com:7000',
    username: 'cust-USER-sess-{nick}',
    password: 'PASS',
    geo: { timezoneId: 'Asia/Kolkata', locale: 'en-IN' },
  },
}));
_resetForTest();
assert.equal(proxiesConfigured(), true);
assert.equal(getProxy('aniket')!.username, 'cust-USER-sess-aniket');
assert.equal(getProxy('krishi')!.username, 'cust-USER-sess-krishi', 'each account gets its own sticky session');
assert.equal(getLaunchIdentity('aniket').timezoneId, 'Asia/Kolkata');
console.log('✓ sessionTemplate ⇒ per-account sticky IP');

// 3. byNickname overrides the template.
fs.writeFileSync(F, JSON.stringify({
  sessionTemplate: { server: 'http://gate:7000', username: 'u-{nick}', password: 'p' },
  byNickname: { aniket: { server: 'http://special:8000', username: 'anike-special', password: 'x' } },
}));
_resetForTest();
assert.equal(getProxy('aniket')!.server, 'http://special:8000');
assert.equal(getProxy('krishi')!.server, 'http://gate:7000');
console.log('✓ byNickname override');

// 4. Two accounts get DIFFERENT fingerprints (not all identical).
_resetForTest();
const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map(getLaunchIdentity);
assert.ok(new Set(ids.map(i => i.userAgent + JSON.stringify(i.viewport))).size > 1, 'fingerprints should vary across accounts');
console.log('✓ fingerprints vary across accounts');

// 5. identityLaunchOverrides (Option A): proxy ONLY for sessions born on a proxy
// (.proxy-born marker written by the login flow); fingerprint only for FRESH dirs.
// Established box-IP sessions are never switched to a proxy (checkpoint risk).
fs.writeFileSync(F, JSON.stringify({ sessionTemplate: { server: 'http://gate:7000', username: 'u-{nick}', password: 'p' } }));
_resetForTest();
const existingDir = '/tmp/pp-existing-session'; fs.mkdirSync(existingDir, { recursive: true });
const freshDir = '/tmp/pp-fresh-session-does-not-exist'; try { fs.rmSync(freshDir, { recursive: true, force: true }); } catch {}
const oExisting = identityLaunchOverrides(existingDir, 'aniket');
assert.equal(oExisting.proxy, undefined, 'box-IP session (no marker) must NOT be switched to a proxy');
assert.equal(oExisting.userAgent, undefined, 'existing session keeps its device — no UA change');
markProxyBorn(existingDir);
const oBorn = identityLaunchOverrides(existingDir, 'aniket');
assert.ok(oBorn.proxy, 'proxy-born session stays on its proxy for life');
assert.equal(oBorn.userAgent, undefined, 'proxy-born but existing — fingerprint still untouched');
const oFresh = identityLaunchOverrides(freshDir, 'aniket');
assert.ok(oFresh.userAgent && !oFresh.proxy, 'fresh dir: fingerprint yes; proxy only after login marks it proxy-born');
fs.rmSync(existingDir, { recursive: true, force: true });
console.log('✓ Option A: marker→proxy, no marker→box IP, fresh→fingerprint only');

console.log('\nALL PROXY-POOL CHECKS PASSED');
