import { NextResponse } from 'next/server';
import updates from '@/data/updates.json';

// GET /api/updates — the changelog feed the dashboard polls every 5s.
// Source of truth is src/data/updates.json, edited + redeployed whenever a
// platform/feature ships — no DB needed, the route just serves the current
// build's list. Newest first.
export const dynamic = 'force-dynamic';

export async function GET() {
  const sorted = [...updates].sort((a, b) => b.id.localeCompare(a.id));
  return NextResponse.json({ updates: sorted });
}
