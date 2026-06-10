import { NextRequest, NextResponse } from 'next/server';
import { fetchRows } from '@/lib/sheetClient';
import { getUser } from '@/lib/userConfig';

export async function GET(req: NextRequest) {
  const tab  = (req.nextUrl.searchParams.get('tab') ?? 'blog') as 'social' | 'blog';
  const userId = req.nextUrl.searchParams.get('user') ?? '';

  const user = getUser(userId);
  if (!user) return NextResponse.json({ error: `Unknown user: "${userId}"` }, { status: 400 });

  const tabName = tab === 'social' ? user.socialTab : user.blogTab;

  try {
    const rows = await fetchRows(tabName);
    return NextResponse.json({ rows, tab, tabName, user: userId, fetchedAt: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
