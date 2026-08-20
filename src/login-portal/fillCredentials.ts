/**
 * fillCredentials.ts — best-effort login-form auto-fill for the portal.
 *
 * The portal used to make a human type every credential over a laggy ~10fps
 * screencast. This fills the standard username/password fields on the pool's
 * live CDP page so the operator sees an already-submitted form and only has to
 * step in when a real challenge (2FA / CAPTCHA / "verify it's you") appears.
 *
 * Deliberately BEST-EFFORT: every step is wrapped, nothing throws, and a missing
 * field just leaves that step for the human — auto-fill is an accelerator on top
 * of the existing manual screencast, never a correctness-critical path. Selectors
 * mirror the ones already used in the matching src/browser/<platform>/login.ts.
 */

import { Page, Locator } from 'playwright';
import { FleetCredentials } from './sessionResolver.js';

interface LoginForm {
  user: string;                 // username/email field selector(s), comma-OR
  userValue: (c: FleetCredentials) => string | undefined;
  next?: string;                // optional "Next/Continue" between user and password
  pass: string;                 // password field selector(s)
  submit: string;               // final submit button selector(s)
}

// Only platforms with a real username+password login. OAuth/OTP/magic-link
// platforms (medium, substack, note, devto, googlesite, blogger, linkmate,
// calisthenics) are intentionally absent — they fall through to manual.
const FORMS: Record<string, LoginForm> = {
  x: {
    // X serves TWO login forms depending on client: the modern multi-step flow
    // (input[name="text"] → Next → password) AND a legacy single-page form
    // (input[name="username_or_email"] + password together). Match both.
    user: 'input[name="username_or_email"], input[name="text"], input[autocomplete="username"]',
    userValue: c => c.username || c.handle,
    next: 'button:has-text("Next"), button:has-text("Continue"), div[role="button"]:has-text("Next"), div[role="button"]:has-text("Continue")',
    pass: 'input[name="password"], input[autocomplete="current-password"]',
    submit: 'div[data-testid="LoginForm_Login_Button"], input[type="submit"], div[role="button"]:has-text("Log in"), button:has-text("Log in")',
  },
  // NOTE: keys MUST match the platform keys in login-portal/config.ts — the portal
  // calls fillCredentials(page, <configKey>, …). Facebook is 'fb', LinkedIn is 'li'.
  fb: {
    user: 'input#email, input[name="email"]',
    userValue: c => c.email,
    pass: 'input#pass, input[name="pass"]',
    submit: 'button[name="login"], button[type="submit"]',
  },
  li: {
    user: 'input#username, input[name="session_key"]',
    userValue: c => c.email,
    pass: 'input#password, input[name="session_password"]',
    submit: 'button[type="submit"]',
  },
  instagram: {
    user: 'input[name="username"]',
    userValue: c => c.username || c.email,
    pass: 'input[name="password"]',
    submit: 'button[type="submit"]',
  },
  hackmd: {
    user: 'input[name="email"], input#email',
    userValue: c => c.email,
    pass: 'input[name="password"], input#password',
    submit: 'button[type="submit"]',
  },
  wordpress: {
    user: 'input#user_login, input[name="log"]',
    userValue: c => c.email,
    pass: 'input#user_pass, input[name="pwd"]',
    submit: 'input#wp-submit, button[type="submit"]',
  },
  notion: {
    user: 'input[type="email"]',
    userValue: c => c.email,
    next: 'div[role="button"]:has-text("Continue"), button:has-text("Continue")',
    pass: 'input[type="password"]',
    submit: 'div[role="button"]:has-text("Continue"), button:has-text("Continue"), button[type="submit"]',
  },
};

/** First VISIBLE element matching selector, polling up to timeoutMs. Null if none.
 *  Pages like X render duplicate hidden forms; .first() can grab the hidden one,
 *  so the human sees an empty field. Always act on what's actually on screen. */
async function firstVisible(page: Page, selector: string, timeoutMs: number): Promise<Locator | null> {
  const loc = page.locator(selector);
  const deadline = Date.now() + timeoutMs;
  do {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) return el;
    }
    await page.waitForTimeout(400);
  } while (Date.now() < deadline);
  return null;
}

/**
 * Fill the login form's user+password fields. Returns true if it got them in.
 *
 * `opts.submit` (default true): press Enter / click the submit button. Pass
 * false when CDP is only attached briefly to type creds and will DETACH before
 * the human acts — then the human does the submit + any challenge over real VNC,
 * so no anti-bot check (Arkose etc.) ever runs while CDP is attached. Any
 * multi-step "Next" click needed to reveal the password field still happens
 * regardless (that's part of filling, not the final submit).
 */
export async function fillCredentials(
  page: Page,
  platform: string,
  creds: FleetCredentials,
  opts: { submit?: boolean } = {},
): Promise<boolean> {
  const submit = opts.submit ?? true;
  const form = FORMS[platform];
  if (!form) return false;                 // platform not auto-fillable
  const user = form.userValue(creds);
  if (!user || !creds.password) return false; // credentials not populated → manual
  const log = (m: string) => console.log(`   [autofill:${platform}] ${m}`);

  // Patient by default — on a loaded 2-vCPU box the login page can render slowly,
  // and a short timeout was silently giving up ("no response"). A little delay is
  // acceptable; a dead form is not.
  const FIELD_MS = 25000; // wait for a field to appear
  const STEP_MS = 10000;  // wait for a click/step

  try {
    log('starting auto-fill…');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1200); // let the login widget mount

    const userEl = await firstVisible(page, form.user, FIELD_MS);
    if (!userEl) { log('username field never appeared — manual takeover'); return false; }
    await userEl.fill(user);
    log('username filled');

    // Advance a step only if the password field isn't already visible. Some forms
    // (most blog logins) show user+pass together; X's modal reveals password after
    // clicking "Continue"/"Next" (or Enter in the username field).
    let passEl = await firstVisible(page, form.pass, 1500);
    if (!passEl && form.next) {
      const nextBtn = await firstVisible(page, form.next, 2500);
      if (nextBtn) await nextBtn.click({ timeout: STEP_MS }).catch(() => userEl.press('Enter').catch(() => {}));
      else await userEl.press('Enter').catch(() => {});
      await page.waitForTimeout(2500); // let the password step render
      passEl = await firstVisible(page, form.pass, FIELD_MS);
    }
    if (!passEl) { log('password field never appeared — manual takeover'); return false; }
    await passEl.fill(creds.password);
    log('password filled');

    if (!submit) {
      log('creds filled, submit left to the human (VNC) — CDP detaching');
      return true;
    }

    // Submit. Enter in the password field reliably submits single-page login
    // forms; also click a visible submit button if present.
    await passEl.press('Enter').catch(() => {});
    const submitBtn = await firstVisible(page, form.submit, 2000);
    if (submitBtn) await submitBtn.click({ timeout: STEP_MS }).catch(() => {});
    log('submitted — credentials in, any challenge is now the human\'s to finish');
    return true;
  } catch (e: any) {
    // Couldn't complete (selector changed, extra step, challenge already up) →
    // the human finishes on the screencast. Never throw.
    log(`could not complete auto-fill, manual takeover: ${e?.message?.slice(0, 80)}`);
    return false;
  }
}
