/**
 * UTM parameter utilities for tracking traffic sources
 */

export const UTM_PARAMS = {
  X: '?utm_source=X&utm_medium=Referral&utm_campaign=Automation',
  Facebook: '?utm_source=Facebook&utm_medium=Referral&utm_campaign=Automation',
  LinkedIn: '?utm_source=Linkedin&utm_medium=Referral&utm_campaign=Automation',
  Medium: '?utm_source=Medium&utm_medium=Referral&utm_campaign=Automation',
  Linkmate: '?utm_source=Linkmate&utm_medium=Referral&utm_campaign=Automation',
  GoogleSite: '?utm_source=GoogleSites&utm_medium=Referral&utm_campaign=Automation',
  Devto: '?utm_source=Devto&utm_medium=Referral&utm_campaign=Automation',
  Calisthenics: '?utm_source=Calisthenics&utm_medium=Referral&utm_campaign=Automation',
  Substack: '?utm_source=Substack&utm_medium=Referral&utm_campaign=Automation',
  HackMD: '?utm_source=HackMD&utm_medium=Referral&utm_campaign=Automation',
  LinkedinPulse: '?utm_source=LinkedinPulse&utm_medium=Referral&utm_campaign=Automation',
  WordPress: '?utm_source=WordPress&utm_medium=Referral&utm_campaign=Automation',
  Blogger: '?utm_source=Blogger&utm_medium=Referral&utm_campaign=Automation',
  Patreon: '?utm_source=Patreon&utm_medium=Referral&utm_campaign=Automation',
  Notion: '?utm_source=Notion&utm_medium=Referral&utm_campaign=Automation',
  Note: '?utm_source=Note&utm_medium=Referral&utm_campaign=Automation',
  Ameba: '?utm_source=Ameba&utm_medium=Referral&utm_campaign=Automation',
  Paragraph: '?utm_source=Paragraph&utm_medium=Referral&utm_campaign=Automation',
  Coda: '?utm_source=Coda&utm_medium=Referral&utm_campaign=Automation',
};

/**
 * Per-agent campaign: base "Automation" becomes "{Agent}Automation" for whichever
 * agent is running (WORKER_NAME), so traffic can be attributed to the agent in
 * analytics. e.g. abhinav → AbhinavAutomation, vansh → VanshAutomation. No
 * WORKER_NAME (generic run) → plain "Automation".
 */
function agentCampaign(): string {
  const w = (process.env.WORKER_NAME || '').trim();
  if (!w) return 'Automation';
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() + 'Automation';
}

/** Swap the generic "Automation" campaign in a UTM_PARAMS string for the running agent's own. */
export function personalizeUtm(utmString: string): string {
  return utmString.replace(/utm_campaign=Automation\b/, `utm_campaign=${agentCampaign()}`);
}

/**
 * Add UTM parameters to all URLs in text/HTML content
 * Avoids adding if UTM already exists
 */
export function injectUTM(content: string, utmString: string): string {
  if (!content || !utmString) return content;

  // Personalize the campaign for the running agent: utm_campaign=Automation → {Agent}Automation.
  const utmParams = personalizeUtm(utmString.replace(/^\?/, '')); // strip leading ?
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;

  return content.replace(urlRegex, (rawMatch) => {
    // Normalize HTML-entity-encoded ampersands first (ChatGPT-written blog HTML
    // often uses ?a=1&amp;b=2) so stripping below works regardless of which the
    // source used — output always uses plain &, never &amp;.
    const match = rawMatch.replace(/&amp;/gi, '&');

    // Never touch image/media URLs
    if (match.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      return match;
    }

    // For kenresearch.com URLs: always strip existing UTM (any case) and
    // replace with the correct platform + per-agent UTM, regardless of what
    // was already there.
    if (match.includes('kenresearch.com')) {
      const baseUrl = match
        .replace(/[?&]utm_source=[^&"'\s]*/gi, '')
        .replace(/[?&]utm_medium=[^&"'\s]*/gi, '')
        .replace(/[?&]utm_campaign=[^&"'\s]*/gi, '')
        .replace(/[?&]utm_term=[^&"'\s]*/gi, '')
        .replace(/[?&]utm_content=[^&"'\s]*/gi, '')
        .replace(/\?$/, '')   // remove trailing ?
        .replace(/&$/, '');   // remove trailing &
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}${utmParams}`;
    }

    // ChatGPT sometimes wrongly tags an external citation link (e.g. a
    // government stats page) with our own generic placeholder UTM, following
    // the "tag every link" instruction too literally. That signature
    // (utm_campaign=automation) is unambiguously ours — strip it off rather
    // than leave or personalize it, since an external site shouldn't carry
    // Ken Research's own campaign tracking at all.
    if (/utm_campaign=automation\b/i.test(match)) {
      const stripped = match
        .replace(/[?&]utm_source=[^&"'\s]*/gi, '')
        .replace(/[?&]utm_medium=[^&"'\s]*/gi, '')
        .replace(/[?&]utm_campaign=[^&"'\s]*/gi, '')
        .replace(/[?&]utm_term=[^&"'\s]*/gi, '')
        .replace(/[?&]utm_content=[^&"'\s]*/gi, '')
        .replace(/\?$/, '')
        .replace(/&$/, '');
      return stripped;
    }

    // For all other URLs: only add UTM if none already present
    if (match.toLowerCase().includes('utm_')) {
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
