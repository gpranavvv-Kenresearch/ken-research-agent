from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import User
from .sync import sync_social_for_user, sync_blog_for_user


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
