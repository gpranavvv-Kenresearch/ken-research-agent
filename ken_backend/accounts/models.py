from django.contrib.auth.models import AbstractUser
from django.db import models

NICKNAME_CHOICES = [
    ('aniket',    'Aniket'),
    ('krishi',    'Krishi'),
    ('pranav',    'Pranav'),
    ('sameeksha', 'Sameeksha'),
    ('vansh',     'Vansh'),
    ('abhinav',   'Abhinav'),
    ('hritika',   'Hritika'),
    ('meenakshi', 'Meenakshi'),
    ('sanya',     'Sanya'),
    ('shivani',   'Shivani'),
    ('vijay',     'Vijay'),
    ('shrey',     'Shrey'),
    ('kamakshi',  'Kamakshi'),
    ('vishal',    'Vishal'),
    ('avdhesh',   'Avdhesh'),
]


class User(AbstractUser):
    nickname = models.CharField(
        max_length=64,
        unique=True,
        choices=NICKNAME_CHOICES,
        help_text="Matches '{Name} Social' and '{Name} Blog' tab prefix in Google Sheet",
    )
    is_worker_online = models.BooleanField(
        default=False,
        help_text="True when local Celery worker is running and sending heartbeats",
    )
    worker_last_seen = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'accounts_user'

    def __str__(self):
        return f"{self.nickname} ({self.email})"

    @property
    def sheet_tab_social(self):
        return f"{self.nickname.title()} Social"

    @property
    def sheet_tab_blog(self):
        return f"{self.nickname.title()} Blog"
