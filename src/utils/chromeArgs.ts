/**
 * Single source of truth for Chrome launch args in the posting path.
 *
 * Several browser login modules drifted apart: 6 of them (blogger, devto,
 * note, hackmd, instagram, paragraph) omitted the Linux hardening block, and
 * paragraph passed only "--disable-infobars". On the 2-vCPU / 7.7GB VPS with
 * NO swap, --disable-dev-shm-usage (route shared memory to disk instead of the
 * tiny /dev/shm) and --disable-gpu are the direct mitigations against renderer
 * OOM / crash. This centralizes them so a new platform can't miss the block.
 *
 * Mirrors the proven arg set in twitter/login.ts's CHROME_LAUNCH_ARGS. The Linux
 * hardening is gated to non-win32 so local Windows dev is unaffected.
 */
export function getChromeLaunchArgs(opts?: { minimized?: boolean; extra?: string[] }): string[] {
  const linuxHardening =
    process.platform !== 'win32'
      ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      : [];

  const args = [
    // Harmless no-op under --headless; keeps the window out of the way when a
    // run is watched headed (HEADLESS=false) on the virtual display.
    ...(opts?.minimized === false ? [] : ['--start-minimized']),
    ...linuxHardening,
    '--disable-blink-features=AutomationControlled',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--disable-infobars',
  ];

  return opts?.extra ? [...args, ...opts.extra] : args;
}
