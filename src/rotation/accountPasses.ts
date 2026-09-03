/**
 * accountPasses.ts — the shared "account pass" engine behind
 * scripts/nightly-social-rotation.ts and scripts/nightly-blogpost-rotation.ts.
 *
 * A day is a list of BATCHES (each batch = an ordered set of platforms), run
 * once per ACCOUNT PASS:
 *
 *   for pass = 1 .. (highest declared account count across agents × platforms):
 *     for each batch, in order:
 *       for each agent, in order:
 *         post 1 on every platform in the batch on which this agent has
 *         declared an account #pass  (none → the agent is skipped for this batch)
 *
 * So pass 1 is everyone's account #1, pass 2 is account #2 for whoever has
 * one, and so on. A platform's posts-per-account-per-day is simply how many
 * batches it appears in — the caller shapes the batches, this module just
 * walks them. Account counts come from .accounts/account-counts.json (the
 * "Accounts" number each member sets per platform on their dashboard page —
 * see accountRotation.ts), read when the day's plan is built.
 *
 * One STEP = one agent × one batch × one account = a counted post cycle with
 * count 1 per platform (postCycle.ts startPostCycle → run-post-cycle-once.ts →
 * runCountedPostCycle = one round, no gap), with POST_ACCOUNT_INDEX pinning
 * the account (accountRotation.ts explicit mode — no round-robin). Steps run
 * strictly one after another; if the agent already has a cycle running (the
 * other rotation, or a manual "Post Now") the step waits for it and then runs
 * — never skips (see runPostCycleToCompletion).
 *
 * Log markers (rotation-health-check.ts keys off these):
 *   "<name> day starting"  …  "<name> day complete"
 */
import { runPostCycleToCompletion } from '../login-portal/postCycle.js';
import { getAccountCount } from '../utils/accountRotation.js';

/** A platform as the posting cycle knows it (`key`, a COUNTED_PLATFORMS key in
 * scheduler-new.ts) and as the account registry knows it (`declKey`, the key
 * in account-counts.json / selectAccountForPlatform). Usually identical; not
 * for LinkedIn (`lipost`/`lipulse` → `li`) or Google Sites (`googlepost` → `googlesite`). */
export interface PassPlatform { key: string; declKey: string }
export interface BatchSpec { label: string; platforms: PassPlatform[] }
export interface Step { pass: number; batch: number; agent: string; counts: Record<string, number> }
export interface DayPlan { passes: number; steps: Step[] }

export interface AccountPassConfig {
  /** Shown in log markers: "<name> day starting" / "<name> day complete". */
  name: string;
  agents: string[];
  /** The batches of one pass, in run order. The same batches run in every pass. */
  batches: BatchSpec[];
  personGapMs: number;
  batchGapMs: number;
  passGapMs: number;
  pollMs?: number;
  log: (msg: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Every distinct platform across all batches, first-seen order. */
export function allPlatforms(batches: BatchSpec[]): PassPlatform[] {
  const seen = new Map<string, PassPlatform>();
  for (const b of batches) for (const p of b.platforms) if (!seen.has(p.key)) seen.set(p.key, p);
  return [...seen.values()];
}

/** Highest declared account count across every agent × platform = number of passes today. */
export function accountPassesToday(agents: string[], batches: BatchSpec[]): number {
  let max = 1;
  for (const agent of agents) {
    for (const p of allPlatforms(batches)) max = Math.max(max, getAccountCount(agent, p.declKey));
  }
  return max;
}

/** Counts for one step: 1 on each batch platform where this agent has declared an account #pass. */
export function stepCounts(agent: string, batch: BatchSpec, pass: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of batch.platforms) {
    if (getAccountCount(agent, p.declKey) >= pass) counts[p.key] = 1;
  }
  return counts;
}

/** The whole day's step list in run order: pass → batch → agent. */
export function buildDayPlan(cfg: AccountPassConfig): DayPlan {
  const passes = accountPassesToday(cfg.agents, cfg.batches);
  const steps: Step[] = [];
  for (let pass = 1; pass <= passes; pass++) {
    cfg.batches.forEach((batch, i) => {
      for (const agent of cfg.agents) {
        const counts = stepCounts(agent, batch, pass);
        if (Object.keys(counts).length) steps.push({ pass, batch: i + 1, agent, counts });
      }
    });
  }
  return { passes, steps };
}

/** Human-readable dump of a day plan, with per-agent totals checked against declared accounts × batches-per-platform. */
export function formatDayPlan(cfg: AccountPassConfig, plan: DayPlan): string {
  const out: string[] = [];
  const platforms = allPlatforms(cfg.batches);
  out.push(`Agents: ${cfg.agents.join(' → ')}`);
  out.push(`Batches per pass: ${cfg.batches.map((b) => `${b.label} [${b.platforms.map((p) => p.key).join(' ')}]`).join('  ·  ')}`);
  out.push(`Account passes today: ${plan.passes} (from .accounts/account-counts.json)`);
  out.push('');
  let lastKey = '';
  for (const s of plan.steps) {
    const key = `${s.pass}:${s.batch}`;
    if (key !== lastKey) {
      const batch = cfg.batches[s.batch - 1];
      out.push(`— pass ${s.pass} (account #${s.pass}) · ${batch.label} · ${batch.platforms.map((p) => p.key).join(', ')}`);
      lastKey = key;
    }
    out.push(`    ${s.agent.padEnd(10)} ${Object.keys(s.counts).join(' ')}`);
  }
  out.push('');
  out.push('Per-agent totals for today (must equal declared accounts × batches the platform appears in):');
  for (const agent of cfg.agents) {
    const parts: string[] = [];
    let ok = true;
    for (const p of platforms) {
      const total = plan.steps.filter((s) => s.agent === agent).reduce((n, s) => n + (s.counts[p.key] ?? 0), 0);
      const perAccount = cfg.batches.filter((b) => b.platforms.some((x) => x.key === p.key)).length;
      const expected = getAccountCount(agent, p.declKey) * perAccount;
      if (total !== expected) ok = false;
      parts.push(`${p.key}:${total}${total === expected ? '' : `(expected ${expected})`}`);
    }
    out.push(`  ${agent.padEnd(10)} ${parts.join(' ')}   ${ok ? '✓' : '✗'}`);
  }
  const posts = plan.steps.reduce((n, s) => n + Object.keys(s.counts).length, 0);
  out.push('');
  out.push(`Total: ${plan.steps.length} steps, ${posts} posts.`);
  return out.join('\n');
}

async function runStep(cfg: AccountPassConfig, s: Step): Promise<void> {
  const label = `${s.agent} · account #${s.pass} · ${cfg.batches[s.batch - 1].label}`;
  cfg.log(`=== ${label}: ${Object.keys(s.counts).join(' ')} ===`);
  await runPostCycleToCompletion(s.agent, s.counts, { POST_ACCOUNT_INDEX: String(s.pass) }, {
    pollMs: cfg.pollMs ?? 15_000,
    onWait: (why) => cfg.log(`⏸ ${s.agent}: ${why} — waiting for it to finish, then running this step.`),
  });
  cfg.log(`${label} complete.`);
}

/** Run one full day: every pass, every batch, every agent, with the configured gaps. */
export async function runDay(cfg: AccountPassConfig, plan: DayPlan = buildDayPlan(cfg)): Promise<void> {
  const { log } = cfg;
  log(`${cfg.name} day starting. Agents: ${cfg.agents.join(' → ')} | ${cfg.batches.length} batch(es)/pass | ${plan.passes} account pass(es) | ${plan.steps.length} steps`);
  for (let pass = 1; pass <= plan.passes; pass++) {
    log(`--- Account pass ${pass} starting ---`);
    for (let b = 1; b <= cfg.batches.length; b++) {
      const batch = cfg.batches[b - 1];
      const keys = batch.platforms.map((p) => p.key).join(', ');
      const batchSteps = plan.steps.filter((s) => s.pass === pass && s.batch === b);
      const who = batchSteps.map((s) => s.agent).join(' → ') || `nobody has an account #${pass} here`;
      log(`--- Pass ${pass} · ${batch.label} (${keys}): ${who} ---`);
      for (const agent of cfg.agents) {
        const step = batchSteps.find((s) => s.agent === agent);
        if (!step) {
          if (pass > 1) log(`${agent}: no account #${pass} on ${keys} — skipping.`);
          continue;
        }
        await runStep(cfg, step);
        await sleep(cfg.personGapMs);
      }
      if (b < cfg.batches.length) {
        log(`--- ${batch.label} done — ${Math.round(cfg.batchGapMs / 60000)} min break before ${cfg.batches[b].label} ---`);
        await sleep(cfg.batchGapMs);
      }
    }
    log(`--- Account pass ${pass} complete ---`);
    if (pass < plan.passes) {
      log(`--- ${Math.round(cfg.passGapMs / 60000)} min break before account pass ${pass + 1} ---`);
      await sleep(cfg.passGapMs);
    }
  }
  log(`${cfg.name} day complete — ${plan.steps.length} steps run.`);
}

/** Parse "HH:MM"; fall back when malformed. */
export function parseHHMM(s: string, fallback: [number, number]): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h >= 0 && h < 24 && mi >= 0 && mi < 60 ? [h, mi] : fallback;
}

/** Milliseconds until the next occurrence of hh:mm IST (tomorrow if it's already past today). */
export function msUntilNextIst(h: number, m: number): number {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const next = new Date(nowIst);
  next.setUTCHours(h, m, 0, 0);
  if (next.getTime() <= nowIst.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - nowIst.getTime();
}
