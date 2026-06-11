"""
Celery tasks — these run on LOCAL machines (not Render.com).
Each task drives existing TypeScript / Python scripts via subprocess.
"""
import json
import os
import subprocess
from datetime import datetime, timezone as tz

from celery import shared_task
from django.conf import settings
from django.utils import timezone

REPO_ROOT = getattr(settings, 'REPO_ROOT', str(
    os.path.join(os.path.dirname(__file__), '..', '..')
))

PLATFORM_SCRIPT = {
    'x':             'scripts/post-x.ts',
    'facebook':      'scripts/post-facebook.ts',
    'linkedin':      'scripts/post-linkedin.ts',
    'linkedin_pulse':'scripts/post-linkedin-pulse.ts',
}

PLATFORM_FLAG = {
    'x':              '--tweet-file',
    'facebook':       '--post-file',
    'linkedin':       '--post-file',
    'linkedin_pulse': '--html-file',
}


def _env():
    return {**os.environ, 'NODE_PATH': os.path.join(REPO_ROOT, 'node_modules')}


def _run_ts(args: list[str], timeout: int = 180) -> subprocess.CompletedProcess:
    return subprocess.run(
        ['npx', 'ts-node'] + args,
        capture_output=True, text=True, cwd=REPO_ROOT, env=_env(), timeout=timeout
    )


# ── Social posting ─────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=60, queue='social')
def execute_social_post(self, job_id: int, platform: str):
    from jobs.models import PostingJob, PostingResult
    from credentials.models import SocialCredential

    try:
        job  = PostingJob.objects.select_related('user').get(pk=job_id)
        user = job.user
    except PostingJob.DoesNotExist:
        return

    result, _ = PostingResult.objects.get_or_create(job=job, platform=platform)
    result.status = 'running'
    result.save(update_fields=['status'])

    # Look up credentials
    try:
        cred = SocialCredential.objects.get(user=user, platform=platform, is_active=True)
    except SocialCredential.DoesNotExist:
        result.status = 'failed'
        result.error_message = f'No active credential for {platform}'
        result.save(update_fields=['status', 'error_message'])
        _update_job_status(job)
        return

    script = PLATFORM_SCRIPT.get(platform)
    if not script:
        result.status = 'failed'
        result.error_message = f'Unknown platform: {platform}'
        result.save(update_fields=['status', 'error_message'])
        _update_job_status(job)
        return

    # Write post content to a temp file
    import tempfile
    content_map = {'x': job.x_post, 'facebook': job.fb_post, 'linkedin': job.li_post}
    post_content = content_map.get(platform, '')

    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.txt', delete=False, encoding='utf-8'
    ) as f:
        f.write(post_content)
        tmp_post = f.name

    try:
        file_flag = PLATFORM_FLAG[platform]
        cmd = [
            script,
            '--nickname', user.nickname,
            '--row', str(job.sheet_row or 0),
            '--batch', job.batch_label or '',
            file_flag, tmp_post,
        ]
        if platform == 'x':
            cmd += ['--username', cred.handle or cred.login_email,
                    '--password', cred.login_password,
                    '--handle',   cred.handle]
        else:
            cmd += ['--email',    cred.login_email,
                    '--password', cred.login_password]

        proc = _run_ts(cmd, timeout=180)

        if proc.returncode == 0:
            # Parse posted URL from stdout (scripts print: POSTED_URL=https://...)
            post_url = ''
            for line in proc.stdout.splitlines():
                if line.startswith('POSTED_URL='):
                    post_url = line.split('=', 1)[1].strip()
            result.status    = 'done'
            result.post_url  = post_url
            result.posted_at = timezone.now()
            result.raw_output = proc.stdout[-2000:]
            result.save(update_fields=['status', 'post_url', 'posted_at', 'raw_output'])
        else:
            raise RuntimeError(proc.stderr[-1000:] or proc.stdout[-1000:])

    except Exception as exc:
        result.status        = 'failed'
        result.error_message = str(exc)[:500]
        result.save(update_fields=['status', 'error_message'])
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            pass
    finally:
        os.unlink(tmp_post)

    _update_job_status(job)


def _update_job_status(job):
    from jobs.models import PostingResult
    results = list(PostingResult.objects.filter(job=job))
    statuses = {r.status for r in results}
    if all(r.status == 'done' for r in results):
        job.status = 'done'
    elif all(r.status == 'failed' for r in results):
        job.status = 'failed'
    elif 'done' in statuses and 'failed' in statuses:
        job.status = 'partial'
    elif 'running' in statuses or 'queued' in statuses:
        job.status = 'running'
    job.save(update_fields=['status'])


# ── Blog generation ────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=1, default_retry_delay=120, queue='blog')
def execute_blog_generation(self, blog_job_id: int):
    from jobs.models import BlogJob

    try:
        job = BlogJob.objects.select_related('user').get(pk=blog_job_id)
    except BlogJob.DoesNotExist:
        return

    job.status = 'running'
    job.save(update_fields=['status'])

    try:
        # Delegate to existing generate-blog logic via Python subprocess
        gen_script = os.path.join(REPO_ROOT, 'scripts', 'generate_blog.py')
        result = subprocess.run(
            ['python', gen_script,
             '--url', job.target_url,
             '--name', job.user.nickname,
             '--row', str(job.sheet_row or 0),
             '--output-json'],
            capture_output=True, text=True, cwd=REPO_ROOT, timeout=600
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr[-1000:])

        data = json.loads(result.stdout)
        job.blog_title       = data.get('blog_title', '')
        job.blog_content     = data.get('blog_content', '')
        job.blog_description = data.get('blog_description', '')
        job.blog_seo_title   = data.get('blog_seo_title', '')
        job.blog_seo_desc    = data.get('blog_seo_desc', '')
        job.rating           = data.get('rating')
        job.cover_image_url  = data.get('cover_image_url', '')
        job.status           = 'done'
        job.save()

        # Queue publishing for each platform
        for platform in job.platforms.split(','):
            platform = platform.strip()
            if platform:
                execute_blog_publish.delay(blog_job_id, platform)

    except Exception as exc:
        job.status        = 'failed'
        job.error_message = str(exc)[:500]
        job.save(update_fields=['status', 'error_message'])
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            pass


@shared_task(bind=True, max_retries=2, default_retry_delay=60, queue='blog')
def execute_blog_publish(self, blog_job_id: int, platform: str):
    from jobs.models import BlogJob, BlogResult
    from credentials.models import SocialCredential

    try:
        job  = BlogJob.objects.select_related('user').get(pk=blog_job_id)
        user = job.user
    except BlogJob.DoesNotExist:
        return

    result, _ = BlogResult.objects.get_or_create(blog_job=job, platform=platform)
    result.status = 'running'
    result.save(update_fields=['status'])

    try:
        cred = SocialCredential.objects.get(user=user, platform=platform, is_active=True)
    except SocialCredential.DoesNotExist:
        result.status        = 'failed'
        result.error_message = f'No active credential for {platform}'
        result.save(update_fields=['status', 'error_message'])
        return

    import tempfile
    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.html', delete=False, encoding='utf-8'
    ) as f:
        f.write(job.blog_content)
        html_path = f.name

    try:
        if platform == 'linkedin_pulse':
            proc = _run_ts([
                'scripts/post-linkedin-pulse.ts',
                '--email',    cred.login_email,
                '--password', cred.login_password,
                '--nickname', user.nickname,
                '--title',    job.blog_title,
                '--html-file', html_path,
                '--caption',  job.blog_description[:500],
                '--seo-title', job.blog_seo_title,
                '--seo-desc',  job.blog_seo_desc,
                '--row',      str(job.sheet_row or 0),
                '--batch',    job.batch_label or '',
            ], timeout=300)
        elif platform == 'notion':
            proc = _run_ts([
                'scripts/post-notion.ts',
                '--email',    cred.login_email,
                '--password', cred.login_password,
                '--nickname', user.nickname,
                '--title',    job.blog_title,
                '--html-file', html_path,
                '--row',      str(job.sheet_row or 0),
                '--batch',    job.batch_label or '',
            ], timeout=300)
        else:
            raise NotImplementedError(f'publish not implemented for {platform}')

        if proc.returncode == 0:
            post_url = ''
            for line in proc.stdout.splitlines():
                if line.startswith('POSTED_URL='):
                    post_url = line.split('=', 1)[1].strip()
            result.status    = 'done'
            result.post_url  = post_url
            result.posted_at = timezone.now()
            result.raw_output = proc.stdout[-2000:]
            result.save(update_fields=['status', 'post_url', 'posted_at', 'raw_output'])
        else:
            raise RuntimeError(proc.stderr[-1000:] or proc.stdout[-1000:])

    except Exception as exc:
        result.status        = 'failed'
        result.error_message = str(exc)[:500]
        result.save(update_fields=['status', 'error_message'])
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            pass
    finally:
        os.unlink(html_path)


# ── Batch orchestration ────────────────────────────────────────────────────────

@shared_task(queue='beat')
def run_scheduled_batch(batch_label: str, batch_id: int = None):
    from jobs.models import BatchRun, PostingJob
    from accounts.models import User
    from sheet.sync import sync_social_for_user

    batch = None
    if batch_id:
        try:
            batch = BatchRun.objects.get(pk=batch_id)
        except BatchRun.DoesNotExist:
            pass

    if not batch:
        batch = BatchRun.objects.create(label=batch_label, is_manual=False, status='running')

    total = posted = failed = 0

    for user in User.objects.filter(is_active=True, is_worker_online=True):
        try:
            sync_social_for_user(user)
        except Exception:
            pass  # best-effort sync; don't abort batch

        pending_jobs = PostingJob.objects.filter(user=user, status='pending')[:15]
        for job in pending_jobs:
            job.status      = 'queued'
            job.batch_label = batch_label
            job.batch_run   = batch
            job.save(update_fields=['status', 'batch_label', 'batch_run'])

            for platform in job.platforms.split(','):
                platform = platform.strip()
                if platform in ('x', 'facebook', 'linkedin'):
                    execute_social_post.delay(job.id, platform)
                    total += 1

    batch.status   = 'done'
    batch.summary  = {'total': total, 'posted': posted, 'failed': failed}
    batch.completed_at = timezone.now()
    batch.save(update_fields=['status', 'summary', 'completed_at'])


# ── Worker heartbeat ───────────────────────────────────────────────────────────

@shared_task(queue='heartbeat')
def worker_heartbeat(user_nickname: str):
    from accounts.models import User
    User.objects.filter(nickname=user_nickname).update(
        is_worker_online=True,
        worker_last_seen=timezone.now(),
    )


@shared_task(queue='beat')
def mark_stale_workers():
    """Mark workers offline if no heartbeat in last 3 minutes."""
    from accounts.models import User
    from django.utils.timezone import now, timedelta
    cutoff = now() - timedelta(minutes=3)
    User.objects.filter(
        is_worker_online=True,
        worker_last_seen__lt=cutoff,
    ).update(is_worker_online=False)


# ── Sheet sync tasks ───────────────────────────────────────────────────────────

@shared_task(queue='sync')
def sync_sheet_social(user_nickname: str):
    from accounts.models import User
    from sheet.sync import sync_social_for_user
    try:
        user = User.objects.get(nickname=user_nickname)
        return sync_social_for_user(user)
    except User.DoesNotExist:
        pass


@shared_task(queue='sync')
def sync_sheet_blog(user_nickname: str):
    from accounts.models import User
    from sheet.sync import sync_blog_for_user
    try:
        user = User.objects.get(nickname=user_nickname)
        return sync_blog_for_user(user)
    except User.DoesNotExist:
        pass
