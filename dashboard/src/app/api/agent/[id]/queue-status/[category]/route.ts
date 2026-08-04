import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// GET /api/agent/:id/queue-status/:category — box-wide queue snapshot (who's
// running/waiting, capacity, ETA) so the dashboard can warn before someone
// clicks Generate/Post Now, not just after.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; category: string }> }) {
  const { id, category } = await params;
  const token = req.headers.get('x-agent-token') ?? '';
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/queue-status/${encodeURIComponent(category)}`,
    { headers: { 'X-Agent-Token': token } },
  );
  return NextResponse.json(data, { status });
}
