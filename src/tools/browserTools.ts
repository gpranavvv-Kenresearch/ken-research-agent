/**
 * browserTools.ts — Browser Automation Tools
 * Wraps all 6 browser scripts (login + posting for X, FB, LI)
 *
 * Key design: Page objects stored in module-level variables
 * since they cannot be serialized across Claude tool boundaries
 */

import { loginToX, closeBrowser } from '../browser/twitter/login.js';
import { postTweet, postThread } from '../browser/twitter/poster.js';
import { loginToFacebook, closeFacebookBrowser } from '../browser/facebook/login.js';
import { postToFacebook } from '../browser/facebook/poster.js';
import { loginToLinkedIn, closeLinkedInBrowser } from '../browser/linkedin/login.js';
import { postToLinkedIn } from '../browser/linkedin/poster.js';
import { postToCalisthenics } from '../browser/calisthenics/poster.js';
import { postToSubstack } from '../browser/substack/poster.js';
import { loginToSubstack, closeSubstackBrowser, getSubstackAccountByNickname, getActiveSubstackAccount } from '../browser/substack/login.js';
import { postToHackMD } from '../browser/hackmd/poster.js';
import { loginToHackMD, closeHackMDBrowser } from '../browser/hackmd/login.js';
import { loginToMedium, closeMediumBrowser } from '../browser/medium/login.js';
import { postToMedium } from '../browser/medium/poster.js';
import { loginToGoogleSite, closeGoogleSiteBrowser } from '../browser/googlesite/login.js';
import { postToGoogleSite } from '../browser/googlesite/poster.js';
import { loginToLinkedInPulse, closeLinkedInPulseBrowser } from '../browser/linkedin-pulse/login.js';
import { postToLinkedinPulse } from '../browser/linkedin-pulse/poster.js';
import { loginToDevto, closeDevtoBrowser } from '../browser/devto/login.js';
import { postToDevto } from '../browser/devto/poster.js';
import { loginToLinkmate, closeLinkmeateBrowser } from '../browser/linkmate/login.js';
import { postToLinkmate } from '../browser/linkmate/poster.js';
import { loginToWordpress, closeWordpressBrowser } from '../browser/wordpress/login.js';
import { postToWordpress } from '../browser/wordpress/poster.js';
import { loginToBlogger, closeBloggerBrowser } from '../browser/blogger/login.js';
import { postToBlogger } from '../browser/blogger/poster.js';
import { loginToNotion, closeNotionBrowser, getNotionAccountByNickname, getActiveNotionAccount } from '../browser/notion/login.js';
import { postToNotion } from '../browser/notion/poster.js';
import { loginToNote, closeNoteBrowser, getNoteAccountByNickname, getActiveNoteAccount } from '../browser/note/login.js';
import { postToNote } from '../browser/note/poster.js';
import { loginToVelog, closeVelogBrowser } from '../browser/velog/login.js';
import { postToVelog } from '../browser/velog/poster.js';
import { loginToCoda, closeCodaBrowser, getCodaAccountByNickname } from '../browser/coda/login.js';
import { postToCoda } from '../browser/coda/poster.js';
import { loginToTumblr, closeTumblrBrowser } from '../browser/tumblr/login.js';
import { postToTumblr } from '../browser/tumblr/poster.js';
import { loginToMastodon, closeMastodonBrowser } from '../browser/mastodon/login.js';
import { postToMastodon } from '../browser/mastodon/poster.js';
// ══ SBM + PPT/PDF platform browser tools (grafted) ══
import { loginToInstapaper, closeInstapaperBrowser } from '../browser/instapaper/login.js';
import { postToInstapaper } from '../browser/instapaper/poster.js';
import { loginToRaindrop, closeRaindropBrowser } from '../browser/raindrop/login.js';
import { postToRaindrop } from '../browser/raindrop/poster.js';
import { loginToPearltrees, closePearltreesBrowser } from '../browser/pearltrees/login.js';
import { postToPearltrees } from '../browser/pearltrees/poster.js';
import { loginToHatena, closeHatenaBrowser } from '../browser/hatena/login.js';
import { postToHatena } from '../browser/hatena/poster.js';
import { loginToPdfHost, closePdfHostBrowser } from '../browser/pdfhost/login.js';
import { postToPdfHost } from '../browser/pdfhost/poster.js';
import { loginToFlipHtml5, closeFlipHtml5Browser } from '../browser/fliphtml5/login.js';
import { postToFlipHtml5 } from '../browser/fliphtml5/poster.js';
import { loginToScribd, closeScribdBrowser } from '../browser/scribd/login.js';
import { postToScribd } from '../browser/scribd/poster.js';
import { loginToFourShared, closeFourSharedBrowser } from '../browser/fourshared/login.js';
import { postToFourShared } from '../browser/fourshared/poster.js';
import { loginToIssuu, closeIssuuBrowser } from '../browser/issuu/login.js';
import { postToIssuu } from '../browser/issuu/poster.js';
import { getAccountByHandle } from '../config/accounts.js';
export interface Tool {
  name: string;
  description?: string;
  input_schema: { type: 'object'; properties?: Record<string, any>; required?: string[]; [key: string]: any };
  cache_control?: { type: 'ephemeral' };
}
import type { Page } from 'playwright';

// Module-level page state
let xPage: Page | null = null;
let fbPage: Page | null = null;
let liPage: Page | null = null;
let hackmdPage: Page | null = null;
let codaPage: Page | null = null;
let codaNickname: string | null = null;
let tumblrPage: Page | null = null;
let mastodonPage: Page | null = null;
let mediumPage: Page | null = null;
let wordpressPage: Page | null = null;
let bloggerPage: Page | null = null;
let googleSitePage: Page | null = null;
let linkedInPulsePage: Page | null = null;
let devtoPage: Page | null = null;
let linkmatePage: Page | null = null;
let notionPage: Page | null = null;
let notePage: Page | null = null;
let velogPage: Page | null = null;
// ══ SBM + PPT/PDF platform browser tools (grafted) ══
let instapaperPage: Page | null = null;
let raindropPage: Page | null = null;
let pearltreesPage: Page | null = null;
let hatenaPage: Page | null = null;
let pdfhostPage: Page | null = null;
let fliphtml5Page: Page | null = null;
let scribdPage: Page | null = null;
let foursharedPage: Page | null = null;
let issuuPage: Page | null = null;

export const BROWSER_TOOLS: Tool[] = [
  {
    name: 'login_x',
    description: 'Login to X (Twitter) with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        accountHandle: { type: 'string', description: 'X account handle (e.g., "vansh")' },
      },
      required: ['accountHandle'],
    },
  },
  {
    name: 'post_tweet',
    description: 'Post a tweet to X. Must call login_x first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tweetText: { type: 'string', description: 'Tweet text (≤280 chars)' },
        handle: { type: 'string', description: 'X account handle' },
      },
      required: ['tweetText', 'handle'],
    },
  },
  {
    name: 'login_facebook',
    description: 'Login to Facebook with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Facebook account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_facebook',
    description: 'Post to Facebook. Must call login_facebook first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        postText: { type: 'string', description: 'Facebook post text' },
      },
      required: ['postText'],
    },
  },
  {
    name: 'login_linkedin',
    description: 'Login to LinkedIn with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'LinkedIn account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_linkedin',
    description: 'Post to LinkedIn. Must call login_linkedin first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        postText: { type: 'string', description: 'LinkedIn post text' },
      },
      required: ['postText'],
    },
  },
  {
    name: 'login_coda',
    description: 'Login to Coda with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Coda account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_coda',
    description: 'Post to Coda (coda.io). Must call login_coda first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Page title' },
        htmlContent: { type: 'string', description: 'Page content (HTML)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_hackmd',
    description: 'Login to HackMD with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'HackMD account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'login_tumblr',
    description: 'Login to Tumblr with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Tumblr account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_tumblr',
    description: 'Post a Tumblr Link post (URL + caption). Must call login_tumblr first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        postText: { type: 'string', description: 'Caption text (with hashtags)' },
        targetUrl: { type: 'string', description: 'URL to attach as the Link block' },
      },
      required: ['postText', 'targetUrl'],
    },
  },
  {
    name: 'login_mastodon',
    description: 'Login to Mastodon with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Mastodon account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_mastodon',
    description: 'Post to Mastodon (single text box, under 500 chars, URL+UTM+hashtags included). Must call login_mastodon first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        postText: { type: 'string', description: 'Full post text including URL and hashtags' },
      },
      required: ['postText'],
    },
  },
  {
    name: 'login_medium',
    description: 'Login to Medium with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Medium account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_medium',
    description: 'Post to Medium. Must call login_medium first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Article title' },
        htmlContent: { type: 'string', description: 'Article content (HTML)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_googlesite',
    description: 'Login to Google Sites with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Google Sites account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_googlesite',
    description: 'Post to Google Sites. Must call login_googlesite first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Site title' },
        htmlContent: { type: 'string', description: 'Site content (HTML)' },
        seedKeyword: { type: 'string', description: 'Keyword for slug generation (optional)' },
        utm: { type: 'string', description: 'UTM parameters (optional)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_linkedin_pulse',
    description: 'Login to LinkedIn Pulse with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'LinkedIn account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_linkedin_pulse',
    description: 'Post to LinkedIn Pulse. Must call login_linkedin_pulse first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Article title' },
        htmlContent: { type: 'string', description: 'Article content (HTML)' },
        seoTitle: { type: 'string', description: 'SEO title (optional)' },
        seoDescription: { type: 'string', description: 'SEO description (optional)' },
        shareCaption: { type: 'string', description: 'Caption for "Tell your network" share box (optional, defaults to seoDescription)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_devto',
    description: 'Login to Dev.to with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Dev.to account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_devto',
    description: 'Post to Dev.to. Must call login_devto first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Article title' },
        htmlContent: { type: 'string', description: 'Article content (HTML)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_linkmate',
    description: 'Login to Linkmate with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Linkmate account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_linkmate',
    description: 'Post to Linkmate. Must call login_linkmate first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Article title' },
        htmlContent: { type: 'string', description: 'Article content (HTML)' },
        seedKeyword: { type: 'string', description: 'Seed keyword for hashtags (optional)' },
        utm: { type: 'string', description: 'UTM parameters for links (optional)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_wordpress',
    description: 'Login to WordPress with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'WordPress account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_wordpress',
    description: 'Post to WordPress. Must call login_wordpress first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Post title' },
        htmlContent: { type: 'string', description: 'Post content (HTML)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_blogger',
    description: 'Login to Blogger with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Blogger account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_blogger',
    description: 'Post to Blogger. Must call login_blogger first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Post title' },
        htmlContent: { type: 'string', description: 'Post content (HTML)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_notion',
    description: 'Login to Notion with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Notion account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_notion',
    description: 'Post to Notion (creates a page and publishes to web). Must call login_notion first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Page title' },
        htmlContent: { type: 'string', description: 'Page content (HTML)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_note',
    description: 'Login to Note.com with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Note account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_note',
    description: 'Post an article to Note.com. Must call login_note first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Article title' },
        htmlContent: { type: 'string', description: 'Article content (HTML)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  {
    name: 'login_velog',
    description: 'Login to Velog with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Velog account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_velog',
    description: 'Post an article to Velog. Must call login_velog first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Article title' },
        htmlContent: { type: 'string', description: 'Article content (HTML)' },
      },
      required: ['title', 'htmlContent'],
    },
  },
  // ══ SBM + PPT/PDF platform browser tools (grafted) ══
  {
    name: 'login_instapaper',
    description: 'Login to Instapaper with account credentials',
    input_schema: { type: 'object' as const, properties: { nickname: { type: 'string', description: 'Instapaper account nickname' } }, required: ['nickname'] },
  },
  {
    name: 'post_instapaper',
    description: 'Save a bookmark to Instapaper. Must call login_instapaper first.',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string', description: 'Bookmark title' }, targetUrl: { type: 'string', description: 'URL to bookmark' }, note: { type: 'string', description: 'Optional note' } }, required: ['title', 'targetUrl'] },
  },
  {
    name: 'login_raindrop',
    description: 'Login to Raindrop.io with account credentials',
    input_schema: { type: 'object' as const, properties: { nickname: { type: 'string', description: 'Raindrop account nickname' } }, required: ['nickname'] },
  },
  {
    name: 'post_raindrop',
    description: 'Save a bookmark to Raindrop.io. Must call login_raindrop first.',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string', description: 'Bookmark title' }, targetUrl: { type: 'string', description: 'URL to bookmark' }, note: { type: 'string', description: 'Optional description' }, tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' } }, required: ['title', 'targetUrl'] },
  },
  {
    name: 'login_pearltrees',
    description: 'Login to Pearltrees with account credentials',
    input_schema: { type: 'object' as const, properties: { nickname: { type: 'string', description: 'Pearltrees account nickname' } }, required: ['nickname'] },
  },
  {
    name: 'post_pearltrees',
    description: 'Save a pearl (bookmark) to Pearltrees. Must call login_pearltrees first.',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string', description: 'Page title' }, targetUrl: { type: 'string', description: 'URL to bookmark' } }, required: ['title', 'targetUrl'] },
  },
  {
    name: 'login_hatena',
    description: 'Login to Hatena Bookmark with account credentials',
    input_schema: { type: 'object' as const, properties: { nickname: { type: 'string', description: 'Hatena account nickname' } }, required: ['nickname'] },
  },
  {
    name: 'post_hatena',
    description: 'Save a bookmark to Hatena. Must call login_hatena first.',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string', description: 'Bookmark title' }, targetUrl: { type: 'string', description: 'URL to bookmark' }, comment: { type: 'string', description: 'Optional comment' } }, required: ['title', 'targetUrl'] },
  },
  {
    name: 'login_pdfhost',
    description: 'Login to PDFHost with account credentials',
    input_schema: { type: 'object' as const, properties: { nickname: { type: 'string', description: 'PDFHost account nickname' } }, required: ['nickname'] },
  },
  {
    name: 'post_pdfhost',
    description: 'Upload a PDF to PDFHost. Must call login_pdfhost first.',
    input_schema: { type: 'object' as const, properties: { filePath: { type: 'string', description: 'Local path to the PDF file' }, title: { type: 'string', description: 'Optional title' }, description: { type: 'string', description: 'Optional description' } }, required: ['filePath'] },
  },
  {
    name: 'login_fliphtml5',
    description: 'Login to FlipHTML5 with account credentials',
    input_schema: { type: 'object' as const, properties: { nickname: { type: 'string', description: 'FlipHTML5 account nickname' } }, required: ['nickname'] },
  },
  {
    name: 'post_fliphtml5',
    description: 'Upload a PDF to FlipHTML5. Must call login_fliphtml5 first.',
    input_schema: { type: 'object' as const, properties: { filePath: { type: 'string', description: 'Local path to the PDF file' }, title: { type: 'string', description: 'Publication title' }, targetUrl: { type: 'string', description: 'Report URL' } }, required: ['filePath', 'title', 'targetUrl'] },
  },
  {
    name: 'login_scribd',
    description: 'Login to Scribd with account credentials',
    input_schema: { type: 'object' as const, properties: { nickname: { type: 'string', description: 'Scribd account nickname' } }, required: ['nickname'] },
  },
  {
    name: 'post_scribd',
    description: 'Upload a document to Scribd. Must call login_scribd first.',
    input_schema: { type: 'object' as const, properties: { filePath: { type: 'string', description: 'Local path to the document' }, title: { type: 'string', description: 'Document title' }, targetUrl: { type: 'string', description: 'Report URL' } }, required: ['filePath', 'title', 'targetUrl'] },
  },
  {
    name: 'login_fourshared',
    description: 'Login to 4shared with account credentials',
    input_schema: { type: 'object' as const, properties: { nickname: { type: 'string', description: '4shared account nickname' } }, required: ['nickname'] },
  },
  {
    name: 'post_fourshared',
    description: 'Upload a file to 4shared. Must call login_fourshared first.',
    input_schema: { type: 'object' as const, properties: { filePath: { type: 'string', description: 'Local path to the file' }, targetUrl: { type: 'string', description: 'Report URL' } }, required: ['filePath', 'targetUrl'] },
  },
  {
    name: 'login_issuu',
    description: 'Login to Issuu with account credentials',
    input_schema: { type: 'object' as const, properties: { nickname: { type: 'string', description: 'Issuu account nickname' } }, required: ['nickname'] },
  },
  {
    name: 'post_issuu',
    description: 'Upload a PDF to Issuu. Must call login_issuu first.',
    input_schema: { type: 'object' as const, properties: { filePath: { type: 'string', description: 'Local path to the PDF file' }, title: { type: 'string', description: 'Publication title' }, description: { type: 'string', description: 'Publication description' }, targetUrl: { type: 'string', description: 'Report URL' } }, required: ['filePath', 'title', 'description', 'targetUrl'] },
  },
];

/**
 * Execute browser tools
 */
export async function executeBrowserTool(toolName: string, input: Record<string, any>): Promise<any> {
  try {
    if (toolName === 'login_x') {
      return await loginXTool(input.accountHandle);
    }
    if (toolName === 'post_tweet') {
      return await postTweetTool(input.tweetText, input.handle);
    }
    if (toolName === 'post_thread') {
      return await postThreadTool(input.tweets, input.handle);
    }
    if (toolName === 'login_facebook') {
      return await loginFbTool(input.nickname);
    }
    if (toolName === 'post_facebook') {
      return await postFbTool(input.postText);
    }
    if (toolName === 'login_linkedin') {
      return await loginLiTool(input.nickname);
    }
    if (toolName === 'post_linkedin') {
      return await postLiTool(input.postText);
    }
    if (toolName === 'login_coda') {
      return await loginCodaTool(input.nickname);
    }
    if (toolName === 'post_coda') {
      return await postCodaTool(input.title, input.htmlContent);
    }
    if (toolName === 'login_hackmd') {
      return await loginHackmdTool(input.nickname);
    }
    if (toolName === 'login_tumblr') {
      return await loginTumblrTool(input.nickname);
    }
    if (toolName === 'post_tumblr') {
      return await postTumblrTool(input.postText, input.targetUrl);
    }
    if (toolName === 'login_mastodon') {
      return await loginMastodonTool(input.nickname);
    }
    if (toolName === 'post_mastodon') {
      return await postMastodonTool(input.postText);
    }
    if (toolName === 'login_medium') {
      return await loginMediumTool(input.nickname);
    }
    if (toolName === 'post_medium') {
      return await postMediumTool(input.title, input.htmlContent);
    }
    if (toolName === 'login_googlesite') {
      return await loginGoogleSiteTool(input.nickname);
    }
    if (toolName === 'post_googlesite') {
      return await postGoogleSiteTool(input.title, input.htmlContent, input.seedKeyword, input.utm);
    }
    if (toolName === 'login_linkedin_pulse') {
      return await loginLinkedInPulseTool(input.nickname);
    }
    if (toolName === 'post_linkedin_pulse') {
      return await postLinkedInPulseTool(input.title, input.htmlContent, input.seoTitle, input.seoDescription, input.shareCaption);
    }
    if (toolName === 'login_devto') {
      return await loginDevtoTool(input.nickname);
    }
    if (toolName === 'post_devto') {
      return await postDevtoTool(input.title, input.htmlContent);
    }
    if (toolName === 'login_linkmate') {
      return await loginLinkmateTool(input.nickname);
    }
    if (toolName === 'post_linkmate') {
      return await postLinkmateTool(input.title, input.htmlContent, input.seedKeyword, input.utm);
    }
    if (toolName === 'post_calisthenics') {
      return await postCalisthenics({
        nickname: input.nickname,
        title: input.title,
        htmlContent: input.htmlContent,
        seedKeyword: input.seedKeyword,
      });
    }
    if (toolName === 'post_substack') {
      return await postSubstackTool({
        nickname: input.nickname,
        title: input.title,
        htmlContent: input.htmlContent,
      });
    }
    if (toolName === 'post_hackmd') {
      return await postHackmdTool({
        title: input.title,
        htmlContent: input.htmlContent,
        description: input.description,
      });
    }
    if (toolName === 'login_wordpress') {
      return await loginWordpressTool(input.nickname);
    }
    if (toolName === 'post_wordpress') {
      return await postWordpressTool(input.title, input.htmlContent);
    }
    if (toolName === 'login_blogger') {
      return await loginBloggerTool(input.nickname);
    }
    if (toolName === 'post_blogger') {
      return await postBloggerTool(input.title, input.htmlContent);
    }
    if (toolName === 'login_notion') {
      return await loginNotionTool(input.nickname);
    }
    if (toolName === 'post_notion') {
      return await postNotionTool(input.title, input.htmlContent);
    }
    if (toolName === 'login_note') {
      return await loginNoteTool(input.nickname);
    }
    if (toolName === 'post_note') {
      return await postNoteTool(input.title, input.htmlContent);
    }
    if (toolName === 'login_velog') {
      return await loginVelogTool(input.nickname);
    }
    if (toolName === 'post_velog') {
      return await postVelogTool(input.title, input.htmlContent);
    }
    // ══ SBM + PPT/PDF platform browser tools (grafted) ══
    if (toolName === 'login_instapaper') {
      return await loginInstapaperTool(input.nickname);
    }
    if (toolName === 'post_instapaper') {
      return await postInstapaperTool(input.title, input.targetUrl, input.note);
    }
    if (toolName === 'login_raindrop') {
      return await loginRaindropTool(input.nickname);
    }
    if (toolName === 'post_raindrop') {
      return await postRaindropTool(input.title, input.targetUrl, input.note, input.tags);
    }
    if (toolName === 'login_pearltrees') {
      return await loginPearltreesTool(input.nickname);
    }
    if (toolName === 'post_pearltrees') {
      return await postPearltreesTool(input.title, input.targetUrl);
    }
    if (toolName === 'login_hatena') {
      return await loginHatenaTool(input.nickname);
    }
    if (toolName === 'post_hatena') {
      return await postHatenaTool(input.title, input.targetUrl, input.comment);
    }
    if (toolName === 'login_pdfhost') {
      return await loginPdfHostTool(input.nickname);
    }
    if (toolName === 'post_pdfhost') {
      return await postPdfHostTool(input.filePath, input.title, input.description);
    }
    if (toolName === 'login_fliphtml5') {
      return await loginFlipHtml5Tool(input.nickname);
    }
    if (toolName === 'post_fliphtml5') {
      return await postFlipHtml5Tool(input.filePath, input.title, input.targetUrl);
    }
    if (toolName === 'login_scribd') {
      return await loginScribdTool(input.nickname);
    }
    if (toolName === 'post_scribd') {
      return await postScribdTool(input.filePath, input.title, input.targetUrl);
    }
    if (toolName === 'login_fourshared') {
      return await loginFourSharedTool(input.nickname);
    }
    if (toolName === 'post_fourshared') {
      return await postFourSharedTool(input.filePath, input.targetUrl);
    }
    if (toolName === 'login_issuu') {
      return await loginIssuuTool(input.nickname);
    }
    if (toolName === 'post_issuu') {
      return await postIssuuTool(input.filePath, input.title, input.description, input.targetUrl);
    }
    return { error: `Unknown tool: ${toolName}`, success: false };
  } catch (err: any) {
    return { error: err.message || String(err), success: false };
  }
}

/**
 * X Tools
 */
async function loginXTool(accountHandle: string): Promise<any> {
  try {
    const account = getAccountByHandle(accountHandle);
    if (!account) {
      return { error: `Account "${accountHandle}" not found`, success: false };
    }

    xPage = await loginToX(account);
    return { success: true, message: `Logged in to @${account.handle}` };
  } catch (err: any) {
    try { await closeBrowser(); } catch { /* ignore */ }
    xPage = null;
    return { error: err.message, success: false };
  }
}

async function postTweetTool(tweetText: string, handle: string): Promise<any> {
  try {
    if (!xPage) {
      return { error: 'Not logged in. Call login_x first.', success: false };
    }

    const result = await postTweet(xPage, tweetText, handle);
    return { success: true, tweetUrl: result.tweetUrl, tweetText };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (xPage) {
      try {
        await closeBrowser(xPage);
      } catch (e) {
        console.warn('Failed to close X browser:', e);
      }
      xPage = null;
    }
  }
}

async function postThreadTool(tweets: string[], handle: string): Promise<any> {
  try {
    if (!xPage) {
      return { error: 'Not logged in. Call login_x first.', success: false };
    }
    const result = await postThread(xPage, tweets, handle);
    return { success: true, tweetUrl: result.tweetUrl, tweetText: result.tweetText };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (xPage) {
      try { await closeBrowser(xPage); } catch { /* ignore */ }
      xPage = null;
    }
  }
}

/**
 * Facebook Tools
 */
async function loginFbTool(nickname: string): Promise<any> {
  try {
    fbPage = await loginToFacebook({ nickname });
    return { success: true, message: `Logged in to Facebook (${nickname})` };
  } catch (err: any) {
    try { await closeFacebookBrowser(); } catch { /* ignore */ }
    fbPage = null;
    return { error: err.message, success: false };
  }
}

async function postFbTool(postText: string): Promise<any> {
  try {
    if (!fbPage) {
      return { error: 'Not logged in. Call login_facebook first.', success: false };
    }

    const result = await postToFacebook(fbPage, postText);
    return { success: true, postUrl: result.postUrl, postText: result.postText };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (fbPage) {
      try {
        await closeFacebookBrowser(fbPage);
      } catch (e) {
        console.warn('Failed to close FB browser:', e);
      }
      fbPage = null;
    }
  }
}

/**
 * LinkedIn Tools
 */
async function loginLiTool(nickname: string): Promise<any> {
  try {
    liPage = await loginToLinkedIn({ nickname });
    return { success: true, message: `Logged in to LinkedIn (${nickname})` };
  } catch (err: any) {
    try { await closeLinkedInBrowser(); } catch { /* ignore */ }
    liPage = null;
    return { error: err.message, success: false };
  }
}

async function postLiTool(postText: string): Promise<any> {
  try {
    if (!liPage) {
      return { error: 'Not logged in. Call login_linkedin first.', success: false };
    }

    const result = await postToLinkedIn(liPage, postText);
    return { success: true, postUrl: result.postUrl, postText: result.postText };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (liPage) {
      try {
        await closeLinkedInBrowser(liPage);
      } catch (e) {
        console.warn('Failed to close LI browser:', e);
      }
      liPage = null;
    }
  }
}

/**
 * Coda Tools
 */
async function loginCodaTool(nickname: string): Promise<any> {
  console.log(`   [login_coda] Attempting to login as: ${nickname}`);
  try {
    codaPage = await loginToCoda({ nickname });
    codaNickname = nickname;
    console.log(`   [login_coda] ✅ Success - page is set`);
    return { success: true, message: `Logged in to Coda (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_coda] ❌ Failed:`, err.message);
    try { await closeCodaBrowser(); } catch { /* ignore */ }
    codaPage = null;
    codaNickname = null;
    return { error: err.message, success: false };
  }
}

async function postCodaTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!codaPage) {
      return { error: 'Not logged in. Call login_coda first.', success: false };
    }
    const account = codaNickname ? getCodaAccountByNickname(codaNickname) : null;
    const result = await postToCoda(codaPage, title, htmlContent, account?.docUrl);
    return {
      success: result.success,
      postUrl: result.postUrl,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (codaPage) {
      try {
        await closeCodaBrowser();
      } catch (e) {
        console.warn('Failed to close Coda browser:', e);
      }
      codaPage = null;
      codaNickname = null;
    }
  }
}

/**
 * Tumblr Tools
 */
async function loginTumblrTool(nickname: string): Promise<any> {
  console.log(`   [login_tumblr] Attempting to login as: ${nickname}`);
  try {
    tumblrPage = await loginToTumblr({ nickname });
    console.log(`   [login_tumblr] ✅ Success - page is set`);
    return { success: true, message: `Logged in to Tumblr (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_tumblr] ❌ Failed:`, err.message);
    try { await closeTumblrBrowser(); } catch { /* ignore */ }
    tumblrPage = null;
    return { error: err.message, success: false };
  }
}

async function postTumblrTool(postText: string, targetUrl: string): Promise<any> {
  try {
    if (!tumblrPage) {
      return { error: 'Not logged in. Call login_tumblr first.', success: false };
    }
    const result = await postToTumblr(tumblrPage, postText, targetUrl);
    return {
      success: result.success,
      postUrl: result.postUrl,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (tumblrPage) {
      try {
        await closeTumblrBrowser();
      } catch (e) {
        console.warn('Failed to close Tumblr browser:', e);
      }
      tumblrPage = null;
    }
  }
}

/**
 * Mastodon Tools
 */
async function loginMastodonTool(nickname: string): Promise<any> {
  console.log(`   [login_mastodon] Attempting to login as: ${nickname}`);
  try {
    mastodonPage = await loginToMastodon({ nickname });
    console.log(`   [login_mastodon] ✅ Success - page is set`);
    return { success: true, message: `Logged in to Mastodon (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_mastodon] ❌ Failed:`, err.message);
    try { await closeMastodonBrowser(); } catch { /* ignore */ }
    mastodonPage = null;
    return { error: err.message, success: false };
  }
}

async function postMastodonTool(postText: string): Promise<any> {
  try {
    if (!mastodonPage) {
      return { error: 'Not logged in. Call login_mastodon first.', success: false };
    }
    const result = await postToMastodon(mastodonPage, postText);
    return {
      success: result.success,
      postUrl: result.postUrl,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (mastodonPage) {
      try {
        await closeMastodonBrowser();
      } catch (e) {
        console.warn('Failed to close Mastodon browser:', e);
      }
      mastodonPage = null;
    }
  }
}

/**
 * HackMD Tools
 */
async function loginHackmdTool(nickname: string): Promise<any> {
  console.log(`   [login_hackmd] Attempting to login as: ${nickname}`);
  try {
    hackmdPage = await loginToHackMD({ nickname: nickname });
    console.log(`   [login_hackmd] ✅ Success - page is set`);
    return { success: true, message: `Logged in to HackMD (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_hackmd] ❌ Failed:`, err.message);
    try { await closeHackMDBrowser(); } catch { /* ignore */ }
    hackmdPage = null;
    return { error: err.message, success: false };
  }
}

/**
 * Calisthenics Tools
 */
async function postCalisthenics(input: { nickname: string; title: string; htmlContent: string; seedKeyword?: string }): Promise<any> {
  try {
    const result = await postToCalisthenics(
      input.nickname,
      {
        title: input.title,
        content: input.htmlContent,
        seedKeyword: input.seedKeyword,
      }
    );
    return {
      success: result.success,
      postUrl: result.postUrl,
      error: result.error,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  }
}

/**
 * Substack Tools
 */
async function postSubstackTool(input: { nickname: string; title: string; htmlContent: string }): Promise<any> {
  try {
    const account = input.nickname
      ? getSubstackAccountByNickname(input.nickname) ?? getActiveSubstackAccount()
      : getActiveSubstackAccount();
    const publicationUrl = account?.publicationUrl || '';
    const page = await loginToSubstack({ nickname: input.nickname });
    const result = await postToSubstack(page, input.title, input.htmlContent, publicationUrl);
    return {
      success: result.success,
      postUrl: result.postUrl,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    await closeSubstackBrowser().catch(() => {});
  }
}

/**
 * HackMD Tools (posting only — login must happen first)
 */
async function postHackmdTool(input: { title: string; htmlContent: string; description?: string }): Promise<any> {
  try {
    if (!hackmdPage) {
      return { error: 'Not logged in. Call login_hackmd first.', success: false };
    }

    const result = await postToHackMD(hackmdPage, input.title, input.htmlContent, input.description);
    return {
      success: result.success,
      postUrl: result.postUrl,
      error: result.error,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (hackmdPage) {
      try {
        await closeHackMDBrowser();
      } catch (e) {
        console.warn('Failed to close HackMD browser:', e);
      }
      hackmdPage = null;
    }
  }
}

/**
 * Medium Tools
 */
async function loginMediumTool(nickname: string): Promise<any> {
  console.log(`   [login_medium] Attempting to login as: ${nickname}`);
  try {
    mediumPage = await loginToMedium({ nickname });
    console.log(`   [login_medium] ✅ Success - page is set`);
    return { success: true, message: `Logged in to Medium (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_medium] ❌ Failed:`, err.message);
    try { await closeMediumBrowser(); } catch { /* ignore */ }
    mediumPage = null;
    return { error: err.message, success: false };
  }
}

async function postMediumTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!mediumPage) {
      return { error: 'Not logged in. Call login_medium first.', success: false };
    }

    const result = await postToMedium(mediumPage, title, htmlContent);
    return {
      success: true,
      postUrl: result.postUrl,
      error: undefined,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (mediumPage) {
      try {
        await closeMediumBrowser();
      } catch (e) {
        console.warn('Failed to close Medium browser:', e);
      }
      mediumPage = null;
    }
  }
}

/**
 * Google Sites Tools
 */
async function loginGoogleSiteTool(nickname: string): Promise<any> {
  console.log(`   [login_googlesite] Attempting to login as: ${nickname}`);
  try {
    googleSitePage = await loginToGoogleSite({ nickname, batchMode: true });
    console.log(`   [login_googlesite] ✅ Success - page is set`);
    return { success: true, message: `Logged in to Google Sites (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_googlesite] ❌ Failed:`, err.message);
    try { await closeGoogleSiteBrowser(); } catch { /* ignore */ }
    googleSitePage = null;
    return { error: err.message, success: false };
  }
}

async function postGoogleSiteTool(title: string, htmlContent: string, seedKeyword?: string, utm?: string): Promise<any> {
  try {
    if (!googleSitePage) {
      return { error: 'Not logged in. Call login_googlesite first.', success: false };
    }

    const result = await postToGoogleSite(googleSitePage, title, htmlContent, seedKeyword);
    return {
      success: true,
      postUrl: result.postUrl,
      slug: result.slug,
      error: undefined,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (googleSitePage) {
      try {
        await closeGoogleSiteBrowser();
      } catch (e) {
        console.warn('Failed to close Google Sites browser:', e);
      }
      googleSitePage = null;
    }
  }
}

/**
 * LinkedIn Pulse Tools
 */
async function loginLinkedInPulseTool(nickname: string): Promise<any> {
  console.log(`   [login_linkedin_pulse] Attempting to login as: ${nickname}`);
  try {
    linkedInPulsePage = await loginToLinkedInPulse(nickname);
    console.log(`   [login_linkedin_pulse] ✅ Success - page is set`);
    return { success: true, message: `Logged in to LinkedIn Pulse (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_linkedin_pulse] ❌ Failed:`, err.message);
    try { await closeLinkedInPulseBrowser(); } catch { /* ignore */ }
    linkedInPulsePage = null;
    return { error: err.message, success: false };
  }
}

async function postLinkedInPulseTool(title: string, htmlContent: string, seoTitle?: string, seoDescription?: string, shareCaption?: string): Promise<any> {
  try {
    if (!linkedInPulsePage) {
      return { error: 'Not logged in. Call login_linkedin_pulse first.', success: false };
    }

    const result = await postToLinkedinPulse(linkedInPulsePage, title, htmlContent, seoTitle, seoDescription, shareCaption);
    return {
      success: true,
      postUrl: result.postUrl,
      error: undefined,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (linkedInPulsePage) {
      try {
        await closeLinkedInPulseBrowser();
      } catch (e) {
        console.warn('Failed to close LinkedIn Pulse browser:', e);
      }
      linkedInPulsePage = null;
    }
  }
}

/**
 * Dev.to Tools
 */
async function loginDevtoTool(nickname: string): Promise<any> {
  console.log(`   [login_devto] Attempting to login as: ${nickname}`);
  try {
    devtoPage = await loginToDevto({ nickname });
    console.log(`   [login_devto] ✅ Success - page is set`);
    return { success: true, message: `Logged in to Dev.to (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_devto] ❌ Failed:`, err.message);
    try { await closeDevtoBrowser(); } catch { /* ignore */ }
    devtoPage = null;
    return { error: err.message, success: false };
  }
}

async function postDevtoTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!devtoPage) {
      return { error: 'Not logged in. Call login_devto first.', success: false };
    }

    const result = await postToDevto(devtoPage, title, htmlContent);
    return {
      success: true,
      postUrl: result.postUrl,
      error: undefined,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (devtoPage) {
      try {
        await closeDevtoBrowser();
      } catch (e) {
        console.warn('Failed to close Dev.to browser:', e);
      }
      devtoPage = null;
    }
  }
}

async function loginLinkmateTool(nickname: string): Promise<any> {
  try {
    console.log(`   [login_linkmate] Attempting to login as: ${nickname}`);
    linkmatePage = await loginToLinkmate({ nickname });
    console.log(`   [login_linkmate] ✅ Success - page is set`);
    return { success: true, error: undefined };
  } catch (err: any) {
    console.log(`   [login_linkmate] ❌ Failed:`, err.message);
    try { await closeLinkmeateBrowser(); } catch { /* ignore */ }
    linkmatePage = null;
    return { error: err.message, success: false };
  }
}

async function postLinkmateTool(title: string, htmlContent: string, seedKeyword?: string, utm?: string): Promise<any> {
  try {
    if (!linkmatePage) {
      return { error: 'Not logged in. Call login_linkmate first.', success: false };
    }

    const result = await postToLinkmate(linkmatePage, title, htmlContent, seedKeyword, utm);
    return {
      success: true,
      postUrl: result.postUrl,
      error: undefined,
    };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (linkmatePage) {
      try {
        await closeLinkmeateBrowser();
      } catch (e) {
        console.warn('Failed to close Linkmate browser:', e);
      }
      linkmatePage = null;
    }
  }
}

/**
 * Get current page state (for debugging)
 */
export function getPageState(): { x: boolean; fb: boolean; li: boolean; hackmd: boolean; medium: boolean; googleSite: boolean; linkedInPulse: boolean; devto: boolean; linkmate: boolean; coda: boolean; tumblr: boolean; mastodon: boolean } {
  return {
    x: xPage !== null,
    fb: fbPage !== null,
    li: liPage !== null,
    hackmd: hackmdPage !== null,
    medium: mediumPage !== null,
    googleSite: googleSitePage !== null,
    linkedInPulse: linkedInPulsePage !== null,
    devto: devtoPage !== null,
    linkmate: linkmatePage !== null,
    coda: codaPage !== null,
    tumblr: tumblrPage !== null,
    mastodon: mastodonPage !== null,
  };
}

/**
 * Force close all browsers (cleanup)
 */
export async function closeAllBrowsers(): Promise<void> {
  if (xPage) {
    try {
      await closeBrowser(xPage);
    } catch (e) {}
    xPage = null;
  }
  if (fbPage) {
    try {
      await closeFacebookBrowser(fbPage);
    } catch (e) {}
    fbPage = null;
  }
  if (liPage) {
    try {
      await closeLinkedInBrowser(liPage);
    } catch (e) {}
    liPage = null;
  }
  if (hackmdPage) {
    try {
      await closeHackMDBrowser();
    } catch (e) {}
    hackmdPage = null;
  }
  if (codaPage) {
    try {
      await closeCodaBrowser();
    } catch (e) {}
    codaPage = null;
    codaNickname = null;
  }
  if (tumblrPage) {
    try {
      await closeTumblrBrowser();
    } catch (e) {}
    tumblrPage = null;
  }
  if (mastodonPage) {
    try {
      await closeMastodonBrowser();
    } catch (e) {}
    mastodonPage = null;
  }
  if (mediumPage) {
    try {
      await closeMediumBrowser();
    } catch (e) {}
    mediumPage = null;
  }
  if (googleSitePage) {
    try {
      await closeGoogleSiteBrowser();
    } catch (e) {}
    googleSitePage = null;
  }
  if (linkedInPulsePage) {
    try {
      await closeLinkedInPulseBrowser();
    } catch (e) {}
    linkedInPulsePage = null;
  }
  if (devtoPage) {
    try {
      await closeDevtoBrowser();
    } catch (e) {}
    devtoPage = null;
  }
  if (linkmatePage) {
    try {
      await closeLinkmeateBrowser();
    } catch (e) {}
    linkmatePage = null;
  }
  if (wordpressPage) {
    try {
      await closeWordpressBrowser();
    } catch (e) {}
    wordpressPage = null;
  }
  if (bloggerPage) {
    try {
      await closeBloggerBrowser();
    } catch (e) {}
    bloggerPage = null;
  }
  if (notionPage) {
    try {
      await closeNotionBrowser();
    } catch (e) {}
    notionPage = null;
  }
  if (notePage) {
    try {
      await closeNoteBrowser();
    } catch (e) {}
    notePage = null;
  }
  if (velogPage) {
    try {
      await closeVelogBrowser();
    } catch (e) {}
    velogPage = null;
  }
}

/**
 * WordPress Tools
 */
async function loginWordpressTool(nickname: string): Promise<any> {
  console.log(`   [login_wordpress] Attempting to login as: ${nickname}`);
  try {
    wordpressPage = await loginToWordpress({ nickname });
    wordpressNickname = nickname;
    console.log(`   [login_wordpress] ✅ Success`);
    return { success: true, message: `Logged in to WordPress (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_wordpress] ❌ Failed:`, err.message);
    try { await closeWordpressBrowser(); } catch { /* ignore */ }
    wordpressPage = null;
    wordpressNickname = null;
    return { error: err.message, success: false };
  }
}

let wordpressNickname: string | null = null;

async function postWordpressTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!wordpressPage) {
      return { error: 'Not logged in. Call login_wordpress first.', success: false };
    }
    const result = await postToWordpress(wordpressPage, title, htmlContent, wordpressNickname ?? undefined);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (wordpressPage) {
      await closeWordpressBrowser().catch(() => {});
      wordpressPage = null;
      wordpressNickname = null;
    }
  }
}

/**
 * Blogger Tools
 */
let bloggerNickname: string | null = null;

async function loginBloggerTool(nickname: string): Promise<any> {
  console.log(`   [login_blogger] Attempting to login as: ${nickname}`);
  try {
    bloggerPage = await loginToBlogger({ nickname });
    bloggerNickname = nickname;
    console.log(`   [login_blogger] ✅ Success`);
    return { success: true, message: `Logged in to Blogger (${nickname})` };
  } catch (err: any) {
    console.log(`   [login_blogger] ❌ Failed:`, err.message);
    try { await closeBloggerBrowser(); } catch { /* ignore */ }
    bloggerPage = null;
    bloggerNickname = null;
    return { error: err.message, success: false };
  }
}

async function postBloggerTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!bloggerPage) {
      return { error: 'Not logged in. Call login_blogger first.', success: false };
    }
    const result = await postToBlogger(bloggerPage, title, htmlContent, bloggerNickname ?? undefined);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (bloggerPage) {
      await closeBloggerBrowser().catch(() => {});
      bloggerPage = null;
      bloggerNickname = null;
    }
  }
}

/**
 * Notion Tools
 */
let notionNickname: string | null = null;

async function loginNotionTool(nickname: string): Promise<any> {
  try {
    notionPage = await loginToNotion({ nickname });
    notionNickname = nickname;
    return { success: true, message: `Logged in to Notion (${nickname})` };
  } catch (err: any) {
    try { await closeNotionBrowser(); } catch { /* ignore */ }
    notionPage = null;
    notionNickname = null;
    return { error: err.message, success: false };
  }
}

async function postNotionTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!notionPage) return { error: 'Not logged in. Call login_notion first.', success: false };
    const result = await postToNotion(notionPage, title, htmlContent);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (notionPage) {
      await closeNotionBrowser().catch(() => {});
      notionPage = null;
      notionNickname = null;
    }
  }
}

/**
 * Note Tools
 */
let noteNickname: string | null = null;

async function loginNoteTool(nickname: string): Promise<any> {
  try {
    notePage = await loginToNote({ nickname });
    noteNickname = nickname;
    return { success: true, message: `Logged in to Note (${nickname})` };
  } catch (err: any) {
    try { await closeNoteBrowser(); } catch { /* ignore */ }
    notePage = null;
    noteNickname = null;
    return { error: err.message, success: false };
  }
}

async function postNoteTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!notePage) return { error: 'Not logged in. Call login_note first.', success: false };
    const result = await postToNote(notePage, title, htmlContent);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (notePage) {
      await closeNoteBrowser().catch(() => {});
      notePage = null;
      noteNickname = null;
    }
  }
}

/**
 * Velog Tools
 */
async function loginVelogTool(nickname: string): Promise<any> {
  try {
    velogPage = await loginToVelog({ nickname });
    return { success: true, message: `Logged in to Velog (${nickname})` };
  } catch (err: any) {
    try { await closeVelogBrowser(); } catch { /* ignore */ }
    velogPage = null;
    return { error: err.message, success: false };
  }
}

async function postVelogTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!velogPage) return { error: 'Not logged in. Call login_velog first.', success: false };
    const result = await postToVelog(velogPage, title, htmlContent);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (velogPage) {
      await closeVelogBrowser().catch(() => {});
      velogPage = null;
    }
  }
}

// ══ SBM + PPT/PDF platform browser tools (grafted) ══
// Simple singleton-page pattern mirroring the Tumblr/Mastodon/Pearltrees tools:
// login sets the module page, post closes it in finally.

/** Instapaper */
async function loginInstapaperTool(nickname: string): Promise<any> {
  try {
    instapaperPage = await loginToInstapaper({ nickname });
    return { success: true, message: `Logged in to Instapaper (${nickname})` };
  } catch (err: any) {
    instapaperPage = null;
    return { error: err.message, success: false };
  }
}

async function postInstapaperTool(title: string, targetUrl: string, note?: string): Promise<any> {
  try {
    if (!instapaperPage) return { error: 'Not logged in. Call login_instapaper first.', success: false };
    const result = await postToInstapaper(instapaperPage, title, targetUrl, note);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (instapaperPage) {
      await closeInstapaperBrowser().catch(() => {});
      instapaperPage = null;
    }
  }
}

/** Raindrop */
async function loginRaindropTool(nickname: string): Promise<any> {
  try {
    raindropPage = await loginToRaindrop({ nickname });
    return { success: true, message: `Logged in to Raindrop (${nickname})` };
  } catch (err: any) {
    raindropPage = null;
    return { error: err.message, success: false };
  }
}

async function postRaindropTool(title: string, targetUrl: string, note?: string, tags?: string[]): Promise<any> {
  try {
    if (!raindropPage) return { error: 'Not logged in. Call login_raindrop first.', success: false };
    const result = await postToRaindrop(raindropPage, title, targetUrl, note, tags);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (raindropPage) {
      await closeRaindropBrowser().catch(() => {});
      raindropPage = null;
    }
  }
}

/** Pearltrees */
async function loginPearltreesTool(nickname: string): Promise<any> {
  try {
    pearltreesPage = await loginToPearltrees({ nickname });
    return { success: true, message: `Logged in to Pearltrees (${nickname})` };
  } catch (err: any) {
    pearltreesPage = null;
    return { error: err.message, success: false };
  }
}

async function postPearltreesTool(title: string, targetUrl: string): Promise<any> {
  try {
    if (!pearltreesPage) return { error: 'Not logged in. Call login_pearltrees first.', success: false };
    const result = await postToPearltrees(pearltreesPage, title, targetUrl);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (pearltreesPage) {
      await closePearltreesBrowser().catch(() => {});
      pearltreesPage = null;
    }
  }
}

/** Hatena */
async function loginHatenaTool(nickname: string): Promise<any> {
  try {
    hatenaPage = await loginToHatena({ nickname });
    return { success: true, message: `Logged in to Hatena (${nickname})` };
  } catch (err: any) {
    hatenaPage = null;
    return { error: err.message, success: false };
  }
}

async function postHatenaTool(title: string, targetUrl: string, comment?: string): Promise<any> {
  try {
    if (!hatenaPage) return { error: 'Not logged in. Call login_hatena first.', success: false };
    const result = await postToHatena(hatenaPage, title, targetUrl, comment);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (hatenaPage) {
      await closeHatenaBrowser().catch(() => {});
      hatenaPage = null;
    }
  }
}

/** PDFHost */
async function loginPdfHostTool(nickname: string): Promise<any> {
  try {
    pdfhostPage = await loginToPdfHost({ nickname });
    return { success: true, message: `Logged in to PDFHost (${nickname})` };
  } catch (err: any) {
    pdfhostPage = null;
    return { error: err.message, success: false };
  }
}

async function postPdfHostTool(filePath: string, title?: string, description?: string): Promise<any> {
  try {
    if (!pdfhostPage) return { error: 'Not logged in. Call login_pdfhost first.', success: false };
    const result = await postToPdfHost(pdfhostPage, filePath, title, description);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (pdfhostPage) {
      await closePdfHostBrowser().catch(() => {});
      pdfhostPage = null;
    }
  }
}

/** FlipHTML5 */
async function loginFlipHtml5Tool(nickname: string): Promise<any> {
  try {
    fliphtml5Page = await loginToFlipHtml5({ nickname });
    return { success: true, message: `Logged in to FlipHTML5 (${nickname})` };
  } catch (err: any) {
    fliphtml5Page = null;
    return { error: err.message, success: false };
  }
}

async function postFlipHtml5Tool(filePath: string, title: string, targetUrl: string): Promise<any> {
  try {
    if (!fliphtml5Page) return { error: 'Not logged in. Call login_fliphtml5 first.', success: false };
    const result = await postToFlipHtml5(fliphtml5Page, filePath, title, targetUrl);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (fliphtml5Page) {
      await closeFlipHtml5Browser().catch(() => {});
      fliphtml5Page = null;
    }
  }
}

/** Scribd */
async function loginScribdTool(nickname: string): Promise<any> {
  try {
    scribdPage = await loginToScribd({ nickname });
    return { success: true, message: `Logged in to Scribd (${nickname})` };
  } catch (err: any) {
    scribdPage = null;
    return { error: err.message, success: false };
  }
}

async function postScribdTool(filePath: string, title: string, targetUrl: string): Promise<any> {
  try {
    if (!scribdPage) return { error: 'Not logged in. Call login_scribd first.', success: false };
    const result = await postToScribd(scribdPage, filePath, title, targetUrl);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (scribdPage) {
      await closeScribdBrowser().catch(() => {});
      scribdPage = null;
    }
  }
}

/** 4shared */
async function loginFourSharedTool(nickname: string): Promise<any> {
  try {
    foursharedPage = await loginToFourShared({ nickname });
    return { success: true, message: `Logged in to 4shared (${nickname})` };
  } catch (err: any) {
    foursharedPage = null;
    return { error: err.message, success: false };
  }
}

async function postFourSharedTool(filePath: string, targetUrl: string): Promise<any> {
  try {
    if (!foursharedPage) return { error: 'Not logged in. Call login_fourshared first.', success: false };
    const result = await postToFourShared(foursharedPage, filePath, targetUrl);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (foursharedPage) {
      await closeFourSharedBrowser().catch(() => {});
      foursharedPage = null;
    }
  }
}

/** Issuu */
async function loginIssuuTool(nickname: string): Promise<any> {
  try {
    issuuPage = await loginToIssuu({ nickname });
    return { success: true, message: `Logged in to Issuu (${nickname})` };
  } catch (err: any) {
    issuuPage = null;
    return { error: err.message, success: false };
  }
}

async function postIssuuTool(filePath: string, title: string, description: string, targetUrl: string): Promise<any> {
  try {
    if (!issuuPage) return { error: 'Not logged in. Call login_issuu first.', success: false };
    const result = await postToIssuu(issuuPage, filePath, title, description, targetUrl);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (issuuPage) {
      await closeIssuuBrowser().catch(() => {});
      issuuPage = null;
    }
  }
}

