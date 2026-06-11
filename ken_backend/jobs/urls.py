from django.urls import path
from . import views

urlpatterns = [
    # Social
    path('social/',              views.SocialJobListCreate.as_view(), name='social-list'),
    path('social/<int:pk>/',     views.SocialJobDetail.as_view(),     name='social-detail'),
    path('social/<int:pk>/retry/', views.retry_social_job,            name='social-retry'),
    # Blog
    path('blog/',                views.BlogJobListCreate.as_view(),   name='blog-list'),
    path('blog/<int:pk>/',       views.BlogJobDetail.as_view(),       name='blog-detail'),
    path('blog/<int:pk>/retry/', views.retry_blog_job,                name='blog-retry'),
    # Batches
    path('batches/',             views.BatchRunList.as_view(),        name='batch-list'),
    path('batches/current/',     views.current_batch,                 name='batch-current'),
    path('batches/trigger/',     views.trigger_batch,                 name='batch-trigger'),
    path('batches/<int:pk>/',    views.BatchRunDetail.as_view(),      name='batch-detail'),
]
