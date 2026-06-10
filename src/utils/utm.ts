/**
 * UTM parameter utilities for tracking traffic sources
 */

export const UTM_PARAMS = {
  X: '?utm_source=X&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Facebook: '?utm_source=Facebook&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  LinkedIn: '?utm_source=Linkedin&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Medium: '?utm_source=Medium&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Linkmate: '?utm_source=Linkmate&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  GoogleSite: '?utm_source=GoogleSites&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Devto: '?utm_source=Devto&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Calisthenics: '?utm_source=Calisthenics&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Substack: '?utm_source=Substack&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  HackMD: '?utm_source=HackMD&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  LinkedinPulse: '?utm_source=LinkedinPulse&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  WordPress: '?utm_source=WordPress&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Blogger: '?utm_source=Blogger&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Patreon: '?utm_source=Patreon&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Notion: '?utm_source=Notion&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Note: '?utm_source=Note&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Ameba: '?utm_source=Ameba&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
  Paragraph: '?utm_source=Paragraph&utm_medium=Referral&utm_campaign=Automation&utm_campaign=AN',
};

/**
 * Add UTM parameters to all URLs in text/HTML content
 * Avoids adding if UTM already exists
 */
export function injectUTM(content: string, utmString: string): string {
  if (!content || !utmString) return content;

  const utmParams = utmString.replace(/^\?/, ''); // strip leading ?
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;

  return content.replace(urlRegex, (match) => {
    // Never touch image/media URLs
    if (match.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      return match;
    }

    // For kenresearch.com URLs: always strip existing UTM and replace with correct platform UTM
    if (match.includes('kenresearch.com')) {
      const baseUrl = match
        .replace(/[?&]utm_source=[^&"'\s]*/g, '')
        .replace(/[?&]utm_medium=[^&"'\s]*/g, '')
        .replace(/[?&]utm_campaign=[^&"'\s]*/g, '')
        .replace(/[?&]utm_term=[^&"'\s]*/g, '')
        .replace(/[?&]utm_content=[^&"'\s]*/g, '')
        .replace(/\?$/, '')   // remove trailing ?
        .replace(/&$/, '');   // remove trailing &
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}${utmParams}`;
    }

    // For all other URLs: only add UTM if none already present
    if (match.includes('utm_')) {
      return match;
    }
    const separator = match.includes('?') ? '&' : '?';
    return `${match}${separator}${utmParams}`;
  });
}

/**
 * Ensures targetUrl appears in content so UTM injection has something to tag.
 * If targetUrl is missing from content, appends a "Read the full report" link.
 * Always call this BEFORE injectUTM.
 */
export function ensureTargetUrl(content: string, targetUrl?: string): string {
  if (!targetUrl || !targetUrl.includes('kenresearch.com')) return content;
  const base = targetUrl.split('?')[0];
  if (content.includes(base)) return content;
  return content + `\n\n<p><a href="${targetUrl}">Read the full report on Ken Research</a></p>`;
}

/**
 * Extract base URL (without UTM) for display
 */
export function getBaseUrl(url: string): string {
  const match = url.match(/^[^?]*/);
  return match ? match[0] : url;
}
