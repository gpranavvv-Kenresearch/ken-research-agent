import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// POST /api/agent/:id/blog-cycle/start — start the continuous blog-generation loop.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get('x-agent-token') ?? '';
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/blog-cycle/start`,
    { method: 'POST', headers: { 'X-Agent-Token': token } },
  );
  return NextResponse.json(data, { status });
}
