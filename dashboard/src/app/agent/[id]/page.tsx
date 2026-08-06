'use client';
import useSWR from 'swr';
import { useState, useEffect, useRef, use } from 'react';
import { getUser, type UserConfig } from '@/lib/userConfig';
import { IMAGE_PROMPT_OPTIONS } from '@/types';
import { AutomationNoticeContent } from '@/components/AutomationNoticeModal';

const PLATFORMS = [
  // Social
  { key: 'x', label: 'X (Twitter)', group: 'social', icon: '𝕏', color: 'bg-slate-200 text-slate-900' },
  { key: 'fb', label: 'Facebook', group: 'social', icon: 'f', color: 'bg-blue-600 text-white' },
  { key: 'li', label: 'LinkedIn', group: 'social', icon: 'in', color: 'bg-sky-700 text-white' },
  { key: 'tumblr', label: 'Tumblr', group: 'social', icon: 't', color: 'bg-slate-800 text-white' },
  { key: 'mastodon', label: 'Mastodon', group: 'social', icon: 'M', color: 'bg-indigo-600 text-white' },
  // Blog
  { key: 'medium', label: 'Medium', group: 'blog', icon: 'M', color: 'bg-neutral-800 text-white' },
  { key: 'notion', label: 'Notion', group: 'blog', icon: 'N', color: 'bg-slate-100 text-slate-900' },
  { key: 'substack', label: 'Substack', group: 'blog', icon: 'S', color: 'bg-orange-500 text-white' },
  { key: 'hackmd', label: 'HackMD', group: 'blog', icon: 'H', color: 'bg-slate-700 text-white' },
  { key: 'devto', label: 'Dev.to', group: 'blog', icon: 'D', color: 'bg-black text-white' },
  { key: 'wordpress', label: 'WordPress', group: 'blog', icon: 'W', color: 'bg-blue-800 text-white' },
  { key: 'blogger', label: 'Blogger', group: 'blog', icon: 'B', color: 'bg-orange-600 text-white' },
  { key: 'googlesite', label: 'Google Sites', group: 'blog', icon: 'G', color: 'bg-green-700 text-white' },
  { key: 'note', label: 'Note', group: 'blog', icon: 'n', color: 'bg-emerald-600 text-white' },
  { key: 'paragraph', label: 'Paragraph', group: 'blog', icon: '¶', color: 'bg-indigo-600 text-white' },
  { key: 'patreon', label: 'Patreon', group: 'blog', icon: 'P', color: 'bg-red-600 text-white' },
  { key: 'calisthenics', label: 'Calisthenics', group: 'blog', icon: 'C', color: 'bg-purple-600 text-white' },
  { key: 'linkmate', label: 'Linkmate', group: 'blog', icon: 'L', color: 'bg-teal-600 text-white' },
  { key: 'ameba', label: 'Ameba', group: 'blog', icon: 'A', color: 'bg-rose-600 text-white' },
  { key: 'coda', label: 'Coda', group: 'blog', icon: 'C', color: 'bg-red-500 text-white' },
  // Engine (blog writer, not a posting target)
  { key: 'chatgpt', label: 'ChatGPT (blog writer)', group: 'engine', icon: '✦', color: 'bg-emerald-700 text-white' },
  { key: 'chatgpt-image', label: 'ChatGPT (image gen)', group: 'engine', icon: '🖼', color: 'bg-fuchsia-700 text-white' },
];

// These 5 agents now run on the fully automatic nightly blog-generation +
// daily posting rotation (scripts/nightly-blog-rotation.ts / nightly-post-rotation.ts
// on the VPS) — manual Generate Blogs / Post Now is disabled for them so nobody
// accidentally double-runs alongside the automation. Check progress in Track.
const AUTOMATED_AGENTS = ['sanya', 'meenakshi', 'vansh', 'sameeksha', 'hritika'];

// Platforms the counted, round-based "Post Now" cycle can post to — keys match
// scheduler-new.ts's COUNTED_PLATFORMS exactly (sent straight through as the
// POST body, no translation).
const POST_COUNT_PLATFORMS = [
  { key: 'x', label: 'X (Twitter)' },
  { key: 'fb', label: 'Facebook' },
  { key: 'lipost', label: 'LinkedIn (post)' },
  { key: 'tumblr', label: 'Tumblr' },
  { key: 'mastodon', label: 'Mastodon' },
  { key: 'lipulse', label: 'LinkedIn Pulse' },
  { key: 'medium', label: 'Medium' },
  { key: 'wordpress', label: 'WordPress' },
  { key: 'blogger', label: 'Blogger' },
  { key: 'googlepost', label: 'Google Sites' },
  { key: 'note', label: 'Note' },
  { key: 'hackmd', label: 'HackMD' },
  { key: 'linkmate', label: 'Linkmate' },
  { key: 'calisthenics', label: 'Calisthenics' },
  { key: 'notion', label: 'Notion' },
  { key: 'devto', label: 'Dev.to' },
  { key: 'coda', label: 'Coda' },
];

interface Account {
  platform: string;
  index: number;
  nickname: string;
  sessionDir: string;
  ready: boolean;
}
interface StatusResp {
  agent: string;
  platforms: Record<string, Account[]>;
  error?: string;
}
interface LoginModal {
  token: string;
  novncUrl: string;
  label: string;
  mode: 'login' | 'view';
}

const tokenKey = (agent: string) => `kr_agent_token_${agent}`;

// Shared posting display (Xvfb :99) — every scheduled/one-off posting run opens
// its browser here. Single fixed target, so no per-agent token is needed.
const WATCH_LIVE_URL = 'https://agent-login.taildbacce.ts.net/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=websockify%3Ftoken%3Dsharedwatch';

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params);
  const user = getUser(agentId);

  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(tokenKey(agentId)));
    setHydrated(true);
  }, [agentId]);

  function saveToken(t: string) {
    sessionStorage.setItem(tokenKey(agentId), t);
    setToken(t);
  }
  function clearToken() {
    sessionStorage.removeItem(tokenKey(agentId));
    setToken(null);
  }

  const authedFetcher = async (url: string) => {
    const r = await fetch(url, { headers: token ? { 'X-Agent-Token': token } : {} });
    if (r.status === 403) { clearToken(); throw new Error('session expired'); }
    return r.json();
  };

  const { data, mutate, isLoading } = useSWR<StatusResp>(
    hydrated && token ? `/api/agent/${agentId}/status` : null,
    authedFetcher,
    { refreshInterval: 10000, shouldRetryOnError: false }
  );

  const { data: genStatus, mutate: mutateGen } = useSWR<{ generating: boolean; log?: string }>(
    hydrated && token ? `/api/agent/${agentId}/generate-status` : null,
    authedFetcher,
    { refreshInterval: 5000, shouldRetryOnError: false }
  );

  const { data: postCycleStatus, mutate: mutatePostCycle } = useSWR<{ running: boolean; agent?: string; startedAt?: number; log?: string; detail?: { stage?: number; round?: number; currentPlatform?: string; phase?: string; remainingCounts?: Record<string, number>; position?: number; waitingFor?: string[]; etaMs?: number } }>(
    hydrated && token ? `/api/agent/${agentId}/post-cycle/status` : null,
    authedFetcher,
    { refreshInterval: 5000, shouldRetryOnError: false }
  );

  const { data: accountCounts, mutate: mutateCounts } = useSWR<Record<string, number>>(
    hydrated && token ? `/api/agent/${agentId}/account-counts` : null,
    authedFetcher,
    { refreshInterval: 15000, shouldRetryOnError: false }
  );

  async function saveAccountCount(platform: string, count: number) {
    if (!token || count < 1) return;
    try {
      await fetch(`/api/agent/${agentId}/account-counts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
        body: JSON.stringify({ platform, count }),
      });
      void mutateCounts();
    } catch { /* best-effort — next save retries */ }
  }

  const [modal, setModal] = useState<LoginModal | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Mirror modal + token in refs so the unload handler (registered once) always
  // sees the current values, not whatever was current when the effect ran.
  const modalRef = useRef<LoginModal | null>(null);
  const tokenRef = useRef<string | null>(null);
  useEffect(() => { modalRef.current = modal; }, [modal]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // If the tab closes / user navigates away / hits back while a login is open,
  // tear it down on the VPS instead of leaving it orphaned (holds a display slot
  // for up to 10 min otherwise, and blocks retrying the same account — a second
  // Chrome launch on the same profile dir silently fails with a black screen).
  useEffect(() => {
    function teardownOnLeave() {
      const m = modalRef.current;
      const t = tokenRef.current;
      if (!m || !t) return;
      fetch(`/api/agent/${agentId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Token': t },
        body: JSON.stringify({ token: m.token }),
        keepalive: true, // lets the request complete even as the page unloads
      }).catch(() => {});
    }
    window.addEventListener('pagehide', teardownOnLeave);
    return () => {
      window.removeEventListener('pagehide', teardownOnLeave);
      teardownOnLeave(); // also cover in-app navigation away from this page
    };
  }, [agentId]);

  async function startLogin(platform: string, index?: number, view = false) {
    if (!token) return;
    const key = view ? `${platform}-${index}-view` : index ? `${platform}-${index}` : `${platform}-new`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/agent/${agentId}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
        body: JSON.stringify(index ? { platform, index, view } : { platform }),
      }).then((r) => r.json());
      if (res.novncUrl) {
        setModal({
          token: res.token, novncUrl: res.novncUrl,
          label: `${res.nickname} · ${platformLabel(platform)}`,
          mode: view ? 'view' : 'login',
        });
      } else {
        alert(res.error || 'Failed to start login');
      }
    } catch (err) {
      alert(`Could not reach the login server — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteSession(platform: string, index: number, nickname: string) {
    if (!token) return;
    if (!confirm(`Delete "${nickname}" (${platformLabel(platform)})?\n\nThis removes the session, credentials, and posting history for this ONE account. It cannot be undone — you'll need to log in again to reuse it.`)) return;
    const key = `${platform}-${index}-delete`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/agent/${agentId}/session/${platform}/${index}`, {
        method: 'DELETE',
        headers: { 'X-Agent-Token': token },
      }).then((r) => r.json());
      if (res.ok) {
        void mutate();
      } else {
        alert(res.error || 'Failed to delete session');
      }
    } catch (err) {
      alert(`Could not reach the login server — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyKey(null);
    }
  }

  // ── Bulk login + live "needs you" queue ────────────────────────────────────
  const [queue, setQueue] = useState<Array<{ token: string; platform: string; index: number; nickname: string; status: string; novncUrl: string }>>([]);
  const [batchBusy, setBatchBusy] = useState<string | null>(null);

  async function refreshQueue() {
    if (!token) return;
    try {
      const res = await fetch(`/api/agent/${agentId}/login-queue`, { headers: { 'X-Agent-Token': token } }).then((r) => r.json());
      setQueue(res.queue || []);
    } catch { /* transient — next poll retries */ }
  }

  // Poll the live login queue so the operator sees which bulk logins need a human.
  useEffect(() => {
    if (!token) return;
    refreshQueue();
    const id = setInterval(refreshQueue, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, agentId]);

  async function startLoginBatch(platform: string, count = 5) {
    if (!token) return;
    setBatchBusy(platform);
    try {
      const res = await fetch(`/api/agent/${agentId}/login-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
        body: JSON.stringify({ platform, count }),
      }).then((r) => r.json());
      if (res.error) alert(res.error);
      else {
        const busy = (res.results || []).filter((r: { reason?: string }) => r.reason === 'box-busy' || r.reason === 'slots-full').length;
        if (busy) alert(`Started ${res.started}. ${busy} could not start (box/slots full — pause the scheduler and set MAX_BROWSERS=5 for bulk onboarding).`);
        refreshQueue();
      }
    } finally {
      setBatchBusy(null);
    }
  }

  const [showGen, setShowGen] = useState(false);
  const [showAutomationNotice, setShowAutomationNotice] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  async function submitGenerate(count: number, format: string, sample: string, imagePrompt: string, force: boolean) {
    if (!token) return;
    setGenBusy(true);
    try {
      const res = await fetch(`/api/agent/${agentId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
        body: JSON.stringify({ count, format, sample, imagePrompt, force }),
      }).then((r) => r.json());
      setShowGen(false);
      alert(res.message || res.error || 'Started');
    } finally {
      setGenBusy(false);
    }
  }

  const [postCycleBusy, setPostCycleBusy] = useState(false);
  const [showPostCounts, setShowPostCounts] = useState(false);

  const [genStopBusy, setGenStopBusy] = useState(false);
  async function stopGenerate() {
    if (!token) return;
    setGenStopBusy(true);
    try {
      const res = await fetch(`/api/agent/${agentId}/generate/stop`, {
        method: 'POST',
        headers: { 'X-Agent-Token': token },
      }).then((r) => r.json());
      if (res.error) alert(res.error);
      mutateGen();
    } finally {
      setGenStopBusy(false);
    }
  }

  async function stopPostCycle() {
    if (!token) return;
    setPostCycleBusy(true);
    try {
      const res = await fetch(`/api/agent/${agentId}/post-cycle/stop`, {
        method: 'POST',
        headers: { 'X-Agent-Token': token },
      }).then((r) => r.json());
      if (res.error) alert(res.error);
      mutatePostCycle();
    } finally {
      setPostCycleBusy(false);
    }
  }

  async function submitPostCounts(counts: Record<string, number>) {
    if (!token) return;
    setPostCycleBusy(true);
    try {
      const res = await fetch(`/api/agent/${agentId}/post-cycle/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
        body: JSON.stringify({ counts }),
      }).then((r) => r.json());
      if (res.error) alert(res.error);
      else setShowPostCounts(false);
      mutatePostCycle();
    } finally {
      setPostCycleBusy(false);
    }
  }

  async function finishLogin() {
    if (!modal || !token) return;
    const loginToken = modal.token;
    setModal(null);
    await fetch(`/api/agent/${agentId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
      body: JSON.stringify({ token: loginToken }),
    }).catch(() => {});
    mutate();
  }

  if (!hydrated) return null;
  if (!token) return <PinGate agentId={agentId} user={user} onAuthed={saveToken} />;

  const platforms = data?.platforms ?? {};
  const isAutomated = AUTOMATED_AGENTS.includes(agentId.toLowerCase());

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {user?.displayName ?? agentId}&apos;s Account Logins
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Log in to each account once — the poster on the server reuses these sessions to post.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (isAutomated ? setShowAutomationNotice(true) : genStatus?.generating ? stopGenerate() : setShowGen(true))}
            disabled={genStopBusy}
            title={isAutomated ? 'Generation is automatic for this account — check Track for progress' : undefined}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isAutomated ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : genStatus?.generating ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {genStopBusy ? 'Working…' : genStatus?.generating ? '⏹ Stop Generating' : isAutomated ? '✨ Generate Blogs (Automatic)' : '✨ Generate Blogs'}
          </button>
          {(() => {
            const mine = postCycleStatus?.running && postCycleStatus.agent === agentId;
            const othersTurn = postCycleStatus?.running && postCycleStatus.agent !== agentId;
            return (
              <button
                onClick={() => (isAutomated ? setShowAutomationNotice(true) : mine ? stopPostCycle() : setShowPostCounts(true))}
                disabled={postCycleBusy || othersTurn}
                title={isAutomated ? 'Posting is automatic for this account — check Track for progress' : othersTurn ? `Running for ${postCycleStatus?.agent}` : 'Choose how many posts per platform, then runs in rounds (1 post/platform/round) until every count reaches 0, 30 min between rounds'}
                className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isAutomated ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : mine ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                {postCycleBusy ? 'Working…' : mine ? '⏹ Stop Posting' : othersTurn ? `🔒 Running for ${postCycleStatus?.agent}` : isAutomated ? '📮 Post Now (Automatic)' : '📮 Post Now'}
              </button>
            );
          })()}
          <button onClick={() => mutate()}
            className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            ↻ Refresh
          </button>
          <button onClick={clearToken}
            className="text-xs bg-slate-800 border border-border hover:border-slate-500 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
            Lock
          </button>
        </div>
      </div>

      {data?.error && (
        <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-6 text-red-400 text-sm mb-6">
          ⚠ {data.error} — is the login server reachable?
        </div>
      )}

      {/* Blog generation status */}
      {genStatus && (genStatus.generating || genStatus.log) && (
        <div className={`mb-6 rounded-xl p-4 border ${genStatus.generating ? 'bg-emerald-950/40 border-emerald-800/40' : 'bg-slate-900/60 border-border'}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {genStatus.generating ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-emerald-300">Generating blogs… (content fills into your sheet as each finishes)</span>
              </>
            ) : (
              <span className="text-slate-300">Last generation run</span>
            )}
          </div>
          {genStatus.log && (
            <pre className="mt-2 text-xs text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">{genStatus.log}</pre>
          )}
        </div>
      )}

      {/* One-off "Post Now" status */}
      {postCycleStatus?.running && postCycleStatus.agent === agentId && (
        <div className="mb-6 rounded-xl p-4 border bg-sky-950/40 border-sky-800/40">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="inline-block w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sky-300">
              {postCycleStatus.detail?.phase === 'queued' ? (
                <>
                  ⏳ Queued — you are #{postCycleStatus.detail.position}
                  {postCycleStatus.detail?.waitingFor?.length ? `, ${postCycleStatus.detail.waitingFor.join(', ')} posting now` : ''}
                  {postCycleStatus.detail?.etaMs ? ` (~${Math.round(postCycleStatus.detail.etaMs / 60000)} min estimated wait)` : ''}
                </>
              ) : postCycleStatus.detail?.round ? (
                <>
                  Posting now — Round {postCycleStatus.detail.round}
                  {postCycleStatus.detail?.currentPlatform ? `, currently: ${postCycleStatus.detail.currentPlatform}` : ''}
                </>
              ) : (
                <>
                  Posting now — full 5-cycle sequence
                  {postCycleStatus.detail?.stage ? ` (Cycle ${postCycleStatus.detail.stage}/5` : ''}
                  {postCycleStatus.detail?.currentPlatform ? `, currently: ${postCycleStatus.detail.currentPlatform})` : postCycleStatus.detail?.stage ? ')' : ''}
                </>
              )}
            </span>
          </div>
          {postCycleStatus.detail?.remainingCounts && (
            <p className="mt-1 text-xs text-sky-300/70 font-mono">
              remaining: {Object.entries(postCycleStatus.detail.remainingCounts)
                .filter(([, c]) => c > 0)
                .map(([k, c]) => `${k}:${c}`)
                .join('  ') || 'all done'}
            </p>
          )}
          {postCycleStatus.log && (
            <pre className="mt-2 text-xs text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">{postCycleStatus.log}</pre>
          )}
          <div className="mt-3 text-xs text-sky-300/80 mb-1">👁 Watch live — shared posting screen:</div>
          <iframe
            src={WATCH_LIVE_URL}
            className="w-full h-[420px] rounded-lg bg-black border border-sky-800/40"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      )}

      {isLoading && !data && (
        <div className="text-center py-20 text-slate-500">
          <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p>Checking session status…</p>
        </div>
      )}

      {!isLoading && !data?.error && queue.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
            Live logins · <span className="text-amber-400">{queue.filter((q) => q.status === 'needs-human').length} need you</span>
            {' · '}<span className="text-green-400">{queue.filter((q) => q.status === 'ready').length} ready</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {queue.map((q) => (
              <div key={q.token} className="border border-border rounded-lg p-2 flex flex-col gap-1 bg-slate-900/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-white truncate" title={q.nickname}>{q.nickname} · {platformLabel(q.platform)}</span>
                  <span className={`text-[10px] font-semibold shrink-0 ${q.status === 'ready' ? 'text-green-400' : q.status === 'needs-human' ? 'text-amber-400' : 'text-blue-400'}`}>
                    {q.status === 'ready' ? '● ready' : q.status === 'needs-human' ? '○ needs you' : '… auto'}
                  </span>
                </div>
                <button
                  onClick={() => setModal({ token: q.token, novncUrl: q.novncUrl, label: `${q.nickname} · ${platformLabel(q.platform)}`, mode: 'login' })}
                  className="text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {q.status === 'ready' ? 'Finish' : 'Open'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !data?.error && (
        <div className="space-y-8">
          {(['engine', 'social', 'blog'] as const).map((grp) => (
            <div key={grp}>
              <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
                {grp === 'social' ? 'Social platforms' : grp === 'blog' ? 'Blog platforms' : 'Blog writer'}
              </h2>
              <div className="space-y-4">
                {PLATFORMS.filter((p) => p.group === grp).map((p) => {
                  const accounts = platforms[p.key] ?? [];
                  const ready = accounts.filter((a) => a.ready).length;
                  return (
                    <div key={p.key} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${p.color}`}>
                      {p.icon}
                    </span>
                    <div>
                      <h2 className="text-white font-semibold">{p.label}</h2>
                      <p className="text-xs text-slate-500">
                        {accounts.length === 0 ? (
                          'No accounts yet'
                        ) : (
                          <>
                            <span className="text-green-400 font-semibold">{ready} logged in</span>
                            {' · '}{accounts.length} total
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {grp !== 'engine' && (
                      <label
                        className="flex items-center gap-1.5 text-xs text-slate-400"
                        title="How many logged-in accounts you have for this platform — posting rotates through them in order (1, 2, 3, 1...). Leave at 1 if you only have one."
                      >
                        Accounts
                        <input
                          type="number"
                          min={1}
                          max={10}
                          defaultValue={accountCounts?.[p.key] ?? 1}
                          key={`${p.key}-${accountCounts?.[p.key] ?? 1}`} // resync the field if the server value changes elsewhere
                          onBlur={(e) => saveAccountCount(p.key, Number(e.target.value))}
                          className="w-14 bg-slate-800 border border-border rounded px-2 py-1 text-white text-center focus:outline-none focus:border-blue-500"
                        />
                      </label>
                    )}
                    {grp !== 'engine' && (
                      <button
                        onClick={() => startLoginBatch(p.key)}
                        disabled={batchBusy === p.key}
                        title="Start 5 logins at once, auto-filled from stored credentials. Only the ones that hit a challenge appear in the queue above."
                        className="text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {batchBusy === p.key ? 'Starting…' : '+ Bulk (5)'}
                      </button>
                    )}
                    <button
                      onClick={() => startLogin(p.key)}
                      disabled={busyKey === `${p.key}-new`}
                      className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {busyKey === `${p.key}-new` ? 'Opening…' : '+ Add account'}
                    </button>
                  </div>
                </div>

                {accounts.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {accounts.map((a) => (
                      <div key={a.index} className="border border-border rounded-lg p-3 flex flex-col gap-2 bg-slate-900/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-white truncate" title={a.nickname}>{a.nickname}</span>
                          {a.ready ? (
                            <span className="text-[11px] font-semibold text-green-400 shrink-0">● Logged in</span>
                          ) : (
                            <span className="text-[11px] font-semibold text-amber-400 shrink-0">○ Needs login</span>
                          )}
                        </div>
                        {a.ready && (
                          <button
                            onClick={() => startLogin(p.key, a.index, true)}
                            disabled={busyKey === `${p.key}-${a.index}-view`}
                            title="Open this session to see which account is saved in it"
                            className="text-xs px-2 py-1.5 rounded transition-colors disabled:opacity-50 bg-indigo-600 hover:bg-indigo-500 text-white"
                          >
                            {busyKey === `${p.key}-${a.index}-view` ? 'Opening…' : '👁 View session'}
                          </button>
                        )}
                        <button
                          onClick={() => startLogin(p.key, a.index)}
                          disabled={busyKey === `${p.key}-${a.index}`}
                          className={`text-xs px-2 py-1.5 rounded transition-colors disabled:opacity-50 ${
                            a.ready
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                              : 'bg-amber-600 hover:bg-amber-500 text-white'
                          }`}
                        >
                          {busyKey === `${p.key}-${a.index}` ? 'Opening…' : a.ready ? 'Re-login' : 'Log in'}
                        </button>
                        <button
                          onClick={() => deleteSession(p.key, a.index, a.nickname)}
                          disabled={busyKey === `${p.key}-${a.index}-delete`}
                          title="Permanently delete this account's session, credentials, and history"
                          className="text-xs px-2 py-1.5 rounded transition-colors disabled:opacity-50 bg-red-900/60 hover:bg-red-800 text-red-200"
                        >
                          {busyKey === `${p.key}-${a.index}-delete` ? 'Deleting…' : '🗑 Delete'}
                        </button>
                      </div>
                    ))}
                  </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <LoginOverlay modal={modal} onDone={finishLogin} />}
      {showGen && <GenerateModal agentId={agentId} token={token} busy={genBusy} onClose={() => setShowGen(false)} onSubmit={submitGenerate} />}
      {showPostCounts && <PostCountsModal agentId={agentId} token={token} busy={postCycleBusy} onClose={() => setShowPostCounts(false)} onSubmit={submitPostCounts} />}
      {showAutomationNotice && <AutomationNoticeContent onClose={() => setShowAutomationNotice(false)} />}
    </div>
  );
}

interface QueueStatus {
  running: { agent: string; startedAt: number }[];
  waiting: { agent: string; joinedAt: number; position: number }[];
  capacity: number;
  etaMs: number;
}

/** Polls the box-wide job queue (blog-gen / post-cycle) so a modal can warn before submit, not just after. */
function useQueueStatus(agentId: string, token: string | null, category: string): QueueStatus | null {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const poll = () => {
      fetch(`/api/agent/${agentId}/queue-status/${category}`, { headers: { 'X-Agent-Token': token } })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setStatus(d); })
        .catch(() => { /* keep last known status */ });
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [agentId, token, category]);
  return status;
}

function otherAgents(status: QueueStatus, self: string): string[] {
  return status.running.map((r) => r.agent).filter((a) => a !== self);
}

const GEN_FORMATS = [
  { id: '', label: 'Use each row\'s Format column', sample: '' },
  { id: 'seo-li', label: 'Sample 1', sample: '/samples/sample-1.html' },
  { id: 'custom', label: 'Custom (paste a sample below)', sample: '' },
];

function GenerateModal({
  agentId, token, busy, onClose, onSubmit,
}: {
  agentId: string;
  token: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (count: number, format: string, sample: string, imagePrompt: string, force: boolean) => void;
}) {
  const [count, setCount] = useState(1);
  const [format, setFormat] = useState('');
  const [sample, setSample] = useState('');
  const [imagePrompt, setImagePrompt] = useState('1');
  const [force, setForce] = useState(false);
  const [ready, setReady] = useState<number | null>(null); // rows with URL + empty content
  const queue = useQueueStatus(agentId, token, 'blog-gen');

  useEffect(() => {
    fetch(`/api/rows?tab=blog&user=${agentId}`)
      .then((r) => r.json())
      .then((d) => {
        const rows: any[] = d.rows ?? [];
        const pending = rows.filter((row) => {
          const url = String(row.targetUrl ?? '').trim();
          const content = String(row['Blog Content'] ?? '').trim();
          return url && content.length < 50;
        }).length;
        setReady(pending);
        setCount(Math.max(1, Math.min(pending || 1, 20)));
      })
      .catch(() => setReady(null));
  }, [agentId]);

  const overAsking = ready !== null && count > ready;
  const queueFull = queue !== null && queue.running.length >= queue.capacity;
  useEffect(() => { if (!queueFull && force) setForce(false); }, [queueFull, force]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Generate Blogs</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Ready count */}
        <div className="mb-4 rounded-lg bg-slate-900/60 border border-border px-3 py-2 text-sm">
          {ready === null ? (
            <span className="text-slate-400">Checking your sheet…</span>
          ) : ready === 0 ? (
            <span className="text-amber-400">⚠ No rows ready — add a row with a URL (and empty Blog Content) first.</span>
          ) : (
            <span className="text-green-400"><b>{ready}</b> row{ready === 1 ? '' : 's'} ready to generate (have a URL, no content yet)</span>
          )}
        </div>

        {/* Count */}
        <label className="block text-sm text-slate-300 mb-1">How many blogs?</label>
        <input
          type="number" min={1} max={20} value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2 text-white mb-1 focus:outline-none focus:border-blue-500"
        />
        {overAsking ? (
          <p className="text-xs text-amber-400 mb-4">Only {ready} ready — it&apos;ll generate {ready} and stop.</p>
        ) : (
          <p className="text-xs text-slate-500 mb-4">Pulls that many rows that have a URL but no content yet.</p>
        )}

        {/* Format */}
        <label className="block text-sm text-slate-300 mb-2">Format</label>
        <div className="space-y-2 mb-4">
          {GEN_FORMATS.map((f) => (
            <div key={f.id || 'per-row'} className="flex items-center gap-2">
              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                <input
                  type="radio" name="genformat" checked={format === f.id}
                  onChange={() => setFormat(f.id)} className="accent-emerald-500"
                />
                <span className="text-sm text-white">{f.label}</span>
              </label>
              {f.sample && (
                <button
                  onClick={() => window.open(f.sample, '_blank')}
                  className="text-xs text-blue-400 hover:text-blue-300 underline shrink-0"
                >
                  view sample
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Custom sample paste */}
        {format === 'custom' && (
          <div className="mb-4">
            <label className="block text-sm text-slate-300 mb-1">Paste a sample blog (HTML)</label>
            <textarea
              rows={6} value={sample} onChange={(e) => setSample(e.target.value)}
              placeholder="<h1>…</h1><p>…</p>  — ChatGPT writes a new blog in this style"
              className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-y"
            />
          </div>
        )}

        {/* Cover image prompt */}
        <label className="block text-sm text-slate-300 mb-2">Cover image style</label>
        <div className="space-y-2 mb-4">
          {IMAGE_PROMPT_OPTIONS.map((opt) => (
            <div key={opt.id} className="flex items-center gap-2">
              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                <input
                  type="radio" name="imageprompt" checked={imagePrompt === opt.id}
                  onChange={() => setImagePrompt(opt.id)} className="accent-emerald-500"
                />
                <span className="text-sm text-white">{opt.label}</span>
              </label>
              <a
                href={opt.example} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 underline shrink-0"
              >
                view example
              </a>
            </div>
          ))}
        </div>

        {/* Queue behavior */}
        {queueFull && queue && (
          <div className="mb-4 rounded-lg bg-amber-950/40 border border-amber-800/40 px-3 py-2 text-xs text-amber-300">
            ⏳ {otherAgents(queue, agentId).join(' and ') || 'Someone'} {otherAgents(queue, agentId).length === 1 ? 'is' : 'are'} currently generating blogs.
            {queue.waiting.length > 0 ? ` ${queue.waiting.length} other${queue.waiting.length === 1 ? '' : 's'} already waiting.` : ''}
            {' '}You&apos;ll be queued and start automatically once one finishes (~{Math.round((queue.etaMs || 0) / 60000)} min estimated wait) — please wait patiently, or tick below to run right now instead.
          </div>
        )}
        {queueFull && (
          <label className="flex items-start gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)}
              className="accent-emerald-500 mt-0.5 shrink-0" />
            <span className="text-xs text-slate-400">
              <span className="text-white font-medium">Skip the queue and run right now anyway</span> (may reduce quality) instead of waiting my turn.
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white">Cancel</button>
          <button
            onClick={() => onSubmit(Math.min(count, ready ?? count), format, format === 'custom' ? sample : '', imagePrompt, force)}
            disabled={busy || ready === 0 || (format === 'custom' && !sample.trim())}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
          >
            {busy ? 'Starting…' : `Generate ${ready !== null ? Math.min(count, ready) : count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PostCountsModal({
  agentId, token, busy, onClose, onSubmit,
}: {
  agentId: string;
  token: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (counts: Record<string, number>) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(
    () => Object.fromEntries(POST_COUNT_PLATFORMS.map((p) => [p.key, 0]))
  );
  const queue = useQueueStatus(agentId, token, 'post-cycle');
  const queueFull = queue !== null && queue.running.length >= queue.capacity;

  const total = Object.values(counts).reduce((sum, c) => sum + (c > 0 ? c : 0), 0);

  function setCount(key: string, value: number) {
    setCounts((prev) => ({ ...prev, [key]: Math.max(0, Math.floor(value) || 0) }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Post Now — how many per platform?</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Leave a platform at 0 to skip it entirely. Runs in rounds — 1 post per platform per round —
          decrementing every round until every count reaches 0, with a 30 min wait between rounds.
        </p>
        {queueFull && queue ? (
          <div className="mb-4 rounded-lg bg-amber-950/40 border border-amber-800/40 px-3 py-2 text-xs text-amber-300">
            ⏳ {otherAgents(queue, agentId).join(', ') || 'Someone'} {otherAgents(queue, agentId).length === 1 ? 'is' : 'are'} currently posting.
            {queue.waiting.length > 0 ? ` ${queue.waiting.length} other${queue.waiting.length === 1 ? '' : 's'} already waiting.` : ''}
            {' '}You&apos;ll be queued and start automatically once they finish (~{Math.round((queue.etaMs || 0) / 60000)} min estimated wait) — please wait patiently.
          </div>
        ) : (
          <p className="text-xs text-slate-500 mb-4">
            Only one agent can post at a time. If someone else is already posting, you&apos;ll be queued
            automatically and start right after them.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          {POST_COUNT_PLATFORMS.map((p) => (
            <div key={p.key}>
              <label className="block text-xs text-slate-400 mb-1">{p.label}</label>
              <input
                type="number" min={0} value={counts[p.key]}
                onChange={(e) => setCount(p.key, Number(e.target.value))}
                className="w-full bg-slate-900 border border-border rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white">Cancel</button>
          <button
            onClick={() => onSubmit(counts)}
            disabled={busy || total === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white"
          >
            {busy ? 'Starting…' : `Start (${total} total post${total === 1 ? '' : 's'})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PinGate({ agentId, user, onAuthed }: { agentId: string; user?: UserConfig; onAuthed: (t: string) => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/agent/${agentId}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }).then((r) => r.json());
      if (res.token) onAuthed(res.token);
      else setErr(res.error || 'Invalid PIN');
    } catch {
      setErr('Could not reach the login server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 bg-card border border-border rounded-xl p-6">
      <h1 className="text-xl font-bold text-white mb-1">{user?.displayName ?? agentId}&apos;s Logins</h1>
      <p className="text-sm text-slate-400 mb-5">
        Enter your PIN to manage your account logins. First time here? The PIN you type now becomes yours.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN (at least 4 digits)"
          className="w-full bg-slate-900 border border-border rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button
          type="submit"
          disabled={busy || pin.length < 4}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

function LoginOverlay({ modal, onDone }: { modal: LoginModal; onDone: () => void }) {
  const viewing = modal.mode === 'view';
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col p-4">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-white">
          <p className="font-semibold">
            {viewing ? 'Viewing session' : 'Log in'} — {modal.label}
          </p>
          <p className="text-xs text-slate-400">
            {viewing
              ? 'This is the account saved in this session. Look, then click “Close” — nothing is changed.'
              : 'Log in below as you normally would. When you reach the home feed, click “I’m logged in”.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!viewing && (
            <button
              onClick={onDone}
              title="Didn't finish logging in? This safely closes and frees up the slot — nothing is saved."
              className="text-slate-300 hover:text-white font-medium px-4 py-2 rounded-lg border border-border hover:border-slate-500 transition-colors"
            >
              ✕ Cancel
            </button>
          )}
          <button
            onClick={onDone}
            className={`text-white font-medium px-4 py-2 rounded-lg transition-colors ${
              viewing ? 'bg-slate-600 hover:bg-slate-500' : 'bg-green-600 hover:bg-green-500'
            }`}
          >
            {viewing ? '✕ Close' : '✓ I’m logged in'}
          </button>
        </div>
      </div>
      <iframe
        src={modal.novncUrl}
        className="flex-1 w-full rounded-lg bg-white border border-slate-700"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

function platformLabel(key: string): string {
  return PLATFORMS.find((p) => p.key === key)?.label ?? key;
}

