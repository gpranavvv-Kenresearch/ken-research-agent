import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// POST /api/admin/cycle — admin (pranav) starts/stops ANY agent's posting or
// blog cycle. Thin proxy to the VPS admin-cycle route. body: { target, kind, action }
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-agent-token') ?? '';
  const body = await req.json().catch(() => ({}));
  const { status, data } = await vpsProxy('/api/agent/admin/admin-cycle', {
    method: 'POST',
    headers: { 'X-Agent-Token': token },
    body: JSON.stringify(body),
  });
  return NextResponse.json(data, { status });
}
