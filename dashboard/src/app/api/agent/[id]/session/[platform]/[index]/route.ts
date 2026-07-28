import { NextRequest, NextResponse } from 'next/server';
import { vpsProxy } from '@/lib/vpsProxy';

export const dynamic = 'force-dynamic';

// DELETE /api/agent/:id/session/:platform/:index — proxy to the VPS session-delete
// endpoint. Removes the session profile, registry entry, health entry and cookies
// fallback for ONE fleet account.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; platform: string; index: string }> },
) {
  const { id, platform, index } = await params;
  const token = req.headers.get('x-agent-token') ?? '';
  const { status, data } = await vpsProxy(
    `/api/agent/${encodeURIComponent(id)}/session/${encodeURIComponent(platform)}/${encodeURIComponent(index)}`,
    { method: 'DELETE', headers: { 'X-Agent-Token': token } },
  );
  return NextResponse.json(data, { status });
}
