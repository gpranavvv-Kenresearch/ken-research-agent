<#
.SYNOPSIS
  Start the local Celery workers for this team member.
  Launches TWO workers:
    - Social worker  → listens on social.{name}  (X, Facebook, LinkedIn posting)
    - Blog worker    → listens on blog.{name}     (blog generation + publishing)

.USAGE
  cd "full team agent"
  .\scripts\start-worker.ps1

  Or pass your nickname directly:
  .\scripts\start-worker.ps1 -Name aniket

.NOTES
  - Each worker runs with -c 1 so only one browser window opens at a time.
  - Keep this window OPEN. Close it to stop both workers.
  - Beat scheduler (on Render) dispatches tasks to the right per-person queue.
#>

param(
    [string]$Name = ""
)

# ── Load .env ──────────────────────────────────────────────────────────────────
$envFile = "ken_backend\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key   = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            if (-not [System.Environment]::GetEnvironmentVariable($key)) {
                [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
    Write-Host "  Loaded .env from $envFile" -ForegroundColor Gray
} else {
    Write-Host "  WARNING: ken_backend\.env not found" -ForegroundColor Yellow
}

# ── Resolve nickname ───────────────────────────────────────────────────────────
if (-not $Name) { $Name = $env:WORKER_NAME }
if (-not $Name) {
    Write-Host ""
    Write-Host "  ERROR: WORKER_NAME not set. Add WORKER_NAME=yourname to ken_backend\.env" -ForegroundColor Red
    exit 1
}
$Name = $Name.ToLower()
$env:WORKER_NAME = $Name

# ── Environment ────────────────────────────────────────────────────────────────
$env:DJANGO_SETTINGS_MODULE = "ken_backend.settings.local"
$env:PYTHONPATH = (Join-Path (Get-Location).Path "ken_backend")

$socialQueue = "social.$Name"
$blogQueue   = "blog.$Name"

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   Workers for: $($Name.ToUpper())" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Social worker  → queue: $socialQueue" -ForegroundColor Cyan
Write-Host "  Blog worker    → queue: $blogQueue" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Keep this window OPEN. Close it to stop both workers." -ForegroundColor Yellow
Write-Host ""

Set-Location (Join-Path (Get-Location).Path "ken_backend")

# ── Kill orphan workers + flush queues ────────────────────────────────────────
Write-Host "  Killing any leftover Celery processes..." -ForegroundColor Gray
Get-Process -Name "celery" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "  Flushing this person's queues in Redis..." -ForegroundColor Gray
python -c "
import os, sys
sys.path.insert(0, '.')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ken_backend.settings.local')
import django; django.setup()
from django.conf import settings
import redis
r = redis.from_url(settings.CELERY_BROKER_URL, ssl_cert_reqs=None)
name = os.environ.get('WORKER_NAME', '')
for q in [f'social.{name}', f'blog.{name}']:
    deleted = r.delete(q)
    print(f'  Cleared queue: {q} ({deleted} keys)')
"
Write-Host ""

# ── Start per-person Beat (fires sync_and_generate_for_me every 5 min) ────────
Write-Host "  Starting local Beat scheduler (every 5 min, scoped to $Name)..." -ForegroundColor Gray
$beatArgs = "-A ken_backend beat --loglevel=warning " +
            "--scheduler django_celery_beat.schedulers:DatabaseScheduler"
$beatJob = Start-Process -FilePath "celery" `
    -ArgumentList $beatArgs `
    -PassThru -WindowStyle Minimized
Write-Host "  Beat PID: $($beatJob.Id)" -ForegroundColor Gray

# ── Start Social worker in background window ───────────────────────────────────
Write-Host "  Starting social worker ($socialQueue)..." -ForegroundColor Gray
$socialJob = Start-Process -FilePath "celery" `
    -ArgumentList "-A ken_backend worker -Q $socialQueue,beat.$Name -c 1 --loglevel=info --pool=solo -n `"social-$Name@%h`"" `
    -PassThru -WindowStyle Normal
Write-Host "  Social worker PID: $($socialJob.Id)" -ForegroundColor Gray

Start-Sleep -Seconds 3

# ── Start Blog worker in foreground (this window) ─────────────────────────────
Write-Host "  Starting blog worker ($blogQueue) in this window..." -ForegroundColor Gray
Write-Host ""

try {
    celery -A ken_backend worker -Q $blogQueue -c 1 --loglevel=info --pool=solo -n "blog-$Name@%h"
} finally {
    # When blog worker stops (Ctrl+C), also stop social worker
    if (-not $socialJob.HasExited) {
        Stop-Process -Id $socialJob.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  Social worker stopped." -ForegroundColor Gray
    }
}
