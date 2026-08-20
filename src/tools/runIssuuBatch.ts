/**
 * runIssuuBatch.ts — Run one Issuu posting batch.
 *
 * Usage:
 *   npx tsx src/tools/runIssuuBatch.ts [batchNum]
 */
import 'dotenv/config';
import { runIssuuBatch } from '../coordinator/masterCoordinator.js';

const batchNum = parseInt(process.argv[2] || '1', 10);

runIssuuBatch(batchNum)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Issuu batch failed:', err.message);
    process.exit(1);
  });
