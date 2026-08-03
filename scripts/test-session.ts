/**
 * test-session.ts — validate a saved login session via the REAL poster login path.
 *
 * The dashboard's green dot only means cookie files exist on disk; the platform
 * can still reject them server-side. This launches the actual login flow the
 * scheduler uses and reports the truth.
 *
 * Usage:
 *   npx tsx scripts/test-session.ts linkedin "abhinav 4" "abhinav 7"
 *   npx tsx scripts/test-session.ts medium "abhinav 1"
 *   npx tsx scripts/test-session.ts x vishal vansh meenakshi hritika sameeksha
 *   npx tsx scripts/test-session.ts facebook vishal vansh meenakshi hritika sameeksha
 *
 * ⚠️ Run during a stage gap (scheduler-status.json phase=waiting) — it uses the
 * same Chrome profiles as the live batches and will kill their browser mid-post.
 */
import 'dotenv/config';

const [platform, ...nicknames] = process.argv.slice(2);
if (!platform || nicknames.length === 0) {
  console.log('Usage: npx tsx scripts/test-session.ts <linkedin|medium|x|facebook> <nickname> [nickname...]');
  process.exit(1);
}

const mods: Record<string, () => Promise<{ login: (o: any) => Promise<any>; close: () => Promise<void> }>> = {
  linkedin: async () => {
    const m = await import('../src/browser/linkedin/login.js');
    return { login: (o) => m.loginToLinkedIn(o), close: () => m.closeLinkedInBrowser() };
  },
  medium: async () => {
    const m = await import('../src/browser/medium/login.js');
    return { login: (o) => m.loginToMedium(o), close: () => m.closeMediumBrowser() };
  },
  x: async () => {
    const m = await import('../src/browser/twitter/login.js');
    const { getAccountByHandle } = await import('../src/config/accounts.js');
    return {
      login: (o) => {
        const account = o.nickname ? getAccountByHandle(o.nickname) : undefined;
        if (o.nickname && !account) throw new Error(`X account "${o.nickname}" not found in accounts.json`);
        return m.loginToX(account);
      },
      close: () => m.closeBrowser(),
    };
  },
  facebook: async () => {
    const m = await import('../src/browser/facebook/login.js');
    return { login: (o) => m.loginToFacebook(o), close: () => m.closeFacebookBrowser() };
  },
};

const factory = mods[platform.toLowerCase()];
if (!factory) { console.log(`Unsupported platform "${platform}". Supported: ${Object.keys(mods).join(', ')}`); process.exit(1); }

const { login, close } = await factory();
let failures = 0;
for (const nick of nicknames) {
  try {
    const page = await login({ nickname: nick });
    const url = typeof page?.url === 'function' ? page.url() : '(no page url)';
    console.log(`RESULT ${nick}: LOGGED IN ✅  (${String(url).slice(0, 60)})`);
  } catch (e: any) {
    failures++;
    console.log(`RESULT ${nick}: FAILED ❌ — ${String(e.message).slice(0, 110)}`);
  } finally {
    try { await close(); } catch { /* ignore */ }
  }
}
process.exit(failures ? 1 : 0);
