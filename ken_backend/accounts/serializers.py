from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User


class LoginSerializer(serializers.Serializer):
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs['email'], password=attrs['password'])
        if not user:
            # try authenticating with username field too
            user = authenticate(username=attrs.get('email'), password=attrs['password'])
        if not user:
            raise serializers.ValidationError('Invalid credentials')
        if not user.is_active:
            raise serializers.ValidationError('Account is disabled')
        attrs['user'] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    sheet_tab_social = serializers.ReadOnlyField()
    sheet_tab_blog   = serializers.ReadOnlyField()

    class Meta:
        model  = User
        fields = [
            'id', 'username', 'email', 'nickname', 'first_name', 'last_name',
            'is_staff', 'is_worker_online', 'worker_last_seen',
            'sheet_tab_social', 'sheet_tab_blog',
        ]
        read_only_fields = ['id', 'is_staff', 'is_worker_online', 'worker_last_seen']


class HeartbeatSerializer(serializers.Serializer):
    nickname = serializers.CharField()
