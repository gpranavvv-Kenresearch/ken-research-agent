<#
.SYNOPSIS
  Start the local Celery worker for your machine.
  Run this in the background - keep this window open while posting.

.USAGE
  cd "full team agent"
  .\scripts\start-worker.ps1

  Or pass your nickname directly:
  .\scripts\start-worker.ps1 -Name aniket

.NOTES
  - Worker polls Upstash Redis for jobs dispatched by the Django backend.
  - One task at a time (-c 1) to avoid overlapping Playwright windows.
  - Keep this window open. Close it to stop the worker.
  - Run setup-sessions.ps1 first if you haven't already.
#>

param(
    [string]$Name = ""
)

# Load .env from ken_backend/
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
    Write-Host "  WARNING: ken_backend\.env not found - worker may fail without REDIS_URL / DATABASE_URL" -ForegroundColor Yellow
}

# Resolve nickname
$EXCLUDED = @("shrey", "vansh", "abhinav")

if (-not $Name) {
    $Name = $env:WORKER_NAME
}
if (-not $Name) {
    Write-Host ""
    Write-Host "  ERROR: WORKER_NAME not set in ken_backend\.env" -ForegroundColor Red
    Write-Host "  Add this line to ken_backend\.env: WORKER_NAME=yourname" -ForegroundColor Yellow
    exit 1
}

$Name = $Name.ToLower()

if ($EXCLUDED -contains $Name) {
    Write-Host ""
    Write-Host "  $Name is in the excluded list. No local worker needed." -ForegroundColor Yellow
    exit 0
}

$env:WORKER_NAME = $Name

# Check sessions for all active team members (this machine handles everyone)
$ACTIVE_MEMBERS = @("aniket","krishi","hritika","meenakshi","sameeksha","vijay","shivani","vishal","sanya","kamakshi","avdhesh","pranav")
$missingSessions = @()
foreach ($member in $ACTIVE_MEMBERS) {
    foreach ($platform in @("x", "fb", "li")) {
        $f = ".sessions-cookies\$platform-$member.json"
        if (-not (Test-Path $f)) {
            $missingSessions += $f
        }
    }
}

if ($missingSessions.Count -gt 0) {
    Write-Host ""
    Write-Host "  WARNING: $($missingSessions.Count) session files missing:" -ForegroundColor Yellow
    $missingSessions | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
    Write-Host "  Run .\scripts\setup-sessions.ps1 to create them." -ForegroundColor Yellow
    Write-Host "  (Worker will still start - missing sessions will cause per-job failures)" -ForegroundColor Gray
    Write-Host ""
}

# Set environment
$env:DJANGO_SETTINGS_MODULE = "ken_backend.settings.local"
$env:PYTHONPATH = (Join-Path (Get-Location).Path "ken_backend")

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   Starting Celery Worker: $($Name.ToUpper())" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Queues: social, blog, celery" -ForegroundColor Cyan
Write-Host "  Concurrency: 1 (one Playwright window at a time)" -ForegroundColor Cyan
Write-Host "  WORKER_NAME: $Name" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Keep this window OPEN. Close it to stop posting." -ForegroundColor Yellow
Write-Host ""

# Run Celery worker (must run from ken_backend/ where manage.py lives)
Set-Location (Join-Path (Get-Location).Path "ken_backend")

# Kill any orphan Beat processes from previous sessions
Write-Host "  Killing any leftover Celery Beat processes..." -ForegroundColor Gray
Get-Process -Name "celery" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Flush ALL Redis queues on startup so no stale tasks from previous sessions survive
Write-Host "  Flushing Redis queues (all queues: social, blog, beat, sync, celery)..." -ForegroundColor Gray
python -c "
import os, sys
sys.path.insert(0, '.')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ken_backend.settings.local')
import django; django.setup()
from django.conf import settings
import redis
r = redis.from_url(settings.CELERY_BROKER_URL, ssl_cert_reqs=None)
r.flushall()
print('  All Redis queues cleared.')
"
Write-Host "  Starting worker..." -ForegroundColor Gray
Write-Host ""

# Start Celery Beat in a background window (Windows does not support -B embedded mode)
Write-Host "  Starting Celery Beat scheduler in background..." -ForegroundColor Gray
$beatJob = Start-Process -FilePath "celery" `
    -ArgumentList "-A ken_backend beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler" `
    -PassThru -WindowStyle Minimized
Write-Host "  Beat PID: $($beatJob.Id)" -ForegroundColor Gray
Write-Host ""

# Start worker in foreground (keeps this window alive)
# Queues: social + blog (posting) + beat (scheduler + sync)
try {
    celery -A ken_backend worker -Q social,blog,celery,beat,sync -c 1 --loglevel=info --pool=solo -n "worker-$Name@%h"
} finally {
    # When worker stops, also stop Beat
    if (-not $beatJob.HasExited) {
        Stop-Process -Id $beatJob.Id -Force
        Write-Host "  Beat stopped." -ForegroundColor Gray
    }
}
