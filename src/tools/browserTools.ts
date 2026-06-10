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
import { loginToPatreon, closePatreonBrowser, getPatreonAccountByNickname, getActivePatreonAccount } from '../browser/patreon/login.js';
import { postToPatreon } from '../browser/patreon/poster.js';
import { loginToNotion, closeNotionBrowser, getNotionAccountByNickname, getActiveNotionAccount } from '../browser/notion/login.js';
import { postToNotion } from '../browser/notion/poster.js';
import { loginToNote, closeNoteBrowser, getNoteAccountByNickname, getActiveNoteAccount } from '../browser/note/login.js';
import { postToNote } from '../browser/note/poster.js';
import { loginToParagraph, closeParagraphBrowser } from '../browser/paragraph/login.js';
import { postToParagraph } from '../browser/paragraph/poster.js';
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
let mediumPage: Page | null = null;
let wordpressPage: Page | null = null;
let bloggerPage: Page | null = null;
let googleSitePage: Page | null = null;
let linkedInPulsePage: Page | null = null;
let devtoPage: Page | null = null;
let linkmatePage: Page | null = null;
let patreonPage: Page | null = null;
let notionPage: Page | null = null;
let notePage: Page | null = null;
let paragraphPage: Page | null = null;

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
    name: 'login_patreon',
    description: 'Login to Patreon with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Patreon account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_patreon',
    description: 'Post to Patreon. Must call login_patreon first.',
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
    name: 'login_paragraph',
    description: 'Login to Paragraph.com with account credentials',
    input_schema: {
      type: 'object' as const,
      properties: {
        nickname: { type: 'string', description: 'Paragraph account nickname' },
      },
      required: ['nickname'],
    },
  },
  {
    name: 'post_paragraph',
    description: 'Post an article to Paragraph.com. Must call login_paragraph first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Article title' },
        htmlContent: { type: 'string', description: 'Article content (HTML)' },
      },
      required: ['title', 'htmlContent'],
    },
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
    if (toolName === 'login_hackmd') {
      return await loginHackmdTool(input.nickname);
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
    if (toolName === 'login_patreon') {
      return await loginPatreonTool(input.nickname);
    }
    if (toolName === 'post_patreon') {
      return await postPatreonTool(input.title, input.htmlContent);
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
    if (toolName === 'login_paragraph') {
      return await loginParagraphTool(input.nickname);
    }
    if (toolName === 'post_paragraph') {
      return await postParagraphTool(input.title, input.htmlContent);
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
export function getPageState(): { x: boolean; fb: boolean; li: boolean; hackmd: boolean; medium: boolean; googleSite: boolean; linkedInPulse: boolean; devto: boolean; linkmate: boolean } {
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
  if (patreonPage) {
    try {
      await closePatreonBrowser();
    } catch (e) {}
    patreonPage = null;
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
 * Patreon Tools
 */
let patreonNickname: string | null = null;

async function loginPatreonTool(nickname: string): Promise<any> {
  try {
    patreonPage = await loginToPatreon({ nickname });
    patreonNickname = nickname;
    return { success: true, message: `Logged in to Patreon (${nickname})` };
  } catch (err: any) {
    patreonPage = null;
    patreonNickname = null;
    return { error: err.message, success: false };
  }
}

async function postPatreonTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!patreonPage) return { error: 'Not logged in. Call login_patreon first.', success: false };
    const { getPatreonAccountByNickname: getByNick } = await import('../browser/patreon/login.js');
    const account = patreonNickname ? getByNick(patreonNickname) : null;
    const result = await postToPatreon(patreonPage, title, htmlContent, account?.creatorUrl);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (patreonPage) {
      await closePatreonBrowser().catch(() => {});
      patreonPage = null;
      patreonNickname = null;
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
 * Paragraph Tools
 */
let paragraphNickname: string | null = null;

async function loginParagraphTool(nickname: string): Promise<any> {
  try {
    paragraphPage = await loginToParagraph({ nickname });
    paragraphNickname = nickname;
    return { success: true, message: `Logged in to Paragraph (${nickname})` };
  } catch (err: any) {
    paragraphPage = null;
    paragraphNickname = null;
    return { error: err.message, success: false };
  }
}

async function postParagraphTool(title: string, htmlContent: string): Promise<any> {
  try {
    if (!paragraphPage) return { error: 'Not logged in. Call login_paragraph first.', success: false };
    const result = await postToParagraph(paragraphPage, title, htmlContent);
    return { success: result.success, postUrl: result.postUrl };
  } catch (err: any) {
    return { error: err.message, success: false };
  } finally {
    if (paragraphPage) {
      await closeParagraphBrowser().catch(() => {});
      paragraphPage = null;
      paragraphNickname = null;
    }
  }
}

