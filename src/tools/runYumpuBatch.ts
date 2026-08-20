/**
 * runYumpuBatch.ts — Run one Yumpu posting batch.
 *
 * Usage:
 *   npx tsx src/tools/runYumpuBatch.ts [batchNum]
 */
import 'dotenv/config';
import { runYumpuBatch } from '../coordinator/masterCoordinator.js';

const batchNum = parseInt(process.argv[2] || '1', 10);

runYumpuBatch(batchNum)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Yumpu batch failed:', err.message);
    process.exit(1);
  });
