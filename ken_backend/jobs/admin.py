from django.contrib import admin
from .models import PostingJob, PostingResult, BlogJob, BlogResult, BatchRun


class PostingResultInline(admin.TabularInline):
    model  = PostingResult
    extra  = 0
    fields = ['platform', 'status', 'post_url', 'error_message', 'posted_at']
    readonly_fields = ['posted_at']


@admin.register(PostingJob)
class PostingJobAdmin(admin.ModelAdmin):
    list_display   = ['id', 'user', 'title', 'platforms', 'status', 'batch_label', 'sheet_row', 'created_at']
    list_filter    = ['status', 'user', 'batch_label']
    search_fields  = ['target_url', 'title', 'user__nickname']
    inlines        = [PostingResultInline]
    actions        = ['retry_failed']

    @admin.action(description='Retry failed jobs')
    def retry_failed(self, request, queryset):
        from workers.tasks import execute_social_post
        for job in queryset.filter(status__in=['failed', 'partial']):
            for platform in job.platforms.split(','):
                execute_social_post.delay(job.id, platform.strip())
            job.status = 'queued'
            job.retry_count += 1
            job.save(update_fields=['status', 'retry_count'])


class BlogResultInline(admin.TabularInline):
    model  = BlogResult
    extra  = 0
    fields = ['platform', 'status', 'post_url', 'error_message', 'posted_at']
    readonly_fields = ['posted_at']


@admin.register(BlogJob)
class BlogJobAdmin(admin.ModelAdmin):
    list_display  = ['id', 'user', 'title', 'status', 'rating', 'sheet_row', 'created_at']
    list_filter   = ['status', 'user']
    search_fields = ['target_url', 'title', 'user__nickname']
    inlines       = [BlogResultInline]
    actions       = ['retry_failed']

    @admin.action(description='Retry failed blog jobs')
    def retry_failed(self, request, queryset):
        from workers.tasks import execute_blog_generation
        for job in queryset.filter(status='failed'):
            execute_blog_generation.delay(job.id)
            job.status = 'queued'
            job.retry_count += 1
            job.save(update_fields=['status', 'retry_count'])


@admin.register(BatchRun)
class BatchRunAdmin(admin.ModelAdmin):
    list_display = ['id', 'label', 'started_at', 'status', 'is_manual', 'triggered_by', 'summary']
    list_filter  = ['status', 'is_manual']
    search_fields = ['label']
