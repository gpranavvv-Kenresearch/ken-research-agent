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

export async function vpsProxy(pathAndQuery: string, init?: RequestInit): Promise<VpsResult> {
  const base = process.env.VPS_API_URL;
  const secret = process.env.VPS_API_SECRET;
  if (!base) return { status: 500, data: { error: 'VPS_API_URL not configured' } };

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${pathAndQuery}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Dashboard-Secret': secret ?? '',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 502, data: { error: `VPS unreachable: ${msg}` } };
  }
}
