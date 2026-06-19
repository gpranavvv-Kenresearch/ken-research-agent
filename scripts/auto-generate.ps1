<#
.SYNOPSIS
  Standalone auto-generator: reads unposted rows from Social + Blog sheet tabs
  and generates content. NO Celery required.
  Runs every IntervalSeconds (default 300). Press Ctrl+C to stop.

.USAGE
  .\scripts\auto-generate.ps1 -Name vishal
  .\scripts\auto-generate.ps1 -Name pranav -Once
  .\scripts\auto-generate.ps1 -Name pranav -IntervalSeconds 180

.NOTES
  Writes generated content to sheet. Does NOT post to any platform.
  Safe to run alongside start-worker.ps1.
#>

param(
    [string]$Name            = "",
    [int]$IntervalSeconds    = 300,
    [switch]$Once
)

# -- Repo root
$RepoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $RepoRoot

# -- Python exe
$pyExe = (& py -c "import sys; print(sys.executable)" 2>$null)
if (-not $pyExe) { $pyExe = "$env:LOCALAPPDATA\Programs\Python\Python314\python.exe" }
$pyDir = Split-Path $pyExe
$env:Path = "$pyDir;$pyDir\Scripts;" + $env:Path
$env:PYTHONUTF8        = "1"
$env:PYTHONIOENCODING  = "utf-8"

# -- Load root .env (API keys)
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
        }
    }
}

# -- Load ken_backend/.env
if (Test-Path "ken_backend\.env") {
    Get-Content "ken_backend\.env" | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
        }
        if ($_ -match '^\s*WORKER_NAME\s*=\s*(\S+)' -and -not $Name) {
            $Name = $Matches[1].Trim()
        }
    }
}

# -- Resolve name
if (-not $Name -and $env:WORKER_NAME) { $Name = $env:WORKER_NAME }
if (-not $Name) {
    Write-Host "ERROR: provide -Name <nickname> or set WORKER_NAME in ken_backend\.env" -ForegroundColor Red
    exit 1
}
$Name = $Name.ToLower()

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   Auto-Generator for: $($Name.ToUpper())" -ForegroundColor Green
Write-Host "   Social tab  +  Blog tab" -ForegroundColor Green
Write-Host "   Interval: $IntervalSeconds s    Press Ctrl+C to stop." -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""

# -- Social pass
function Invoke-SocialPass {
    $capName = $Name.Substring(0,1).ToUpper() + $Name.Substring(1)
    Write-Host "  [SOCIAL] Reading '$capName Social' sheet..." -ForegroundColor Cyan

    try {
        $raw  = & python scripts\sheet_read.py --sheet social --name $Name --action unposted
        $data = ($raw | Out-String).Trim() | ConvertFrom-Json
    } catch {
        Write-Host "    Social sheet read failed: $_" -ForegroundColor Yellow
        return
    }

    if (-not $data.ok) { Write-Host "    Social read failed: $($data.error)" -ForegroundColor Yellow; return }

    $todo = @($data.rows | Where-Object {
        $_.targetUrl -and (
            -not $_.'X Post' -or
            -not $_.'FB Post' -or
            -not $_.'LinkedIn Post'
        )
    })

    Write-Host ("    {0} total rows, {1} need generation." -f @($data.rows).Count, $todo.Count) -ForegroundColor Gray

    $i = 0
    foreach ($row in $todo) {
        $i++
        $label = if ($row.Title) { $row.Title } else { $row.targetUrl }

        $missing = @()
        if (-not $row.'X Post')        { $missing += 'x' }
        if (-not $row.'FB Post')       { $missing += 'facebook' }
        if (-not $row.'LinkedIn Post') { $missing += 'linkedin' }
        $plats = $missing -join ','

        Write-Host ""
        Write-Host ("    ({0}/{1}) SOCIAL ROW {2}: {3}" -f $i, $todo.Count, $row._dataRow, $label) -ForegroundColor Cyan
        Write-Host "           Missing: $plats - scraping and writing..." -ForegroundColor DarkGray

        $all = & python scripts\generate_content.py `
            --url       "$($row.targetUrl)" `
            --title     "$($row.Title)" `
            --name      $Name `
            --row       $row._dataRow `
            --platforms $plats 2>&1

        if ($LASTEXITCODE -eq 0) {
            $jsonLine = $all | Where-Object { "$_" -match '"x"\s*:' } | Select-Object -Last 1
            $xl = 0; $fl = 0; $ll = 0
            if ($jsonLine) {
                try {
                    $c = "$jsonLine" | ConvertFrom-Json
                    $xl = $c.x.Length; $fl = $c.facebook.Length; $ll = $c.linkedin.Length
                } catch {}
            }
            Write-Host ("           [OK] X={0} | FB={1} | LI={2} chars" -f $xl, $fl, $ll) -ForegroundColor Green
        } else {
            Write-Host "           [FAILED]" -ForegroundColor Red
            $all | Select-Object -Last 5 | ForEach-Object { Write-Host "             $_" -ForegroundColor DarkYellow }
        }
    }

    if ($todo.Count -gt 0) { Write-Host "    ----- social pass done -----" -ForegroundColor Green }
}

# -- Blog pass
function Invoke-BlogPass {
    $capName = $Name.Substring(0,1).ToUpper() + $Name.Substring(1)
    Write-Host "  [BLOG]   Reading '$capName Blog' sheet..." -ForegroundColor Magenta

    try {
        $raw  = & python scripts\sheet_read.py --sheet blog --name $Name --action unposted
        $data = ($raw | Out-String).Trim() | ConvertFrom-Json
    } catch {
        Write-Host "    Blog sheet read failed: $_" -ForegroundColor Yellow
        return
    }

    if (-not $data.ok) { Write-Host "    Blog read failed: $($data.error)" -ForegroundColor Yellow; return }

    $todo = @($data.rows | Where-Object {
        $_.targetUrl -and -not $_.'Blog Content'
    })

    Write-Host ("    {0} total blog rows, {1} need generation." -f @($data.rows).Count, $todo.Count) -ForegroundColor Gray

    $i = 0
    foreach ($row in $todo) {
        $i++
        $label = if ($row.Title) { $row.Title } else { $row.targetUrl }
        $plats = if ($row.Platforms) { $row.Platforms } else { "linkedin-pulse" }

        Write-Host ""
        Write-Host ("    ({0}/{1}) BLOG ROW {2}: {3}" -f $i, $todo.Count, $row._dataRow, $label) -ForegroundColor Magenta
        Write-Host "           Scraping + researching + writing article..." -ForegroundColor DarkGray

        $titleVal = if ($row.Title) { $row.Title } else { "" }
        $all = & python scripts\generate_blog.py `
            --url       "$($row.targetUrl)" `
            --title     "$titleVal" `
            --name      $Name `
            --row       $row._dataRow `
            --platforms $plats `
            --output-json 2>&1

        if ($LASTEXITCODE -eq 0) {
            $jsonLine = $all | Where-Object { "$_" -match '"blog_title"\s*:' } | Select-Object -Last 1
            $titleOut = ""
            $wordCount = 0
            if ($jsonLine) {
                try {
                    $c = "$jsonLine" | ConvertFrom-Json
                    $titleOut = $c.blog_title
                    if ($c.html_content) { $wordCount = ($c.html_content -split '\s+').Count }
                } catch {}
            }
            Write-Host ("           [OK] '{0}'  (~{1} words)" -f $titleOut, $wordCount) -ForegroundColor Green
        } else {
            Write-Host "           [FAILED]" -ForegroundColor Red
            $all | Select-Object -Last 6 | ForEach-Object { Write-Host "             $_" -ForegroundColor DarkYellow }
        }
    }

    if ($todo.Count -gt 0) { Write-Host "    ----- blog pass done -----" -ForegroundColor Magenta }
}

# -- Main loop
function Invoke-AllPasses {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host ""
    Write-Host "==============================" -ForegroundColor DarkGray
    Write-Host "  $stamp" -ForegroundColor DarkGray
    Write-Host "==============================" -ForegroundColor DarkGray

    Invoke-SocialPass
    Write-Host ""
    Invoke-BlogPass
}

if ($Once) {
    Invoke-AllPasses
} else {
    while ($true) {
        Invoke-AllPasses
        Write-Host ""
        Write-Host "  sleeping $IntervalSeconds s..." -ForegroundColor DarkGray
        Start-Sleep -Seconds $IntervalSeconds
    }
}
