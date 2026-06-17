import { NextRequest, NextResponse } from 'next/server';
import { appendBlogRow, appendSocialRow } from '@/lib/sheetClient';

export const dynamic = 'force-dynamic';
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

    const basePayload: SubmitPayload = {
      title:          body.title,
      targetUrl:      body.targetUrl,
      name:           user.displayName,
      format:         body.format || 'seo-li',
      platforms:      body.platforms ?? [],
      socialPlatforms: body.socialPlatforms ?? [],
      description:    body.description,
      blogTab:        user.blogTab,
      socialTab:      user.socialTab,
    };

    const djangoUrl     = process.env.DJANGO_API_URL;
    const webhookSecret = process.env.DJANGO_WEBHOOK_SECRET;

    let blogSheetRow   = -1;
    let socialSheetRow = -1;

    // Write blog row → {Name} Blog tab
    if (basePayload.platforms.length > 0) {
      blogSheetRow = await appendBlogRow(basePayload);

      if (djangoUrl && webhookSecret && blogSheetRow > 0) {
        try {
          await fetch(`${djangoUrl}/api/v1/sheet/webhook/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': webhookSecret },
            body: JSON.stringify({
              type:      'blog',
              name:      user.id,
              sheetRow:  blogSheetRow,
              title:     basePayload.title,
              targetUrl: basePayload.targetUrl,
              platforms: basePayload.platforms,
            }),
          });
        } catch (err) {
          console.error('[submit] Django blog webhook failed (non-fatal):', err);
        }
      }
    }

    // Write social row → {Name} Social tab
    if (basePayload.socialPlatforms.length > 0) {
      socialSheetRow = await appendSocialRow(basePayload);

      if (djangoUrl && webhookSecret && socialSheetRow > 0) {
        try {
          await fetch(`${djangoUrl}/api/v1/sheet/webhook/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': webhookSecret },
            body: JSON.stringify({
              type:            'social',
              name:            user.id,
              sheetRow:        socialSheetRow,
              title:           basePayload.title,
              targetUrl:       basePayload.targetUrl,
              socialPlatforms: basePayload.socialPlatforms,
            }),
          });
        } catch (err) {
          console.error('[submit] Django social webhook failed (non-fatal):', err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      blogSheetRow,
      socialSheetRow,
      blogTab:   blogSheetRow   > 0 ? user.blogTab   : null,
      socialTab: socialSheetRow > 0 ? user.socialTab : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
