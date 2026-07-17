import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// GET /api/agent/:id/post-cycle/status — is a post cycle running, recent log/stage detail.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get('x-agent-token') ?? '';
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/post-cycle/status`,
    { headers: { 'X-Agent-Token': token } },
  );
  return NextResponse.json(data, { status });
}
