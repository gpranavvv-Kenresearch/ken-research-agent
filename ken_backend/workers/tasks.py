"""
Celery tasks — these run on LOCAL machines (not Render.com).
Each task drives existing TypeScript / Python scripts via subprocess.
"""
import json
import os
import subprocess
import sys
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

# Normalize platform names from sheet (any capitalisation/format) → internal slug
_PLATFORM_ALIASES = {
    'linkedinpulse':  'linkedin_pulse',
    'linkedin_pulse': 'linkedin_pulse',
    'linkedin pulse': 'linkedin_pulse',
    'medium':         'medium',
    'devto':          'devto',
    'dev.to':         'devto',
    'substack':       'substack',
    'hackmd':         'hackmd',
    'wordpress':      'wordpress',
    'blogger':        'blogger',
    'notion':         'notion',
    'googlesite':     'googlesite',
    'google site':    'googlesite',
    'note':           'note',
    'paragraph':      'paragraph',
    'patreon':        'patreon',
    'calisthenics':   'calisthenics',
    'linkmate':       'linkmate',
}

def _normalize_blog_platform(raw: str) -> str:
    return _PLATFORM_ALIASES.get(raw.lower().strip(), raw.lower().strip())

# Mapping from platform slug → sheet column prefix
# e.g. 'linkedin_pulse' → columns: "LinkedIn Pulse URL", "LinkedIn Pulse Status", "LinkedIn Pulse Batch", "LinkedIn Pulse Error"
BLOG_PLATFORM_COLUMNS = {
    'linkedin_pulse': {'url': 'LinkedIn Pulse URL',   'status': 'LinkedIn Pulse Status',   'batch': 'LinkedIn Pulse Batch',   'error': 'LinkedIn Pulse Error'},
    'medium':         {'url': 'Medium Post URL',       'status': 'Medium Status',            'batch': 'Medium Batch',           'error': 'Medium Error'},
    'devto':          {'url': 'Dev.to Post URL',       'status': 'Dev.to Status',            'batch': 'Dev.to Batch',           'error': 'Dev.to Error'},
    'substack':       {'url': 'Substack Post URL',     'status': 'Substack Status',          'batch': 'Substack Batch',         'error': 'Substack Error'},
    'hackmd':         {'url': 'HackMD Post URL',       'status': 'HackMD Status',            'batch': 'HackMD Batch',           'error': 'HackMD Error'},
    'wordpress':      {'url': 'WordPress Post URL',    'status': 'WordPress Status',         'batch': 'WordPress Batch',        'error': 'WordPress Error'},
    'blogger':        {'url': 'Blogger Post URL',      'status': 'Blogger Status',           'batch': 'Blogger Batch',          'error': 'Blogger Error'},
    'notion':         {'url': 'Notion Post URL',       'status': 'Notion Status',            'batch': 'Notion Batch',           'error': 'Notion Error'},
    'googlesite':     {'url': 'Google Site Post URL',  'status': 'Google Site Status',       'batch': 'Google Site Batch',      'error': 'Google Site Error'},
    'note':           {'url': 'Note Post URL',         'status': 'Note Status',              'batch': 'Note Batch',             'error': 'Note Error'},
    'paragraph':      {'url': 'Paragraph Post URL',    'status': 'Paragraph Status',         'batch': 'Paragraph Batch',        'error': 'Paragraph Error'},
    'patreon':        {'url': 'Patreon Post URL',      'status': 'Patreon Status',           'batch': 'Patreon Batch',          'error': 'Patreon Error'},
    'calisthenics':   {'url': 'Calisthenics Post URL', 'status': 'Calisthenics Status',      'batch': 'Calisthenics Batch',     'error': 'Calisthenics Error'},
    'linkmate':       {'url': 'Linkmate Post URL',     'status': 'Linkmate Status',          'batch': 'Linkmate Batch',         'error': 'Linkmate Error'},
}


def _env():
    return {**os.environ, 'NODE_PATH': os.path.join(REPO_ROOT, 'node_modules')}


def _run_ts(args: list[str], timeout: int = 180) -> subprocess.CompletedProcess:
    # On Windows npx is npx.cmd
    npx = 'npx.cmd' if os.name == 'nt' else 'npx'
    return subprocess.run(
        [npx, 'tsx'] + args,
        capture_output=True, text=True, cwd=REPO_ROOT, env=_env(), timeout=timeout
    )


# ── Per-person queue dispatchers ──────────────────────────────────────────────
# social.{nickname} → that person's social posting worker
# blog.{nickname}   → that person's blog worker (generation + publishing)

def dispatch_social_post(job, platform: str):
    """Queue a social posting task to the person's dedicated social worker."""
    execute_social_post.apply_async(
        args=[job.id, platform],
        queue=f'social.{job.user.nickname}',
    )

def dispatch_blog_generation(job):
    """Queue a blog generation task to the person's dedicated blog worker."""
    execute_blog_generation.apply_async(
        args=[job.id],
        queue=f'blog.{job.user.nickname}',
    )

def dispatch_blog_publish(job, platform: str):
    """Queue a blog publish task to the person's dedicated blog worker."""
    execute_blog_publish.apply_async(
        args=[job.id, platform],
        queue=f'blog.{job.user.nickname}',
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
             '--url',       job.target_url,
             '--title',     job.title or '',
             '--name',      job.user.nickname,
             '--row',       str(job.sheet_row or 0),
             '--platforms', job.platforms or 'linkedin-pulse',
             '--output-json'],
            capture_output=True, text=True, cwd=REPO_ROOT, timeout=900
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

        # Queue publishing for each platform (normalize names first)
        for platform in job.platforms.split(','):
            platform = _normalize_blog_platform(platform)
            if platform:
                dispatch_blog_publish(job, platform)

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
    import subprocess as _sp

    platform = _normalize_blog_platform(platform)
    cols     = BLOG_PLATFORM_COLUMNS.get(platform)

    try:
        job  = BlogJob.objects.select_related('user').get(pk=blog_job_id)
        user = job.user
    except BlogJob.DoesNotExist:
        return

    result, _ = BlogResult.objects.get_or_create(blog_job=job, platform=platform)

    # Platform not yet implemented — mark skipped in sheet and exit cleanly
    if platform not in PLATFORM_SCRIPT:
        result.status        = 'skipped'
        result.error_message = f'No posting script for {platform} yet'
        result.save(update_fields=['status', 'error_message'])
        if cols and job.sheet_row:
            _write_blog_sheet(user.nickname, job.sheet_row, {
                cols['status']: 'skipped',
                cols['error']:  f'Not implemented yet',
            })
        return

    result.status = 'running'
    result.save(update_fields=['status'])

    try:
        cred = SocialCredential.objects.get(user=user, platform=platform, is_active=True)
    except SocialCredential.DoesNotExist:
        msg = f'No active credential for {platform}'
        result.status        = 'failed'
        result.error_message = msg
        result.save(update_fields=['status', 'error_message'])
        if cols and job.sheet_row:
            _write_blog_sheet(user.nickname, job.sheet_row, {cols['status']: 'error', cols['error']: msg})
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
                '--email',     cred.login_email,
                '--password',  cred.login_password,
                '--nickname',  user.nickname,
                '--title',     job.blog_title,
                '--html-file', html_path,
                '--caption',   job.blog_description[:500],
                '--seo-title', getattr(job, 'blog_seo_title', ''),
                '--seo-desc',  getattr(job, 'blog_seo_desc', ''),
                '--row',       str(job.sheet_row or 0),
                '--batch',     job.batch_label or '',
            ], timeout=300)
        elif platform == 'notion':
            proc = _run_ts([
                'scripts/post-notion.ts',
                '--email',     cred.login_email,
                '--password',  cred.login_password,
                '--nickname',  user.nickname,
                '--title',     job.blog_title,
                '--html-file', html_path,
                '--row',       str(job.sheet_row or 0),
                '--batch',     job.batch_label or '',
            ], timeout=300)
        else:
            raise NotImplementedError(f'publish not implemented for {platform}')

        if proc.returncode == 0:
            post_url = ''
            all_lines = proc.stdout.splitlines() + proc.stderr.splitlines()
            for line in all_lines:
                if line.startswith('POSTED_URL='):
                    post_url = line.split('=', 1)[1].strip()
            print(f'[blog_publish] post_url={post_url!r}', flush=True)
            print(f'[blog_publish] stdout tail: {proc.stdout[-500:]}', flush=True)
            result.status     = 'done'
            result.post_url   = post_url
            result.posted_at  = timezone.now()
            result.raw_output = proc.stdout[-2000:]
            result.save(update_fields=['status', 'post_url', 'posted_at', 'raw_output'])
            if cols and job.sheet_row:
                updates = {
                    cols['url']:       post_url,
                    cols['status']:    'posted',
                    cols['batch']:     job.batch_label or '',
                    'lastPostedBlog':  timezone.now().isoformat(),
                }
                print(f'[blog_publish] writing sheet: {updates}', flush=True)
                _write_blog_sheet(user.nickname, job.sheet_row, updates)
        else:
            raise RuntimeError(proc.stderr[-1000:] or proc.stdout[-1000:])

    except Exception as exc:
        msg = str(exc)[:500]
        result.status        = 'failed'
        result.error_message = msg
        result.save(update_fields=['status', 'error_message'])
        if cols and job.sheet_row:
            _write_blog_sheet(user.nickname, job.sheet_row, {cols['status']: 'error', cols['error']: msg[:200]})
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            pass
    finally:
        os.unlink(html_path)


def _write_blog_sheet(nickname: str, row: int, updates: dict):
    import json as _json, subprocess as _sp
    try:
        proc = _sp.run(
            ['python', os.path.join(REPO_ROOT, 'scripts', 'sheet_write.py'),
             '--sheet', 'blog', '--name', nickname,
             '--row', str(row), '--updates', _json.dumps(updates, ensure_ascii=False)],
            capture_output=True, text=True,
            cwd=REPO_ROOT, timeout=60,
            env={**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1'},
        )
        if proc.returncode != 0:
            print(f'[blog_sheet_write] FAILED row={row} nick={nickname}: {proc.stderr[-500:]}', flush=True)
        else:
            print(f'[blog_sheet_write] OK row={row} nick={nickname}', flush=True)
    except Exception as e:
        print(f'[blog_sheet_write] exception row={row}: {e}', flush=True)


# ── Generate & Post (event-driven, triggered by form submission) ───────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=60, queue='social')
def generate_and_post(self, job_id: int):
    """
    Full pipeline for one PostingJob:
      1. Run generate_content.py → scrape URL + AI writes tweet/FB/LI text
      2. Save generated text to PostingJob fields
      3. Queue execute_social_post for each platform
    """
    from jobs.models import PostingJob

    try:
        job = PostingJob.objects.select_related('user').get(pk=job_id)
    except PostingJob.DoesNotExist:
        return

    job.status = 'running'
    job.save(update_fields=['status'])

    try:
        gen_script = os.path.join(REPO_ROOT, 'scripts', 'generate_content.py')
        result = subprocess.run(
            [
                'python', gen_script,
                '--url',         job.target_url,
                '--title',       job.title or '',
                '--name',        job.user.nickname,
                '--row',         str(job.sheet_row or 0),
                '--platforms',   job.platforms,
                '--description', '',
            ],
            capture_output=True, text=True,
            cwd=REPO_ROOT, env=_env(), timeout=300,
        )

        if result.returncode != 0:
            raise RuntimeError(result.stderr[-800:] or 'generate_content.py failed')

        # Parse JSON from stdout
        data = json.loads(result.stdout.strip().splitlines()[-1])

        if data.get('x'):
            job.x_post = data['x']
        if data.get('facebook'):
            job.fb_post = data['facebook']
        if data.get('linkedin'):
            job.li_post = data['linkedin']
        job.status = 'queued'
        job.save()

        # Queue posting for each selected social platform
        for platform in [p.strip() for p in job.platforms.split(',')]:
            if platform in ('x', 'facebook', 'linkedin'):
                dispatch_social_post(job, platform)

    except Exception as exc:
        job.status = 'failed'
        job.error_message = str(exc)[:500]
        job.save(update_fields=['status', 'error_message'])
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            pass


# ── Auto sync + generate all (runs every 5 min via Beat) ──────────────────────

ACTIVE_MEMBERS = [
    'aniket', 'krishi', 'hritika', 'meenakshi', 'sameeksha',
    'vijay', 'shivani', 'vishal', 'sanya', 'kamakshi', 'avdhesh', 'pranav',
]

@shared_task(soft_time_limit=3600, time_limit=3600)
def sync_and_generate_for_me():
    """
    Per-person version of sync_and_generate_all.
    Reads WORKER_NAME from environment — processes ONLY that person.
    Beat on each laptop calls this every 5 min on the beat.{name} queue.
    """
    nickname = os.environ.get('WORKER_NAME', '').lower().strip()
    if not nickname:
        print('[sync_me] WORKER_NAME not set — skipping', flush=True)
        return

    from accounts.models import User
    from sheet.reader import read_unposted_social, read_unposted_blog
    from jobs.models import PostingJob, BlogJob

    print(f'[sync_me] === Starting sync for {nickname} ===', flush=True)

    try:
        user = User.objects.get(nickname=nickname)
    except Exception:
        print(f'[sync_me] User {nickname} not found in DB', flush=True)
        return

    # ── Social rows ───────────────────────────────────────────────────────
    try:
        social_rows = read_unposted_social(nickname)
    except Exception as e:
        print(f'[sync_me] Social read error: {e}', flush=True)
        social_rows = []

    for row in social_rows:
        url       = row.get('targetUrl', '').strip()
        sheet_row = row.get('_dataRow') or row.get('_sheetRow') or row.get('row')
        title     = row.get('title') or row.get('Title', '')
        platforms = row.get('Platforms', 'x,facebook,linkedin').strip() or 'x,facebook,linkedin'

        if not url or not sheet_row:
            continue

        job, is_new = PostingJob.objects.get_or_create(
            user=user, target_url=url, sheet_row=int(sheet_row),
            defaults={'title': title, 'platforms': platforms, 'status': 'running'},
        )
        if not is_new:
            if job.status not in ('failed', 'running'):
                continue
            job.status = 'running'
            job.error_message = ''
            job.save(update_fields=['status', 'error_message'])

        print(f'[sync_me] Social row {sheet_row}: {url[:60]}', flush=True)
        plat_list = [p.strip().lower() for p in platforms.split(',') if p.strip()]
        proc = subprocess.run(
            [sys.executable,
             os.path.join(REPO_ROOT, 'scripts', 'generate_content.py'),
             '--url', url, '--title', title,
             '--name', nickname, '--row', str(sheet_row),
             '--platforms', ','.join(plat_list)],
            capture_output=True, text=True, cwd=REPO_ROOT, timeout=300,
            env={**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1'},
        )
        if proc.returncode == 0:
            job.status = 'done'
            print(f'[sync_me] Social row {sheet_row}: content written ✓', flush=True)
        else:
            job.status = 'failed'
            job.error_message = proc.stderr[-500:]
            print(f'[sync_me] Social row {sheet_row}: FAILED — {proc.stderr[-200:]}', flush=True)
        job.save(update_fields=['status', 'error_message'])

    # ── Blog rows ─────────────────────────────────────────────────────────
    try:
        blog_rows = read_unposted_blog(nickname)
    except Exception as e:
        print(f'[sync_me] Blog read error: {e}', flush=True)
        blog_rows = []

    for row in blog_rows:
        url       = row.get('targetUrl', '').strip()
        sheet_row = row.get('_dataRow') or row.get('_sheetRow') or row.get('row')
        title     = row.get('title') or row.get('Title', '')
        platforms = row.get('Platforms', 'linkedin_pulse').strip() or 'linkedin_pulse'

        if not url or not sheet_row:
            continue

        job, is_new = BlogJob.objects.get_or_create(
            user=user, target_url=url, sheet_row=int(sheet_row),
            defaults={'title': title, 'platforms': platforms, 'status': 'running'},
        )
        if not is_new:
            if job.status not in ('failed', 'running'):
                continue
            job.status = 'running'
            job.error_message = ''
            job.save(update_fields=['status', 'error_message'])

        print(f'[sync_me] Blog row {sheet_row}: {url[:60]}', flush=True)
        dispatch_blog_generation(job)

    print(f'[sync_me] === Sync complete for {nickname} ===', flush=True)


@shared_task(queue='beat', soft_time_limit=3600, time_limit=3600)
def sync_and_generate_all():
    """
    Runs every 5 minutes. Processes everything sequentially:
      Tab by tab → row by row → platform by platform → write after each.

    Flow per tab:
      Social rows: row1 → X (write) → FB (write) → LI (write) → row2 → ...
      Blog rows:   row1 → generate blog (write) → row2 → ...
    """
    from accounts.models import User
    from sheet.reader import read_unposted_social, read_unposted_blog
    from jobs.models import PostingJob, BlogJob

    print('[sync] === Starting sequential sync ===', flush=True)

    for nickname in ACTIVE_MEMBERS:
        try:
            user = User.objects.get(nickname=nickname)
        except Exception:
            continue

        # ── Social rows ───────────────────────────────────────────────────────
        try:
            social_rows = read_unposted_social(nickname)
        except Exception as e:
            print(f'[sync] [{nickname}] Social read error: {e}', flush=True)
            social_rows = []

        for row in social_rows:
            url       = row.get('targetUrl', '').strip()
            sheet_row = row.get('_dataRow') or row.get('_sheetRow') or row.get('row')
            title     = row.get('title') or row.get('Title', '')
            platforms = row.get('Platforms', 'x,facebook,linkedin').strip() or 'x,facebook,linkedin'

            if not url or not sheet_row:
                continue

            job, is_new = PostingJob.objects.get_or_create(
                user=user, target_url=url, sheet_row=int(sheet_row),
                defaults={'title': title, 'platforms': platforms, 'status': 'running'},
            )
            if not is_new:
                # Re-queue only if previously failed or went stale
                if job.status not in ('failed', 'running'):
                    continue
                job.status = 'running'
                job.error_message = ''
                job.save(update_fields=['status', 'error_message'])

            print(f'[sync] [{nickname}] Social row {sheet_row}: {url[:60]}', flush=True)

            # Generate & write platform by platform
            plat_list = [p.strip().lower() for p in platforms.split(',') if p.strip()]
            proc = subprocess.run(
                [sys.executable,
                 os.path.join(REPO_ROOT, 'scripts', 'generate_content.py'),
                 '--url', url, '--title', title,
                 '--name', nickname, '--row', str(sheet_row),
                 '--platforms', ','.join(plat_list)],
                capture_output=True, text=True, cwd=REPO_ROOT, timeout=300,
            )
            if proc.returncode == 0:
                job.status = 'done'
                print(f'[sync] [{nickname}] Social row {sheet_row}: content written to sheet ✓', flush=True)
            else:
                job.status = 'failed'
                job.error_message = proc.stderr[-500:]
                print(f'[sync] [{nickname}] Social row {sheet_row}: FAILED — {proc.stderr[-200:]}', flush=True)
            job.save(update_fields=['status', 'error_message'])

        # ── Blog rows ─────────────────────────────────────────────────────────
        try:
            blog_rows = read_unposted_blog(nickname)
        except Exception as e:
            print(f'[sync] [{nickname}] Blog read error: {e}', flush=True)
            blog_rows = []

        for row in blog_rows:
            url       = row.get('targetUrl', '').strip()
            sheet_row = row.get('_dataRow') or row.get('_sheetRow') or row.get('row')
            title     = row.get('title') or row.get('Title', '')
            platforms = row.get('Platforms', 'linkedin_pulse').strip() or 'linkedin_pulse'

            if not url or not sheet_row:
                continue

            job, is_new = BlogJob.objects.get_or_create(
                user=user, target_url=url, sheet_row=int(sheet_row),
                defaults={'title': title, 'platforms': platforms, 'status': 'running'},
            )
            if not is_new:
                # Re-queue if previously failed or went stale (running but no worker picked it up)
                if job.status not in ('failed', 'running'):
                    continue
                job.status = 'running'
                job.error_message = ''
                job.save(update_fields=['status', 'error_message'])

            print(f'[sync] [{nickname}] Blog row {sheet_row}: {url[:60]}', flush=True)
            dispatch_blog_generation(job)

    print('[sync] === Sync complete ===', flush=True)


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
                    dispatch_social_post(job, platform)
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
