/**
 * diagnostics.ts — per-batch failure diagnostics.
 *
 * Every platform batch function collects its row failures into a list, then
 * prints (and appends to logs/diagnostics.log) one line per failure in the
 * format:  <platform> - <account> - <short reason>
 * e.g.     fb - abhinav 4 - account fail / locator not found
 *
 * This runs after EVERY batch call — standalone CLI runs and scheduler stages
 * alike — so there's always a clear "what broke, on which account" summary
 * without having to dig through raw error messages.
 */

import fs from 'fs';
import path from 'path';

const LOG_FILE = path.resolve('logs/diagnostics.log');

export interface FailureEntry { account: string; reason: string; }

/** Turns a raw error message into a short, consistent human label. */
export function classifyFailure(message: string | undefined): string {
  if (!message) return 'unknown error';
  const m = message.toLowerCase();
  if (/waiting for locator|waitforselector|timeout \d+ms exceeded/.test(m)) return 'locator not found (timeout)';
  if (/not found in credentials|account .* not found|no active .* session|session not (valid|found)|no session/.test(m)) return 'account not found / no session';
  if (/login failed|not logged in|unable to log in|authentication failure/.test(m)) return 'login failed';
  if (/wrong password|bad credentials|incorrect password/.test(m)) return 'bad credentials';
  if (/banned|suspended|restricted|checkpoint|disabled/.test(m)) return 'account banned/restricted';
  if (/no blog content|content empty|generated content empty/.test(m)) return 'no content to post';
  if (/target page, context or browser has been closed/.test(m)) return 'browser closed unexpectedly';
  if (/credits exhausted|no credits|402/.test(m)) return 'API credits exhausted';
  return message.slice(0, 100);
}

/** Records one row failure into a batch's local failure list (call at every failure point). */
export function addFailure(list: FailureEntry[], account: string, rawMessage: string | undefined): void {
  list.push({ account: account || 'unknown', reason: classifyFailure(rawMessage) });
}

/** Prints + persists the diagnostic summary for one platform's batch run. */
export function printDiagnostics(platformLabel: string, failures: FailureEntry[], posted: number, total: number): void {
  if (failures.length === 0) {
    console.log(`📋 [DIAGNOSTIC] ${platformLabel}: ${posted}/${total} posted — no failures`);
    return;
  }
  const tag = platformLabel.toLowerCase();
  console.log(`📋 [DIAGNOSTIC] ${platformLabel}: ${posted}/${total} posted, ${failures.length} failed:`);
  const lines = failures.map(f => `${tag} - ${f.account} - ${f.reason}`);
  for (const line of lines) console.log(`   ${line}`);

  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, lines.map(l => `${ts} ${l}`).join('\n') + '\n');
  } catch { /* non-critical */ }
}
