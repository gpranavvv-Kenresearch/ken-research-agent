import type { BrowserContext } from 'playwright';

// Only these are aborted. Content is always typed into a form, so images, web
// fonts, and audio/video are pure weight — blocking them cuts per-post CPU, RAM,
// and bandwidth across ~150 browser launches per lap. Everything else
// (document, stylesheet, script, xhr, fetch, websocket, manifest, ...) is
// allowed: blocking stylesheet/script/xhr breaks rich-text editors and autosave.
const HEAVY = new Set(['image', 'font', 'media']);

/**
 * Abort heavy assets for every page in a context. Applied at the context level
 * so it also covers popups/new tabs a platform opens (e.g. a publish success
 * tab). Best-effort: never throws into the login flow.
 *
 * Per-platform kill switch: RESOURCE_BLOCK_DISABLE=medium,ameba,linkmate skips
 * blocking for platforms where it trips Cloudflare or breaks an editor. Roll out
 * to robust text platforms first; add editors/Cloudflare platforms only after a
 * monitored lap shows their posted-counts held.
 */
export async function blockHeavyResources(context: BrowserContext, platform: string): Promise<void> {
  const disabled = (process.env.RESOURCE_BLOCK_DISABLE || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (disabled.includes(platform.toLowerCase())) return;

  try {
    await context.route('**/*', (route) => {
      if (HEAVY.has(route.request().resourceType())) return route.abort();
      return route.continue();
    });
  } catch {
    // best-effort — a failed route setup must never block posting
  }
}
