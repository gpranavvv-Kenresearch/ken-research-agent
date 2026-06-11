from rest_framework import generics, permissions
from .models import SocialCredential
from .serializers import SocialCredentialSerializer


class CredentialListCreateView(generics.ListCreateAPIView):
    serializer_class   = SocialCredentialSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SocialCredential.objects.filter(user=self.request.user)


class CredentialDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class   = SocialCredentialSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SocialCredential.objects.filter(user=self.request.user)
