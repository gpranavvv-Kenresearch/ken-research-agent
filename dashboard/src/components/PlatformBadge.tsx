import type { PlatformDef, RawRow } from '@/types';
import { getField } from '@/types';

interface Props {
  platform: PlatformDef;
  row: RawRow;
  compact?: boolean;
}

function normalise(s: string): 'posted' | 'failed' | 'pending' {
  const l = s.toLowerCase();
  if (l === 'posted' || l === 'success' || l === 'done') return 'posted';
  if (l === 'failed' || l === 'error' || l.startsWith('fail')) return 'failed';
  return 'pending';
}

export default function PlatformBadge({ platform, row, compact = false }: Props) {
  const status = getField(row, ...platform.statusCols);
  const url = getField(row, ...platform.urlCols);
  const error = getField(row, ...platform.errorCols);
  const state = normalise(status);

  const base = compact
    ? 'inline-flex items-center text-xs px-2 py-0.5 rounded font-medium gap-1 max-w-[100px] truncate'
    : 'inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium gap-1.5 whitespace-nowrap';

  if (state === 'posted') {
    return (
      <a href={url || '#'} target="_blank" rel="noopener noreferrer"
        className={`${base} bg-green-900/60 text-green-300 border border-green-700/40 hover:bg-green-800/60 transition-colors`}
        title={`${platform.label}: Posted`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
        {!compact && platform.label}
        {compact && <span className="truncate">{platform.label}</span>}
        <span>↗</span>
      </a>
    );
  }

  if (state === 'failed') {
    return (
      <span
        className={`${base} bg-red-900/60 text-red-300 border border-red-700/40 cursor-help`}
        title={error || `${platform.label}: Failed`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        {!compact && platform.label}
        {compact && <span className="truncate">{platform.label}</span>}
        <span title={error}>⚠</span>
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-slate-800 text-slate-500 border border-slate-700/40`}
      title={`${platform.label}: Pending`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
      {!compact && platform.label}
      {compact && <span className="truncate">{platform.label}</span>}
    </span>
  );
}
