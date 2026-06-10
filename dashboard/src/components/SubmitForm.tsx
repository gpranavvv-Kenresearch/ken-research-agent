'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, BLOG_PLATFORMS, SOCIAL_PLATFORMS } from '@/types';
import { useUser } from '@/context/UserContext';
import { SHARED_SHEET_ID } from '@/lib/userConfig';

export default function SubmitForm() {
  const router = useRouter();
  const { user } = useUser();

  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [bulkResults, setBulkResults] = useState<{ title: string; url: string; row?: number; error?: string }[]>([]);

  const [form, setForm] = useState({
    title: '',
    targetUrl: '',
    format: 'seo-li',
    description: '',
    platforms: BLOG_PLATFORMS.map((p) => p.key),
    social: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');

  function toggle(key: string, arr: string[], setter: (v: string[]) => void) {
    setter(arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]);
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { setError('No user selected.'); return; }
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setError('Paste at least one line.'); return; }

    setLoading(true); setError(''); setBulkResults([]);
    const results: typeof bulkResults = [];

    for (const line of lines) {
      const sep = line.includes('|') ? '|' : '\t';
      const parts = line.split(sep).map((p) => p.trim());
      const title = parts[0] ?? '';
      const url   = parts[1] ?? '';
      if (!title || !url) { results.push({ title: line, url: '', error: 'Bad format — use Title | URL' }); continue; }
      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, targetUrl: url, name: user.displayName, format: form.format, description: '', platforms: [...form.platforms, ...form.social], userId: user.id }),
        });
        const data = await res.json() as { success?: boolean; sheetRow?: number; error?: string };
        if (!res.ok) results.push({ title, url, error: data.error ?? 'Failed' });
        else results.push({ title, url, row: data.sheetRow });
      } catch (err) {
        results.push({ title, url, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    setBulkResults(results);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { setError('No user selected — please refresh and choose your name.'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          targetUrl: form.targetUrl,
          name: user.displayName,
          format: form.format,
          description: form.description,
          platforms: [...form.platforms, ...form.social],
          userId: user.id,
        }),
      });
      const data = await res.json() as { success?: boolean; sheetRow?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Submit failed');
      setSuccess(`✅ Added to ${user.displayName}'s sheet (row ${data.sheetRow}). Generation will start shortly.`);
      setTimeout(() => router.push('/track'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHARED_SHEET_ID}/edit`;

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Account badge */}
      {user && (
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3">
          <span className="text-slate-400 text-sm">Submitting as</span>
          <span className="text-white font-semibold">{user.displayName}</span>
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-xs ml-auto underline underline-offset-2 transition-colors"
          >
            → your personal sheet ↗
          </a>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-lg w-fit">
        <button type="button" onClick={() => setMode('single')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${mode === 'single' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
          Single URL
        </button>
        <button type="button" onClick={() => setMode('bulk')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${mode === 'bulk' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
          Bulk Import
        </button>
      </div>

      {/* ── BULK MODE ── */}
      {mode === 'bulk' && (
        <form onSubmit={handleBulkSubmit} className="space-y-8">

          {/* URLs textarea */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Report URLs</h2>
            <textarea
              rows={10}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`India Cold Chain Logistics Market | https://www.kenresearch.com/...\nChina EV Battery Market | https://www.kenresearch.com/...\n...`}
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-white placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-blue-500 resize-y"
            />
            <p className="text-xs text-slate-500">Separate title and URL with <code className="text-slate-400">|</code> — paste up to 50 rows at once</p>
          </section>

          {/* Format */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Blog Format</h2>
            <div className="grid gap-3">
              {FORMATS.map((f) => (
                <label key={f.id}
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                    form.format === f.id ? 'border-blue-500 bg-blue-950/40' : 'border-border bg-card hover:border-slate-500'
                  }`}
                >
                  <input type="radio" name="bulk-format" value={f.id} checked={form.format === f.id}
                    onChange={() => setForm({ ...form, format: f.id })} className="mt-0.5 accent-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold text-sm">{f.label}</p>
                      <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{f.subLabel}</span>
                    </div>
                    <p className="text-slate-400 text-xs mt-1">{f.desc}</p>
                  </div>
                  {f.sampleRoute && (
                    <a href={f.sampleRoute} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-xs text-blue-400 hover:text-blue-300 border border-blue-800/60 hover:border-blue-500 bg-blue-950/30 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      See example ↗
                    </a>
                  )}
                </label>
              ))}
            </div>
          </section>

          {/* Blog platforms */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Blog Platforms</h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm({ ...form, platforms: BLOG_PLATFORMS.map((p) => p.key) })}
                  className="text-xs text-blue-400 hover:text-blue-300">All</button>
                <span className="text-slate-600">·</span>
                <button type="button" onClick={() => setForm({ ...form, platforms: [] })}
                  className="text-xs text-slate-400 hover:text-slate-300">None</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BLOG_PLATFORMS.map((p) => {
                const checked = form.platforms.includes(p.key);
                return (
                  <label key={p.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      checked ? 'border-blue-500/60 bg-blue-950/30 text-white' : 'border-border bg-card text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <input type="checkbox" checked={checked}
                      onChange={() => toggle(p.key, form.platforms, (v) => setForm({ ...form, platforms: v }))}
                      className="accent-blue-500" />
                    {p.label}
                  </label>
                );
              })}
            </div>
          </section>

          {/* Social platforms */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Social Platforms <span className="text-slate-600 normal-case font-normal">(optional)</span></h2>
            <div className="grid grid-cols-3 gap-2">
              {SOCIAL_PLATFORMS.map((p) => {
                const checked = form.social.includes(p.key);
                return (
                  <label key={p.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      checked ? 'border-blue-500/60 bg-blue-950/30 text-white' : 'border-border bg-card text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <input type="checkbox" checked={checked}
                      onChange={() => toggle(p.key, form.social, (v) => setForm({ ...form, social: v }))}
                      className="accent-blue-500" />
                    {p.label}
                  </label>
                );
              })}
            </div>
          </section>

          {error && <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3">{error}</p>}

          {bulkResults.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Results — {bulkResults.filter(r => r.row).length}/{bulkResults.length} added</p>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {bulkResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${r.error ? 'bg-red-950/30 border border-red-800/30' : 'bg-green-950/30 border border-green-800/30'}`}>
                    <span>{r.error ? '✗' : '✓'}</span>
                    <span className="truncate flex-1 text-slate-300">{r.title}</span>
                    {r.row && <span className="text-slate-500 shrink-0">row {r.row}</span>}
                    {r.error && <span className="text-red-400 shrink-0">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Submitting…' : '🚀 Submit All Rows'}
          </button>
        </form>
      )}

      {/* ── SINGLE MODE ── */}
      {mode === 'single' && <form onSubmit={handleSubmit} className="space-y-8">

      {/* Core info */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Report Details</h2>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Title <span className="text-red-400">*</span></label>
          <input type="text" required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. India Cold Chain Logistics Market to Reach USD 23 Billion by 2030"
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Ken Research Report URL <span className="text-red-400">*</span></label>
          <input type="url" required value={form.targetUrl}
            onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
            placeholder="https://www.kenresearch.com/..."
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Short Description <span className="text-slate-600">(optional)</span></label>
          <textarea rows={2} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="2–3 sentences summarising the report…"
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
      </section>

      {/* Format */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Blog Format</h2>
        <div className="grid gap-3">
          {FORMATS.map((f) => (
            <label key={f.id}
              className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                form.format === f.id ? 'border-blue-500 bg-blue-950/40' : 'border-border bg-card hover:border-slate-500'
              }`}
            >
              <input type="radio" name="format" value={f.id} checked={form.format === f.id}
                onChange={() => setForm({ ...form, format: f.id })} className="mt-0.5 accent-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-semibold text-sm">{f.label}</p>
                  <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{f.subLabel}</span>
                </div>
                <p className="text-slate-400 text-xs mt-1">{f.desc}</p>
              </div>
              {f.sampleRoute && (
                <a
                  href={f.sampleRoute}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-xs text-blue-400 hover:text-blue-300 border border-blue-800/60 hover:border-blue-500 bg-blue-950/30 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  See example ↗
                </a>
              )}
            </label>
          ))}
        </div>
      </section>

      {/* Blog platforms */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Blog Platforms</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm({ ...form, platforms: BLOG_PLATFORMS.map((p) => p.key) })}
              className="text-xs text-blue-400 hover:text-blue-300">All</button>
            <span className="text-slate-600">·</span>
            <button type="button" onClick={() => setForm({ ...form, platforms: [] })}
              className="text-xs text-slate-400 hover:text-slate-300">None</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BLOG_PLATFORMS.map((p) => {
            const checked = form.platforms.includes(p.key);
            return (
              <label key={p.key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                  checked ? 'border-blue-500/60 bg-blue-950/30 text-white' : 'border-border bg-card text-slate-400 hover:border-slate-500'
                }`}
              >
                <input type="checkbox" checked={checked}
                  onChange={() => toggle(p.key, form.platforms, (v) => setForm({ ...form, platforms: v }))}
                  className="accent-blue-500" />
                {p.label}
              </label>
            );
          })}
        </div>
      </section>

      {/* Social platforms */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Social Platforms <span className="text-slate-600 normal-case font-normal">(optional)</span></h2>
        <div className="grid grid-cols-3 gap-2">
          {SOCIAL_PLATFORMS.map((p) => {
            const checked = form.social.includes(p.key);
            return (
              <label key={p.key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                  checked ? 'border-blue-500/60 bg-blue-950/30 text-white' : 'border-border bg-card text-slate-400 hover:border-slate-500'
                }`}
              >
                <input type="checkbox" checked={checked}
                  onChange={() => toggle(p.key, form.social, (v) => setForm({ ...form, social: v }))}
                  className="accent-blue-500" />
                {p.label}
              </label>
            );
          })}
        </div>
      </section>

      {error   && <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3">{error}</p>}
      {success && <p className="text-sm text-green-400 bg-green-950/30 border border-green-800/40 rounded-lg px-4 py-3">{success}</p>}

      <button type="submit" disabled={loading}
        className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 text-white font-semibold rounded-xl transition-colors"
      >
        {loading ? 'Submitting…' : '🚀 Generate & Distribute'}
      </button>
    </form>}

    </div>
  );
}
