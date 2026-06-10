/**
 * restore-cookies.ts — Restore .sessions-cookies/ from GitHub Secret chunks
 *
 * Reads COOKIES_X_1..N, COOKIES_FB_1..N, COOKIES_LI_1..N env vars,
 * decodes them, and writes individual JSON files to .sessions-cookies/
 *
 * Run by GitHub Actions before posting.
 */

import fs from 'fs';
import path from 'path';

const OUT_DIR = '.sessions-cookies';

function restorePlatform(prefix: string): number {
  let combined = '';
  for (let i = 1; i <= 10; i++) {
    const chunk = process.env[`COOKIES_${prefix}_${i}`];
    if (!chunk) break;
    combined += chunk;
  }

  if (!combined) {
    console.log(`  ⚠️  No COOKIES_${prefix}_* env vars found`);
    return 0;
  }

  const data: Record<string, any> = JSON.parse(Buffer.from(combined, 'base64').toString('utf8'));
  let count = 0;

  for (const [name, state] of Object.entries(data)) {
    const file = path.join(OUT_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(state));
    count++;
  }

  console.log(`  ✅ ${prefix}: restored ${count} cookie files`);
  return count;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('[restore-cookies] Restoring sessions from GitHub Secrets...');
restorePlatform('X');
restorePlatform('FB');
restorePlatform('LI');
console.log('[restore-cookies] Done.');
