/**
 * LinkedIn Pulse Login
 * Reuses LinkedIn login — Pulse is a feature within LinkedIn
 */

import { loginToLinkedIn, closeLinkedInBrowser } from '../linkedin/login.js';
import type { Page } from 'playwright';

export async function loginToLinkedInPulse(nickname: string): Promise<Page> {
  console.log(`   [LinkedIn Pulse] Using LinkedIn login for account: ${nickname}`);
  const page = await loginToLinkedIn({ nickname });

  // A confirmed-logged-in session going straight into a multi-step publish
  // flow (fill title, paste body, click Next, click Publish) with zero gap
  // is the exact pattern LinkedIn's automation detection flags — confirmed
  // live: a real account's li_at got server-revoked immediately after this
  // sequence, while every other session cookie stayed intact (server-side
  // kill, not a local write bug). A short idle pause before acting — closer
  // to a human landing on the feed and reading for a bit before writing —
  // is the mitigation; it costs a few seconds per post, not per-account
  // hours, so it doesn't change throughput meaningfully.
  const settleMs = 8000 + Math.floor(Math.random() * 12000); // 8-20s
  console.log(`   [LinkedIn Pulse] Settling ${Math.round(settleMs / 1000)}s before composing...`);
  await page.waitForTimeout(settleMs);

  // Navigate to LinkedIn article composer
  console.log('   [LinkedIn Pulse] Navigating to article composer...');
  await page.goto('https://www.linkedin.com/article/new/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  return page;
}

export async function closeLinkedInPulseBrowser(): Promise<void> {
  console.log('   [LinkedIn Pulse] Closing browser...');
  await closeLinkedInBrowser();
}
