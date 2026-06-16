"""
Seed all 45 social credentials (15 users × 3 platforms) from CLAUDE.md data.
Safe to re-run — uses update_or_create.
"""
from django.core.management.base import BaseCommand
from accounts.models import User
from credentials.models import SocialCredential

# ── Facebook (15) ────────────────────────────────────────────────────────────
FACEBOOK = {
    'hritika':   ('kamakshikenresearch@gmail.com',  'Kamakshikenresearch123$', ''),
    'vansh':     ('Shivanimehr444@gmail.com',        'Shivani@123',            ''),
    'meenakshi': ('meenakshi.kenresearch@gmail.com', 'Meenakshi@123',          ''),
    'sameeksha': ('bhardwaj.sameekshaa@gmail.com',   'Sam@692004',             ''),
    'aniket':    ('aniketsanduja.ken@gmail.com',      'anisandy070',            ''),
    'krishi':    ('Narendarmodii.ken@gmail.com',      'Pranav@6096',            ''),
    'vijay':     ('vijaykumarab41@gmail.com',         'TyTt9@MhXBm77Zx',       ''),
    'shrey':     ('shreyken10@gmail.com',             'Ken@1234',               ''),
    'shivani':   ('vishalkenresearch@gmail.com',      'KKK@1234',               ''),
    'vishal':    ('vishalvaishken01@gmail.com',        'KKK@1234',               ''),
    'sanya':     ('suhani.st11@gmail.com',            'Kenresearch@0211',        ''),
    'pranav':    ('Pranavgupta.ken@gmail.com',         'Pranav@6096',            ''),
    'abhinav':   ('Pranavgupta2023@gmail.com',         'Pranav@6096',            ''),
    'avdhesh':   ('saksham.dm3@gmail.com',             'Sak.dm@0408',            ''),
    'kamakshi':  ('yashtiwari8182@gmail.com',           'Ken@1234',               ''),
}

# ── LinkedIn (15) ─────────────────────────────────────────────────────────────
LINKEDIN = {
    'vansh':     ('vansh.meena.ken@gmail.com',     'Ken@1234',                   ''),
    'sameeksha': ('bhardwaj.sameekshaa@gmail.com', 'Sam@692004',                 ''),
    'krishi':    ('krishjr1546@gmail.com',           'Newken@0309',               ''),
    'kamakshi':  ('kamakshikenresearch@gmail.com',  'p5Ci+Bf_wH8$S;M',           ''),
    'aniket':    ('anisandy.ken@gmail.com',          'anisandy070',               ''),
    'hritika':   ('vidhi.y.research@gmail.com',     'Vidhi@1212',                ''),
    'shivani':   ('cutchersierra@gmail.com',         'Sierra@555',                ''),
    'shrey':     ('g.pranavvv@gmail.com',            'g.pranavvv@6096',           ''),
    'vijay':     ('textorraghav@gmail.com',          'Harshita9794457117',        ''),
    'meenakshi': ('anishachauhan856@gmail.com',      'Anisha@5singh21',           ''),
    'pranav':    ('tanishakp3210@gmail.com',          'Tanishasharma@123456789',   ''),
    'vishal':    ('vishalvaishken01@gmail.com',       'KKK@1234',                  ''),
    'abhinav':   ('vijukumar298@gmail.com',           'TyTt9@MhXBm77Zx',          ''),
    'avdhesh':   ('anisandy.ken@gmail.com',           'anisandy@070',              ''),
    'sanya':     ('Pranavgupta.ken@gmail.com',        'g.pranavvv@6096',           ''),
}

# LinkedIn Pulse uses the same login as LinkedIn
LINKEDIN_PULSE = LINKEDIN

# ── X / Twitter (15) ──────────────────────────────────────────────────────────
# (email, password, handle) — login_email field stores username for X
X = {
    'aniket':    ('aniket1829473',   'anisandy070',       'aniket1829473'),
    'krishi':    ('krishjr1546',     'nEWKEN@0309',       'krishjr1546'),
    'sameeksha': ('SanayaThak6446', 'Pranav@6096',        'SanayaThak6446'),
    'hritika':   ('RahulShriv_1890', 'Rahul_1890@',      'RahulShriv_1890'),
    'meenakshi': ('Vanshmeenaa',    'Pranav@6096',        'Vanshmeenaa'),
    'vansh':     ('anshikabha17897','Ken@1234',           'anshikabha17897'),
    'kamakshi':  ('manangupta81885','Ken@1234',           'manangupta81885'),
    'vishal':    ('PranavGupta6096','Pranav@6096',        'PranavGupta6096'),
    'pranav':    ('Kenresearchh',   'Pranav@6096',        'kenresearchh'),
    'shrey':     ('ShreyGupta81866','Pranav@6096',        'ShreyGupta81866'),
    'sanya':     ('Varsha_Jain1',   'KKK@1234',           'Varsha_Jain1'),
    'shivani':   ('Hritikasah12345','Hritika@12345',      'Hritikasah12345'),
    'vijay':     ('Ashi25396',      'Pranav@6096',        'Ashi25396'),
    'avdhesh':   ('SameekshaB58183','Sam@692004',         'SameekshaB58183'),
    'abhinav':   ('Shrey322220',    'Ken@1234',           'shreyken10'),
}


class Command(BaseCommand):
    help = 'Seed all 45 social credentials for 15 team members'

    def handle(self, *args, **options):
        created = updated = skipped = 0

        platform_map = [
            ('x',             X),
            ('facebook',      FACEBOOK),
            ('linkedin',      LINKEDIN),
            ('linkedin_pulse', LINKEDIN_PULSE),
        ]

        for platform, data in platform_map:
            for nickname, (email_or_user, password, handle) in data.items():
                try:
                    user = User.objects.get(nickname=nickname)
                except User.DoesNotExist:
                    self.stdout.write(self.style.WARNING(
                        f'  skip {nickname}/{platform}: user not found'
                    ))
                    skipped += 1
                    continue

                obj, was_created = SocialCredential.objects.update_or_create(
                    user=user,
                    platform=platform,
                    defaults={
                        'login_email':    email_or_user,
                        'login_password': password,
                        'handle':         handle,
                        'is_active':      True,
                    }
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'Done — {created} created, {updated} updated, {skipped} skipped.'
        ))
