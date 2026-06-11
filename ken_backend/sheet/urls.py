from django.urls import path
from . import views

urlpatterns = [
    path('sync/social/', views.sync_social, name='sheet-sync-social'),
    path('sync/blog/',   views.sync_blog,   name='sheet-sync-blog'),
    path('status/',      views.sheet_status, name='sheet-status'),
]
