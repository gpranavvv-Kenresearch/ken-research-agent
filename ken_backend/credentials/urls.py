from django.urls import path
from . import views

urlpatterns = [
    path('',       views.CredentialListCreateView.as_view(), name='credential-list'),
    path('<int:pk>/', views.CredentialDetailView.as_view(),  name='credential-detail'),
]
