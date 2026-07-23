/**
 * server.ts — Login Portal API (the VPS ⇄ dashboard bridge).
 *
 * Runs as its own pm2 process (`login-api`), separate from `scheduler`, bound to
 * localhost and fronted by Nginx + Tailscale Funnel. Lets the Vercel dashboard:
 *   - read an agent's fleet login status
 *   - start a live browser login (embedded as a live, interactive CDP screencast)
 *   - finish/tear down a login
 *
 * Login sessions run through cdpLoginPool.ts — headless Chrome + CDP screencast,
 * no X11/VNC/websockify involved. The old Xvfb+x11vnc+websockify stack (still
 * boot here via startWebsockify()) is kept running only for the legacy shared
 * `:99` viewer during the transition; nothing in the login flow depends on it
 * anymore and it can be removed once that's confirmed unused too.
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { requireDashboardSecret } from './auth.js';
import {
  API_PORT, WEBSOCKIFY_PORT, TOKEN_DIR, NOVNC_WEB_ROOT, PUBLIC_BASE_URL, PLATFORMS,
} from './config.js';
import {
  agentSessionDir, registerFleetAccount, listAgentStatus, nextIndex, sessionReadyForDir,
} from './sessionResolver.js';
import { startLogin, teardown, getLogin, sweepExpired, poolStatus, loginQueue } from './cdpLoginPool.js';
import { verifyOrSetPin, mintToken, requireAgentToken } from './agentAuth.js';
import { startCycle, stopCycle, cycleStatus } from './blogCycle.js';
import { startPostCycle, stopPostCycle, postCycleStatus } from './postCycle.js';
import { proxySummary, rotateProxy } from '../health/proxyPool.js';
import { checkProxies } from '../health/proxyCheck.js';

let websockifyProc: ChildProcess | null = null;

/** Agents with a blog-generation run currently in flight (one at a time — shared ChatGPT). */
const generating = new Set<string>();

function startWebsockify(): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  // Single shared websockify: serves noVNC static files AND routes by ?token=.
  websockifyProc = spawn('websockify', [
    '--web', NOVNC_WEB_ROOT,
    '--token-plugin', 'TokenFile',
    '--token-source', TOKEN_DIR,
    String(WEBSOCKIFY_PORT),
  ], { stdio: 'ignore' });
  websockifyProc.on('exit', (code) => {
    console.error(`[login-api] websockify exited (code ${code}) — restarting in 2s`);
    setTimeout(startWebsockify, 2000);
  });
}

/** Build the public noVNC URL for a login token (relative if no public base set). */
function novncUrl(token: string): string {
  const path = `vnc.html?autoconnect=1&resize=scale&reconnect=1&path=${encodeURIComponent('websockify?token=' + token)}`;
  return PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL.replace(/\/$/, '')}/${path}` : `/${path}`;
}

const app = express();
app.use(express.json());

// Health check is unauthenticated (for tunnel/uptime probes).
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, pool: poolStatus(), websockify: !!websockifyProc });
});

app.use('/api', requireDashboardSecret);

// POST /api/agent/:agent/auth { pin } — verify (or set on first use) the agent PIN,
// returning a short-lived agent-scoped token for subsequent calls.
app.post('/api/agent/:agent/auth', (req: Request, res: Response) => {
  const pin = String(req.body?.pin || '');
  const { ok, created } = verifyOrSetPin(req.params.agent, pin);
  if (!ok) {
    res.status(401).json({ error: 'invalid PIN' });
    return;
  }
  res.json({ ok: true, created, token: mintToken(req.params.agent) });
});

// GET /api/agent/:agent/status — fleet login status per platform.
app.get('/api/agent/:agent/status', requireAgentToken, (req: Request, res: Response) => {
  res.json(listAgentStatus(req.params.agent));
});

// POST /api/agent/:agent/login  { platform, index? } — start an embedded login.
app.post('/api/agent/:agent/login', requireAgentToken, async (req: Request, res: Response) => {
  const agent = req.params.agent.toLowerCase();
  const platform = String(req.body?.platform || '').toLowerCase();
  if (!PLATFORMS[platform]) {
    res.status(400).json({ error: `unknown platform "${platform}"` });
    return;
  }
  const index = Number(req.body?.index) > 0 ? Number(req.body.index) : nextIndex(agent, platform);
  const sessionDir = agentSessionDir(agent, platform, index);
  // "View session" mode: open the platform's logged-in page (reveals the stored
  // account) instead of the login page. Read-only — the user just looks, then closes.
  const view = Boolean(req.body?.view);
  const openUrl = view
    ? (PLATFORMS[platform].homeUrl || PLATFORMS[platform].loginUrl)
    : PLATFORMS[platform].loginUrl;

  try {
    registerFleetAccount(agent, platform, index);
    const started = await startLogin({
      agent, platform, index, sessionDir, loginUrl: openUrl,
    });
    res.json({
      ok: true,
      agent, platform, index, view,
      nickname: `${agent} ${index}`,
      token: started.token,
      // Field name kept as `novncUrl` so the dashboard frontend needs no change —
      // it just embeds whatever URL comes back. Now points at the CDP screencast
      // viewer instead of noVNC; same contract, different transport underneath.
      novncUrl: started.viewerUrl,
      expiresAt: started.expiresAt,
    });
  } catch (err: any) {
    if (err?.message === 'POOL_EXHAUSTED') {
      res.status(503).json({ error: 'all login slots are busy — try again shortly' });
      return;
    }
    if (err?.message === 'BOX_BUSY') {
      res.status(503).json({ error: 'a posting session is running right now — try again in a few minutes' });
      return;
    }
    console.error('[login-api] start-login failed:', err);
    res.status(500).json({ error: 'failed to start login' });
  }
});

// POST /api/agent/:agent/login/:token/finish — tear down, then check readiness.
// Order matters: teardown() shuts Chrome down gracefully (SIGTERM, waits for
// exit) so any just-completed login's cookies actually reach disk before we
// read them — checking readiness first (the old order) could read a stale
// Cookies DB and report "not logged in" for a login that actually succeeded.
app.post('/api/agent/:agent/login/:token/finish', requireAgentToken, async (req: Request, res: Response) => {
  const agent = req.params.agent.toLowerCase();
  const token = req.params.token;
  const login = getLogin(token);
  if (!login || login.agent !== agent) {
    res.status(404).json({ error: 'unknown or mismatched login token' });
    return;
  }
  const { sessionDir, platform, index } = login;
  await teardown(token);
  const ready = sessionReadyForDir(sessionDir, platform);
  res.json({ ok: true, platform, index, ready });
});

// POST /api/agent/:agent/login-batch { platform, indices?[], count? } — start many
// logins at once. Each is auto-filled (if credentials are populated); the operator
// then only handles the ones that land in the "needs-human" queue below.
// NOTE: bounded by the box-wide MAX_BROWSERS cap — for a bulk onboarding session,
// pause the scheduler and set MAX_BROWSERS=5 so 5 logins can run in parallel.
app.post('/api/agent/:agent/login-batch', requireAgentToken, async (req: Request, res: Response) => {
  const agent = req.params.agent.toLowerCase();
  const platform = String(req.body?.platform || '').toLowerCase();
  if (!PLATFORMS[platform]) {
    res.status(400).json({ error: `unknown platform "${platform}"` });
    return;
  }
  let indices: number[] = Array.isArray(req.body?.indices)
    ? req.body.indices.map(Number).filter((n: number) => n > 0)
    : [];
  if (!indices.length) {
    // No explicit indices → allocate `count` fresh sequential ones (default 5).
    const count = Math.max(1, Math.min(10, Number(req.body?.count) || 5));
    const start = nextIndex(agent, platform);
    indices = Array.from({ length: count }, (_, i) => start + i);
  }

  const results: Array<{ index: number; ok: boolean; token?: string; novncUrl?: string; state?: string; reason?: string }> = [];
  for (const index of indices) {
    try {
      registerFleetAccount(agent, platform, index);
      const started = await startLogin({
        agent, platform, index, sessionDir: agentSessionDir(agent, platform, index),
        loginUrl: PLATFORMS[platform].loginUrl,
      });
      results.push({ index, ok: true, token: started.token, novncUrl: started.viewerUrl, state: started.state });
    } catch (err: any) {
      // Slots/box full → stop starting more; the operator raises MAX_BROWSERS or
      // finishes some first. Report the remaining as skipped, don't 500 the batch.
      const reason = err?.message === 'POOL_EXHAUSTED' ? 'slots-full'
        : err?.message === 'BOX_BUSY' ? 'box-busy' : (err?.message || 'error');
      results.push({ index, ok: false, reason });
      if (reason === 'slots-full' || reason === 'box-busy') break;
    }
  }
  res.json({ ok: true, agent, platform, started: results.filter(r => r.ok).length, results });
});

// GET /api/agent/:agent/login-queue — live logins for this agent with per-login
// state, so the dashboard can show only the ones that still need a human.
app.get('/api/agent/:agent/login-queue', requireAgentToken, (req: Request, res: Response) => {
  res.json({ ok: true, queue: loginQueue(req.params.agent.toLowerCase()) });
});

// POST /api/agent/:agent/generate-blogs { count } — on-demand: generate N blogs now.
// Spawns the generator (single pass, up to `count` unprocessed rows) headed on :99.
app.post('/api/agent/:agent/generate-blogs', requireAgentToken, (req: Request, res: Response) => {
  const agent = req.params.agent.toLowerCase();
  const count = Math.max(1, Math.min(20, Number(req.body?.count) || 1));
  const format = String(req.body?.format || '').trim();   // optional batch override
  const sample = String(req.body?.sample || '').trim();    // optional custom sample HTML
  if (generating.has(agent)) {
    res.status(409).json({ error: 'a generation is already running for this agent — wait for it to finish' });
    return;
  }
  generating.add(agent);

  const args = ['tsx', 'scripts/run-blog-generator.ts', '--name', agent, '--limit', String(count)];
  if (format) args.push('--format-override', format);
  let sampleTmp = '';
  if (sample) {
    sampleTmp = `/tmp/gen-sample-${agent}-${Date.now()}.html`;
    fs.writeFileSync(sampleTmp, sample, 'utf-8');
    args.push('--sample-file', sampleTmp);
  }

  const logFile = `/tmp/blog-gen-${agent}.log`;
  fs.appendFileSync(logFile, `\n=== generate ${count} (${format || 'per-row format'}) @ ${new Date().toISOString()} ===\n`);
  // Scripts write progress DIRECTLY to logFile (via BLOG_LOG) — unbuffered/live —
  // so stdio is ignored here (avoids Node's buffered stdout making the banner lag).
  const child = spawn('npx', args, {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: { ...process.env, DISPLAY: ':99', WORKER_NAME: agent, BLOG_LOG: logFile },
  });
  child.unref();
  const release = () => { generating.delete(agent); if (sampleTmp) { try { fs.rmSync(sampleTmp, { force: true }); } catch { /* noop */ } } };
  child.on('exit', release);
  // Safety release, sized to ~35 min/blog so the lock never frees while a slow run is still going.
  setTimeout(release, (count * 35 + 10) * 60 * 1000);
  res.json({ ok: true, agent, count, message: `Generating ${count} blog(s). Content fills into your sheet as each finishes (~10-15 min each).` });
});

// GET /api/agent/:agent/generate-status — running? + recent progress/error log lines.
app.get('/api/agent/:agent/generate-status', requireAgentToken, (req: Request, res: Response) => {
  const agent = req.params.agent.toLowerCase();
  let log = '';
  try {
    log = fs.readFileSync(`/tmp/blog-gen-${agent}.log`, 'utf-8')
      .trim().split('\n').filter(Boolean).slice(-12).join('\n');
  } catch { /* no run yet */ }
  res.json({ generating: generating.has(agent), log });
});

// POST /api/agent/:agent/blog-cycle/start — begin the continuous loop: generate
// up to 5 blogs, sleep 30 min, repeat, until stopped. Locking is per-agent —
// each agent has its own ChatGPT profile, so different agents' cycles don't
// block each other; only starting a second cycle for the SAME agent is rejected.
app.post('/api/agent/:agent/blog-cycle/start', requireAgentToken, (req: Request, res: Response) => {
  const agent = req.params.agent.toLowerCase();
  try {
    startCycle(agent);
    res.json({ ok: true, message: `Blog cycle started for ${agent} — 5 blogs, then a 30 min pause, repeating until you stop it.` });
  } catch (err: any) {
    res.status(409).json({ error: err.message });
  }
});

// POST /api/agent/:agent/blog-cycle/stop — stop this agent's cycle.
app.post('/api/agent/:agent/blog-cycle/stop', requireAgentToken, (req: Request, res: Response) => {
  const result = stopCycle(req.params.agent.toLowerCase());
  res.json({ ok: true, ...result });
});

// GET /api/agent/:agent/blog-cycle/status — running? recent log lines, for THIS agent.
app.get('/api/agent/:agent/blog-cycle/status', requireAgentToken, (req: Request, res: Response) => {
  res.json(cycleStatus(req.params.agent.toLowerCase()));
});

// POST /api/agent/:agent/post-cycle/start — one-off "Post Now" run: all 15
// full 5-cycle narrowing sequence, once through, independent of the live scheduler daemon.
app.post('/api/agent/:agent/post-cycle/start', requireAgentToken, (req: Request, res: Response) => {
  const agent = req.params.agent.toLowerCase();
  try {
    startPostCycle(agent);
    res.json({ ok: true, message: `Post cycle started for ${agent} — full 5-cycle sequence (15 → 13 → 8 → 5 → 2 platforms, 30 min between each), once through.` });
  } catch (err: any) {
    res.status(409).json({ error: err.message });
  }
});

// POST /api/agent/:agent/post-cycle/stop — stop whichever post cycle is running.
app.post('/api/agent/:agent/post-cycle/stop', requireAgentToken, (_req: Request, res: Response) => {
  const result = stopPostCycle();
  res.json({ ok: true, ...result });
});

// GET /api/agent/:agent/post-cycle/status — running? which agent? recent log + stage detail.
app.get('/api/agent/:agent/post-cycle/status', requireAgentToken, (_req: Request, res: Response) => {
  res.json(postCycleStatus());
});

// ── Proxy management (dashboard test/rotate buttons) ────────────────────────
// All under /api, so already behind requireDashboardSecret. Never returns proxy
// credentials — only names, rotation counters, and live exit-IP test results.

// GET /api/proxy/list — configured accounts + rotation state (fast, no browser).
app.get('/api/proxy/list', (_req: Request, res: Response) => {
  res.json(proxySummary());
});

// POST /api/proxy/test { nicks: string[] } — verify proxies via the real
// Playwright path (launches a headless browser; admin action, so it's fine).
app.post('/api/proxy/test', async (req: Request, res: Response) => {
  const nicks = Array.isArray(req.body?.nicks) ? req.body.nicks.map(String).slice(0, 50) : [];
  try {
    res.json(await checkProxies(nicks));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'proxy test failed' });
  }
});

// POST /api/proxy/rotate { nick } — hand this account a fresh sticky IP.
app.post('/api/proxy/rotate', (req: Request, res: Response) => {
  const nick = String(req.body?.nick || '').trim();
  if (!nick) { res.status(400).json({ error: 'nick required' }); return; }
  const r = rotateProxy(nick);
  // Strip the proxy creds from the response — dashboard only needs the outcome.
  res.json({ rotated: r.rotated, rotation: r.rotation, reason: r.reason });
});

// Watchdog: force-tear-down abandoned logins past their TTL.
setInterval(() => {
  const n = sweepExpired();
  if (n) console.log(`[login-api] swept ${n} expired login(s)`);
}, 60 * 1000);

startWebsockify();
app.listen(API_PORT, '127.0.0.1', () => {
  console.log(`[login-api] listening on 127.0.0.1:${API_PORT} · websockify :${WEBSOCKIFY_PORT}`);
});

function shutdown() {
  try { websockifyProc?.kill('SIGKILL'); } catch { /* noop */ }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Keep the daemon alive through async faults. The screencast/CDP path throws
// "Target/context/browser has been closed" as an *unhandled rejection* when a
// user's Chrome dies mid-session — which was crashing the whole login-api and
// forcing a PM2 restart (42 of them). These are per-session faults, not process
// faults: log and carry on so other logins aren't interrupted.
process.on('unhandledRejection', (reason: any) => {
  console.error(`[login-api] unhandledRejection (ignored):`, reason?.message || reason);
});
process.on('uncaughtException', (err: any) => {
  console.error(`[login-api] uncaughtException (ignored):`, err?.message || err);
});
