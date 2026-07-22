/**
 * Self-check for accountHealth. Run: HEALTH_LEDGER_FILE=/tmp/h.json node --import=tsx src/health/accountHealth.selfcheck.ts
 * Asserts the gate + policy behave. No framework.
 */
import assert from 'assert';
import fs from 'fs';
import { canPost, record, effectiveCap, classify, reactivate, markNew, _resetForTest } from './accountHealth.js';

const F = process.env.HEALTH_LEDGER_FILE || '/tmp/health-selfcheck.json';
process.env.HEALTH_LEDGER_FILE = F;
try { fs.rmSync(F, { force: true }); } catch {}
_resetForTest();

const T = '2026-07-22T04:00:00.000Z'; // fixed "now" so warmup math is deterministic

// 1. classify maps signals correctly
assert.equal(classify({ success: true }), 'SUCCESS');
assert.equal(classify({ error: 'Account suspended for spam' }), 'FATAL');
assert.equal(classify({ reason: 'NEEDS_HUMAN', error: 'checkpoint/challenge' }), 'HARD');
assert.equal(classify({ error: 'You are posting too fast, slow down' }), 'SOFT');
assert.equal(classify({ error: 'posting too fast' }), 'SOFT'); // rate signal, not a generic fail
assert.equal(classify({ error: 'selector timeout waiting for #compose' }), 'RETRYABLE');
console.log('✓ classify');

// 2. An EXISTING account (first seen, not onboarded) is treated as established:
// full cap, NOT throttled to 1 — this is the live-fleet safety guarantee.
const gEst = canPost('X', 'established', T);
assert.equal(gEst.ok, true);
assert.equal(gEst.cap, 8, `established X account should get full cap 8, got ${gEst.cap}`);
console.log('✓ existing account = full cap (no accidental throttle)');

// 2b. Only an explicitly-onboarded new account warms up from cap 1.
markNew('X', 'fresh');
assert.equal(canPost('X', 'fresh', T).cap, 1, 'onboarded new account warms up at cap 1');
console.log('✓ markNew ⇒ warmup cap=1');

// 3. hitting the (warmup) cap blocks further posts the same day
record('X', 'fresh', { success: true }, T);
const g1 = canPost('X', 'fresh', T);
assert.equal(g1.ok, false);
assert.match(g1.reason, /daily cap/);
console.log('✓ daily cap enforced');

// 4. HARD signal quarantines immediately
record('LinkedIn', 'bob', { reason: 'NEEDS_HUMAN', error: 'checkpoint/challenge' }, T);
const g2 = canPost('LinkedIn', 'bob', T);
assert.equal(g2.ok, false);
assert.match(g2.reason, /quarantine/i);
console.log('✓ HARD → quarantine');

// 5. SOFT signal sets a cooldown that blocks now but frees later
record('Facebook', 'carol', { error: 'action blocked temporarily' }, T);
assert.equal(canPost('Facebook', 'carol', T).ok, false);
const later = '2026-07-25T04:00:00.000Z'; // >48h
assert.equal(canPost('Facebook', 'carol', later).ok, true, 'cooldown should expire after 48h');
console.log('✓ SOFT → cooldown, auto-expires');

// 6. FATAL kills the account permanently; reactivate() is the only way back
record('X', 'dave', { error: 'Your account has been permanently suspended' }, T);
assert.equal(canPost('X', 'dave', later).ok, false);
reactivate('X', 'dave');
// still capped by warmup but no longer dead → the block reason must not be "dead"
assert.doesNotMatch(canPost('X', 'dave', later).reason, /dead/);
console.log('✓ FATAL → dead, reactivate recovers');

// 7. an aged account gets the full safe cap (warmup complete)
const aged = '2026-09-01T04:00:00.000Z'; // >18 days after firstSeen(T)
// force firstSeen far in the past by seeding via a success at T then checking cap much later
assert.equal(effectiveCap({ platform: 'X', warmup: true, firstSeen: '2026-06-01' } as any, aged), 8,
  'aged X account should reach full cap 8');
console.log('✓ warmup completes → full cap');

console.log('\nALL ACCOUNT-HEALTH CHECKS PASSED');
