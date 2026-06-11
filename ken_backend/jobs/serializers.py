from rest_framework import serializers
from .models import PostingJob, PostingResult, BlogJob, BlogResult, BatchRun
from accounts.serializers import UserSerializer


class PostingResultSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PostingResult
        fields = ['id', 'platform', 'status', 'post_url', 'error_message', 'posted_at']


class PostingJobSerializer(serializers.ModelSerializer):
    results = PostingResultSerializer(many=True, read_only=True)

    class Meta:
        model  = PostingJob
        fields = [
            'id', 'target_url', 'title', 'platforms', 'status',
            'scheduled_for', 'batch_label', 'x_post', 'fb_post', 'li_post',
            'sheet_row', 'created_at', 'updated_at', 'retry_count',
            'error_message', 'results',
        ]
        read_only_fields = [
            'id', 'status', 'created_at', 'updated_at',
            'retry_count', 'error_message', 'results',
        ]


class BlogResultSerializer(serializers.ModelSerializer):
    class Meta:
        model  = BlogResult
        fields = ['id', 'platform', 'status', 'post_url', 'error_message', 'posted_at']


class BlogJobSerializer(serializers.ModelSerializer):
    results = BlogResultSerializer(many=True, read_only=True)

    class Meta:
        model  = BlogJob
        fields = [
            'id', 'target_url', 'title', 'platforms', 'status',
            'scheduled_for', 'batch_label',
            'blog_title', 'blog_content', 'blog_description',
            'blog_seo_title', 'blog_seo_desc',
            'rating', 'cover_image_url',
            'sheet_row', 'created_at', 'updated_at', 'retry_count',
            'error_message', 'results',
        ]
        read_only_fields = [
            'id', 'status', 'blog_title', 'blog_content', 'blog_description',
            'blog_seo_title', 'blog_seo_desc', 'rating', 'cover_image_url',
            'created_at', 'updated_at', 'retry_count', 'error_message', 'results',
        ]


class BatchRunSerializer(serializers.ModelSerializer):
    triggered_by = UserSerializer(read_only=True)

    class Meta:
        model  = BatchRun
        fields = ['id', 'label', 'started_at', 'completed_at',
                  'triggered_by', 'is_manual', 'status', 'summary']
