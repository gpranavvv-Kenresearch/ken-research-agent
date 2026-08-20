/**
 * Plain-text cleanup for social platforms that do not render markdown.
 */
export function stripMarkdownBold(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/\*\*/g, '');
}

// Same figure shape blogSanityAgent bolds in HTML (currency, comma-grouped
// thousands, decimals, %, billion/million/trillion) — kept in sync deliberately
// so a number reads as "the same figure" whether it lands in a blog or a post.
const NUMBER_RE = /(?<![\w'"=])(?:[$₹€£]\s?)?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)%?(?:\s(?:billion|million|trillion|bn|mn))?(?!\w)/gi;

// Unicode Mathematical Bold Digits (U+1D7CE–U+1D7D7) — real distinct characters
// that render as bold on plain-text platforms (X, Facebook, LinkedIn, Tumblr,
// Mastodon all support them), unlike markdown **bold** which those platforms
// show as literal asterisks. Only digits are swapped — currency symbols, "%",
// and "billion/million" stay as normal text, so the swap doesn't touch anything
// a length-sensitive caller (e.g. a char-limit check) wasn't already counting.
const BOLD_DIGITS = ['𝟎', '𝟏', '𝟐', '𝟑', '𝟒', '𝟓', '𝟔', '𝟕', '𝟖', '𝟗'];
function boldDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => BOLD_DIGITS[Number(d)]);
}

/** Bolds every numeric figure in plain text via Unicode math-bold digits. */
export function boldNumbersForSocial(text: string): string {
  return text.replace(NUMBER_RE, boldDigits);
}

/** Collapses accidental double-spacing/blank-line runs a model sometimes emits. */
export function normalizeSocialSpacing(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')       // multiple spaces -> one
    .replace(/\n{3,}/g, '\n\n')       // 3+ blank lines -> one blank line
    .replace(/[ \t]+\n/g, '\n')       // trailing spaces before a line break
    .trim();
}

export function preparePlainSocialPost(text: string): string {
  return normalizeSocialSpacing(boldNumbersForSocial(stripMarkdownBold(text)));
}
