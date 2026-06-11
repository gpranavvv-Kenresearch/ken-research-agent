# start_worker.ps1 — Run this on your LOCAL machine to start the Celery worker.
# Double-click in Explorer, or run from PowerShell.
#
# Prerequisites:
#   1. Python installed, pip install -r requirements.txt done
#   2. .env file in the ken_backend/ folder (copy from .env.example and fill in)
#   3. WORKER_NAME in .env set to YOUR nickname (e.g. aniket)
#   4. Node.js + npm + ts-node installed (for posting scripts)

# Change to the ken_backend directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir "..")

# Load .env file
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
} else {
    Write-Error ".env file not found. Copy .env.example to .env and fill in your values."
    exit 1
}

$env:DJANGO_SETTINGS_MODULE = "ken_backend.settings.local"

$workerName = $env:WORKER_NAME
if (-not $workerName) {
    Write-Error "WORKER_NAME not set in .env. Set it to your nickname (e.g. aniket)."
    exit 1
}

Write-Host "Starting Celery worker for: $workerName" -ForegroundColor Green
Write-Host "Connecting to Redis: $($env:REDIS_URL -replace ':.*@', ':***@')" -ForegroundColor Cyan

# Start heartbeat loop in the background (pings server every 60 seconds)
$heartbeatJob = Start-Job -ScriptBlock {
    param($name, $settings, $pythonPath)
    $env:DJANGO_SETTINGS_MODULE = $settings
    while ($true) {
        python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', '$settings')
django.setup()
from workers.tasks import worker_heartbeat
worker_heartbeat.delay('$name')
" 2>$null
        Start-Sleep 60
    }
} -ArgumentList $workerName, $env:DJANGO_SETTINGS_MODULE, $env:PYTHONPATH

# Start the worker (one concurrent task — critical for Playwright)
celery -A ken_backend worker `
    --queues social,blog,heartbeat,sync `
    --concurrency 1 `
    --loglevel info `
    --hostname "$workerName@%h"
