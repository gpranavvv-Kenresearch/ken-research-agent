/**
 * retry.ts — retry a posting attempt when it fails on a transient Playwright
 * selector timeout (page got stuck / rendered slowly), instead of failing the
 * row outright. Does NOT retry other error types (bad credentials, banned
 * account, etc.) — those are real failures and should surface immediately.
 */

const TIMEOUT_PATTERN = /Timeout \d+ms exceeded|waiting for locator|waitForSelector|Target page, context or browser has been closed/i;

export function isTransientTimeoutError(message: string | undefined): boolean {
  return !!message && TIMEOUT_PATTERN.test(message);
}

/**
 * Re-runs `fn` (a full login+post attempt) when it fails on a transient
 * selector-timeout — whether `fn` resolves with { success: false, error } (the
 * postTo*Account() helper pattern) or throws (the loginTo*() + raw poster
 * pattern, e.g. Ameba). Non-timeout failures are NOT retried — they propagate
 * (thrown) or resolve (returned) exactly as they would without this wrapper.
 */
export async function retryOnSelectorTimeout<T extends { success: boolean; error?: string }>(
  fn: () => Promise<T>,
  opts: { retries?: number; label?: string; delayMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 4000;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const result = await fn();
      if (result.success || attempt > retries || !isTransientTimeoutError(result.error)) return result;
    } catch (err: any) {
      if (attempt > retries || !isTransientTimeoutError(err?.message)) throw err;
    }
    console.log(`    ⏳ ${opts.label || 'Post'} hit a selector timeout (attempt ${attempt}/${retries + 1}) — retrying...`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // Unreachable — the loop always returns or throws on its final iteration.
  throw new Error('retryOnSelectorTimeout: exhausted retries unexpectedly');
}
