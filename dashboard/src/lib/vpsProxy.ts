/**
 * vpsProxy.ts — server-side helper to reach the VPS login-portal API.
 *
 * Mirrors the Django proxy pattern in app/api/post-now/route.ts, but points at
 * the VPS control API (Tailscale Funnel URL) and authenticates with the shared
 * X-Dashboard-Secret. The secret lives ONLY in server env — never shipped to the
 * browser. Runs from Vercel serverless functions (outside the corporate network),
 * so the Tailscale Let's Encrypt cert validates normally.
 */

export interface VpsResult {
  status: number;
  data: any;
}

// A brief pm2 restart (a code deploy) or the tunnel reconnecting takes a few
// seconds; without a retry, any dashboard request landing in that window
// fails instantly and surfaces to the user as "VPS unreachable" even though
// the server is back up moments later. RETRY_DELAYS_MS only applies to a
// genuine connect-level failure (the request never reached the server at
// all — safe to retry regardless of HTTP method), never to a request that
// got a real HTTP response or timed out after being sent (which might have
// already run server-side — retrying that blindly could double-trigger an
// action like starting a login or a post cycle).
const RETRY_DELAYS_MS = [400, 1200];
const REQUEST_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True only for a connection-level failure (DNS, refused, reset) — the
 * request body never left this process, so no server-side action could have
 * run. A timeout/abort is NOT included here: by then the request may already
 * be executing on the server. */
function isConnectFailure(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('fetch failed') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('econnreset');
}

export async function vpsProxy(pathAndQuery: string, init?: RequestInit): Promise<VpsResult> {
  const base = process.env.VPS_API_URL;
  const secret = process.env.VPS_API_SECRET;
  if (!base) return { status: 500, data: { error: 'VPS_API_URL not configured' } };

  const url = `${base.replace(/\/$/, '')}${pathAndQuery}`;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'X-Dashboard-Secret': secret ?? '',
          ...(init?.headers ?? {}),
        },
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    } catch (err) {
      lastErr = err;
      const willRetry = isConnectFailure(err) && attempt < RETRY_DELAYS_MS.length;
      if (!willRetry) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    } finally {
      clearTimeout(timer);
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return { status: 502, data: { error: `VPS unreachable: ${msg}` } };
}
