/**
 * open-login.ts — open the real browser for one account and LEAVE IT OPEN.
 *
 * Unlike test-session.ts (which closes the browser right after checking),
 * this keeps the window up so you can see whether it's logged in and, if
 * not, log in manually yourself. The session saves automatically to the
 * same persistent Chrome profile the scheduler uses — no extra step needed.
 *
 * Usage:
 *   npx tsx scripts/open-login.ts x vishal
 *   npx tsx scripts/open-login.ts facebook vansh
 *   npx tsx scripts/open-login.ts linkedin meenakshi
 *   npx tsx scripts/open-login.ts medium hritika
 *
 * When done logging in, just press Ctrl+C to exit this script.
 */
import 'dotenv/config';
import readline from 'readline';

const [platform, nickname] = process.argv.slice(2);
if (!platform || !nickname) {
  console.log('Usage: npx tsx scripts/open-login.ts <x|facebook|linkedin|medium> <nickname>');
  process.exit(1);
}

const mods: Record<string, () => Promise<{ login: (o: any) => Promise<any> }>> = {
  linkedin: async () => {
    const m = await import('../src/browser/linkedin/login.js');
    return { login: (o) => m.loginToLinkedIn(o) };
  },
  medium: async () => {
    const m = await import('../src/browser/medium/login.js');
    return { login: (o) => m.loginToMedium(o) };
  },
  x: async () => {
    const m = await import('../src/browser/twitter/login.js');
    const { getAccountByHandle } = await import('../src/config/accounts.js');
    return {
      login: (o) => {
        const account = getAccountByHandle(o.nickname);
        if (!account) throw new Error(`X account "${o.nickname}" not found in accounts.json`);
        return m.loginToX(account);
      },
    };
  },
  facebook: async () => {
    const m = await import('../src/browser/facebook/login.js');
    return { login: (o) => m.loginToFacebook(o) };
  },
  notion: async () => {
    const m = await import('../src/browser/notion/login.js');
    return { login: (o) => m.loginToNotion(o) };
  },
  googlesite: async () => {
    const m = await import('../src/browser/googlesite/login.js');
    return { login: (o) => m.loginToGoogleSite(o) };
  },
};

const factory = mods[platform.toLowerCase()];
if (!factory) { console.log(`Unsupported platform "${platform}". Supported: ${Object.keys(mods).join(', ')}`); process.exit(1); }

const { login } = await factory();
try {
  const page = await login({ nickname });
  const url = typeof page?.url === 'function' ? page.url() : '(no page url)';
  console.log(`✅ ${nickname} appears LOGGED IN on ${platform}. Current URL: ${url}`);
} catch (e: any) {
  console.log(`⚠️  ${nickname} is NOT logged in on ${platform} — ${e.message}`);
  console.log('   Note: some platforms (e.g. LinkedIn on 2FA) close the failed browser automatically.');
  console.log('   If the window is gone, just re-run this same command — it will reopen at the login page.');
  console.log('   If the window is still open, log in manually now — it saves automatically.');
}

await new Promise<void>((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('\nPress Enter when done to close and exit... ', () => { rl.close(); resolve(); });
});
process.exit(0);
