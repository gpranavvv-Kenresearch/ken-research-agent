import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { gracefulKillByNeedle } from './procKill.js';

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
      // Linux/macOS — graceful kill of the Chrome process tree using this
      // profile dir. Trailing space anchors `--user-data-dir=<dir> ` so e.g.
      // "note-1" does NOT also match "note-10/11/12" (Chrome always has more
      // args after user-data-dir, so the space is always present). Self-safe
      // and SIGTERM-before-SIGKILL — see gracefulKillByNeedle.
      gracefulKillByNeedle(`--user-data-dir=${absDir} `);
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
