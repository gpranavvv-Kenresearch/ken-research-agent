from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display  = ['nickname', 'email', 'is_worker_online', 'worker_last_seen', 'is_staff', 'is_active']
    list_filter   = ['is_worker_online', 'is_staff', 'is_active', 'nickname']
    search_fields = ['nickname', 'email', 'username']
    ordering      = ['nickname']
    fieldsets     = BaseUserAdmin.fieldsets + (
        ('Ken Research', {'fields': ('nickname', 'is_worker_online', 'worker_last_seen')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Ken Research', {'fields': ('nickname', 'email')}),
    )
