'use client';
import { USERS } from '@/lib/userConfig';
import { useUser } from '@/context/UserContext';

const COLOR_MAP: Record<string, string> = {
  blue:    'bg-blue-600 hover:bg-blue-500 border-blue-500',
  purple:  'bg-purple-600 hover:bg-purple-500 border-purple-500',
  green:   'bg-green-700 hover:bg-green-600 border-green-500',
  orange:  'bg-orange-600 hover:bg-orange-500 border-orange-500',
  red:     'bg-red-700 hover:bg-red-600 border-red-500',
  pink:    'bg-pink-600 hover:bg-pink-500 border-pink-500',
  teal:    'bg-teal-600 hover:bg-teal-500 border-teal-500',
  yellow:  'bg-yellow-600 hover:bg-yellow-500 border-yellow-500',
  indigo:  'bg-indigo-600 hover:bg-indigo-500 border-indigo-500',
  cyan:    'bg-cyan-600 hover:bg-cyan-500 border-cyan-500',
  emerald: 'bg-emerald-700 hover:bg-emerald-600 border-emerald-500',
};

const TEXT_MAP: Record<string, string> = {
  blue: 'text-blue-400', purple: 'text-purple-400', green: 'text-green-400',
  orange: 'text-orange-400', red: 'text-red-400', pink: 'text-pink-400',
  teal: 'text-teal-400', yellow: 'text-yellow-400', indigo: 'text-indigo-400',
  cyan: 'text-cyan-400', emerald: 'text-emerald-400',
};

export default function UserSelector() {
  const { setUser } = useUser();

  return (
    <div className="fixed inset-0 z-50 bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest mb-3">Ken Research</p>
          <h1 className="text-3xl font-bold text-white">Who are you?</h1>
          <p className="text-slate-400 mt-2 text-sm">Select your name to access your dashboard and sheet.</p>
        </div>

        {/* Grid of names */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {USERS.map((u) => (
            <button
              key={u.id}
              onClick={() => setUser(u)}
              className="group flex flex-col items-center gap-2 p-4 bg-card border border-border rounded-xl hover:border-slate-500 transition-all hover:scale-105 active:scale-95"
            >
              {/* Avatar */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm border-2 transition-colors ${COLOR_MAP[u.color] ?? 'bg-slate-600 border-slate-500'}`}>
                {u.initials}
              </div>
              <span className={`text-sm font-medium transition-colors group-hover:${TEXT_MAP[u.color] ?? 'text-white'} text-slate-300`}>
                {u.displayName}
              </span>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-slate-600 mt-8">
          Your selection is saved locally — you won&apos;t need to pick again.
        </p>
      </div>
    </div>
  );
}
