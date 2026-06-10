'use client';
import { useEffect } from 'react';
import type { RawRow, PlatformDef } from '@/types';
import { getField, SOCIAL_PLATFORMS, BLOG_PLATFORMS } from '@/types';
import PlatformBadge from './PlatformBadge';

interface Props {
  row: RawRow;
  tab: 'social' | 'blog';
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  const isUrl = value.startsWith('http');
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      {isUrl ? (
        <a href={value} target="_blank" rel="noopener noreferrer"
          className="text-blue-400 hover:underline text-sm break-all">{value}</a>
      ) : (
        <p className="text-slate-200 text-sm break-words whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

function PlatformSection({ title, platforms, row }: { title: string; platforms: PlatformDef[]; row: RawRow }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-1 gap-2">
        {platforms.map((p) => {
          const status = getField(row, ...p.statusCols);
          const url = getField(row, ...p.urlCols);
          const batch = getField(row, ...p.batchCols);
          const error = getField(row, ...p.errorCols);
          return (
            <div key={p.key} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2 gap-3">
              <div className="flex items-center gap-2 min-w-[110px]">
                <span className="text-xs font-mono text-slate-400 w-6 text-center">{p.icon}</span>
                <span className="text-sm text-slate-300">{p.label}</span>
              </div>
              <PlatformBadge platform={p} row={row} />
              <div className="text-xs text-slate-500 flex-1 text-right truncate">
                {batch && <span className="mr-2">{batch}</span>}
                {error && <span className="text-red-400 truncate" title={error}>⚠ {error.slice(0, 50)}</span>}
                {url && !error && <span className="text-green-500 truncate">↗ posted</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RowDetailModal({ row, tab, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = getField(row, 'Blog Title', 'Title', 'title');
  const url = getField(row, 'targetUrl', 'Target URL');
  const name = getField(row, 'Name', 'name');
  const format = getField(row, 'Format', 'format');
  const blogContent = getField(row, 'Blog Content', 'blogContent');
  const submittedAt = getField(row, 'Submitted At', 'postDate', 'Date', 'date');
  const description = getField(row, 'Blog Description', 'blogCaption', 'description');
  const rating = getField(row, 'Rating', 'rating', 'seoScore');

  const xPost = getField(row, 'X Post', 'xPost');
  const fbPost = getField(row, 'FB Post', 'fbPost');
  const liPost = getField(row, 'LinkedIn Post', 'linkedinPost');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 overflow-y-auto py-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a2235] border border-border rounded-xl w-full max-w-3xl shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="flex-1 pr-4">
            <p className="text-xs text-slate-500 mb-1">Row #{row._sheetRow}</p>
            <h2 className="text-white font-semibold text-lg leading-snug">{title || '—'}</h2>
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-blue-400 hover:underline text-xs break-all mt-1 block">{url}</a>
          </div>
          <button onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none shrink-0 p-1">✕</button>
        </div>

        <div className="p-5 space-y-6">
          {/* Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Account" value={name} />
            <Field label="Format" value={format} />
            <Field label="Submitted" value={submittedAt} />
            {rating && <Field label="Blog Rating" value={rating + ' / 10'} />}
          </div>

          {description && <Field label="Description" value={description} />}

          {/* Blog content status */}
          <div>
            <p className="text-xs text-slate-500 mb-1">Blog Content</p>
            {blogContent
              ? <span className="inline-flex items-center gap-1.5 text-xs bg-green-900/40 text-green-300 border border-green-700/30 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Generated ({blogContent.length.toLocaleString()} chars)
                </span>
              : <span className="inline-flex items-center gap-1.5 text-xs bg-slate-800 text-slate-400 border border-slate-700 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" /> Not yet generated
                </span>
            }
          </div>

          {/* Generated post text */}
          {(xPost || fbPost || liPost) && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Generated Post Text</h3>
              {xPost && <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">X / Twitter</p>
                <p className="text-slate-200 text-sm whitespace-pre-wrap">{xPost}</p>
              </div>}
              {fbPost && <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Facebook</p>
                <p className="text-slate-200 text-sm whitespace-pre-wrap">{fbPost}</p>
              </div>}
              {liPost && <div className="bg-slate-800/60 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">LinkedIn</p>
                <p className="text-slate-200 text-sm whitespace-pre-wrap">{liPost}</p>
              </div>}
            </div>
          )}

          {/* Platform statuses */}
          {tab === 'social'
            ? <PlatformSection title="Social Platforms" platforms={SOCIAL_PLATFORMS} row={row} />
            : <PlatformSection title="Blog Platforms" platforms={BLOG_PLATFORMS} row={row} />
          }
        </div>
      </div>
    </div>
  );
}
