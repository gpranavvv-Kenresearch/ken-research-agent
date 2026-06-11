from django.db import models

# No DB models needed — workers are stateless Celery tasks.
# Job state lives in jobs.models (PostingJob, BlogJob, PostingResult, BlogResult).
