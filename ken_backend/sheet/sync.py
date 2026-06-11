"""
Converts Google Sheet rows into Django DB records (PostingJob / BlogJob).
Uses get_or_create to be idempotent — safe to run repeatedly.
"""
from jobs.models import PostingJob, BlogJob
from .reader import read_unposted_social, read_unposted_blog


def sync_social_for_user(user) -> dict:
    rows = read_unposted_social(user.nickname)
    created = skipped = 0
    for row in rows:
        target_url = row.get('targetUrl', '').strip()
        sheet_row  = row.get('_sheetRow') or row.get('row')
        if not target_url or not sheet_row:
            continue
        obj, is_new = PostingJob.objects.get_or_create(
            user=user,
            target_url=target_url,
            sheet_row=int(sheet_row),
            defaults={
                'title':     row.get('title', ''),
                'platforms': row.get('Platforms', 'x,facebook,linkedin').strip() or 'x,facebook,linkedin',
            },
        )
        if is_new:
            created += 1
        else:
            skipped += 1
    return {'created': created, 'skipped': skipped, 'total': len(rows)}


def sync_blog_for_user(user) -> dict:
    rows = read_unposted_blog(user.nickname)
    created = skipped = 0
    for row in rows:
        target_url = row.get('targetUrl', '').strip()
        sheet_row  = row.get('_sheetRow') or row.get('row')
        if not target_url or not sheet_row:
            continue
        obj, is_new = BlogJob.objects.get_or_create(
            user=user,
            target_url=target_url,
            sheet_row=int(sheet_row),
            defaults={
                'title':     row.get('title', ''),
                'platforms': row.get('Platforms', 'linkedin_pulse,notion,medium').strip() or 'linkedin_pulse,notion,medium',
            },
        )
        if is_new:
            created += 1
        else:
            skipped += 1
    return {'created': created, 'skipped': skipped, 'total': len(rows)}
