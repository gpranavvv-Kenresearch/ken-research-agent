import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

// POST /api/post-now { sheetRow, platform, agent } — retries one row on one
// platform, direct to the VPS login-api (runRetryRow), no Django/Celery hop.
// `agent` picks which person's sheet the row belongs to — required, since the
// VPS server runs as one shared process and can't infer it from rowIndex
// alone. Body also carries other fields (name, tab, content, etc.) from
// RowDetailModal for back-compat, but only sheetRow/platform/agent are
// actually used server-side — the row itself is re-read fresh from the sheet.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const rowIndex = Number(body?.sheetRow);
  // Dashboard's platform keys mostly match runRetryRow's 1:1 — only LI Pulse differs.
  const platform = body?.platform === 'linkedinPulse' ? 'linkedin-pulse' : String(body?.platform || '');
  const agent = String(body?.agent || '');

  const { status, data } = await vpsProxy('/api/retry-row', {
    method: 'POST',
    body: JSON.stringify({ rowIndex, platform, agent }),
  });
  return NextResponse.json(data, { status });
}
