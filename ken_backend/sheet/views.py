from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.conf import settings

from accounts.models import User
from .sync import sync_social_for_user, sync_blog_for_user

# Platforms the frontend sends as "social" keys
SOCIAL_PLATFORM_KEYS = {'x', 'facebook', 'linkedin'}
# Normalise camelCase frontend keys → Django DB keys
PLATFORM_KEY_MAP = {
    'linkedinPulse': 'linkedin_pulse',
    'googlesite':    'google_sites',
}


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def sheet_webhook(request):
    """
    Called by Next.js /api/submit immediately after writing a row to the Sheet.
    Creates PostingJob / BlogJob records and queues generate_and_post tasks.
    Protected by a shared secret in the X-Webhook-Secret header.
    """
    secret = request.headers.get('X-Webhook-Secret', '')
    expected = getattr(settings, 'WEBHOOK_SECRET', '')
    if expected and secret != expected:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    data      = request.data
    job_type  = (data.get('type') or '').lower().strip()   # 'social' | 'blog' | '' (legacy)
    name      = (data.get('name') or '').lower().strip()
    # Vercel sends the actual sheet row (header=1, first data row=2).
    # sheet_write.py expects data row (1-based, no header), so subtract 1.
    raw_row   = data.get('sheetRow')
    sheet_row = (int(raw_row) - 1) if raw_row is not None else None
    title     = data.get('title', '')
    url       = data.get('targetUrl', '')

    if not name or not url:
        return Response({'error': 'name and targetUrl are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(nickname=name)
    except User.DoesNotExist:
        return Response({'error': f'User "{name}" not found'}, status=status.HTTP_404_NOT_FOUND)

    queued = []

    # ── Social posting job ───────────────────────────────────────────────────
    if job_type in ('social', ''):
        raw_social = data.get('socialPlatforms') or data.get('platforms', [])
        social_platforms = [PLATFORM_KEY_MAP.get(p, p) for p in raw_social if p in SOCIAL_PLATFORM_KEYS or p in ('x', 'facebook', 'linkedin')]

        # legacy: if no explicit type, filter social from combined platforms list
        if job_type == '' and not social_platforms:
            raw = data.get('platforms', [])
            social_platforms = [PLATFORM_KEY_MAP.get(p, p) for p in raw if p in SOCIAL_PLATFORM_KEYS]

        if social_platforms:
            from jobs.models import PostingJob
            from workers.tasks import generate_and_post

            job, created = PostingJob.objects.get_or_create(
                user=user,
                target_url=url,
                sheet_row=sheet_row,
                defaults={
                    'title':     title,
                    'platforms': ','.join(social_platforms),
                    'status':    'pending',
                },
            )
            if created:
                generate_and_post.delay(job.id)
                queued.append({'type': 'social', 'job_id': job.id, 'platforms': social_platforms})

    # ── Blog job ─────────────────────────────────────────────────────────────
    if job_type in ('blog', ''):
        raw_blog = data.get('platforms', [])
        blog_platforms = [PLATFORM_KEY_MAP.get(p, p) for p in raw_blog if p not in SOCIAL_PLATFORM_KEYS]

        if blog_platforms:
            from jobs.models import BlogJob
            from workers.tasks import execute_blog_generation

            blog_job, created = BlogJob.objects.get_or_create(
                user=user,
                target_url=url,
                sheet_row=sheet_row,
                defaults={
                    'title':     title,
                    'platforms': ','.join(blog_platforms),
                    'status':    'pending',
                },
            )
            if created:
                execute_blog_generation.delay(blog_job.id)
                queued.append({'type': 'blog', 'job_id': blog_job.id, 'platforms': blog_platforms})

    return Response({'queued': queued}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sync_social(request):
    try:
        result = sync_social_for_user(request.user)
        return Response(result)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def sync_blog(request):
    try:
        result = sync_blog_for_user(request.user)
        return Response(result)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


BLOG_PLATFORMS = {'linkedinpulse', 'linkedin_pulse', 'linkedin pulse', 'medium', 'devto', 'dev.to',
                  'substack', 'hackmd', 'wordpress', 'blogger', 'notion', 'googlesite',
                  'note', 'paragraph', 'patreon', 'calisthenics', 'linkmate'}

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def post_now(request):
    """
    Triggered by Vercel "Post Now" button.
    Routes to social or blog task based on platform.
    """
    secret = request.headers.get('X-Webhook-Secret', '')
    expected = getattr(settings, 'WEBHOOK_SECRET', '')
    if expected and secret != expected:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    data      = request.data
    name      = (data.get('name') or '').lower().strip()
    raw_row   = data.get('sheetRow')
    sheet_row = (int(raw_row) - 1) if raw_row is not None else None
    platform  = (data.get('platform') or '').lower().strip()
    tab       = (data.get('tab') or 'social').lower().strip()
    url       = data.get('targetUrl', '')
    title     = data.get('title', '')

    if not name or not platform or not url or sheet_row is None:
        return Response({'error': 'name, platform, targetUrl, sheetRow required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(nickname=name)
    except User.DoesNotExist:
        return Response({'error': f'User "{name}" not found'}, status=status.HTTP_404_NOT_FOUND)

    is_blog = tab == 'blog' or platform in BLOG_PLATFORMS

    if is_blog:
        from jobs.models import BlogJob
        from workers.tasks import dispatch_blog_generation, dispatch_blog_publish

        blog_content = data.get('blogContent', '').strip()

        job, _ = BlogJob.objects.get_or_create(
            user=user, target_url=url, sheet_row=sheet_row,
            defaults={'title': title, 'platforms': platform, 'status': 'queued'},
        )
        if data.get('blogTitle'):       job.blog_title       = data['blogTitle']
        if blog_content:                job.blog_content     = blog_content
        if data.get('blogDescription'): job.blog_description = data['blogDescription']
        job.save()

        # If blog content already exists → skip generation, go straight to publish
        if blog_content:
            dispatch_blog_publish(job, platform)
            return Response({'queued': True, 'job_id': job.id, 'platform': platform, 'action': 'publish', 'queue': f'blog.{user.nickname}'})
        else:
            dispatch_blog_generation(job)
            return Response({'queued': True, 'job_id': job.id, 'platform': platform, 'action': 'generate', 'queue': f'blog.{user.nickname}'})

    else:
        from jobs.models import PostingJob
        from workers.tasks import dispatch_social_post

        x_post  = data.get('xPost', '')
        fb_post = data.get('fbPost', '')
        li_post = data.get('liPost', '')

        job, _ = PostingJob.objects.get_or_create(
            user=user, target_url=url, sheet_row=sheet_row,
            defaults={'title': title, 'platforms': platform, 'status': 'queued'},
        )
        if x_post:  job.x_post  = x_post
        if fb_post: job.fb_post = fb_post
        if li_post: job.li_post = li_post
        job.save()

        dispatch_social_post(job, platform)
        return Response({'queued': True, 'job_id': job.id, 'platform': platform, 'queue': f'social.{user.nickname}'})


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def sheet_status(request):
    from jobs.models import PostingJob, BlogJob
    data = []
    for user in User.objects.filter(is_active=True).order_by('nickname'):
        data.append({
            'nickname':          user.nickname,
            'worker_online':     user.is_worker_online,
            'social_pending':    PostingJob.objects.filter(user=user, status='pending').count(),
            'social_done':       PostingJob.objects.filter(user=user, status='done').count(),
            'social_failed':     PostingJob.objects.filter(user=user, status='failed').count(),
            'blog_pending':      BlogJob.objects.filter(user=user, status='pending').count(),
            'blog_done':         BlogJob.objects.filter(user=user, status='done').count(),
            'blog_failed':       BlogJob.objects.filter(user=user, status='failed').count(),
        })
    return Response(data)
