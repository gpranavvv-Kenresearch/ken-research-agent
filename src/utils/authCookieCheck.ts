/**
 * authCookieCheck.ts — trust the real session cookie over a UI-render guess.
 *
 * Every platform's "am I logged in?" check works by navigating to a page and
 * polling for specific UI elements to become visible within a timeout. That's
 * a guess about rendering speed, not a fact about the session. Confirmed live
 * on LinkedIn: a session with a valid li_at cookie (expires a year out) still
 * failed the UI-visibility check under load — a false negative that discards
 * a working, password-less account with nothing to retry with.
 *
 * This checks the actual auth cookie via the live browser context instead.
 * Cookie names are NOT duplicated here — they're read from the same
 * PLATFORMS.authCookies registry the dashboard's own status check already
 * uses (src/login-portal/config.ts), so there is one source of truth.
 */
import type { BrowserContext } from 'playwright';
import { PLATFORMS } from '../login-portal/config.js';

/**
 * True if the context currently holds any of this platform's known auth
 * cookies. A trailing '*' in the registry means prefix match (e.g. WordPress's
 * 'wordpress_logged_in*'). Fails closed (false) on any error — this is a
 * fallback signal, never the sole gate for anything.
 */
export async function hasAuthCookie(context: BrowserContext, platformKey: string): Promise<boolean> {
  const plat = PLATFORMS[platformKey];
  if (!plat || !plat.authCookies.length) return false;
  try {
    const cookies = await context.cookies();
    return cookies.some((c) =>
      plat.authCookies.some((name) =>
        name.endsWith('*') ? c.name.startsWith(name.slice(0, -1)) : c.name === name
      )
    );
  } catch {
    return false;
  }
}
