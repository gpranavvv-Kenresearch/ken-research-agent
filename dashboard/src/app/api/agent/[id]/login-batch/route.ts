import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// POST /api/agent/:id/login-batch  { platform, indices?[], count? } — start many logins at once.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get('x-agent-token') ?? '';
  const body = await req.json().catch(() => ({}));
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/login-batch`,
    { method: 'POST', body: JSON.stringify(body), headers: { 'X-Agent-Token': token } },
  );
  return NextResponse.json(data, { status });
}
