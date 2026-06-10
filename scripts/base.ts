import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec';
export const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');

export function ensureArtifactsDir() {
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

export interface StepError {
  step: string;
  action: string;
  expected: string;
  actual: string;
  message: string;
  timestamp: string;
}

export function writeResumeFile(script: string, failedStep: string, error: string, args: Record<string, unknown>) {
  ensureArtifactsDir();
  const resume = {
    script,
    failedStep,
    error,
    args,
    screenshotPath: path.join(ARTIFACTS_DIR, 'screenshot.png'),
    domPath: path.join(ARTIFACTS_DIR, 'dom-snapshot.html'),
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'resume.json'), JSON.stringify(resume, null, 2));
}

export async function saveArtifacts(page: Page, stepName: string, error: Error | string) {
  ensureArtifactsDir();
  const msg = typeof error === 'string' ? error : error.message;

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot.png'), fullPage: false }).catch(() => {});

  const html = await page.content().catch(() => '');
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'dom-snapshot.html'), html);

  const errorObj: StepError = {
    step: stepName,
    action: '',
    expected: '',
    actual: await page.title().catch(() => ''),
    message: msg,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'error.json'), JSON.stringify(errorObj, null, 2));

  console.error(`[FAIL] Step: ${stepName} | ${msg}`);
}

// Try multiple selectors, return first match
export async function findElement(page: Page, selectors: string[], timeout = 8000) {
  for (const sel of selectors) {
    try {
      const el = await page.waitForSelector(sel, { timeout });
      if (el) return el;
    } catch {}
  }
  return null;
}

// Paste text via clipboard inject + Ctrl+V
export async function pasteText(page: Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(500);
}

// Close all extra tabs, keep only current
export async function closeExtraTabs(page: Page) {
  const ctx = page.context();
  const pages = ctx.pages();
  for (const p of pages) {
    if (p !== page) await p.close().catch(() => {});
  }
}

// POST result to Apps Script
export async function postToSheet(payload: object): Promise<void> {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log('[SHEET]', text);
}

// Dismiss common X popups/modals after login
export async function dismissXPopups(page: Page) {
  const dismissSelectors = [
    '[data-testid="app-bar-close"]',
    '[aria-label="Close"]',
    '[data-testid="confirmationSheetCancel"]',
    '[data-testid="sheetDialog"] button[data-testid="app-bar-close"]',
    'div[role="dialog"] button[aria-label="Close"]',
  ];
  for (const sel of dismissSelectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // Dismiss browser notification popup
  await page.evaluate(() => {
    if (window.Notification) {
      Object.defineProperty(Notification, 'permission', { get: () => 'denied' });
    }
  }).catch(() => {});
}
