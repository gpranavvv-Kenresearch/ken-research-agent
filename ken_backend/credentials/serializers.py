from rest_framework import serializers
from .models import SocialCredential


class SocialCredentialSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SocialCredential
        fields = [
            'id', 'platform', 'login_email', 'login_password',
            'handle', 'session_dir', 'is_active', 'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'login_password': {'write_only': True},
            'created_at': {'read_only': True},
            'updated_at': {'read_only': True},
        }

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
