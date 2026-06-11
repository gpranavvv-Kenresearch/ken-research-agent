from django.db import models
from django.conf import settings

JOB_STATUS = [
    ('pending',   'Pending'),
    ('queued',    'Queued'),
    ('running',   'Running'),
    ('done',      'Done'),
    ('failed',    'Failed'),
    ('partial',   'Partial'),
    ('cancelled', 'Cancelled'),
]

ALL_PLATFORMS = [
    ('x',            'X (Twitter)'),
    ('facebook',     'Facebook'),
    ('linkedin',     'LinkedIn'),
    ('linkedin_pulse','LinkedIn Pulse'),
    ('medium',       'Medium'),
    ('notion',       'Notion'),
    ('devto',        'Dev.to'),
    ('wordpress',    'WordPress'),
    ('blogger',      'Blogger'),
    ('hackmd',       'HackMD'),
    ('linkmate',     'Linkmate'),
    ('google_sites', 'Google Sites'),
    ('paragraph',    'Paragraph'),
    ('calisthenics', 'Calisthenics'),
    ('substack',     'Substack'),
]


class BatchRun(models.Model):
    label        = models.CharField(max_length=32, help_text="e.g. '2026-06-11-B3'")
    started_at   = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='triggered_batches'
    )
    is_manual = models.BooleanField(default=False)
    status    = models.CharField(max_length=16, choices=JOB_STATUS, default='running')
    summary   = models.JSONField(default=dict)

    class Meta:
        db_table = 'jobs_batchrun'
        ordering = ['-started_at']

    def __str__(self):
        return f"Batch {self.label} ({self.status})"


class PostingJob(models.Model):
    user         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='posting_jobs'
    )
    target_url   = models.URLField(max_length=2048)
    title        = models.CharField(max_length=512, blank=True)
    platforms    = models.CharField(max_length=256, default='x,facebook,linkedin',
                                    help_text="Comma-separated: x,facebook,linkedin")
    status       = models.CharField(max_length=16, choices=JOB_STATUS, default='pending')
    scheduled_for = models.DateTimeField(null=True, blank=True)
    batch_label  = models.CharField(max_length=32, blank=True)
    x_post       = models.TextField(blank=True)
    fb_post      = models.TextField(blank=True)
    li_post      = models.TextField(blank=True)
    sheet_row    = models.IntegerField(null=True, blank=True)
    batch_run    = models.ForeignKey(
        BatchRun, null=True, blank=True, on_delete=models.SET_NULL, related_name='posting_jobs'
    )
    retry_count  = models.PositiveSmallIntegerField(default=0)
    error_message = models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'jobs_postingjob'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.nickname} | {self.title[:50]} ({self.status})"


class PostingResult(models.Model):
    job           = models.ForeignKey(PostingJob, on_delete=models.CASCADE, related_name='results')
    platform      = models.CharField(max_length=32, choices=ALL_PLATFORMS)
    status        = models.CharField(max_length=16, choices=JOB_STATUS, default='pending')
    post_url      = models.URLField(max_length=2048, blank=True)
    error_message = models.TextField(blank=True)
    posted_at     = models.DateTimeField(null=True, blank=True)
    raw_output    = models.TextField(blank=True)

    class Meta:
        db_table = 'jobs_postingresult'
        unique_together = [('job', 'platform')]

    def __str__(self):
        return f"{self.job} / {self.platform} ({self.status})"


class BlogJob(models.Model):
    user             = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='blog_jobs'
    )
    target_url       = models.URLField(max_length=2048)
    title            = models.CharField(max_length=512, blank=True)
    platforms        = models.CharField(max_length=256, default='linkedin_pulse,notion,medium')
    status           = models.CharField(max_length=16, choices=JOB_STATUS, default='pending')
    scheduled_for    = models.DateTimeField(null=True, blank=True)
    batch_label      = models.CharField(max_length=32, blank=True)
    blog_title       = models.CharField(max_length=512, blank=True)
    blog_content     = models.TextField(blank=True)
    blog_description = models.TextField(blank=True)
    blog_seo_title   = models.CharField(max_length=512, blank=True)
    blog_seo_desc    = models.CharField(max_length=512, blank=True)
    rating           = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    cover_image_url  = models.URLField(max_length=2048, blank=True)
    sheet_row        = models.IntegerField(null=True, blank=True)
    batch_run        = models.ForeignKey(
        BatchRun, null=True, blank=True, on_delete=models.SET_NULL, related_name='blog_jobs'
    )
    retry_count      = models.PositiveSmallIntegerField(default=0)
    error_message    = models.TextField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'jobs_blogjob'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.nickname} | {self.title[:50]} ({self.status})"


class BlogResult(models.Model):
    blog_job      = models.ForeignKey(BlogJob, on_delete=models.CASCADE, related_name='results')
    platform      = models.CharField(max_length=32, choices=ALL_PLATFORMS)
    status        = models.CharField(max_length=16, choices=JOB_STATUS, default='pending')
    post_url      = models.URLField(max_length=2048, blank=True)
    error_message = models.TextField(blank=True)
    posted_at     = models.DateTimeField(null=True, blank=True)
    raw_output    = models.TextField(blank=True)

    class Meta:
        db_table = 'jobs_blogresult'
        unique_together = [('blog_job', 'platform')]

    def __str__(self):
        return f"{self.blog_job} / {self.platform} ({self.status})"
