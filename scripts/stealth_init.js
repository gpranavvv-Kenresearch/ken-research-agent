// Stealth init script — injected before every page load
// Removes Playwright/automation signals so Cloudflare doesn't detect bot

Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
  configurable: true
});

// Hide automation in Chrome object
if (window.chrome) {
  try {
    Object.defineProperty(window.chrome, 'csi', { get: () => undefined, configurable: true });
    Object.defineProperty(window.chrome, 'loadTimes', { get: () => undefined, configurable: true });
  } catch (e) {}
}

// Realistic plugins array
try {
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
      ];
      arr.item = (i) => arr[i];
      arr.namedItem = (n) => arr.find(p => p.name === n) || null;
      return arr;
    },
    configurable: true
  });
} catch (e) {}

// Realistic languages
try {
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
    configurable: true
  });
} catch (e) {}

// Remove automation-specific properties from window
try {
  delete window.__playwright;
  delete window.__selenium_unwrapped;
  delete window._selenium;
  delete window.callSelenium;
  delete window._Selenium_IDE_Recorder;
} catch (e) {}
