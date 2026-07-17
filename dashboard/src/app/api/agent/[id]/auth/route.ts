import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// POST /api/agent/:id/auth  { pin } — verify/set the agent PIN, get an agent token.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/auth`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return NextResponse.json(data, { status });
}
