import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// POST /api/agent/:id/local-login/prepare  { platform } — reserve a fleet slot
// and get back a copy-paste command to run on your OWN machine (opens a real
// local Chrome instead of streaming a remote one — no lag).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get('x-agent-token') ?? '';
  const body = await req.json().catch(() => ({}));
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/local-login/prepare`,
    { method: 'POST', body: JSON.stringify(body), headers: { 'X-Agent-Token': token } },
  );
  return NextResponse.json(data, { status });
}
