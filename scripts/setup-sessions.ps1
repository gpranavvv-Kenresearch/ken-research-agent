<#
.SYNOPSIS
  One-time session setup for a team member.
  Run this ONCE on your machine — sessions are saved to .sessions-cookies/ and reused forever.

  NOTE: Shrey, Vansh, Abhinav, Pranav do NOT run this script (no dedicated sessions).

.USAGE
  cd "full team agent"
  .\scripts\setup-sessions.ps1

  Or pass your nickname directly to skip the prompt:
  .\scripts\setup-sessions.ps1 -Name aniket
#>

param(
    [string]$Name = ""
)

# ── Who is setting up sessions ─────────────────────────────────────────────────
$ACTIVE_MEMBERS = @(
    "aniket", "krishi", "hritika", "meenakshi", "sameeksha",
    "vijay", "shivani", "vishal", "sanya", "kamakshi", "avdhesh"
)
$EXCLUDED = @("shrey", "vansh", "abhinav", "pranav")

if (-not $Name) {
    Write-Host ""
    Write-Host "  Who are you? Enter your nickname (lowercase):" -ForegroundColor Cyan
    Write-Host "  Active members: $($ACTIVE_MEMBERS -join ', ')" -ForegroundColor Gray
    Write-Host ""
    $Name = (Read-Host "  Your nickname").Trim().ToLower()
}

if ($EXCLUDED -contains $Name) {
    Write-Host ""
    Write-Host "  $Name is not in the active session list (shrey/vansh/abhinav/pranav are excluded)." -ForegroundColor Yellow
    Write-Host "  No sessions needed for your account." -ForegroundColor Yellow
    exit 0
}

if (-not ($ACTIVE_MEMBERS -contains $Name)) {
    Write-Host ""
    Write-Host "  Unknown nickname: $Name" -ForegroundColor Red
    Write-Host "  Must be one of: $($ACTIVE_MEMBERS -join ', ')" -ForegroundColor Red
    exit 1
}

# ── Platform sessions per member ───────────────────────────────────────────────
# Social platforms: x, fb, li
# Blog platforms:   medium (+ li already covers LinkedIn Pulse, notion, etc.)
$SOCIAL_PLATFORMS = @("x", "fb", "li")
$BLOG_PLATFORMS   = @("medium", "notion")

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   Session Setup for: $($Name.ToUpper())" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  You will log into each platform one by one." -ForegroundColor Cyan
Write-Host "  A browser window opens — log in — press Enter in this window." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Platforms: Social (X, Facebook, LinkedIn) + Blog (Medium, Notion)" -ForegroundColor Gray
Write-Host ""

$total    = $SOCIAL_PLATFORMS.Count + $BLOG_PLATFORMS.Count
$current  = 0

# ── Social sessions ────────────────────────────────────────────────────────────
Write-Host "  ── SOCIAL PLATFORMS ──────────────────────────────────────────" -ForegroundColor Yellow
foreach ($platform in $SOCIAL_PLATFORMS) {
    $current++
    Write-Host ""
    Write-Host "  [$current/$total] Setting up: $platform ($Name)" -ForegroundColor Cyan
    npx tsx scripts/local-login.ts --name $Name --platform $platform
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: $platform session setup may have failed (exit $LASTEXITCODE). Continuing..." -ForegroundColor Yellow
    }
}

# ── Blog sessions ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ── BLOG PLATFORMS ───────────────────────────────────────────" -ForegroundColor Yellow
Write-Host "  Note: LinkedIn Pulse reuses your LinkedIn (li) session — no separate login needed." -ForegroundColor Gray
Write-Host ""
foreach ($platform in $BLOG_PLATFORMS) {
    $current++
    Write-Host ""
    Write-Host "  [$current/$total] Setting up: $platform ($Name)" -ForegroundColor Cyan
    npx tsx scripts/local-login.ts --name $Name --platform $platform
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: $platform session setup may have failed (exit $LASTEXITCODE). Continuing..." -ForegroundColor Yellow
    }
}

# ── ChatGPT (shared, once per machine) ────────────────────────────────────────
Write-Host ""
Write-Host "  ── CHATGPT (cover image generation — shared session) ────────" -ForegroundColor Yellow
$profileDir = ".sessions-cookies\chatgpt-profile"
if (Test-Path $profileDir) {
    Write-Host "  ChatGPT session already exists at $profileDir — skipping." -ForegroundColor Gray
    Write-Host "  (Delete $profileDir and re-run if you need to refresh it.)" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "  Setting up shared ChatGPT session for DALL-E image generation..." -ForegroundColor Cyan
    npx tsx scripts/local-login.ts --name shared --platform chatgpt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: ChatGPT session setup failed. Blog images will be skipped until fixed." -ForegroundColor Yellow
    }
}

# ── Summary ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   All done! Sessions saved to .sessions-cookies/" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Files created:" -ForegroundColor Cyan

$sessionFiles = @(
    "x-$Name.json",
    "fb-$Name.json",
    "li-$Name.json",
    "medium-$Name.json",
    "notion-$Name.json"
)
foreach ($f in $sessionFiles) {
    $p = ".sessions-cookies\$f"
    if (Test-Path $p) {
        $size = (Get-Item $p).Length
        Write-Host "    ✅ $p  ($size bytes)" -ForegroundColor Green
    } else {
        Write-Host "    ❌ $p  (MISSING — session may have failed)" -ForegroundColor Red
    }
}

if (Test-Path ".sessions-cookies\chatgpt-profile") {
    Write-Host "    ✅ .sessions-cookies\chatgpt-profile\  (persistent Chrome profile)" -ForegroundColor Green
} else {
    Write-Host "    ❌ .sessions-cookies\chatgpt-profile\  (MISSING)" -ForegroundColor Red
}

Write-Host ""
Write-Host "  You can now start your Celery worker:" -ForegroundColor Cyan
Write-Host "    .\scripts\start-worker.ps1" -ForegroundColor White
Write-Host ""
