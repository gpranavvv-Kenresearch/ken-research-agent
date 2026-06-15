from django.core.management.base import BaseCommand
from accounts.models import User

TEAM = [
    ('pranav',    'Kenopscloud@kenresearch.com',      True),
    ('aniket',    'aniketsanduja.ken@gmail.com',      False),
    ('krishi',    'krishjr1546@gmail.com',            False),
    ('vansh',     'vansh.meena.ken@gmail.com',        False),
    ('sameeksha', 'bhardwaj.sameekshaa@gmail.com',   False),
    ('hritika',   'vidhi.y.research@gmail.com',       False),
    ('meenakshi', 'anishachauhan856@gmail.com',       False),
    ('vijay',     'textorraghav@gmail.com',           False),
    ('shrey',     'g.pranavvv@gmail.com',             False),
    ('shivani',   'cutchersierra@gmail.com',          False),
    ('vishal',    'vishalvaishken01@gmail.com',       False),
    ('sanya',     'Pranavgupta.ken@gmail.com',        False),
    ('abhinav',   'vijukumar298@gmail.com',           False),
    ('avdhesh',   'anisandy.ken@gmail.com',           False),
    ('kamakshi',  'kamakshikenresearch@gmail.com',    False),
]

DEFAULT_PASSWORD = 'KenTeam@2026'


class Command(BaseCommand):
    help = 'Create all 15 Ken Research team user accounts'

    def handle(self, *args, **options):
        for username, email, is_super in TEAM:
            if User.objects.filter(username=username).exists():
                User.objects.filter(username=username).update(nickname=username)
                self.stdout.write(f'Updated {username}')
            else:
                if is_super:
                    u = User.objects.create_superuser(username, email, DEFAULT_PASSWORD)
                else:
                    u = User.objects.create_user(username, email, DEFAULT_PASSWORD)
                u.nickname = username
                u.save()
                self.stdout.write(f'Created {username}')
        self.stdout.write(self.style.SUCCESS('All team accounts ready.'))
