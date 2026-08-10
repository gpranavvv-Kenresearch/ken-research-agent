'use client';
import useSWR from 'swr';
import { useState, useEffect } from 'react';
import PinGate from '@/components/PinGate';

const AGENT_ID = 'admin';
const TOKEN_KEY = 'kr_agent_token_admin';

interface PostCycleStatus {
  running: boolean;
  agent?: string;
  startedAt?: number;
  detail?: { stage?: number; round?: number; currentPlatform?: string; phase?: string };
}
interface BlogCycleStatus {
  running: boolean;
  agent?: string;
  startedAt?: number;
}
interface AgentStatus {
  id: string;
  postCycle: PostCycleStatus;
  blogCycle: BlogCycleStatus;
}
interface FailedItem {
  title: string;
  targetUrl: string;
  platform: string;
  error: string;
}
interface UserFailures {
  userId: string;
  displayName: string;
  blogFailed: FailedItem[];
  socialFailed: FailedItem[];
}
interface FeedbackRow {
  Name?: string;
  Message?: string;
  Category?: string;
  'Submitted At'?: string;
  [k: string]: unknown;
}
interface RunState { lastCompleted: string | null; lastStarted: string | null; state: 'ok' | 'running' | 'missed'; }
interface ScheduledHealth { checkedAt: string; istDay: string; posting: RunState; blog: RunState; }

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY));
    setHydrated(true);
  }, []);

  function saveToken(t: string) {
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }
  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  const authedFetcher = async (url: string) => {
    const r = await fetch(url, { headers: token ? { 'X-Agent-Token': token } : {} });
    if (r.status === 403) { clearToken(); throw new Error('session expired'); }
    return r.json();
  };

  const { data: statusData, isLoading: statusLoading, mutate: mutateStatus } = useSWR<{ agents: AgentStatus[]; scheduledHealth?: ScheduledHealth }>(
    hydrated && token ? '/api/admin/status' : null,
    authedFetcher,
    { refreshInterval: 10000, shouldRetryOnError: false }
  );

  const [busy, setBusy] = useState<string | null>(null);
  async function triggerCycle(target: string, kind: 'post' | 'blog', action: 'start' | 'stop') {
    setBusy(`${target}:${kind}:${action}`);
    try {
      const r = await fetch('/api/admin/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Agent-Token': token } : {}) },
        body: JSON.stringify({ target, kind, action }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) alert(`Failed: ${d.error || r.status}`);
      await mutateStatus();
    } finally {
      setBusy(null);
    }
  }

  const { data: failedData, isLoading: failedLoading } = useSWR<{ users: UserFailures[] }>(
    hydrated && token ? '/api/admin/failed-posts' : null,
    authedFetcher,
    { refreshInterval: 30000, shouldRetryOnError: false }
  );

  const { data: feedbackData, isLoading: feedbackLoading } = useSWR<{ rows: FeedbackRow[] }>(
    hydrated && token ? '/api/feedback' : null,
    authedFetcher,
    { refreshInterval: 30000, shouldRetryOnError: false }
  );

  if (!hydrated) return null;
  if (!token) return (
    <PinGate
      agentId={AGENT_ID}
      title="Admin Dashboard"
      subtitle="Enter the admin PIN. First time here? The PIN you type now becomes the admin PIN for everyone who needs this view."
      onAuthed={saveToken}
    />
  );

  const agents = statusData?.agents ?? [];
  const runningAgents = agents.filter((a) => a.postCycle.running || a.blogCycle.running);
  const users = failedData?.users ?? [];
  const totalFailed = users.reduce((sum, u) => sum + u.blogFailed.length + u.socialFailed.length, 0);
  const feedback = feedbackData?.rows ?? [];
  const health = statusData?.scheduledHealth;
  const healthPill = (label: string, s?: RunState) => {
    const st = s?.state ?? 'missed';
    const cls = st === 'ok' ? 'bg-emerald-900/50 text-emerald-400'
      : st === 'running' ? 'bg-amber-900/50 text-amber-400'
      : 'bg-red-900/60 text-red-300';
    const txt = st === 'ok' ? '✓ ran today' : st === 'running' ? '● running' : '✗ MISSED today';
    return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{label}: {txt}</span>;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Live process status, failed posts, and feedback across every member.</p>
        </div>
        <button onClick={clearToken} className="text-xs text-slate-400 hover:text-white">Log out</button>
      </div>

      {/* Scheduled-run health (cron: posting 08:00 IST, blog 00:00 IST) */}
      {health && (
        <div className={`rounded-xl p-3 border flex flex-wrap items-center gap-3 ${(health.posting.state === 'missed' || health.blog.state === 'missed') ? 'border-red-800/60 bg-red-950/30' : 'border-border bg-card'}`}>
          <span className="text-sm font-medium text-white">Scheduled runs</span>
          {healthPill('Posting', health.posting)}
          {healthPill('Blog gen', health.blog)}
          <span className="text-xs text-slate-500 ml-auto">as of {new Date(health.checkedAt).toLocaleString()}</span>
        </div>
      )}

      {/* Live status */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Live Right Now {!statusLoading && <span className="text-sm text-slate-400 font-normal">({runningAgents.length} running)</span>}
        </h2>
        {statusLoading && <p className="text-slate-500 text-sm">Loading…</p>}
        {!statusLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((a) => {
              const running = a.postCycle.running || a.blogCycle.running;
              return (
                <div key={a.id} className={`bg-card border rounded-xl p-4 ${running ? 'border-emerald-600/50' : 'border-border'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white capitalize">{a.id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${running ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {running ? '● running' : 'idle'}
                    </span>
                  </div>
                  {a.postCycle.running && (
                    <p className="text-xs text-slate-400">
                      Posting — round {a.postCycle.detail?.round ?? '?'}, {a.postCycle.detail?.currentPlatform ?? '…'}
                    </p>
                  )}
                  {a.blogCycle.running && <p className="text-xs text-slate-400">Generating blogs</p>}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <button disabled={busy !== null || a.postCycle.running}
                      onClick={() => triggerCycle(a.id, 'post', 'start')}
                      className="text-xs px-2 py-1 rounded bg-blue-900/40 text-blue-300 hover:bg-blue-800/50 disabled:opacity-40 disabled:cursor-not-allowed">
                      {busy === `${a.id}:post:start` ? '…' : 'Start Posting'}
                    </button>
                    <button disabled={busy !== null || a.blogCycle.running}
                      onClick={() => triggerCycle(a.id, 'blog', 'start')}
                      className="text-xs px-2 py-1 rounded bg-purple-900/40 text-purple-300 hover:bg-purple-800/50 disabled:opacity-40 disabled:cursor-not-allowed">
                      {busy === `${a.id}:blog:start` ? '…' : 'Start Generation'}
                    </button>
                    {a.postCycle.running && (
                      <button disabled={busy !== null} onClick={() => triggerCycle(a.id, 'post', 'stop')}
                        className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50 disabled:opacity-40">Stop Posting</button>
                    )}
                    {a.blogCycle.running && (
                      <button disabled={busy !== null} onClick={() => triggerCycle(a.id, 'blog', 'stop')}
                        className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50 disabled:opacity-40">Stop Gen</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Failed posts */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Failed Posts {!failedLoading && <span className="text-sm text-slate-400 font-normal">({totalFailed} total)</span>}
        </h2>
        {failedLoading && <p className="text-slate-500 text-sm">Loading…</p>}
        {!failedLoading && (
          <div className="space-y-3">
            {users.filter((u) => u.blogFailed.length + u.socialFailed.length > 0).map((u) => (
              <details key={u.userId} className="bg-card border border-red-900/40 rounded-xl p-4">
                <summary className="cursor-pointer font-medium text-white">
                  {u.displayName} — <span className="text-red-400">{u.blogFailed.length + u.socialFailed.length} failed</span>
                </summary>
                <div className="mt-3 space-y-2">
                  {[...u.blogFailed, ...u.socialFailed].map((f, i) => (
                    <div key={i} className="text-sm border-t border-border pt-2">
                      <p className="text-white">{f.title || '(untitled)'} <span className="text-slate-500">— {f.platform}</span></p>
                      {f.error && <p className="text-red-400 text-xs mt-0.5">{f.error}</p>}
                    </div>
                  ))}
                </div>
              </details>
            ))}
            {totalFailed === 0 && <p className="text-slate-500 text-sm">No failed posts right now.</p>}
          </div>
        )}
      </section>

      {/* Feedback */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Feedback {!feedbackLoading && <span className="text-sm text-slate-400 font-normal">({feedback.length})</span>}
        </h2>
        {feedbackLoading && <p className="text-slate-500 text-sm">Loading…</p>}
        {!feedbackLoading && (
          <div className="space-y-2">
            {[...feedback].reverse().map((f, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-white">{f.Name || 'Anonymous'}</span>
                  <span className="text-xs text-slate-500">{f.Category} · {f['Submitted At']}</span>
                </div>
                <p className="text-sm text-slate-300">{f.Message}</p>
              </div>
            ))}
            {feedback.length === 0 && <p className="text-slate-500 text-sm">No feedback yet.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
