/**
 * runHatenaBatch.ts — Run one Hatena Bookmark posting batch.
 *
 * Usage:
 *   npx tsx src/tools/runHatenaBatch.ts [batchNum]
 */
import 'dotenv/config';
import { runHatenaBatch } from '../coordinator/masterCoordinator.js';

const batchNum = parseInt(process.argv[2] || '1', 10);

runHatenaBatch(batchNum)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Hatena batch failed:', err.message);
    process.exit(1);
  });
