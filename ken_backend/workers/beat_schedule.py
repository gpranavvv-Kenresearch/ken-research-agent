"""
Celery Beat periodic schedule.

Batch slots (IST = UTC+5:30) → UTC:
  B1 10:30 → 05:00 UTC
  B2 11:15 → 05:45 UTC
  B3 12:00 → 06:30 UTC
  B4 13:00 → 07:30 UTC
  B5 14:00 → 08:30 UTC
  B6 15:00 → 09:30 UTC
  B7 16:00 → 10:30 UTC
  B8 17:15 → 11:45 UTC

Heartbeat + stale-worker check run every 60s and 5 min respectively.
"""
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    # ── Batch slots ──────────────────────────────────────────────────────────
    'batch-B1': {
        'task': 'workers.tasks.run_scheduled_batch',
        'schedule': crontab(hour=5, minute=0),
        'args': ('B1',),
    },
    'batch-B2': {
        'task': 'workers.tasks.run_scheduled_batch',
        'schedule': crontab(hour=5, minute=45),
        'args': ('B2',),
    },
    'batch-B3': {
        'task': 'workers.tasks.run_scheduled_batch',
        'schedule': crontab(hour=6, minute=30),
        'args': ('B3',),
    },
    'batch-B4': {
        'task': 'workers.tasks.run_scheduled_batch',
        'schedule': crontab(hour=7, minute=30),
        'args': ('B4',),
    },
    'batch-B5': {
        'task': 'workers.tasks.run_scheduled_batch',
        'schedule': crontab(hour=8, minute=30),
        'args': ('B5',),
    },
    'batch-B6': {
        'task': 'workers.tasks.run_scheduled_batch',
        'schedule': crontab(hour=9, minute=30),
        'args': ('B6',),
    },
    'batch-B7': {
        'task': 'workers.tasks.run_scheduled_batch',
        'schedule': crontab(hour=10, minute=30),
        'args': ('B7',),
    },
    'batch-B8': {
        'task': 'workers.tasks.run_scheduled_batch',
        'schedule': crontab(hour=11, minute=45),
        'args': ('B8',),
    },
    # ── Maintenance ──────────────────────────────────────────────────────────
    'mark-stale-workers': {
        'task': 'workers.tasks.mark_stale_workers',
        'schedule': 300.0,  # every 5 minutes
    },
}
