'use client';
import { useEffect, useRef, useState } from 'react';

interface UpdateItem {
  id: string;
  date: string;
  title: string;
  description: string;
}

const ACK_KEY = 'kr_updates_acknowledged';
const POLL_MS = 5000;

function loadAcknowledged(): Set<string> {
  try {
    const raw = localStorage.getItem(ACK_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveAcknowledged(ids: Set<string>): void {
  try { localStorage.setItem(ACK_KEY, JSON.stringify([...ids])); } catch { /* noop */ }
}

export default function UpdatesBell() {
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const knownIdsRef = useRef<Set<string> | null>(null); // ids seen in the previous poll — null until first fetch
  const hasAutoOpenedRef = useRef(false);

  useEffect(() => {
    setAcknowledged(loadAcknowledged());

    async function poll() {
      try {
        const res = await fetch('/api/updates', { cache: 'no-store' });
        const data = await res.json();
        const list: UpdateItem[] = data.updates ?? [];
        setUpdates(list);

        const currentIds = new Set(list.map((u) => u.id));
        const isFirstFetch = knownIdsRef.current === null;
        const hasBrandNew = !isFirstFetch && [...currentIds].some((id) => !knownIdsRef.current!.has(id));

        const unackedNow = list.some((u) => !loadAcknowledged().has(u.id));
        // Auto-open once per session if there's anything unacknowledged, and
        // again any time a genuinely new update lands mid-session (someone
        // just shipped something while this tab was open).
        if ((isFirstFetch && unackedNow && !hasAutoOpenedRef.current) || hasBrandNew) {
          setOpen(true);
          hasAutoOpenedRef.current = true;
        }
        knownIdsRef.current = currentIds;
      } catch { /* transient network error — next poll retries */ }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  function acknowledge(id: string) {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveAcknowledged(next);
      return next;
    });
  }

  function acknowledgeAll() {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      updates.forEach((u) => next.add(u.id));
      saveAcknowledged(next);
      return next;
    });
  }

  const unackedCount = updates.filter((u) => !acknowledged.has(u.id)).length;
  const isLive = unackedCount > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          open ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'
        }`}
      >
        <span className="relative inline-flex h-2 w-2">
          {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? 'bg-emerald-400' : 'bg-slate-600'}`} />
        </span>
        🔔 Updates
        {unackedCount > 0 && (
          <span className="ml-0.5 text-[10px] font-bold bg-emerald-500 text-white rounded-full px-1.5 py-0.5 leading-none">
            {unackedCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-96 max-h-[28rem] overflow-y-auto bg-[#1a2235] border border-border rounded-xl shadow-2xl z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-[#1a2235]">
              <h3 className="text-sm font-semibold text-white">What's new</h3>
              {unackedCount > 0 && (
                <button onClick={acknowledgeAll} className="text-xs text-blue-400 hover:text-blue-300">
                  Mark all as read
                </button>
              )}
            </div>
            <div className="divide-y divide-border">
              {updates.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No updates yet.</p>
              )}
              {updates.map((u) => {
                const acked = acknowledged.has(u.id);
                return (
                  <label
                    key={u.id}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${acked ? 'opacity-50' : 'hover:bg-slate-800/50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={acked}
                      onChange={() => acknowledge(u.id)}
                      className="mt-1 accent-emerald-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{u.title}</p>
                        {!acked && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{u.description}</p>
                      <p className="text-[10px] text-slate-600 mt-1">{u.date}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
