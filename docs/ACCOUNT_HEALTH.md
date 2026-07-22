# Account Health & Anti-Ban System

Reduces account restrictions by (1) remembering per-account signals and benching
accounts that flash warnings, and (2) routing each account through a sticky
residential proxy with a stable fingerprint. Bans come from a finite, known
signal set — this is a rules engine with a feedback loop, not ML.

## Parts

| File | Role |
|------|------|
| `src/health/accountHealth.ts` | Ledger + signal→action policy + `canPost` gate + warmup ramp |
| `src/health/proxyPool.ts` | Sticky per-account proxy + consistent per-account fingerprint |
| `scripts/health-status.ts` | CLI: view ledger, `--reactivate <platform> <nickname>` |
| `.accounts/health.json` | The ledger (auto-created, gitignored) |
| `.accounts/proxies.json` | Proxy config (you create it, gitignored) |

## Signal → action

| Result | Signal | Action |
|--------|--------|--------|
| success | SUCCESS | +2 health, count the post |
| suspended / banned / disabled | FATAL | mark **dead**, stop forever, alert |
| checkpoint / challenge / unusual activity / captcha / locked | HARD | **quarantine** (needs human) |
| rate-limit / too fast / action-blocked / throttled | SOFT | **cooldown 48 h**, −20 health, half cap for a week |
| selector timeout / network / generic | RETRYABLE | −5 health; 3-in-a-row → 6 h cooldown |

## Observe vs enforce (rollout safety)

The gate ships in **observe mode**: it records signals and logs `would-skip …`
but still posts, so you can validate the ledger against real traffic first.
When it looks right, enforce it:

```bash
# on the VPS run folder .env
HEALTH_ENFORCE=true
# then restart the scheduler at a safe window (generating-blogs phase)
```

Check the ledger any time:
```bash
node --import=tsx scripts/health-status.ts
node --import=tsx scripts/health-status.ts --reactivate LinkedIn aniket   # after fixing an account
```

## Warmup (new accounts only)

Existing accounts are treated as **established** (full cap) the first time
they're seen — they are NOT throttled. Only accounts you explicitly onboard
warm up (cap 1 → full over ~18 days):
```ts
import { markNew } from './src/health/accountHealth.js';
markNew('X', 'new_nickname');   // call when provisioning a fresh account
```

## Proxies (`.accounts/proxies.json`)

The #1 cause of blocks was ~240 accounts posting from one datacenter IP. Give
each account a **sticky** residential/mobile IP. Most providers do sticky
sessions via a username suffix — `{nick}` is replaced with the account nickname:

```json
{
  "sessionTemplate": {
    "server": "http://gate.yourprovider.com:7000",
    "username": "customer-USER-cc-in-sessid-{nick}",
    "password": "PASS",
    "geo": { "timezoneId": "Asia/Kolkata", "locale": "en-IN" }
  },
  "byNickname": {
    "aniket": { "server": "...", "username": "...", "password": "...", "geo": { "timezoneId": "Asia/Kolkata", "locale": "en-IN" } }
  }
}
```

Absent/empty file ⇒ no proxy (safe no-op). `geo` sets the browser timezone/locale
to match the proxy's exit country.

### Verify proxies before relying on them
Bought proxies are often partly dead. `scripts/proxy-check.ts` tests each account's
proxy through the *same* Playwright path the posters use, and flags dead / not-routing IPs:
```bash
node --import=tsx scripts/proxy-check.ts --direct          # baseline: the box's own IP
node --import=tsx scripts/proxy-check.ts aniket krishi ...  # each account's exit IP + geo + latency
```
Exit code is non-zero if any proxy is dead or not routing (safe to wire into a cron check).
No server, no third-party code — nothing to hijack.

### Migration caution
Do NOT flip every existing account onto a new IP at once — a sudden IP change on
an established session can itself trigger a checkpoint. Roll out gradually:
new accounts on proxy from day 1; migrate existing accounts a few at a time and
watch `health-status`.

## Follow-ups (not yet wired)

- Health gate is live on **X / Facebook / LinkedIn** (where blocks happen). Same
  two-line pattern (`healthGate(...)` before post, `healthRecordSafe(...)` after)
  extends to the other batches in `masterCoordinator.ts`.
- `getLaunchIdentity(nickname)` from `proxyPool.ts` needs wiring into each
  `launchPersistentContext` (`proxy`, `userAgent`, `viewport`, `locale`,
  `timezoneId`). Start with X/FB/LI. Keep Cloudflare-stealth UAs where they exist.
- Timing jitter / randomized account order in the scheduler for a more human cadence.
