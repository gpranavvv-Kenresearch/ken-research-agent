from django.db import models
from django.conf import settings

PLATFORM_CHOICES = [
    ('x',            'X (Twitter)'),
    ('facebook',     'Facebook'),
    ('linkedin',     'LinkedIn'),
    ('linkedin_pulse','LinkedIn Pulse'),
    ('medium',       'Medium'),
    ('notion',       'Notion'),
    ('devto',        'Dev.to'),
    ('wordpress',    'WordPress'),
    ('blogger',      'Blogger'),
    ('hackmd',       'HackMD'),
    ('linkmate',     'Linkmate'),
    ('google_sites', 'Google Sites'),
    ('paragraph',    'Paragraph'),
    ('calisthenics', 'Calisthenics'),
    ('substack',     'Substack'),
]


class SocialCredential(models.Model):
    user           = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='credentials'
    )
    platform       = models.CharField(max_length=32, choices=PLATFORM_CHOICES)
    login_email    = models.CharField(max_length=255, blank=True)
    login_password = models.CharField(max_length=512, blank=True)
    handle         = models.CharField(max_length=128, blank=True)
    session_dir    = models.CharField(max_length=512, blank=True)
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'credentials_socialcredential'
        unique_together = [('user', 'platform')]
        ordering = ['platform']

    def __str__(self):
        return f"{self.user.nickname} / {self.platform}"
