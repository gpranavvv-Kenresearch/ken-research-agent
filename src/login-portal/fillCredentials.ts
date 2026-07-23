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
    user: 'input[name="text"], input[autocomplete="username"]',
    userValue: c => c.username || c.handle,
    next: 'button:has-text("Next"), div[role="button"]:has-text("Next")',
    pass: 'input[name="password"], input[autocomplete="current-password"]',
    submit: 'div[role="button"]:has-text("Log in"), button:has-text("Log in")',
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

  try {
    const userEl = page.locator(form.user).first();
    await userEl.waitFor({ state: 'visible', timeout: 8000 });
    await userEl.fill(user);
    log('username filled');

    if (form.next) {
      try {
        await page.locator(form.next).first().click({ timeout: 4000 });
        await page.waitForTimeout(1500); // let the password step render
      } catch { /* single-page form — password already present */ }
    }

    const passEl = page.locator(form.pass).first();
    await passEl.waitFor({ state: 'visible', timeout: 8000 });
    await passEl.fill(creds.password);
    log('password filled');

    try {
      await page.locator(form.submit).first().click({ timeout: 4000 });
      log('submitted');
    } catch {
      await passEl.press('Enter').catch(() => {}); // fallback: Enter in the password field
      log('submitted (Enter)');
    }
    return true;
  } catch (e: any) {
    // Any miss (selector changed, extra step, challenge already up) → hand off to
    // the human on the screencast. Never throw.
    log(`stopped, manual takeover: ${e?.message?.slice(0, 80)}`);
    return false;
  }
}
