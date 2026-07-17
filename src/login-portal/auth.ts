/**
 * auth.ts — dashboard→VPS shared-secret gate for the login portal.
 *
 * Mirrors the X-Webhook-Secret pattern the dashboard already uses to reach the
 * Django backend (dashboard/src/app/api/post-now/route.ts). Every portal request
 * must carry `X-Dashboard-Secret: <LOGIN_API_SECRET>`. Per-agent PIN auth is added
 * in Phase 4 on top of this outer gate (defense in depth).
 */

import type { Request, Response, NextFunction } from 'express';

export function requireDashboardSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.LOGIN_API_SECRET;
  if (!expected) {
    res.status(500).json({ error: 'LOGIN_API_SECRET not configured on the server' });
    return;
  }
  const provided = req.header('X-Dashboard-Secret');
  if (!provided || provided !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}
