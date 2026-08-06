import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// GET /api/agent/:id/account-counts — declared account counts per platform, e.g. { x: 2, fb: 3 }.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get('x-agent-token') ?? '';
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/account-counts`,
    { headers: { 'X-Agent-Token': token } },
  );
  return NextResponse.json(data, { status });
}

// POST /api/agent/:id/account-counts { platform, count } — declare how many
// accounts this agent has logged in for one platform.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get('x-agent-token') ?? '';
  const body = await req.json().catch(() => ({}));
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/account-counts`,
    { method: 'POST', headers: { 'X-Agent-Token': token }, body: JSON.stringify(body) },
  );
  return NextResponse.json(data, { status });
}
