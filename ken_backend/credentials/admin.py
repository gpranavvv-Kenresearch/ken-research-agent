from django.contrib import admin
from .models import SocialCredential


@admin.register(SocialCredential)
class SocialCredentialAdmin(admin.ModelAdmin):
    list_display  = ['user', 'platform', 'login_email', 'handle', 'is_active', 'updated_at']
    list_filter   = ['platform', 'is_active', 'user']
    search_fields = ['user__nickname', 'login_email', 'handle']
    ordering      = ['user__nickname', 'platform']
