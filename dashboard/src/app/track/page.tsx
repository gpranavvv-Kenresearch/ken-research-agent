'use client';
import useSWR from 'swr';
import { useState } from 'react';
import TrackingTable from '@/components/TrackingTable';
import type { RawRow } from '@/types';
import { BLOG_PLATFORMS, SOCIAL_PLATFORMS, getField, latestPostDate } from '@/types';
import { useUser } from '@/context/UserContext';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ApiResponse {
  rows: RawRow[];
  fetchedAt: string;
  error?: string;
}

export default function TrackPage() {
  const [tab, setTab] = useState<'blog' | 'social'>('blog');
  const { user } = useUser();

  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    user ? `/api/rows?tab=${tab}&user=${user.id}` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const rows = data?.rows ?? [];
  const fetchedAt = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : null;

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Distribution Tracker</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Showing <span className="text-white font-medium">{user?.displayName}&apos;s</span> sheet — real-time status across all platforms.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {fetchedAt && <span className="text-xs text-slate-500">Updated {fetchedAt}</span>}
          <button onClick={() => mutate()}
            className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <TabBtn active={tab === 'blog'} onClick={() => setTab('blog')}>📝 Blog Posts</TabBtn>
        <TabBtn active={tab === 'social'} onClick={() => setTab('social')}>📣 Social Posts</TabBtn>
      </div>

      {/* Stats bar */}
      {!isLoading && rows.length > 0 && <StatsBar rows={rows} tab={tab} />}

      {/* Content */}
      {isLoading && (
        <div className="text-center py-20 text-slate-500">
          <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p>Loading from Google Sheets…</p>
        </div>
      )}

      {(error || data?.error) && (
        <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-6 text-red-400 text-sm">
          ⚠ {data?.error ?? (error instanceof Error ? error.message : String(error))}
        </div>
      )}

      {!isLoading && !error && !data?.error && (
        <TrackingTable rows={rows} tab={tab} agentId={user?.id ?? ''} />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'bg-card border border-border text-slate-300 hover:text-white hover:border-slate-500'
      }`}
    >
      {children}
    </button>
  );
}

/** Row has generated content ready to post — same check TrackingTable uses for its Ready/Pending badge. */
function hasGeneratedContent(row: RawRow, tab: 'blog' | 'social'): boolean {
  if (tab === 'blog') return !!getField(row, 'Blog Content', 'blogContent');
  return !!(getField(row, 'X Post', 'xPost') || getField(row, 'FB Post', 'fbPost') || getField(row, 'LinkedIn Post', 'linkedinPost'));
}

function StatsBar({ rows, tab }: { rows: RawRow[]; tab: 'blog' | 'social' }) {
  const platforms = tab === 'blog' ? BLOG_PLATFORMS : SOCIAL_PLATFORMS;
  const todayStr = new Date().toISOString().slice(0, 10);
  let posted = 0, failed = 0, postedToday = 0;

  for (const row of rows) {
    for (const p of platforms) {
      const s = getField(row, ...p.statusCols).toLowerCase();
      if (s === 'posted' || s === 'success' || s === 'done') posted++;
      else if (s === 'failed' || s === 'error') failed++;
    }
    if (latestPostDate(row, platforms) === todayStr) postedToday++;
  }

  // Pending = rows with content generated but not yet posted to any platform —
  // e.g. 60 rows, 25 have generated content, 10 of those got posted -> pending = 15.
  const withContent = rows.filter((row) => hasGeneratedContent(row, tab));
  const withContentPosted = withContent.filter((row) =>
    platforms.some((p) => {
      const s = getField(row, ...p.statusCols).toLowerCase();
      return s === 'posted' || s === 'success' || s === 'done';
    })
  );
  const pending = withContent.length - withContentPosted.length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <StatCard label="Total Rows" value={rows.length} color="text-white" />
      <StatCard label="Generated" value={withContent.length} color="text-blue-400" />
      <StatCard label="Posts Live" value={posted} color="text-green-400" />
      <StatCard label="Posted Today" value={postedToday} color="text-emerald-400" />
      <StatCard label="Failed" value={failed} color="text-red-400" />
      <StatCard label="Pending" value={pending} color="text-slate-400" />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
