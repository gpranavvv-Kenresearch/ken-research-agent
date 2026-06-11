from django.contrib import admin
from django.urls import path, include

admin.site.site_header = 'Ken Research Admin'
admin.site.site_title = 'Ken Research'
admin.site.index_title = 'Team Agent Control Panel'

urlpatterns = [
    path('ken-admin/', admin.site.urls),
    path('api/v1/', include([
        path('auth/',        include('accounts.urls')),
        path('credentials/', include('credentials.urls')),
        path('jobs/',        include('jobs.urls')),
        path('sheet/',       include('sheet.urls')),
    ])),
]
