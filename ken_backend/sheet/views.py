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

    data     = request.data
    name     = (data.get('name') or '').lower().strip()
    sheet_row = data.get('sheetRow')
    title    = data.get('title', '')
    url      = data.get('targetUrl', '')
    platforms_raw = data.get('platforms', [])   # list from frontend

    if not name or not url:
        return Response({'error': 'name and targetUrl are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(nickname=name)
    except User.DoesNotExist:
        return Response({'error': f'User "{name}" not found'}, status=status.HTTP_404_NOT_FOUND)

    # Normalise keys
    platforms = [PLATFORM_KEY_MAP.get(p, p) for p in platforms_raw]

    social_platforms = [p for p in platforms if p in SOCIAL_PLATFORM_KEYS]
    blog_platforms   = [p for p in platforms if p not in SOCIAL_PLATFORM_KEYS]

    queued = []

    # ── Social posting job ───────────────────────────────────────────────────
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
