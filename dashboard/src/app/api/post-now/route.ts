import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const djangoUrl     = process.env.DJANGO_API_URL;
  const webhookSecret = process.env.DJANGO_WEBHOOK_SECRET;

  if (!djangoUrl) return NextResponse.json({ error: 'DJANGO_API_URL not configured' }, { status: 500 });

  const body = await req.json();

  try {
    const res = await fetch(`${djangoUrl}/api/v1/sheet/post-now/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error ?? 'Django error' }, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
