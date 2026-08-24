/**
 * runVelogBatch.ts — Run one Velog posting batch.
 * Picks up to 2 blog-sheet rows via the shared 2-slot blog model
 * (getRowsForContinuousVelogPosting), posts each with its assigned
 * account, writes results back to the sheet.
 *
 * Usage:
 *   npx tsx src/tools/runVelogBatch.ts [batchNum]
 *   Example: npx tsx src/tools/runVelogBatch.ts 1
 */
import 'dotenv/config';
import { runVelogBatch } from '../coordinator/masterCoordinator.js';

const batchNum = parseInt(process.argv[2] || '1', 10);

runVelogBatch(batchNum)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Velog batch failed:', err.message);
    process.exit(1);
  });
