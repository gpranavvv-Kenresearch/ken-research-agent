/**
 * stealth.ts — shared browser-fingerprint hardening for platforms that run
 * Cloudflare (or similar) bot-challenge checks in front of the real login
 * (confirmed live: Calisthenics/Mighty Networks showed a Cloudflare "Verify
 * you are human" Turnstile challenge instead of the expected page).
 *
 * This only patches well-known automation "tells" that a real Chrome window
 * wouldn't normally exhibit — it does not defeat Turnstile's behavioral
 * scoring on its own, but it removes the static JS-level signals that make
 * an otherwise-real, headed Chrome session look scripted.
 */

import { BrowserContext } from 'playwright';

/** Launch args that reduce automation "tells" beyond the basics already used
 * elsewhere in this repo (--disable-blink-features=AutomationControlled). */
export const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-infobars',
  '--disable-session-crashed-bubble',
  '--window-position=0,0',
];

/** A realistic desktop Chrome UA — avoids anything CDP/automation-tooling adds. */
export const STEALTH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Patch the well-known static fingerprint checks bot-detection scripts look
 * for. Apply via `context.addInitScript(installStealth)` before navigating.
 */
export function installStealth(): void {
  const w = globalThis as any;

  // navigator.webdriver — the single most common automation flag.
  Object.defineProperty(w.navigator, 'webdriver', { get: () => undefined });

  // window.chrome — headless/CDP-launched Chrome often lacks the full object
  // real Chrome ships; a bare {} or missing object is itself a signal.
  w.window.chrome = w.window.chrome || {};
  w.window.chrome.app = w.window.chrome.app || { isInstalled: false };
  w.window.chrome.runtime = w.window.chrome.runtime || {
    OnInstalledReason: {}, OnRestartRequiredReason: {}, PlatformArch: {},
    PlatformNaclArch: {}, PlatformOs: {}, RequestUpdateCheckStatus: {},
  };
  w.window.chrome.csi = w.window.chrome.csi || (() => {});
  w.window.chrome.loadTimes = w.window.chrome.loadTimes || (() => {});

  // navigator.plugins — a real desktop Chrome always has a handful; an empty
  // array is a common headless/automation tell.
  Object.defineProperty(w.navigator, 'plugins', {
    get: () => [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Native Client', filename: 'internal-nacl-plugin' },
    ],
  });

  // navigator.languages — some launch configs leave this empty or single-entry.
  Object.defineProperty(w.navigator, 'languages', { get: () => ['en-US', 'en'] });

  // navigator.permissions.query — headless Chrome resolves notifications
  // permission queries differently than real Chrome; a common check compares
  // Notification.permission against the resolved query state.
  const originalQuery = w.navigator.permissions?.query?.bind(w.navigator.permissions);
  if (originalQuery) {
    w.navigator.permissions.query = (params: any) =>
      params?.name === 'notifications'
        ? Promise.resolve({ state: (w.Notification as any)?.permission || 'default' })
        : originalQuery(params);
  }

  // WebGL vendor/renderer — SwiftShader/headless GPU strings are a strong
  // automation signal; report a plausible real-GPU string instead.
  const patchGetParameter = (proto: any) => {
    if (!proto) return;
    const original = proto.getParameter;
    proto.getParameter = function (param: number) {
      if (param === 37445) return 'Google Inc. (NVIDIA)'; // UNMASKED_VENDOR_WEBGL
      if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)'; // UNMASKED_RENDERER_WEBGL
      return original.apply(this, [param]);
    };
  };
  patchGetParameter(w.WebGLRenderingContext?.prototype);
  patchGetParameter(w.WebGL2RenderingContext?.prototype);

  // navigator.hardwareConcurrency / deviceMemory — low/round numbers (esp. 1)
  // read as a VM/automation host rather than a real desktop.
  Object.defineProperty(w.navigator, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(w.navigator, 'deviceMemory', { get: () => 8 });
}

/** Convenience: call once right after `launchPersistentContext`. */
export async function applyStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(installStealth);
}
