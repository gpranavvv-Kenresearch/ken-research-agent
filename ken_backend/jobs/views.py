from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from .models import PostingJob, BlogJob, BatchRun
from .serializers import PostingJobSerializer, BlogJobSerializer, BatchRunSerializer


# ── Social Jobs ────────────────────────────────────────────────────────────────

class SocialJobListCreate(generics.ListCreateAPIView):
    serializer_class   = PostingJobSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = PostingJob.objects.filter(user=self.request.user).prefetch_related('results')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        job = serializer.save(user=self.request.user)
        # Queue immediately if no scheduled_for
        if not job.scheduled_for:
            from workers.tasks import execute_social_post
            for platform in job.platforms.split(','):
                execute_social_post.delay(job.id, platform.strip())
            job.status = 'queued'
            job.save(update_fields=['status'])


class SocialJobDetail(generics.RetrieveAPIView):
    serializer_class   = PostingJobSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return PostingJob.objects.filter(user=self.request.user).prefetch_related('results')


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def retry_social_job(request, pk):
    try:
        job = PostingJob.objects.get(pk=pk, user=request.user)
    except PostingJob.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    if job.status not in ('failed', 'partial'):
        return Response({'detail': f'Job status is {job.status}, cannot retry.'}, status=400)
    from workers.tasks import execute_social_post
    failed_platforms = [r.platform for r in job.results.filter(status='failed')]
    if not failed_platforms:
        failed_platforms = job.platforms.split(',')
    for platform in failed_platforms:
        execute_social_post.delay(job.id, platform.strip())
    job.status = 'queued'
    job.retry_count += 1
    job.save(update_fields=['status', 'retry_count'])
    return Response(PostingJobSerializer(job).data)


# ── Blog Jobs ──────────────────────────────────────────────────────────────────

class BlogJobListCreate(generics.ListCreateAPIView):
    serializer_class   = BlogJobSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = BlogJob.objects.filter(user=self.request.user).prefetch_related('results')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        job = serializer.save(user=self.request.user)
        from workers.tasks import execute_blog_generation
        execute_blog_generation.delay(job.id)
        job.status = 'queued'
        job.save(update_fields=['status'])


class BlogJobDetail(generics.RetrieveAPIView):
    serializer_class   = BlogJobSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return BlogJob.objects.filter(user=self.request.user).prefetch_related('results')


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def retry_blog_job(request, pk):
    try:
        job = BlogJob.objects.get(pk=pk, user=request.user)
    except BlogJob.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    from workers.tasks import execute_blog_generation
    execute_blog_generation.delay(job.id)
    job.status = 'queued'
    job.retry_count += 1
    job.save(update_fields=['status', 'retry_count'])
    return Response(BlogJobSerializer(job).data)


# ── Batch Runs ─────────────────────────────────────────────────────────────────

class BatchRunList(generics.ListAPIView):
    serializer_class   = BatchRunSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return BatchRun.objects.all().order_by('-started_at')


class BatchRunDetail(generics.RetrieveAPIView):
    serializer_class   = BatchRunSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset           = BatchRun.objects.all()


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def current_batch(request):
    batch = BatchRun.objects.filter(status='running').order_by('-started_at').first()
    if not batch:
        return Response({'detail': 'No batch currently running.'})
    return Response(BatchRunSerializer(batch).data)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def trigger_batch(request):
    label = request.data.get('label', '')
    if not label:
        return Response({'detail': 'label is required.'}, status=400)
    from workers.tasks import run_scheduled_batch
    batch = BatchRun.objects.create(
        label=label, triggered_by=request.user, is_manual=True
    )
    run_scheduled_batch.delay(label, batch_id=batch.id)
    return Response(BatchRunSerializer(batch).data, status=status.HTTP_201_CREATED)
