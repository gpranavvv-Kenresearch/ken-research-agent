"""
Converts Google Sheet rows into Django DB records.
Dispatch happens in sync_and_generate_all (tasks.py), not here.
"""
from jobs.models import PostingJob, BlogJob
from .reader import read_unposted_social, read_unposted_blog


def sync_social_for_user(user) -> list:
    """Read unposted social rows, create DB records. Return list of newly created jobs."""
    rows = read_unposted_social(user.nickname)
    new_jobs = []
    for row in rows:
        url       = row.get('targetUrl', '').strip()
        sheet_row = row.get('_dataRow') or row.get('_sheetRow') or row.get('row')
        if not url or not sheet_row:
            continue
        job, is_new = PostingJob.objects.get_or_create(
            user=user,
            target_url=url,
            sheet_row=int(sheet_row),
            defaults={
                'title':     row.get('title', row.get('Title', '')),
                'platforms': row.get('Platforms', 'x,facebook,linkedin').strip() or 'x,facebook,linkedin',
                'status':    'queued',
            },
        )
        if is_new:
            new_jobs.append(job)
    return new_jobs


def sync_blog_for_user(user) -> list:
    """Read unposted blog rows, create DB records. Return list of newly created jobs."""
    rows = read_unposted_blog(user.nickname)
    new_jobs = []
    for row in rows:
        url       = row.get('targetUrl', '').strip()
        sheet_row = row.get('_dataRow') or row.get('_sheetRow') or row.get('row')
        if not url or not sheet_row:
            continue
        job, is_new = BlogJob.objects.get_or_create(
            user=user,
            target_url=url,
            sheet_row=int(sheet_row),
            defaults={
                'title':     row.get('title', row.get('Title', '')),
                'platforms': row.get('Platforms', 'linkedin_pulse').strip() or 'linkedin_pulse',
                'status':    'queued',
            },
        )
        if is_new:
            new_jobs.append(job)
    return new_jobs
