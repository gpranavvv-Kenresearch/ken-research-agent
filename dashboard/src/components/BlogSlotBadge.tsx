import type { BlogSlot } from '@/types';
import { BLOG_PLATFORM_META } from '@/types';

interface Props {
  slot: BlogSlot;
  compact?: boolean;
}

function normalise(s: string): 'posted' | 'failed' | 'pending' {
  const l = s.toLowerCase();
  if (l === 'posted' || l === 'success' || l === 'done') return 'posted';
  if (l === 'failed' || l === 'error' || l.startsWith('fail')) return 'failed';
  return 'pending';
}

export default function BlogSlotBadge({ slot, compact = false }: Props) {
  const label = slot.platform || `Slot ${slot.slot}`;
  const state = slot.platform ? normalise(slot.status) : 'pending';
  const meta = BLOG_PLATFORM_META[slot.platform];

  const base = compact
    ? 'inline-flex items-center text-xs px-2 py-0.5 rounded font-medium gap-1 max-w-[110px] truncate'
    : 'inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium gap-1.5 whitespace-nowrap';

  if (!slot.platform) {
    return (
      <span className={`${base} bg-slate-800 text-slate-600 border border-slate-700/40`} title={`Slot ${slot.slot}: unclaimed`}>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
        {!compact && 'Unclaimed'}
        {compact && <span className="truncate">Unclaimed</span>}
      </span>
    );
  }

  if (state === 'posted') {
    return (
      <a href={slot.url || '#'} target="_blank" rel="noopener noreferrer"
        className={`${base} bg-green-900/60 text-green-300 border border-green-700/40 hover:bg-green-800/60 transition-colors`}
        title={`${label}: Posted`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
        {!compact && (meta ? `${meta.icon} ${label}` : label)}
        {compact && <span className="truncate">{label}</span>}
        <span>↗</span>
      </a>
    );
  }

  if (state === 'failed') {
    return (
      <span className={`${base} bg-red-900/60 text-red-300 border border-red-700/40 cursor-help`} title={slot.error || `${label}: Failed`}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        {!compact && label}
        {compact && <span className="truncate">{label}</span>}
        <span title={slot.error}>⚠</span>
      </span>
    );
  }

  return (
    <span className={`${base} bg-slate-800 text-slate-500 border border-slate-700/40`} title={`${label}: Pending`}>
      <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
      {!compact && label}
      {compact && <span className="truncate">{label}</span>}
    </span>
  );
}
