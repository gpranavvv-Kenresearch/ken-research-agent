/**
 * agentAuth.ts — per-agent PIN auth for the login portal (Phase 4).
 *
 * Adds a second gate on top of the dashboard shared-secret: each agent has a PIN
 * (scrypt-hashed, stored server-side), and proving it mints a short-lived,
 * agent-scoped token that must accompany every status/login/finish call. This
 * stops agent A from driving agent B's logins. No external deps — Node crypto only.
 *
 * First-time UX: if an agent has no PIN yet, the first /auth call *sets* it (claim).
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

const AUTH_FILE = path.resolve('.accounts/portal-auth.json');
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8h

function hmacKey(): string {
  const k = process.env.LOGIN_API_SECRET;
  if (!k) throw new Error('LOGIN_API_SECRET not set (needed to sign agent tokens)');
  return k;
}

// ── PIN storage (scrypt) ─────────────────────────────────────────────────────

interface AuthStore { [agent: string]: { pinHash: string } }

function loadStore(): AuthStore {
  try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8')); } catch { return {}; }
}
function saveStore(store: AuthStore): void {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function pinMatches(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(pin, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(computed, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verify an agent's PIN, or set it on first use. Returns whether it was created. */
export function verifyOrSetPin(agent: string, pin: string): { ok: boolean; created: boolean } {
  const a = agent.toLowerCase();
  if (!pin || pin.length < 4) return { ok: false, created: false };
  const store = loadStore();
  const existing = store[a];
  if (!existing) {
    store[a] = { pinHash: hashPin(pin) };
    saveStore(store);
    return { ok: true, created: true };
  }
  return { ok: pinMatches(pin, existing.pinHash), created: false };
}

// ── Agent-scoped tokens (HMAC) ───────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sign(body: string): string {
  return b64url(crypto.createHmac('sha256', hmacKey()).update(body).digest());
}

export function mintToken(agent: string): string {
  const payload = JSON.stringify({ agent: agent.toLowerCase(), exp: Date.now() + TOKEN_TTL_MS });
  const body = b64url(Buffer.from(payload));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string, agent: string): boolean {
  if (!token || !token.includes('.')) return false;
  const [body, sig] = token.split('.');
  const expected = sign(body);
  const sBuf = Buffer.from(sig);
  const eBuf = Buffer.from(expected);
  if (sBuf.length !== eBuf.length || !crypto.timingSafeEqual(sBuf, eBuf)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    return payload.exp > Date.now() && payload.agent === agent.toLowerCase();
  } catch {
    return false;
  }
}

/** Express middleware: require a valid agent token matching the :agent route param. */
export function requireAgentToken(req: Request, res: Response, next: NextFunction): void {
  const agent = req.params.agent;
  const token = req.header('X-Agent-Token') || '';
  if (!verifyToken(token, agent)) {
    res.status(403).json({ error: 'agent authentication required' });
    return;
  }
  next();
}
