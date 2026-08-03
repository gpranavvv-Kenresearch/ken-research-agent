import 'dotenv/config';
import { runCoordinatorOnce } from '../src/scheduler-new.js';

async function main() {
  if (process.env.WORKER_NAME !== 'krishi') {
    throw new Error('Refusing to run — WORKER_NAME must be "krishi" for this script.');
  }
  console.log('Starting one full 5-stage posting cycle for Krishi...');
  await runCoordinatorOnce('.sessions/scheduler-status-krishi.json');
  console.log('Krishi full cycle complete.');
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
