from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import User
from .serializers import LoginSerializer, UserSerializer, HeartbeatSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    refresh = RefreshToken.for_user(user)
    return Response({
        'access':  str(refresh.access_token),
        'refresh': str(refresh),
        'user':    UserSerializer(user).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    try:
        token = RefreshToken(request.data.get('refresh'))
        token.blacklist()
    except (TokenError, KeyError):
        pass
    return Response({'detail': 'Logged out.'}, status=status.HTTP_205_RESET_CONTENT)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def me_view(request):
    if request.method == 'GET':
        return Response(UserSerializer(request.user).data)
    # PATCH — worker heartbeat
    request.user.is_worker_online = True
    request.user.worker_last_seen = timezone.now()
    request.user.save(update_fields=['is_worker_online', 'worker_last_seen'])
    return Response({'detail': 'Heartbeat received.'})


@api_view(['GET'])
@permission_classes([IsAdminUser])
def team_view(request):
    users = User.objects.all().order_by('nickname')
    return Response(UserSerializer(users, many=True).data)
