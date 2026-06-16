import { NextRequest, NextResponse } from 'next/server';
import { appendBlogRow } from '@/lib/sheetClient';
import type { SubmitPayload } from '@/lib/sheetClient';
import { getUser } from '@/lib/userConfig';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SubmitPayload & { userId?: string };

    if (!body.title?.trim())     return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!body.targetUrl?.trim()) return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    if (!body.userId?.trim())    return NextResponse.json({ error: 'User not selected' }, { status: 400 });

    const user = getUser(body.userId);
    if (!user) return NextResponse.json({ error: `Unknown user: "${body.userId}"` }, { status: 400 });

    const payload: SubmitPayload = {
      title:       body.title,
      targetUrl:   body.targetUrl,
      name:        user.displayName,
      format:      body.format || 'Format 1',
      platforms:   body.platforms ?? [],
      description: body.description,
      blogTab:     user.blogTab,
    };

    const sheetRow = await appendBlogRow(payload);

    // Notify Django to generate content + queue posting immediately
    const djangoUrl    = process.env.DJANGO_API_URL;
    const webhookSecret = process.env.DJANGO_WEBHOOK_SECRET;
    if (djangoUrl && webhookSecret) {
      try {
        await fetch(`${djangoUrl}/api/v1/sheet/webhook/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': webhookSecret,
          },
          body: JSON.stringify({
            name:      user.id,
            sheetRow,
            title:     payload.title,
            targetUrl: payload.targetUrl,
            platforms: payload.platforms,
          }),
        });
      } catch (err) {
        console.error('[submit] Django webhook failed (non-fatal):', err);
      }
    }

    return NextResponse.json({ success: true, sheetRow, tab: user.blogTab });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
