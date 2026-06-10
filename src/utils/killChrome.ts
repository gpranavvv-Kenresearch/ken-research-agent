import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Kill any Chrome processes that are using the given user-data-dir profile,
 * and remove stale singleton lock files. This prevents the "Opening in existing
 * browser session" error when Playwright tries to launch with that profile.
 */
export function killChromeForProfile(sessionDir: string): void {
  const absDir = path.resolve(sessionDir);

  // Kill Chrome/Chromium processes using this profile dir
  try {
    if (process.platform === 'win32') {
      const script = `
        $procs = Get-WmiObject Win32_Process -Filter "Name='chrome.exe'"
        foreach ($p in $procs) {
          if ($p.CommandLine -and $p.CommandLine -like '*${absDir.replace(/\\/g, '\\\\')}*') {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
          }
        }
      `;
      execSync(`powershell -NoProfile -Command "${script.replace(/\n\s*/g, ' ')}"`, {
        stdio: 'pipe',
        timeout: 10000,
      });
    } else {
      // Linux/macOS — pkill any chromium process using this profile dir
      execSync(`pkill -f "${absDir}" || true`, { stdio: 'pipe', timeout: 5000 });
    }
  } catch {
    // Non-fatal — best effort
  }

  // Remove stale lock files (both root-level singleton locks and Default/LOCK from LevelDB)
  for (const lockFile of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const lockPath = path.join(absDir, lockFile);
    if (fs.existsSync(lockPath)) {
      try { fs.rmSync(lockPath); } catch {}
    }
  }
  // LevelDB LOCK in Default profile — can cause "Opening in existing browser session" if stale
  const defaultLock = path.join(absDir, 'Default', 'LOCK');
  if (fs.existsSync(defaultLock)) {
    try { fs.rmSync(defaultLock); } catch {}
  }
}
