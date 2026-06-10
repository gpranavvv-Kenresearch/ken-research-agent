'use client';
import { useState } from 'react';
import type { RawRow } from '@/types';
import { getField, SOCIAL_PLATFORMS, BLOG_PLATFORMS } from '@/types';
import PlatformBadge from './PlatformBadge';
import RowDetailModal from './RowDetailModal';

interface Props {
  rows: RawRow[];
  tab: 'social' | 'blog';
}

function ProgressBar({ row, tab }: { row: RawRow; tab: 'social' | 'blog' }) {
  const platforms = tab === 'social' ? SOCIAL_PLATFORMS : BLOG_PLATFORMS;
  const posted = platforms.filter((p) => {
    const s = getField(row, ...p.statusCols).toLowerCase();
    return s === 'posted' || s === 'success' || s === 'done';
  }).length;
  const pct = Math.round((posted / platforms.length) * 100);
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 tabular-nums w-10">{posted}/{platforms.length}</span>
    </div>
  );
}

export default function TrackingTable({ rows, tab }: Props) {
  const [selected, setSelected] = useState<RawRow | null>(null);
  const [search, setSearch] = useState('');
  const platforms = tab === 'social' ? SOCIAL_PLATFORMS : BLOG_PLATFORMS;

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const title = getField(r, 'Blog Title', 'Title', 'title').toLowerCase();
    const url = getField(r, 'targetUrl', 'Target URL').toLowerCase();
    const name = getField(r, 'Name', 'name').toLowerCase();
    return title.includes(search.toLowerCase()) || url.includes(search.toLowerCase()) || name.includes(search.toLowerCase());
  });

  if (!rows.length) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="text-4xl mb-4">📭</p>
        <p className="text-lg">No rows found in this tab yet.</p>
        <p className="text-sm mt-1">Submit a URL to get started.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by title, URL, or account…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md bg-card border border-border rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        {search && (
          <span className="ml-3 text-xs text-slate-500">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-slate-800/50">
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-8">#</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-[200px]">Title</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">Account</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">Format</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">Content</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">Progress</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Platforms</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const title = getField(row, 'Blog Title', 'Title', 'title');
              const url = getField(row, 'targetUrl', 'Target URL');
              const name = getField(row, 'Name', 'name');
              const format = getField(row, 'Format', 'format');
              const blogContent = getField(row, 'Blog Content', 'blogContent');
              const hasContent = !!blogContent;

              return (
                <tr
                  key={row._dataRow}
                  className="border-b border-border/50 hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  onClick={() => setSelected(row)}
                >
                  <td className="px-4 py-3 text-slate-500 tabular-nums">{row._sheetRow}</td>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium leading-snug line-clamp-2 group-hover:text-blue-300 transition-colors">
                      {title || <span className="text-slate-500 italic">No title</span>}
                    </p>
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-slate-500 hover:text-blue-400 hover:underline truncate block max-w-[280px]"
                    >{url}</a>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{name || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {format
                      ? <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-700/30 px-2 py-0.5 rounded-full">{format}</span>
                      : <span className="text-slate-600 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {hasContent
                      ? <span className="text-xs text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" /> Ready</span>
                      : <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block" /> Pending</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar row={row} tab={tab} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5 max-w-[480px]">
                      {platforms.map((p) => (
                        <PlatformBadge key={p.key} platform={p} row={row} compact />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <RowDetailModal row={selected} tab={tab} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
