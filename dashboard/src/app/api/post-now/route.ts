import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

// POST /api/post-now { sheetRow, platform } — retries one row on one platform,
// direct to the VPS login-api (runRetryRow), no Django/Celery hop. Body also
// carries other fields (name, tab, content, etc.) from RowDetailModal for
// back-compat, but only sheetRow + platform are actually used server-side —
// the row itself is re-read fresh from the sheet on the VPS.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const rowIndex = Number(body?.sheetRow);
  // Dashboard's platform keys mostly match runRetryRow's 1:1 — only LI Pulse differs.
  const platform = body?.platform === 'linkedinPulse' ? 'linkedin-pulse' : String(body?.platform || '');

  const { status, data } = await vpsProxy('/api/retry-row', {
    method: 'POST',
    body: JSON.stringify({ rowIndex, platform }),
  });
  return NextResponse.json(data, { status });
}
