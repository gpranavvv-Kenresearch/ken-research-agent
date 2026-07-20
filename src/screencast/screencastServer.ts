/**
 * screencastServer.ts — live low-latency browser viewer + optional remote
 * control, using Chrome DevTools Protocol instead of a VNC/X11 desktop stack.
 *
 * Chrome encodes JPEG frames of the page itself and pushes them over the same
 * CDP connection Playwright already uses to drive the browser — no Xvfb, no
 * x11vnc, no websockify, and it works identically on a headless browser (no
 * X server needed at all). A tiny HTTP+WebSocket server here relays those
 * frames to any number of browser tabs (multi-viewer safe, unlike VNC where
 * every viewer shares one mouse/keyboard), and — when `interactive: true` —
 * forwards mouse/keyboard input back from the viewer into the real page via
 * CDP's Input domain, replacing what the noVNC "Add Account" login flow does.
 *
 * Usage:
 *   const handle = await startScreencastServer(page, 7900, { interactive: true });
 *   console.log(handle.url); // open this in any browser tab
 *   ...
 *   await handle.stop();
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page, CDPSession } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIEWER_HTML = fs.readFileSync(path.join(__dirname, 'viewer.html'), 'utf-8');

export interface ScreencastOptions {
  quality?: number;       // JPEG quality 0-100 (default 80)
  maxWidth?: number;      // default 1280
  maxHeight?: number;     // default 900
  everyNthFrame?: number; // unused now — kept for API compatibility
  frameIntervalMs?: number; // how often to poll a fresh screenshot (default 100 = ~10fps)
  interactive?: boolean;  // forward mouse/keyboard input from viewers into the page (default false)
  /**
   * When set, both the page load and the WebSocket upgrade must carry a
   * matching `?t=` query param. Without this, the pool's fixed, small port
   * range (5 slots) would let anyone who knows the public URL enumerate every
   * concurrent login by trying each port — no per-session secret needed. This
   * closes that: the token from startLogin() is required to actually view or
   * control any given session.
   */
  token?: string;
}

export interface ScreencastServerHandle {
  url: string;
  /** Point the same running server at a different page (e.g. next account/platform). */
  setPage: (page: Page) => Promise<void>;
  stop: () => Promise<void>;
}

async function dispatchInput(cdp: CDPSession, msg: any): Promise<void> {
  try {
    switch (msg.event) {
      case 'mousePressed':
      case 'mouseReleased':
      case 'mouseMoved':
        await cdp.send('Input.dispatchMouseEvent', {
          type: msg.event,
          x: msg.x,
          y: msg.y,
          button: msg.button,
          clickCount: msg.clickCount,
        });
        break;
      case 'mouseWheel':
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: msg.x,
          y: msg.y,
          deltaX: msg.deltaX,
          deltaY: msg.deltaY,
        });
        break;
      case 'keyDown':
      case 'keyUp': {
        const params: Record<string, unknown> = {
          type: msg.event === 'keyDown' ? (msg.text ? 'keyDown' : 'rawKeyDown') : 'keyUp',
          key: msg.key,
          code: msg.code,
          windowsVirtualKeyCode: msg.keyCode,
          nativeVirtualKeyCode: msg.keyCode,
          modifiers: msg.modifiers ?? 0,
        };
        if (msg.text) {
          params.text = msg.text;
          params.unmodifiedText = msg.text;
        }
        await cdp.send('Input.dispatchKeyEvent', params as any);
        break;
      }
    }
  } catch (err: any) {
    console.error(`[screencast] dispatchInput FAILED for ${msg.event}:`, err?.message || err);
  }
}

export async function startScreencastServer(
  page: Page,
  port: number,
  opts: ScreencastOptions = {},
): Promise<ScreencastServerHandle> {
  const quality = opts.quality ?? 80;
  const maxWidth = opts.maxWidth;
  const maxHeight = opts.maxHeight;
  const frameIntervalMs = opts.frameIntervalMs ?? 100;
  const interactive = opts.interactive ?? false;
  const requiredToken = opts.token;

  function tokenOk(reqUrl: string | undefined): boolean {
    if (!requiredToken) return true; // no token configured — open (e.g. local dev/testing)
    if (!reqUrl) return false;
    const t = new URL(reqUrl, 'http://x').searchParams.get('t');
    return t === requiredToken;
  }

  const clients = new Set<WebSocket>();
  let cdp: CDPSession | null = null;
  let currentPage: Page | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let capturing = false; // guards against overlapping captures if one takes longer than the interval

  function broadcast(msg: object): void {
    const data = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  function stopPolling(): void {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  async function stopScreencast(): Promise<void> {
    stopPolling();
    if (cdp) {
      await cdp.detach().catch(() => {});
      cdp = null;
    }
  }

  /**
   * Poll page.screenshot() on our own fixed interval instead of using CDP's
   * Page.startScreencast push API. startScreencast looked like the "proper"
   * CDP-native way to do this, but it has a well-known internal throttle that
   * capped real-world testing at ~2fps regardless of quality/resolution
   * tuning — confirmed not CPU-bound (server sat at ~1.5% CPU the whole time).
   * Polling screenshots directly gives us the actual frame rate we ask for.
   */
  async function startScreencastOn(target: Page): Promise<void> {
    await stopScreencast();
    currentPage = target;
    console.log(`[screencast] attaching to page: ${target.url()}`);

    if (maxWidth && maxHeight) {
      await target.setViewportSize({ width: maxWidth, height: maxHeight }).catch(() => {});
    }

    // Still need a CDP session, but only for Input dispatch now — not screencast.
    cdp = await target.context().newCDPSession(target);

    let frameCount = 0;
    pollTimer = setInterval(async () => {
      if (capturing || clients.size === 0) return; // nothing to do — save the work
      capturing = true;
      try {
        const shot = await target.screenshot({ type: 'jpeg', quality });
        frameCount++;
        if (frameCount === 1 || frameCount % 50 === 0) {
          console.log(`[screencast] frame #${frameCount}, ${shot.length} bytes, clients=${clients.size}`);
        }
        broadcast({ type: 'frame', data: shot.toString('base64') });
      } catch {
        // page mid-navigation, closed, etc. — just skip this tick
      } finally {
        capturing = false;
      }
    }, frameIntervalMs);

    target.once('close', () => {
      if (currentPage === target) broadcast({ type: 'status', text: 'page closed — waiting for next page...' });
    });
  }

  const httpServer = http.createServer((req, res) => {
    if (!tokenOk(req.url)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden — missing or invalid token');
      return;
    }
    if (req.url?.split('?')[0] === '/' || req.url?.split('?')[0] === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(VIEWER_HTML);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, cb) => cb(tokenOk(info.req.url)),
  });
  wss.on('connection', async (ws) => {
    clients.add(ws);
    console.log(`[screencast] viewer connected, total clients=${clients.size}`);
    ws.send(JSON.stringify({ type: 'mode', interactive }));

    // Seed the new viewer with the CURRENT state immediately — CDP screencast
    // only pushes a frame on repaint, so without this, refreshing/opening the
    // viewer shows a blank canvas until something happens to trigger a new one.
    if (currentPage) {
      try {
        const shot = await currentPage.screenshot({ type: 'jpeg', quality });
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'frame', data: shot.toString('base64') }));
        }
      } catch (err: any) {
        console.error('[screencast] seed screenshot failed:', err?.message || err);
      }
    }
    ws.on('message', (raw) => {
      if (!interactive || !cdp) {
        console.log(`[screencast] input message dropped: interactive=${interactive} cdp=${!!cdp}`);
        return;
      }
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'input') {
        console.log(`[screencast] input received: ${msg.event} x=${msg.x} y=${msg.y}`);
        void dispatchInput(cdp, msg);
      }
    });
    ws.on('close', () => clients.delete(ws));
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  await startScreencastOn(page);

  return {
    url: `http://localhost:${port}`,
    setPage: (newPage: Page) => startScreencastOn(newPage),
    stop: async () => {
      await stopScreencast();
      for (const ws of clients) ws.close();
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
