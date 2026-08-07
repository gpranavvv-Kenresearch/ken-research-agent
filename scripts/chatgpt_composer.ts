// Reliable text input for ChatGPT's Lexical/ProseMirror composer.
//
// ChatGPT's #prompt-textarea is a contenteditable <div> backed by Lexical.
// Playwright's locator.fill() only delivers the first line; everything after
// the first \n\n is silently dropped because Lexical re-renders from its own
// internal state. Symptom: GPT replies "the message only includes the
// opening line, please share the full brief."
//
// This helper bypasses fill() by dispatching a synthetic paste event with a
// DataTransfer payload — which Lexical handles natively and preserves
// newlines correctly. Falls back to keyboard.insertText if the paste event
// doesn't take. Aborts hard if neither approach gets the full prompt in.

import { Page } from 'playwright';

const COMPOSER_SELECTOR = '#prompt-textarea';

/**
 * Remove ChatGPT's blocking overlay modals (e.g. the "conversation history
 * rate limit" dialog) from the DOM. This is a live React app — the modal can
 * re-render itself seconds after being removed if the underlying condition
 * (rate limit, session nudge, etc.) is still true, so call this again right
 * before EVERY click that could be intercepted, not just once up front.
 * Returns true if a modal was found and removed.
 */
export async function dismissBlockingModals(page: Page): Promise<boolean> {
  const removed = await page.evaluate(() => {
    const modal = document.querySelector(
      '#modal-conversation-history-rate-limit, [data-testid="modal-conversation-history-rate-limit"]'
    );
    if (modal) { modal.remove(); return true; }
    return false;
  });
  if (removed) {
    console.log('[composer] Removed blocking modal from DOM');
    await page.waitForTimeout(300);
  }
  return removed;
}

/**
 * Any ChatGPT popup/dialog — the known rate-limit modal, but also any other
 * overlay (session nudge, "stay logged in", upsell, etc.) that can appear
 * mid-generation — dismissed by pressing Enter (its default button) instead
 * of ripping it out of the DOM. For the completion-poll loop, where DOM
 * removal alone hasn't reliably cleared the underlying blocked state, and
 * where new popup variants keep showing up that a single hardcoded selector
 * won't catch. Only use this where focus isn't in the composer (Enter there
 * would submit the prompt) — use dismissBlockingModals() instead there.
 */
const POPUP_SELECTOR = [
  '#modal-conversation-history-rate-limit',
  '[data-testid="modal-conversation-history-rate-limit"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  'div[data-state="open"]',
].join(', ');

export async function dismissRateLimitModalByEnter(page: Page): Promise<boolean> {
  let dismissedAny = false;
  // Popups can re-render right after being dismissed, so keep pressing Enter
  // until the page is actually clear instead of returning after one press.
  for (let i = 0; i < 5; i++) {
    const present = await page.locator(POPUP_SELECTOR).first().isVisible({ timeout: 1000 }).catch(() => false);
    if (!present) break;
    console.log('[composer] Popup detected — dismissing with Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    dismissedAny = true;
  }
  return dismissedAny;
}

export async function pasteIntoChatGPTComposer(
  page: Page,
  text: string,
  opts: { minFillRatio?: number } = {},
): Promise<void> {
  const { minFillRatio = 0.5 } = opts;
  const expectedLen = text.length;

  await dismissBlockingModals(page);

  const composer = page.locator(COMPOSER_SELECTOR).first();
  await composer.waitFor({ state: 'visible', timeout: 15000 });
  await composer.click();
  await page.waitForTimeout(300);

  // Clear any leftover content
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);

  // Primary: synthetic paste event with DataTransfer, dispatched on the
  // resolved DOM element (composer.evaluate passes the matched element in).
  // Playwright pierces shadow DOM to find #prompt-textarea; raw
  // document.querySelector inside page.evaluate does not — so use the
  // locator handle directly.
  // Lexical's paste handler reads clipboardData.getData('text/plain') and
  // preserves newlines, unlike .fill() which truncates to the first text node.
  await composer.evaluate((target: Element, textToInsert: string) => {
    (target as HTMLElement).focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', textToInsert);
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    target.dispatchEvent(pasteEvent);
  }, text);

  await page.waitForTimeout(1500);

  let actualLen = await readComposerLength(composer);
  console.log(`  Composer length after paste: ${actualLen}/${expectedLen} chars`);

  // In ChatGPT's new "Extended" mode, long pastes are auto-converted into a
  // text-file ATTACHMENT instead of landing in the composer text. Detect that
  // case and accept it as a valid prompt delivery.
  if (actualLen < expectedLen * minFillRatio) {
    const attachmentPresent = await detectPastedAttachment(page, text);
    if (attachmentPresent) {
      console.log('  Composer empty but prompt landed as ATTACHMENT (Extended mode). Accepting.');
      return;
    }
    console.log('  Paste event undersized. Falling back to keyboard.insertText...');
    await composer.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    await page.keyboard.insertText(text);
    await page.waitForTimeout(1500);
    actualLen = await readComposerLength(composer);
    console.log(`  Composer length after insertText: ${actualLen}/${expectedLen} chars`);
  }

  if (actualLen < expectedLen * minFillRatio) {
    // Final attachment check — insertText may have triggered the same Extended-mode conversion.
    const attachmentPresent = await detectPastedAttachment(page, text);
    if (attachmentPresent) {
      console.log('  Composer empty but prompt landed as ATTACHMENT (Extended mode). Accepting.');
      return;
    }
    throw new Error(
      `Prompt did not land in ChatGPT composer. Got ${actualLen} chars, expected ~${expectedLen}. ` +
      `No attachment chip detected either. The Lexical composer rejected paste-event and keyboard.insertText. ` +
      `Inspect the composer manually — selector or behavior may have changed.`
    );
  }
}

// Look for the "Extended-mode" attachment chip that ChatGPT creates when a
// long paste is auto-converted into a text file. Match on the leading 12-20
// characters of the prompt — that's what ChatGPT shows on the chip preview.
async function detectPastedAttachment(page: Page, text: string): Promise<boolean> {
  const preview = text.slice(0, 12).trim();
  if (!preview) return false;
  return await page.evaluate((needle: string) => {
    // 1. Search for any element whose text begins with the prompt's first chars
    //    (the chip preview), inside the composer area / above the text input.
    const all = Array.from(document.querySelectorAll('div, span, button, a'));
    return all.some(el => {
      const t = (el.textContent || '').trim();
      if (!t) return false;
      // Chip text is typically a short truncation like "Act as a pre.."
      // Match if first 10 chars line up
      return t.length < 100 && t.startsWith(needle.slice(0, 10));
    });
  }, preview);
}

async function readComposerLength(composer: ReturnType<Page['locator']>): Promise<number> {
  return await composer.evaluate((el: Element) => ((el as HTMLElement).textContent || (el as HTMLElement).innerText || '').length);
}
