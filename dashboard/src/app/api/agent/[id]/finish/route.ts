import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// POST /api/agent/:id/finish  { token } — finish + tear down a login on the VPS.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentToken = req.headers.get('x-agent-token') ?? '';
  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/login/${encodeURIComponent(token)}/finish`,
    { method: 'POST', headers: { 'X-Agent-Token': agentToken } },
  );
  return NextResponse.json(data, { status });
}
