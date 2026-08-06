'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useUser } from '@/context/UserContext';

const CODA_NOTICE_KEY = 'kr_coda_notice_dismissed_v2';

function CodaNoticeBanner({ loginsHref }: { loginsHref: string }) {
  const [dismissed, setDismissed] = useState(true); // default hidden until we know localStorage says otherwise (avoids SSR flash)

  useEffect(() => {
    setDismissed(localStorage.getItem(CODA_NOTICE_KEY) === '1');
  }, []);

  if (dismissed) return null;

  return (
    <div className="bg-amber-950/40 border-b border-amber-800/40">
      <div className="max-w-screen-2xl mx-auto px-6 py-2 flex items-center gap-3 text-sm">
        <span className="text-amber-300">🆕</span>
        <span className="text-amber-200 flex-1">
          New platforms are live: <span className="font-semibold">Coda</span> (blog) and <span className="font-semibold">Tumblr</span> (bookmarking). Head to <span className="font-semibold">Logins</span> and log in to start posting to them.
        </span>
        <Link href={loginsHref} className="text-amber-300 hover:text-amber-100 underline text-xs shrink-0">Go to Logins</Link>
        <button
          onClick={() => { localStorage.setItem(CODA_NOTICE_KEY, '1'); setDismissed(true); }}
          className="text-amber-400 hover:text-amber-100 text-xs shrink-0"
        >
          ✕ dismiss
        </button>
      </div>
    </div>
  );
}

const COLOR_DOT: Record<string, string> = {
  blue: 'bg-blue-500', purple: 'bg-purple-500', green: 'bg-green-500',
  orange: 'bg-orange-500', red: 'bg-red-500', pink: 'bg-pink-500',
  teal: 'bg-teal-500', yellow: 'bg-yellow-500', indigo: 'bg-indigo-500',
  cyan: 'bg-cyan-500', emerald: 'bg-emerald-500',
};

export default function Navbar() {
  const path = usePathname();
  const router = useRouter();
  const { user, clearUser } = useUser();
  const isHome = path === '/';

  return (
    <nav className="bg-card border-b border-border sticky top-0 z-40">
      <div className="max-w-screen-2xl mx-auto px-6 flex items-center gap-4 h-14">
        {/* Back button — shown on all pages except home */}
        {!isHome && (
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
          >
            ← Back
          </button>
        )}

        {/* Brand — links to home */}
        <Link href="/" className="text-white font-bold text-lg tracking-tight shrink-0 hover:text-blue-300 transition-colors">
          Ken Research <span className="text-blue-400">Distribution</span>
        </Link>

        {/* Nav links */}
        {user && (
          <div className="flex gap-1">
            <NavLink href="/track"  active={path.startsWith('/track')}>📊 Track</NavLink>
            <NavLink href="/submit" active={path.startsWith('/submit')}>➕ Submit URL</NavLink>
            <NavLink href={`/agent/${user.id}`} active={path.startsWith('/agent')}>🔑 Logins</NavLink>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User chip */}
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Auto-refreshes every 15s</span>
            <div className="flex items-center gap-2 bg-slate-800 border border-border rounded-full px-3 py-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${COLOR_DOT[user.color] ?? 'bg-slate-400'}`} />
              <span className="text-sm text-white font-medium">{user.displayName}</span>
              <button
                onClick={clearUser}
                title="Switch user"
                className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold transition-all"
                style={{ background: 'linear-gradient(135deg, #6366f1, #06b6d4)', color: '#fff' }}
              >
                Switch User
              </button>
            </div>
          </div>
        )}
      </div>
      {user && <CodaNoticeBanner loginsHref={`/agent/${user.id}`} />}
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'
      }`}
    >
      {children}
    </Link>
  );
}
