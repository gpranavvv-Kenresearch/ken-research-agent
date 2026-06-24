# Ken Research Worker — Complete Setup Instructions

**This file is given to Claude on a new team member's laptop. Claude must follow every step below in order, without asking any questions. Everything needed is in this file.**

---

## Who This Machine Is For

At the top of this file, the person's nickname will be written. Look for:

```
WORKER = vansh
```

or `shrey` or `vishal`. Every command below uses this nickname. Replace `{NAME}` with that nickname throughout.

---

## Step 0 — Identify This Machine's Worker Name

Read the line above. Set `{NAME}` to whichever name is written there (vansh / shrey / vishal).

All account credentials (X username/password, Facebook email/password, LinkedIn email/password) are in **CLAUDE.md** in the repo root under the sections "X Accounts", "Facebook Accounts", and "LinkedIn Accounts". Look up the row where Nickname = `{NAME}` to get the credentials for each platform.

---

## Step 1 — Prerequisites Check

Run each check in PowerShell. If any fails, install it before continuing.

```powershell
# Check Node.js (need 18+)
node --version

# Check Python (need 3.10+)
python --version

# Check Git
git --version

# Check Google Chrome is installed at default path
Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe"
# If False: download from https://www.google.com/chrome and install it
```

---

## Step 2 — Pull the Repo

If the repo folder does NOT exist on this machine:
```powershell
cd "$env:USERPROFILE\Desktop"
git clone "https://github.com/gpranavvv-Kenresearch/ken-research-agent.git" "full team agent"
cd "full team agent"
```
If prompted for GitHub username/password, use the GitHub credentials Pranav provides.

If the repo folder ALREADY exists:
```powershell
cd "$env:USERPROFILE\Desktop\full team agent"
git pull origin main
```

All following commands run from inside the `full team agent` folder. Always `cd` to it first.

---

## Step 3 — Copy the .env File

The `.env` file is NOT in the repo (it contains API keys). It must be copied from Pranav's laptop.

**Pranav must share the file** `ken_backend\.env` via USB drive, Teams, or WhatsApp.

Once received, place it at exactly:
```
full team agent\ken_backend\.env
```

Then open it in Notepad and change ONLY this one line:
```
WORKER_NAME={NAME}
```

Replace `{NAME}` with this machine's worker name (vansh / shrey / vishal).

Also change this line to match the actual folder path on THIS machine:
```
REPO_ROOT=C:\Users\{WindowsUsername}\Desktop\full team agent
```

Replace `{WindowsUsername}` with the actual Windows username on this laptop (run `echo $env:USERNAME` in PowerShell to find it).

Save and close the file.

---

## Step 4 — Copy the Google Service Account Credentials

The file `credentials\service-account.json` must also be copied from Pranav's laptop.

Place it at:
```
full team agent\credentials\service-account.json
```

(Create the `credentials` folder if it does not exist.)

---

## Step 5 — Install Node.js Dependencies

```powershell
cd "$env:USERPROFILE\Desktop\full team agent"
npm install
```

Verify tsx is available:
```powershell
npx tsx --version
```

---

## Step 6 — Install Python Dependencies

```powershell
cd "$env:USERPROFILE\Desktop\full team agent\ken_backend"
pip install -r requirements.txt
pip install google-auth requests beautifulsoup4
```

---

## Step 7 — Run Django Migrations (one time)

```powershell
cd "$env:USERPROFILE\Desktop\full team agent\ken_backend"
$env:DJANGO_SETTINGS_MODULE = "ken_backend.settings.local"
python manage.py migrate
```

---

## Step 8 — Verify Sheet Connection

```powershell
cd "$env:USERPROFILE\Desktop\full team agent"
python scripts\sheet_read.py --sheet social --name {NAME} --action unposted
```

Expected output: JSON with `"ok": true` and a `rows` array. If it errors, check that `credentials\service-account.json` is in place.

---

## Step 9 — Save Browser Sessions (ONE-TIME LOGIN)

This is the only step that requires a human. For each platform below, a browser window will open. The person must log in manually, then press Enter in PowerShell to save the session.

**Run all of these. Do not skip any.**

```powershell
cd "$env:USERPROFILE\Desktop\full team agent"
```

### 9a — X (Twitter)
```powershell
npx tsx scripts\local-login.ts --name {NAME} --platform x
```
Browser opens → log in to X with:
- Username: (see credentials table at top of this file for this machine's name)
- Password: (see credentials table)

When the home feed is visible, press Enter in PowerShell.

### 9b — Facebook
```powershell
npx tsx scripts\local-login.ts --name {NAME} --platform fb
```
Browser opens → log in to Facebook with:
- Email: (see credentials table)
- Password: (see credentials table)

When the Facebook home feed is visible, press Enter.

### 9c — LinkedIn (used for both social posts AND blog articles)
```powershell
npx tsx scripts\local-login.ts --name {NAME} --platform li
```
Browser opens → log in to LinkedIn with:
- Email: (see credentials table)
- Password: (see credentials table)

When the LinkedIn feed is visible, press Enter.

### 9d — ChatGPT (for blog cover image generation — shared, one per machine)
```powershell
npx tsx scripts\local-login.ts --name shared --platform chatgpt
```
Browser opens → log in to ChatGPT with any team Google account.
When the main chat interface loads, press Enter.

---

## Step 10 — Verify Sessions Were Saved

```powershell
ls "$env:USERPROFILE\Desktop\full team agent\scripts\sessions\"
```

You should see four folders:
```
chrome-x-{NAME}\
chrome-fb-{NAME}\
chrome-li-{NAME}\
```

And one folder in `.sessions-cookies\`:
```
chatgpt-profile\
```

If any is missing, repeat that platform's login step from Step 9.

---

## Step 11 — Test a Single Post (Dry Run)

Test that the posting script can load the session and reach the platform:

```powershell
cd "$env:USERPROFILE\Desktop\full team agent"
# Read one unposted row
python scripts\sheet_read.py --sheet social --name {NAME} --action unposted
```

This should return rows. If it shows `0 unposted rows`, add a test row to the `{Name} Social` tab in the Google Sheet with a `targetUrl` and this person's name in the `Name` column, then re-run.

---

## Step 12 — Start the Workers

Open **two separate PowerShell windows**.

**Window 1 — Content Generator** (runs every 5 minutes, generates social posts + blogs):
```powershell
cd "$env:USERPROFILE\Desktop\full team agent"
.\scripts\auto-generate.ps1 -Name {NAME}
```

**Window 2 — Posting Worker** (posts content to platforms when triggered):
```powershell
cd "$env:USERPROFILE\Desktop\full team agent"
.\scripts\start-worker.ps1
```

Both windows must stay open while the worker is running. Close them to stop.

---

## Step 13 — Verify Workers Are Running

In the generator window (Window 1), you should see something like:
```
============================================================
 Auto-Generator for: {NAME}
 Social tab  + Blog tab
 Interval: 300 s    Press Ctrl+C to stop.
============================================================
```

In the posting worker window (Window 2), you should see:
```
============================================================
 Workers for: {NAME}
============================================================
 Social worker → queue: social.{name}
 Blog worker   → queue: blog.{name}
```

---

## Daily Operation

- Keep both PowerShell windows open during working hours (10:30 AM – 6:00 PM IST).
- The generator runs every 5 minutes and writes content to the sheet.
- The posting worker picks up tasks from the Vercel dashboard "Post Now" button or scheduled cron.
- If a window crashes, just restart it with the same command.

---

## Troubleshooting

### "Session invalid — logging in with credentials"
The saved Chrome profile expired or got corrupted. Re-run the login for that platform (Step 9) and press Enter after logging in.

### "Sheet read failed"
The `credentials\service-account.json` file is missing or wrong. Copy it again from Pranav's laptop.

### "WORKER_NAME not set"
Open `ken_backend\.env` and confirm `WORKER_NAME={NAME}` is set correctly (no extra spaces).

### Blog image has empty `src`
The ChatGPT session expired. Re-run:
```powershell
npx tsx scripts\local-login.ts --name shared --platform chatgpt
```

### "celery not found"
```powershell
pip install celery[redis]
```

### "npx tsx not found"
```powershell
npm install
```

---

## File Locations Summary

| File | Where to Get It | Purpose |
|------|----------------|---------|
| `ken_backend\.env` | Copy from Pranav's laptop, change WORKER_NAME and REPO_ROOT | All API keys and config |
| `credentials\service-account.json` | Copy from Pranav's laptop | Google Sheets write access |
| `scripts\sessions\chrome-x-{NAME}\` | Created by Step 9a | X login session |
| `scripts\sessions\chrome-fb-{NAME}\` | Created by Step 9b | Facebook login session |
| `scripts\sessions\chrome-li-{NAME}\` | Created by Step 9c | LinkedIn + LinkedIn Pulse session |
| `.sessions-cookies\chatgpt-profile\` | Created by Step 9d | ChatGPT image generation session |
