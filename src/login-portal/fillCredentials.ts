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

import { Page } from 'playwright';
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
  facebook: {
    user: 'input#email, input[name="email"]',
    userValue: c => c.email,
    pass: 'input#pass, input[name="pass"]',
    submit: 'button[name="login"], button[type="submit"]',
  },
  linkedin: {
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
  paragraph: {
    user: 'input[type="email"]',
    userValue: c => c.email,
    pass: 'input[type="password"]',
    submit: 'button[type="submit"]',
  },
  ameba: {
    user: 'input[name="accountId"], input#login-id, input[type="email"]',
    userValue: c => c.email,
    pass: 'input[name="password"], input[type="password"]',
    submit: 'button[type="submit"]',
  },
  patreon: {
    user: 'input[name="email"], input[type="email"]',
    userValue: c => c.email,
    pass: 'input[name="password"], input[type="password"]',
    submit: 'button[type="submit"]',
  },
};

/** Returns true if it filled+submitted a form, false if it left the login to the human. */
export async function fillCredentials(page: Page, platform: string, creds: FleetCredentials): Promise<boolean> {
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

    const userEl = page.locator(form.user).first();
    await userEl.waitFor({ state: 'visible', timeout: FIELD_MS });
    await userEl.fill(user);
    log('username filled');

    const passEl = page.locator(form.pass).first();
    // Only advance a step if the password field isn't already on the page. Some
    // forms (X's legacy single-page form, most blog logins) show user+pass
    // together; others (X multi-step, Notion) reveal the password after a click.
    const passAlreadyThere = await passEl.isVisible().catch(() => false);
    if (!passAlreadyThere && form.next) {
      const nextBtn = page.locator(form.next).first();
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click({ timeout: STEP_MS }).catch(() => userEl.press('Enter').catch(() => {}));
      } else {
        await userEl.press('Enter').catch(() => {});
      }
      await page.waitForTimeout(2500); // let the password step render
    }

    await passEl.waitFor({ state: 'visible', timeout: FIELD_MS });
    await passEl.fill(creds.password);
    log('password filled');

    const submitBtn = page.locator(form.submit).first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click({ timeout: STEP_MS }).catch(() => passEl.press('Enter').catch(() => {}));
    } else {
      await passEl.press('Enter').catch(() => {});
    }
    log('submitted — credentials in, any challenge is now the human\'s to finish');
    return true;
  } catch (e: any) {
    // Couldn't complete (selector changed, extra step, challenge already up) →
    // the human finishes on the screencast. Never throw.
    log(`could not complete auto-fill, manual takeover: ${e?.message?.slice(0, 80)}`);
    return false;
  }
}
