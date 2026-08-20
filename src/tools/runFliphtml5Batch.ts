/**
 * runFliphtml5Batch.ts — Run one FlipHTML5 posting batch.
 *
 * Usage:
 *   npx tsx src/tools/runFliphtml5Batch.ts [batchNum]
 */
import 'dotenv/config';
import { runFliphtml5Batch } from '../coordinator/masterCoordinator.js';

const batchNum = parseInt(process.argv[2] || '1', 10);

runFliphtml5Batch(batchNum)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ FlipHTML5 batch failed:', err.message);
    process.exit(1);
  });
