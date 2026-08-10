/**
 * rotation-health-check.ts — did today's cron-driven posting & blog runs happen?
 *
 * Reads each rotation's own log for its "all done" marker and checks the date.
 * Writes .sessions/rotation-health.json, which the login-api /admin-status
 * endpoint serves to the admin dashboard so a silent miss is VISIBLE.
 *
 * Run by cron a few times a day (see the deploy crontab). No side effects.
 */
import fs from 'fs';
import path from 'path';

const POST_LOG = process.env.POST_ROTATION_LOG || '/tmp/nightly-post-rotation.log';
const BLOG_LOG = process.env.BLOG_ROTATION_LOG || '/tmp/nightly-blog-rotation.log';
const OUT = path.resolve('.sessions/rotation-health.json');

function istDay(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Find the last line matching `marker` and return its ISO timestamp (logs are `[ISO] msg`). */
function lastMarkerTime(logFile: string, marker: RegExp): string | null {
  let text = '';
  try { text = fs.readFileSync(logFile, 'utf8'); } catch { return null; }
  const lines = text.split('\n').filter(l => marker.test(l));
  if (!lines.length) return null;
  const m = lines[lines.length - 1].match(/\[([0-9T:\-.]+Z)\]/);
  return m ? m[1] : null;
}

function status(logFile: string, doneMarker: RegExp, startMarker: RegExp) {
  const lastDoneIso = lastMarkerTime(logFile, doneMarker);
  const lastStartIso = lastMarkerTime(logFile, startMarker);
  const today = istDay();
  const doneToday = !!lastDoneIso && istDay(new Date(lastDoneIso)) === today;
  const startedToday = !!lastStartIso && istDay(new Date(lastStartIso)) === today;
  return {
    lastCompleted: lastDoneIso,
    lastStarted: lastStartIso,
    // ok = it finished today; running = started today but not finished yet;
    // missed = neither started nor finished today.
    state: doneToday ? 'ok' : startedToday ? 'running' : 'missed',
  };
}

const health = {
  checkedAt: new Date().toISOString(),
  istDay: istDay(),
  posting: status(POST_LOG, /Both rounds done|all manual runs finished/i, /rotation starting|Round 1 starting/i),
  blog: status(BLOG_LOG, /Both cycles done/i, /rotation starting|Cycle 1 starting/i),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(health, null, 2));
console.log(`[health] posting=${health.posting.state} blog=${health.blog.state} → ${OUT}`);
