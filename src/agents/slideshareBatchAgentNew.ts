/**
 * slideshareBatchAgentNew.ts — SlideShare Batch Posting Agent
 * Posts PPTX slideshows from up to 15 accounts SEQUENTIALLY.
 * Each account gets one row: generates slide content → builds PPTX → uploads.
 */

import type { SheetRow } from '../sheets/sheets.js';
import { loginToSlideShare, closeSlideShareBrowser, getSlideShareAccounts } from '../browser/slideshare/login.js';
import { postToSlideShare } from '../browser/slideshare/poster.js';
import { generateSlideShareContent } from './contentAgentNew.js';
import { generatePptx, cleanupPptx } from '../utils/pptGenerator.js';
import { UTM_PARAMS } from '../utils/utm.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface SlideShareBatchResult {
  posted: number;
  failed: number;
  results: Array<{
    nickname: string;
    success: boolean;
    postUrl?: string;
    error?: string;
  }>;
}

export async function runSlideShareBatchAgent(params: {
  rows: SheetRow[];
  batchNum: number;
}): Promise<SlideShareBatchResult> {
  const accounts = getSlideShareAccounts()
    .filter(a => a.active)
    .slice(0, 15);

  const result: SlideShareBatchResult = {
    posted: 0,
    failed: 0,
    results: [],
  };

  const limit = Math.min(accounts.length, params.rows.length);
  console.log(`[SlideShare Batch ${params.batchNum}] ${limit} accounts × ${limit} rows`);

  for (let i = 0; i < limit; i++) {
    const account  = accounts[i];
    const row      = params.rows[i];
    const nickname = account.nickname || account.email.split('@')[0];

    console.log(`\n[SlideShare] Account ${i + 1}/${limit}: ${nickname} — "${row.title}"`);

    let pptxPath: string | null = null;
    try {
      // 1. Generate slide content via LLM
      console.log('   Generating slide content...');
      const slideContent = await generateSlideShareContent({
        url:         row.targetUrl,
        title:       row.title,
        marketValue: row.marketValue,
        cagr:        row.cagr,
        seedKeyword: row.seedKeyword,
      });

      // 2. Build PPTX
      console.log('   Building PPTX...');
      pptxPath = await generatePptx({
        title:       slideContent.title,
        subtitle:    slideContent.subtitle,
        marketSize:  slideContent.marketSize,
        cagr:        slideContent.cagr,
        keyPoints:   slideContent.keyPoints,
        tags:        slideContent.tags,
        ctaUrl:      `${row.targetUrl}${UTM_PARAMS.SlideShare}`,
        description: slideContent.description,
      });
      console.log(`   PPTX built: ${pptxPath}`);

      // 3. Login
      const { page } = await loginToSlideShare({ nickname });

      // 4. Upload and publish
      const postResult = await postToSlideShare(
        page,
        pptxPath,
        slideContent.title,
        slideContent.description,
        slideContent.tags,
      );

      result.posted++;
      result.results.push({ nickname, success: true, postUrl: postResult.postUrl });
      console.log(`   ✅ Posted: ${postResult.postUrl}`);

    } catch (err: any) {
      result.failed++;
      result.results.push({ nickname, success: false, error: err.message });
      console.error(`   ❌ Failed for ${nickname}: ${err.message}`);
    } finally {
      await closeSlideShareBrowser();
      if (pptxPath) cleanupPptx(pptxPath);
    }

    // Delay between accounts
    if (i < limit - 1) {
      const delay = 8000 + Math.floor(Math.random() * 4000);
      console.log(`   Waiting ${Math.round(delay / 1000)}s before next account...`);
      await sleep(delay);
    }
  }

  console.log(`\n[SlideShare Batch ${params.batchNum}] Done — ${result.posted} posted, ${result.failed} failed`);
  return result;
}
