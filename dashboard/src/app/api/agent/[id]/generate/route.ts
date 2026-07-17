import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// POST /api/agent/:id/generate  { count } — trigger on-demand blog generation on the VPS.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get('x-agent-token') ?? '';
  const body = await req.json().catch(() => ({}));
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/generate-blogs`,
    { method: 'POST', body: JSON.stringify(body), headers: { 'X-Agent-Token': token } },
  );
  return NextResponse.json(data, { status });
}
