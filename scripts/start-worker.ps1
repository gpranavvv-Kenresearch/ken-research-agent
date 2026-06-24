<#
.SYNOPSIS
  Start the local Celery POSTING workers for this team member.
  Launches TWO workers:
    - Social worker  → listens on social.{name}  (X, Facebook, LinkedIn, Instagram, Threads posting)
    - Blog worker    → listens on blog.{name}     (blog publishing only — LinkedIn Pulse, Medium, etc.)

  DOES NOT generate content. Run auto-generate.ps1 separately for generation.
  Starts FRESH every time — all pending backlog is flushed before workers start.

.USAGE
  cd "full team agent"
  .\scripts\start-worker.ps1

  Or pass your nickname directly:
  .\scripts\start-worker.ps1 -Name aniket

.NOTES
  - Each worker runs with -c 1 so only one browser window opens at a time.
  - Keep this window OPEN. Close it to stop both workers.
  - Triggered by cron schedule on Render or via "Post Now" button in dashboard.
  - Beat scheduler is NOT started here — generation is handled by auto-generate.ps1.
#>

param(
    [string]$Name = ""
)

# ── Load .env (always overwrite — prevents stale env from polluting values) ────
$envFile = "ken_backend\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key   = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            # Always set — don't skip if already present (stale session env can block it)
            [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
            Set-Item -Path "Env:$key" -Value $value -ErrorAction SilentlyContinue
        }
    }
    Write-Host "  Loaded .env from $envFile" -ForegroundColor Gray
} else {
    Write-Host "  WARNING: ken_backend\.env not found" -ForegroundColor Yellow
}

# ── Resolve nickname (explicit WORKER_NAME read, then param, then env) ─────────
if (-not $Name) {
    # Read directly from .env file — most reliable, immune to env pollution
    $wLine = Get-Content $envFile -ErrorAction SilentlyContinue |
             Where-Object { $_ -match '^\s*WORKER_NAME\s*=\s*(\S+)' } |
             Select-Object -First 1
    if ($wLine -match '^\s*WORKER_NAME\s*=\s*(\S+)') { $Name = $Matches[1].Trim() }
}
if (-not $Name) { $Name = $env:WORKER_NAME }
if (-not $Name) {
    Write-Host ""
    Write-Host "  ERROR: WORKER_NAME not set. Add WORKER_NAME=yourname to ken_backend\.env" -ForegroundColor Red
    exit 1
}
$Name = $Name.ToLower().Trim()
$env:WORKER_NAME = $Name
[System.Environment]::SetEnvironmentVariable("WORKER_NAME", $Name, "Process")

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

# ── Kill orphan workers (no Beat — generation is auto-generate.ps1's job) ──────
Write-Host "  Killing any leftover Celery processes..." -ForegroundColor Gray
Get-Process -Name "celery" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# ── Flush ALL queues for this person so we start with zero backlog ─────────────
Write-Host "  Flushing queues for $Name (clean slate)..." -ForegroundColor Gray
python -c "
import os, sys
sys.path.insert(0, '.')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ken_backend.settings.local')
import django; django.setup()
from django.conf import settings
import redis
r = redis.from_url(settings.CELERY_BROKER_URL, ssl_cert_reqs=None)
name = os.environ.get('WORKER_NAME', '')
queues = [f'social.{name}', f'blog.{name}', f'beat.{name}']
for q in queues:
    deleted = r.delete(q)
    print(f'  Cleared: {q} ({deleted} keys deleted)')
"
Write-Host ""

# ── Start Social worker in background window ───────────────────────────────────
# Listens ONLY on social.{name} — posting tasks for X, Facebook, LinkedIn, Instagram, Threads
Write-Host "  Starting social worker ($socialQueue)..." -ForegroundColor Gray
$socialJob = Start-Process -FilePath "celery" `
    -ArgumentList "-A ken_backend worker -Q $socialQueue -c 1 --loglevel=info --pool=solo -n `"social-$Name@%h`"" `
    -PassThru -WindowStyle Normal
Write-Host "  Social worker PID: $($socialJob.Id)" -ForegroundColor Gray

Start-Sleep -Seconds 3

# ── Start Blog worker in foreground (this window) ─────────────────────────────
# Listens ONLY on blog.{name} — blog publishing tasks (LinkedIn Pulse, Medium, etc.)
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
