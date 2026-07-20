/**
 * config.ts — Login Portal configuration
 *
 * The login portal ("login-api") is a small Express server that runs on the VPS
 * alongside the pm2 `scheduler`. It lets the Vercel dashboard drive a real Chrome
 * browser (on an ephemeral virtual display) so a team member can log in to their
 * platform accounts; the resulting session is stored where the scheduler reads it.
 *
 * See PLAN: Self-Service Session-Login Portal.
 */

export interface PortalPlatform {
  key: string;           // short key used in the session-dir name (e.g. x, medium)
  label: string;         // human label for the dashboard
  group: 'social' | 'blog' | 'engine';
  loginUrl: string;      // URL Chrome opens for the login
  homeUrl?: string;      // logged-in landing page (reveals the stored account) for "View session";
                         // falls back to loginUrl, which usually redirects to home when logged in.
  registryFile: string;  // .accounts/*.json the scheduler reads (relative to repo root)
  authCookies: string[]; // post-login cookie NAMES; a trailing '*' means prefix match.
                         // Any present ⇒ logged in (distinguishes real login from guest cookies).
}

/**
 * Every platform the portal can log into. Social first, then blog platforms.
 * Note: LinkedIn Pulse reuses the `li` (LinkedIn) session, so it needs no tile.
 * authCookies are best-known session cookies; niche platforms may be approximate
 * (the login itself always works regardless of badge accuracy).
 */
export const PLATFORMS: Record<string, PortalPlatform> = {
  // ── Social ──
  x:  { key: 'x',  label: 'X (Twitter)', group: 'social', loginUrl: 'https://x.com/login',                homeUrl: 'https://x.com/home',                        registryFile: '.accounts/accounts.json',          authCookies: ['auth_token'] },
  fb: { key: 'fb', label: 'Facebook',    group: 'social', loginUrl: 'https://www.facebook.com/login',      homeUrl: 'https://www.facebook.com/me',               registryFile: '.accounts/facebook-accounts.json', authCookies: ['c_user'] },
  li: { key: 'li', label: 'LinkedIn',    group: 'social', loginUrl: 'https://www.linkedin.com/login',      homeUrl: 'https://www.linkedin.com/feed/',            registryFile: '.accounts/linkedin-accounts.json', authCookies: ['li_at'] },

  // ── Blog ──
  medium:       { key: 'medium',       label: 'Medium',       group: 'blog', loginUrl: 'https://medium.com/m/signin',    homeUrl: 'https://medium.com/',                      registryFile: '.accounts/accounts-medium.json',       authCookies: ['sid', 'uid'] },
  notion:       { key: 'notion',       label: 'Notion',       group: 'blog', loginUrl: 'https://app.notion.com/login',   homeUrl: 'https://app.notion.com/',                  registryFile: '.accounts/accounts-notion.json',       authCookies: ['token_v2'] },
  substack:     { key: 'substack',     label: 'Substack',     group: 'blog', loginUrl: 'https://substack.com/sign-in',   homeUrl: 'https://substack.com/home',                registryFile: '.accounts/accounts-substack.json',     authCookies: ['substack.sid', 'connect.sid'] },
  hackmd:       { key: 'hackmd',       label: 'HackMD',       group: 'blog', loginUrl: 'https://hackmd.io/login',        homeUrl: 'https://hackmd.io/?nav=overview',          registryFile: '.accounts/accounts-hackmd.json',       authCookies: ['connect.sid'] },
  devto:        { key: 'devto',        label: 'Dev.to',       group: 'blog', loginUrl: 'https://dev.to/enter',           homeUrl: 'https://dev.to/dashboard',                 registryFile: '.accounts/accounts-devto.json',        authCookies: ['_Devto_Forem_Session'] },
  wordpress:    { key: 'wordpress',    label: 'WordPress',    group: 'blog', loginUrl: 'https://wordpress.com/log-in',   homeUrl: 'https://wordpress.com/home',               registryFile: '.accounts/accounts-wordpress.json',    authCookies: ['wordpress_logged_in*'] },
  blogger:      { key: 'blogger',      label: 'Blogger',      group: 'blog', loginUrl: 'https://www.blogger.com/',       homeUrl: 'https://www.blogger.com/',                 registryFile: '.accounts/accounts-blogger.json',      authCookies: ['SID', '__Secure-1PSID'] },
  googlesite:   { key: 'googlesite',   label: 'Google Sites', group: 'blog', loginUrl: 'https://sites.google.com/new',   homeUrl: 'https://sites.google.com/',                registryFile: '.accounts/accounts-googlesite.json',   authCookies: ['SID', '__Secure-1PSID'] },
  note:         { key: 'note',         label: 'Note',         group: 'blog', loginUrl: 'https://note.com/login',         homeUrl: 'https://note.com/',                        registryFile: '.accounts/accounts-note.json',         authCookies: ['_note_session_v5', 'note_gql_web_session'] },
  paragraph:    { key: 'paragraph',    label: 'Paragraph',    group: 'blog', loginUrl: 'https://paragraph.com/home',     homeUrl: 'https://paragraph.com/home',               registryFile: '.accounts/accounts-paragraph.json',    authCookies: ['privy-token', 'privy-session'] },
  patreon:      { key: 'patreon',      label: 'Patreon',      group: 'blog', loginUrl: 'https://www.patreon.com/login',  homeUrl: 'https://www.patreon.com/dashboard',        registryFile: '.accounts/accounts-patreon.json',      authCookies: ['session_id'] },
  calisthenics: { key: 'calisthenics', label: 'Calisthenics', group: 'blog', loginUrl: 'https://calisthenics.mn.co/',    homeUrl: 'https://calisthenics.mn.co/',              registryFile: '.accounts/accounts-calisthenics.json', authCookies: ['_session_id'] },
  linkmate:     { key: 'linkmate',     label: 'Linkmate',     group: 'blog', loginUrl: 'https://linkmate.mn.co/',        homeUrl: 'https://linkmate.mn.co/',                  registryFile: '.accounts/accounts-linkmate.json',     authCookies: ['_session_id'] },
  ameba:        { key: 'ameba',        label: 'Ameba',        group: 'blog', loginUrl: 'https://ameba.jp/login',         homeUrl: 'https://www.ameba.jp/home',                registryFile: '.accounts/accounts-ameba.json',        authCookies: ['user_session1', 'asauth'] },

  // ── Engine (blog generation, not a posting target) ──
  // ChatGPT session used by generate_blog_chatgpt.ts to write the article HTML.
  chatgpt: { key: 'chatgpt', label: 'ChatGPT (blog writer)', group: 'engine', loginUrl: 'https://chatgpt.com/', registryFile: '.accounts/chatgpt-accounts.json', authCookies: ['__Secure-next-auth.session-token', '__Secure-next-auth.session-token*'] },
  // Separate ChatGPT session used by generate_image.ts for cover-image generation —
  // a distinct profile so image generation can run concurrently with the blog writer above.
  'chatgpt-image': { key: 'chatgpt-image', label: 'ChatGPT (image gen)', group: 'engine', loginUrl: 'https://chatgpt.com/', registryFile: '.accounts/chatgpt-image-accounts.json', authCookies: ['__Secure-next-auth.session-token', '__Secure-next-auth.session-token*'] },
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS);

/**
 * Fixed pool of ephemeral virtual displays for concurrent logins.
 * Display :99 is reserved for the legacy shared noVNC — the pool starts at :100.
 * Cap = 5 simultaneous logins (see plan). Each slot gets its own x11vnc port.
 */
export interface DisplaySlotDef {
  display: string;  // e.g. ":100"
  vncPort: number;  // x11vnc rfbport, localhost-only
}

export const DISPLAY_POOL: DisplaySlotDef[] = [
  { display: ':100', vncPort: 5910 },
  { display: ':101', vncPort: 5911 },
  { display: ':102', vncPort: 5912 },
  { display: ':103', vncPort: 5913 },
  { display: ':104', vncPort: 5914 },
];

/**
 * Pool for the CDP-based login flow (cdpLoginPool.ts) — replaces DISPLAY_POOL's
 * Xvfb+x11vnc slots. No X server involved: each slot is just a pair of ports —
 * one for headless Chrome's own remote-debugging endpoint (never exposed
 * publicly, localhost only), one for that login's screencast viewer (the one
 * actually reachable from the dashboard). Same capacity (5) as the old pool.
 */
export interface ScreencastPortSlot {
  debugPort: number;  // Chrome's --remote-debugging-port, localhost only
  viewerPort: number; // the screencast HTTP+WS server for this slot
}

export const SCREENCAST_PORT_POOL: ScreencastPortSlot[] = [
  { debugPort: 9300, viewerPort: 7910 },
  { debugPort: 9301, viewerPort: 7911 },
  { debugPort: 9302, viewerPort: 7912 },
  { debugPort: 9303, viewerPort: 7913 },
  { debugPort: 9304, viewerPort: 7914 },
];

/** Single shared websockify (token-plugin) that fronts every display's VNC port. */
export const WEBSOCKIFY_PORT = Number(process.env.LOGIN_WS_PORT || 6090);

/** Express API port (localhost only; fronted by Nginx + Tailscale Funnel). */
export const API_PORT = Number(process.env.LOGIN_API_PORT || 8090);

/** Directory where per-login websockify token files are written. */
export const TOKEN_DIR = process.env.LOGIN_TOKEN_DIR || '/tmp/login-portal-tokens';

/** Per-login token time-to-live (ms) before the watchdog force-tears-down. */
export const LOGIN_TTL_MS = 10 * 60 * 1000;

/** Public base URL the browser uses to reach noVNC (set once the tunnel is known). */
export const PUBLIC_BASE_URL = process.env.LOGIN_PUBLIC_URL || '';

/** Path to the Chrome/Chromium binary (matches the rest of the repo's CHROME_PATH). */
export const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';

/** noVNC static web root (installed via apt `novnc`). */
export const NOVNC_WEB_ROOT = process.env.NOVNC_WEB_ROOT || '/usr/share/novnc/';
