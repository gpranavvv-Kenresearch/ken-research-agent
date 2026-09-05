/**
 * generate_blog_chatgpt.ts — generate a blog by driving the user's ChatGPT.
 *
 * Two format paths:
 *   - Default ('seo-li', or anything except 'custom'): the self-contained
 *     master SERP/AI-citation prompt (buildMasterPrompt) — does its own
 *     research, sourcing, and 7-section HTML assembly, no sample file needed.
 *   - 'custom': the older sample-style prompt (buildPrompt) — pastes a
 *     user-supplied sample blog as a style/structure template.
 * Either way: wait for the response to finish (~10-15 min) → extract
 * Title / Description / Content(HTML). Handles BOTH output shapes: a
 * ```html code block, or raw HTML as message text.
 *
 * Reuses the ChatGPT persistent-profile automation pattern from generate_image.ts.
 * Emits a single last-line JSON: {"status":"success","title","description","html"}.
 *
 * Usage:
 *   npx tsx scripts/generate_blog_chatgpt.ts --agent abhinav --format seo-li \
 *       --url "<report url>" --title "<report title>" [--session-dir <dir>]
 */

import { chromium, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { injectUTM, UTM_PARAMS } from '../src/utils/utm.js';
import { dismissBlockingModals, dismissRateLimitModalByEnter } from './chatgpt_composer.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const agent      = (arg('--agent') || '').toLowerCase();
const format     = (arg('--format') || 'seo-li').toLowerCase();
const url        = arg('--url') || '';
const title      = arg('--title') || '';
const sessionArg = arg('--session-dir');
const sampleArg  = arg('--sample-file'); // custom format: user-pasted sample blog HTML

function out(obj: Record<string, unknown>): never {
  // Last stdout line is the machine-readable contract (matches generate_image.ts).
  console.log(JSON.stringify(obj));
  process.exit(obj.status === 'success' ? 0 : 1);
}

/** Write a live progress line straight to the shared log (avoids stdout buffering). */
function progress(msg: string): void {
  const f = process.env.BLOG_LOG;
  if (f) { try { fs.appendFileSync(f, msg + '\n'); } catch { /* noop */ } }
  else console.error(msg);
}

if (!url || !title) out({ status: 'error', message: '--url and --title are required' });

const CHROME_PATH = process.env.CHROME_PATH || undefined;
const CHATGPT_URL = 'https://chatgpt.com/';
const RESPONSE_TIMEOUT_MS = 30 * 60 * 1000;   // hard cap 30 min
const POLL_MS = 60 * 1000;                    // check every 1 min (generation is 12-15+ min when it's actually working)
const STALL_CHECKS_TO_GIVE_UP = 4;            // this many consecutive 1-min checks with an unchanged length → treat as stuck, give up

// One profile PER AGENT (not shared team-wide) so two agents can each generate
// blog text concurrently without fighting over the same Chrome profile lock.
// "abhinav" keeps the original un-suffixed dir (already logged in there before
// this became per-agent); every other agent gets its own suffixed dir.
function sessionDir(): string {
  if (sessionArg) return path.resolve(sessionArg);
  const a = agent || 'abhinav';
  return path.resolve('.sessions-cookies', a === 'abhinav' ? 'chatgpt-profile' : `chatgpt-profile-${a}`);
}

// Only called for the 'custom' format — the user-pasted sample blog is the
// style template. Every other format uses the self-contained master prompt
// (buildMasterPrompt), which needs no sample file at all.
function loadSample(): string {
  if (!sampleArg) return '';
  const sp = path.resolve(sampleArg);
  if (!fs.existsSync(sp)) return '';
  return fs.readFileSync(sp, 'utf-8').trim();
}

/**
 * The master SERP/AI-citation blog prompt (user-supplied 2026-08-04) — fully
 * self-contained: does its own research, sourcing, fact-checking, and HTML
 * assembly per a fixed 7-section architecture. Used for every format EXCEPT
 * 'custom' (which still uses the older sample-style buildPrompt() below).
 * ARTICLE_HTML mode kept (the prompt's own default/"safest" mode) rather than
 * CMS_PACKAGE — a raw HTML response is far more robust to extract from a
 * ~1500-word ChatGPT generation than trusting valid JSON out of the same.
 */
function buildMasterPrompt(reportTitle: string, reportUrl: string): string {
  return `KEN RESEARCH SERP AND AI CITATION MASTER BLOG PROMPT
HOW TO USE
Paste this prompt into a new chat and change only the final <INPUTS> block.
Use OUTPUT_MODE: ARTICLE_HTML for a clean article body.
Keep OUTPUT_MODE: ARTICLE_HTML for the normal publishing workflow. This is the default and safest mode.
Use OUTPUT_MODE: CMS_PACKAGE only when a JSON-aware automation will decode the response before publishing.
Use IMAGE_MODE: OFF for a completely text-only article.
The only mandatory inputs are REPORT_TITLE and REPORT_URL.
ROLE
You are a senior market-intelligence editor, research analyst, SEO strategist, answer-experience architect, fact-checker, and HTML publishing specialist for Ken Research.
Produce one publication-ready article that is genuinely useful to decision-makers, eligible for search discovery, easy for answer systems to interpret, and defensible under editorial review.
SEO, GAI/GEO/AIO, AXO/AEO, and E-E-A-T are quality disciplines, not ranking tricks. Do not promise rankings, Google AI Overview inclusion, featured snippets, or AI citations.
OUTCOME
Create an evidence-led market article of 1,450-1,600 visible words that:
Answers the market question quickly and accurately.
Uses one consistent set of market values, years, units, segments, and qualifiers.
Adds original commercial interpretation instead of paraphrasing the report page.
Distinguishes Ken Research estimates, official facts, company facts, and editorial inference.
Covers the main executive intents: definition, size, forecast, growth mechanisms, value migration, competition, regulation, risks, and actions.
Uses descriptive headings, compact evidence units, natural entity language, and source-adjacent attribution.
Includes only verified, relevant, crawlable links.
Returns the exact selected output format without commentary.
NON-NEGOTIABLE TRUST RULES
Never invent a figure, date, company, ranking, market share, segment position, regulation, programme, quote, respondent count, methodology, or URL.
Search-result snippets are discovery aids, not evidence. Open the source page.
Never use a competing market-research firm as a source or hyperlink destination.
Do not present an estimate or forecast as a completed fact.
Do not invent first-hand experience, analyst credentials, customer stories, or expert quotations.
If a material claim cannot be verified, omit it or use narrower qualitative wording.
Before concluding the primary report cannot be accessed, retry opening REPORT_URL at least 3 times across a few seconds apart — a single failed load is very often a transient network hiccup, a slow first response, or a temporary bot-check, not a real block. Also try opening the bare domain (kenresearch.com) and re-navigating from there if the direct URL fails. Only after multiple genuine, consistent failures to load ANY page on the domain — or after successfully loading the page and finding its content genuinely does not match the requested market/report — is this a real block.
If, after exhausting those retries, the primary report truly cannot be accessed or its core market identity cannot be verified, do not stop or refuse. Instead, search the open web for the same market (REPORT_TITLE, its geography, and its core scope) and assemble the DATA_SPINE from other reputable, live sources — industry associations, government/regulatory statistics, company filings, reputable trade press. Still write and frame the article as Ken Research's own market intelligence throughout (e.g. "Ken Research estimates...", "According to Ken Research..."), exactly as if the primary report page had loaded normally, using the best-verified web-sourced figures as that estimate. Never name or link to a competing market-research firm (Mordor Intelligence, IMARC, MarketsandMarkets, Technavio, Precedence Research, Future Market Insights, Renub Research, or similar) as a source — if a figure's only available attribution is one of those firms, use the figure without naming its source, or omit that specific claim rather than invent a number. Only return RESEARCH BLOCKED: Primary report could not be verified if the web search itself also fails to turn up any usable, verifiable data for this market — this should be rare.
If REPORT_URL or REPORT_TITLE is a survey, feedback study, methodology page, or service offering rather than a standard market-sizing report, this DOES NOT reduce the requirement for verified market data — widen the web search instead: find verified market-size, CAGR, or forecast data for the closest adjacent, verifiable market or industry (e.g. for a patient feedback survey, search for the patient experience management market, healthcare CX market, or hospital patient satisfaction software market; for any other survey/service page, identify and search the market category it operationally belongs to). Present that verified adjacent-market data exactly as Ken Research's own market intelligence throughout (e.g. "Ken Research estimates...", "According to Ken Research..."), the same as for a standard report. Every figure must still come from a real, verifiable source — never invent one. Only return RESEARCH BLOCKED if this widened search also fails to turn up any usable, verifiable data for the market or its closest adjacent category.
GENERAL FALLBACK (applies to every rule in this prompt): if any source, page or link cannot be opened or verified — the report page, a Ken Research cluster page, an official external source — that never stops the article. Write with what you could verify, omit or soften what you could not, never invent a figure or a URL, and never return a refusal message of any kind. The only acceptable non-article output is RESEARCH BLOCKED, and only when even the widened web search finds no usable data at all.
KEN RESEARCH BRAND AUTHORITY RULES (MANDATORY — the finished article is run through an automated code validator that checks these exact rules and flags the article for review if any are missed, so follow them closely; never withhold the article over them)
Title: the H1 title must naturally contain the words "Ken Research".
Opening paragraph: paragraph 1 must (a) mention "Ken Research", (b) use an approved authority-context phrase from the approved list below in the same sentence, and (c) hyperlink that first Ken Research mention to a kenresearch.com destination (homepage or the primary report).
Approved expressions — use only these when referring to Ken Research as a source: "According to Ken Research analysis", "Ken Research market assessment indicates", "The Ken Research study highlights", "Ken Research estimates".
Banned expressions — never write these: "Ken Research says", "Ken Research thinks", "Ken Research provides reports".
Mention frequency: since this article is always 1,450-1,600 words (above the 1,200-word threshold), the text must contain between 2 and 4 total mentions of "Ken Research" (counting every occurrence in visible text, including the title) — never fewer than 2, never more than 4.
Promotional risk: never use the words "Buy", "Purchase", "Download now", or "Get report" anywhere in the article. Keep the tone strictly editorial.
Every Ken Research mention must be connected to evidence, market intelligence, analysis, or methodology — never a bare/promotional reference.
RESEARCH CONTRACT
Complete the following silently before drafting.
1. Resolve the market entity
Open REPORT_URL and resolve redirects to the final canonical Ken Research report page. If the first attempt fails to load, retry — do not treat one failed request as proof the page or domain is unreachable.
Confirm the exact market, geography, included products or services, excluded scope, currency, and forecast period.
Read the accessible summary, KPI cards, tables, charts, segmentation, competitive coverage, methodology, FAQs, and publication information.
2. Lock the DATA_SPINE
Record the verified values available for:
Base or historical value, currency, year, and status
Current estimate, when available
Forecast value, currency, and year
Published CAGR and exact period
Volume and unit, when available
Largest segment and segmentation dimension
Fastest-growing segment and segmentation dimension
Important demand, pricing, technology, channel, funding, trade, or regulatory indicators
Verified market participants
Verified methodology information
Every repeated figure must match this DATA_SPINE. Recalculate CAGR from the locked values as a reasonableness check, but do not replace a published rate merely because of normal rounding.
3. Build the CLAIM_LEDGER
For every candidate factual claim, record its source URL, publisher, date, geography, year, unit, status, scope, and permitted wording.
Use this source hierarchy:
Ken Research report page for proprietary market estimates, segmentation, forecast, competitive coverage, and methodology.
Government departments, regulators, national statistics offices, public agencies, and primary legal or policy documents.
Official company filings, releases, product pages, and investor materials for company-specific claims.
Recognized multilaterals and industry associations when stronger primary evidence is unavailable.
Reputable trade sources only for non-critical context that cannot be obtained from a primary source.
4. Resolve conflicts and freshness
Use the latest authoritative official source for external policy, demographic, regulatory, funding, budget, and programme facts.
Cross-check the Ken Research page's hero, KPI cards, tables, narrative, charts, and FAQs.
Never combine a value from one year with a CAGR or forecast from another data series.
If one page label conflicts with a consistent value-year combination repeated elsewhere, use the consistent combination and log the isolated label in SOURCE_QA.
If a contradiction cannot be resolved, omit the disputed detail.
Put a verified year beside time-sensitive claims. Avoid unsupported words such as "currently," "recently," or "today."
5. Build the INTENT_AND_ENTITY_MAP
Identify:
Primary query and exact market entity
Likely executive follow-up questions
Related entities, technologies, policies, channels, companies, and buyer groups
The one commercial thesis the evidence best supports
The strongest counter-risk to that thesis
Three stakeholder decisions the article should improve
Use natural entity language. Do not create separate paragraphs merely to target keyword variants.
6. Validate links
Open every intended destination and confirm successful loading, final canonical URL, page-title match, topic relevance, and support for the surrounding statement.
Reject guessed URLs, soft 404s, search pages, generic filter pages, login walls, empty pages, irrelevant redirects, shortened URLs, or fabricated report slugs.
7. Check cannibalization and content uniqueness
Search the Ken Research domain for an existing article targeting the same market and primary query.
If an existing page satisfies the same intent, design this article as a substantive update or choose a clearly distinct executive angle rather than creating a near-duplicate.
In CMS_PACKAGE mode, record the competing internal URL and recommended action in seo.cannibalization_alert.
Do not copy paragraphs from the report page or create near-identical versions for multiple publishing platforms.
SEARCH AND AI-ANSWER WRITING STANDARD
Answer-first construction
The first paragraph must answer what the market is, its verified size or status, forecast direction, and why the result matters.
The first paragraph after every H2 must answer that section's question in approximately 45-80 words.
Follow the answer with deeper evidence and implications. Do not bury the conclusion at the end.
Citation-ready evidence units
Build short, self-contained passages around one claim cluster:
State the claim with the entity, geography, year, and unit.
Attribute the evidence directly.
Explain the mechanism.
State the commercial implication or counter-risk.
Keep Ken Research estimates, official evidence, and analysis visibly distinct with wording such as:
"Ken Research estimates..."
"Official data from [agency] shows..."
"This suggests..."
Original value
The article must contribute at least three forms of original analytical value:
A causal explanation of what moves value, volume, margins, or access
A stakeholder-specific implication
A credible counterpoint, constraint, or downside scenario
Do not merely restate drivers, company names, and market figures from the report page.
E-E-A-T and trust signals
Use a supplied author or organization byline; never invent an analyst.
State the research basis, source types, and data status.
Preserve regulatory and programme status: proposal, recommendation, enacted rule, active programme, or historical measure.
Name sources and dates where they materially improve trust.
Use company claims only for that company and label them accordingly.
Treat trust as the priority when experience, expertise, authority, and promotional language conflict.
Readability and language
Write for senior executives in neutral, concrete language.
Keep paragraphs to two or three sentences and normally below 90 words.
Average roughly 16-24 words per sentence.
Use one idea per paragraph and one clear purpose per section.
Avoid vague consulting phrases, generic introductions, hype, keyword stuffing, and repeated strategic labels.
Do not use the same statistic and implication in more than two body locations, excluding one FAQ retrieval answer.
Use <strong> selectively for decisive values and conclusions, not every number.
NEW ARTICLE ARCHITECTURE
Use exactly one H1 and exactly seven H2 sections, in this fixed order and role.
H2 heading wording — do not default to the same literal H2 heading text article after article. Each "H2 N:" label below names that section's ROLE, not mandatory verbatim text — write a fresh, natural heading for this specific market that fulfills the role (often working in the market entity, geography, or the article's live theme) instead of reusing a stock phrase every time. Keep the section order and count fixed; vary only the wording.
Hero image, conditional
If IMAGE_MODE: ON and HERO_IMAGE_URL passes validation, place a verified hero image before the H1. If the image fails, omit it silently. If IMAGE_MODE: OFF, output no image tags or image discussion.
H1 — MANDATORY TWO-CLAUSE TITLE FORMAT (overrides any generic headline length/shape guidance elsewhere)
The H1 always has exactly two clauses joined by " : " (space, colon, space). Never omit the colon clause — a title without it fails validation.
Clause 1 — the market-size headline:
{GEOGRAPHY} {MARKET NAME} Market {Nears|Hits} USD {VALUE}{B|M}
Use "Nears" when the headline value is an approaching/forecast figure not yet reached. Use "Hits" when the headline value is a current/achieved figure.
{VALUE}{B|M} format: "USD" followed by the number then immediately "B" (billion) or "M" (million) with no space before the letter — e.g. "USD 5.83B", "USD 211B", "USD 99.1M", "USD 1.6B", "USD 14M". Use one or two decimal places only when the verified figure needs them; whole numbers stay whole (e.g. "USD 211B", not "USD 211.0B").
Geography is the short verified market geography (e.g. "India", "Global", "Vietnam", "Thailand", "Middle East", "APAC", "Kuwait"). Market Name is the concise verified market/report entity.
Clause 2 — the Ken Research analytical hook, in one of exactly two patterns:
Pattern A (Tracks): Ken Research Tracks a/an {2-4 word Insight Noun Phrase}
  Example insight phrases: "a Compliance Race", "a Counterfeit Risk", "a Workforce Gap", "an IT Talent Gap", "a Gastroenterologist Shortage", "a Consolidation Wave", "a Channel Shift", "a Compliance Filter", "a Regulatory Divide".
Pattern B (Flags): Ken Research Flags {Factor} as the Real|Bigger {Consequence Noun Phrase}
  Example: "Ken Research Flags SME Financing as the Real Modernization Bottleneck", "Ken Research Flags Price Volatility as the Bigger Risk", "Ken Research Flags Brand Concentration as the Real Entry Barrier".
Choose whichever pattern the article's strongest counter-risk/thesis fits more naturally — the insight phrase (Pattern A) or factor+consequence (Pattern B) must genuinely reflect the counter-risk identified in the RESEARCH CONTRACT and Decision Framework sections, never a generic or unrelated phrase.
Title-case both clauses (capitalize major words); keep small connector words ("a", "an", "as", "the") lowercase except when starting a clause.
Full worked examples (format only — do not reuse the figures):
"India Sustainable Packaging Market Nears USD 5.83B : Ken Research Tracks a Compliance Race"
"Global Fried Onion Market Hits USD 4.9B : Ken Research Flags Price Volatility as the Bigger Risk"
Do not use vague trend-only endings such as "Shifts to Powered Care," "Enters a New Era," or "Growth Accelerates" in place of clause 2 — clause 2 must always be the "Ken Research Tracks/Flags ..." structure above.
Typical total length runs 80-100 visible characters; up to ~130 is acceptable for a longer Pattern B consequence phrase. There is no fixed 50-60 character cap — the two-clause structure and clarity take priority over brevity.
Wrap only "USD {VALUE}{B|M}" in <strong> inside the H1; leave the rest of the H1 unformatted.
No byline
Never output a byline paragraph (e.g. "By Ken Research", "By [Author]", or any variant) anywhere in the article, regardless of SHOW_BYLINE or AUTHOR_NAME field values. The article body goes directly from the H1 into the opening abstract paragraph.
No citation-tool artifacts
Never output raw citation/browsing-tool markup such as ":contentReference[oaicite:0]{index=0}", "[oaicite:...]", or any other bracket-style citation residue. If a claim needs a source, express it in plain prose (e.g. "According to Ken Research analysis...") or as a proper <a> hyperlink per the LINK ARCHITECTURE rules — never as leftover tool syntax. Reread the full response before returning it and strip any such artifact if one appears.
Opening abstract
Write two paragraphs totaling approximately 140-180 words.
Paragraph 1:
Answer the market definition, size or current status, forecast direction, and time period.
Link the first natural Ken Research mention to the homepage.
Link the market name to the primary report in a separate sentence.
Use no more than three core statistics.
Paragraph 2:
State the main growth mechanism, counter-risk, and central commercial thesis.
Do not summarize every later section.
H2 1: Market Definition and Evidence Snapshot
Begin with a one-sentence definition that clarifies what is included and, when necessary, excluded.
Add exactly five concise bullets: current/base value, forecast and CAGR period, segment structure, one official external signal, and the central implication or risk.
Use complementary evidence rather than repeating the opening word for word.
If IMAGE_MODE: ON and SNAPSHOT_IMAGE_URL passes validation, place it after the definition and before the bullets.
H2 2: Growth Mechanisms and Market Economics
Use two or three H3 subsections selected for the market, covering ground such as:
what is expanding the demand base
how price and volume are interacting
which technology, funding, replacement, or channel mechanism matters most
H3 phrasing is not required to be a question every time — use a question, a direct statement, or a short thematic label, whichever reads most naturally for that specific point; do not mechanically convert every H3 into a question just for formatting consistency, and do not phrase all H3s in a section the same way.
Each subsection must move from evidence to mechanism to commercial consequence.
H2 3: Where Market Value Is Moving
Use two H3 subsections to explain the most decision-relevant shifts across product, technology, application, end user, channel, geography, or price tier. Same H3-phrasing freedom as above — question, statement, or label, whichever fits.
Identify the segmentation dimension explicitly.
Distinguish largest from fastest-growing.
Explain buyer behaviour and why the mix shift matters.
Do not list every segment.
H2 4: Competition, Regulation and Entry Barriers
Use two or three H3 subsections. Same H3-phrasing freedom as above.
Discuss only verified participants and treat them as unranked unless shares or rankings are sourced.
Explain the real basis of competition: access, distribution, service, pricing, technology, procurement, compliance, or customer relationships.
Explain the most material regulation, policy, funding rule, trade condition, or barrier to entry using an official source.
Include the strongest risk to the article's thesis.
After this section, include CTA 1 linking to the canonical primary report. The anchor must describe the destination accurately.
H2 5: Decision Framework and Market Outlook
Use exactly two H3 subsections:
Decision Framework
Signals to Monitor
Requirements:
Translate the evidence into exactly three stakeholder actions.
Present a measured base-case direction and two conditions that could strengthen or weaken it. Do not invent probabilities.
Identify leading indicators to monitor through the forecast period.
Add one or two relevant Ken Research cluster links only when they give useful adjacent-market context.
After this section, include CTA 2 linking to the Ken Research Talk to Us destination. Use exactly one of these two verified URLs (either is acceptable — do not invent or use any other "talk to us"/"contact" URL): https://www.kenresearch.com/book-a-discovery-call or https://www.kenresearch.com/custom-form, each with the mandatory UTM string appended as usual. Keep it consultative.
H2 6: Frequently Asked Questions
Include exactly five unique FAQ pairs. Use an H3 question and one 45-65-word answer for each.
Cover:
Market definition and scope
Size, year, and data status
Forecast value and CAGR period
Segment, competition, or regulation
Primary opportunity or risk
Question format — mandatory: prefix every H3 question with its number in the form "Q1:", "Q2:", "Q3:", "Q4:", "Q5:" (in order), followed by a space, then the question text. Each question must explicitly include the exact market name (e.g. "the Global Welded Metal Bellow Market") rather than a vague pronoun like "the market" or "this segment", and must be phrased the way a real executive searcher would type or ask it — matching the underlying search/answer intent for that FAQ topic (definition intent, sizing intent, forecast intent, segmentation/competition intent, opportunity/risk intent), not a generic templated phrasing.
Example: "Q2: How Large Is the Global Welded Metal Bellow Market in 2025?" — not "Q2: How large is the market?".
Answer directly in the first sentence. Do not add unsupported facts.
FAQ interlinking — mandatory: include exactly two Ken Research hyperlinks across the five FAQ answers — one link each inside two different answers (never both links in the same answer, never more than two total in this section). Link to the primary report or a genuinely relevant Ken Research cluster page, using the same UTM rules as the rest of the article. Use descriptive market-topic anchor text for these two links (e.g. the market/report name) rather than the literal words "Ken Research" — this keeps the article's total "Ken Research" mention count within the mandatory brand-frequency band above. The other three answers stay link-free.
H2 7: Methodology and Sources
Reserve approximately 110-150 words for this final section and write three complete paragraphs:
Research Basis: verified Ken Research methodology and validation information.
Sources: primary report attribution plus the most important official source publishers. Include the third primary-report link placement here.
Disclaimer: a concise statement that the article is for informational purposes and that readers should consult the full report or relevant professionals before making decisions.
Do not claim a confidence level unless the report publishes one.
Do not add a separate caveats section. The article is not complete until the Disclaimer paragraph is fully written and closed with </p>.
COMPLETION LOCK
Draft all seven H2 sections before returning any output.
Reserve the final 110-150 visible words for Methodology and Sources.
If the response approaches the length limit, compress earlier analysis. Never truncate the final section, FAQ answers, CTAs, source attribution, or disclaimer.
The final HTML element must be the complete Disclaimer paragraph.
The final non-whitespace characters in ARTICLE_HTML mode must be </p>.
Count opening and closing <p>, <h1>, <h2>, <h3>, <ul>, <li>, <a>, <strong>, and <em> tags. Every opened tag must close.
Do not return a partial article under any circumstance.
LINK ARCHITECTURE
The finished article should contain 12-14 Ken Research link placements when enough destinations can be verified, separate from official external citations. Fewer verified links is acceptable; invented links never are.
Required Ken Research distribution:
Ken Research homepage: exactly one placement in the opening
Canonical primary report: exactly three placements in the opening, CTA 1, and Sources paragraph
Ken Research Talk to Us: exactly one placement in CTA 2, using either https://www.kenresearch.com/book-a-discovery-call or https://www.kenresearch.com/custom-form (with UTM) — never any other "talk to us"/"contact"/"custom form" URL
Frequently Asked Questions: exactly two placements, one each inside two different FAQ answers
Relevant Ken Research cluster pages: target five to seven placements using five to seven unique destinations — use as many as can actually be verified
Total Ken Research placements: target 12-14
Total unique Ken Research destinations: target at least eight
Use one or two unique official government, regulator, national-statistics, or public-agency links, with two preferred when two strong and directly relevant sources exist. Never use more than two official external citations. These external citations do not count toward the 12-14 Ken Research placements.
Aim for one or two official external citations and never more than two. If no official government, regulator or national-statistics page can be verified for this market, write the article with zero external citations rather than inventing one or refusing — attribute the relevant claims to Ken Research analysis instead.
Distribute internal links across the article:
Opening: homepage and primary report
Market Definition and Evidence Snapshot: one relevant cluster page
Growth Mechanisms and Market Economics: one or two relevant cluster pages
Where Market Value Is Moving: one or two relevant cluster pages
Competition, Regulation and Entry Barriers: one relevant cluster page plus primary-report CTA 1
Decision Framework and Market Outlook: one or two relevant cluster pages plus Talk to Us CTA 2
Frequently Asked Questions: two links, one each inside two different FAQ answers (primary report or a relevant cluster page)
Methodology and Sources: primary report
Prioritize actual related Ken Research report pages. A verified sector, service, report-store category, or Competition Benchmarking page may be used only when it directly fits the surrounding discussion. Never use a generic page merely to reach the count.
If five unique relevant cluster destinations cannot be verified after a genuine search, do not stop and do not refuse. Write the complete article using every Ken Research destination you COULD verify — the homepage, the primary report and the Talk to Us URL are always available, so at minimum those three appear — and simply include fewer cluster links. Never guess or invent a URL to reach a count. Never return "LINK VALIDATION BLOCKED" or any other refusal because of link count: a complete article with fewer verified links is always the correct output; a refusal never is.
Competitor market-research domains are prohibited.
Link quality
Use concise descriptive anchor text, not "click here," "read more," naked URLs, or repeated exact-match anchors.
Place the link next to the claim or context it supports.
Do not put two links in one sentence.
Prefer one link per paragraph.
Related Ken Research pages must be verified, genuinely relevant, and contextually introduced.
External factual links must point to direct primary pages, not government homepages when a specific page is available.
Mandatory UTM rule — EXACT, byte-for-byte, no exceptions
Every Ken Research hyperlink must end with this EXACT UTM string, character for character, with absolutely nothing changed, added, removed, re-encoded, or reordered:
?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation
Example — for the report https://www.kenresearch.com/saudi-arabia-outdoor-play-structures-market, the final href must be exactly:
https://www.kenresearch.com/saudi-arabia-outdoor-play-structures-market?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation
Rules:
Only the base URL (the domain + path, e.g. https://www.kenresearch.com/saudi-arabia-outdoor-play-structures-market) may vary from link to link. The UTM string itself — ?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation — must be pasted identically on every single Ken Research link, with zero variation.
Use a literal "?" to join the base URL and the UTM string — never "&", never "&amp;", never a second "?".
Use a literal "&" between utm_medium and utm_campaign — never "&amp;", never any HTML-entity encoding.
Do not change letter casing anywhere in the UTM string. Do not add, drop, duplicate, or reorder any of the three parameters.
If the base URL already ends with a "/", still join with a single "?" — never leave a stray "/" or "&" before the UTM string.
Apply this to all 12-14 Ken Research placements, including homepage, primary report, related pages, FAQ links, and Talk to Us.
Do not add any query parameters to official external sources.
Reopen every tracked URL and verify it reaches the intended page AND ends with exactly ?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation.
Reject any Ken Research <a> tag whose href does not end with that exact UTM string.
Link markup
For LINK_STYLE_MODE: CMS, use clean crawlable anchors:
<a href='FINAL_URL'><strong>DESCRIPTIVE ANCHOR</strong></a>
For LINK_STYLE_MODE: INLINE, use:
<a href='FINAL_URL' style='color:#0645AD; font-weight:700; text-decoration:underline;' target='_blank' rel='noopener'><strong>DESCRIPTIVE ANCHOR</strong></a>
Use single quotation marks for HTML attributes.
IMAGE RULES
When IMAGE_MODE: OFF:
Output no image tags.
Do not search for, request, generate, or mention images.
When IMAGE_MODE: ON:
Use only supplied image URLs.
Confirm a successful image response and inspect the image.
Reject broken, unreadable, misspelled, truncated, contradictory, outdated, or fabricated visual data.
Prefer a 16:9 hero image at least 1200 pixels wide.
Write concise descriptive alt text based on the actual visual and market entity.
Do not stuff keywords or place unsupported figures in alt text.
Hero markup:
<img src='HERO_IMAGE_URL' alt='VERIFIED DESCRIPTIVE ALT' loading='eager'/>
Snapshot markup:
<img src='SNAPSHOT_IMAGE_URL' alt='VERIFIED DESCRIPTIVE ALT' loading='lazy'/>
OUTPUT MODES
ARTICLE_HTML
Precede the fragment with the single "Description:" line defined in FINAL RESPONSE, then return one clean HTML fragment.
Put each block element on a new real line.
Never output the literal character sequences \\n, \\r, or \\t.
Do not JSON-escape the HTML.
Allowed tags:
<img>, <h1>, <h2>, <h3>, <p>, <ul>, <li>, <a>, <strong>, <em>
Do not output Markdown, code fences, full HTML document wrappers, meta tags, CSS blocks, JavaScript, schema, comments, tables, footnotes, internal ledgers, or commentary.
After the single "Description:" line (see FINAL RESPONSE), the HTML fragment must begin with < and end with the final </p> from the completed Disclaimer paragraph.
CMS_PACKAGE
Return one valid JSON object with exactly these keys:
seo
schema
source_qa
link_manifest
article_html
seo must include:
meta_title: 50-60 characters and include the strongest verified numerical hook
meta_description: 145-155 characters
slug: concise lowercase hyphenated slug
canonical_url: supplied value or null
primary_keyword: exact market entity
secondary_entities: five to eight verified related entities
excerpt: 150-170 characters
author_name: supplied value or null
published_date: supplied value or null
updated_date: supplied value or null
featured_image_alt: verified value or null
cannibalization_alert: verified competing internal URL and recommendation, or null
post_publish_checks: an array covering indexability, canonical rendering, sitemap inclusion, mobile content parity, Core Web Vitals, schema validation, image fetchability, and crawlable internal links
schema must include article, faq, and breadcrumb fields.
If CMS_GENERATES_SCHEMA: YES, return null for all three.
If CMS_GENERATES_SCHEMA: NO, generate valid JSON-LD only when required author, date, canonical URL, image, and breadcrumb inputs are available.
Schema must match visible content exactly. Do not invent missing fields.
Do not create special "AI schema"; use only valid structured data supported by the visible page.
source_qa must be an array of verified source-page contradictions, each containing issue, locations, safe_article_value, and recommended_fix. Use an empty array when none are found.
link_manifest must list each final link's type, anchor, url, section, and verification_status.
article_html must contain the complete validated article as one continuous JSON string. Do not insert \\n, \\r, or \\t escape sequences. The JSON-aware consumer must decode this field before publishing; never publish the raw JSON representation.
PUBLISHING DEPENDENCIES OUTSIDE THE ARTICLE
The content cannot rank or become eligible for AI features if the published page is inaccessible or technically ineligible. The CMS or SEO workflow must separately verify after publication:
The final URL returns HTTP 200 and is not blocked by robots rules or noindex.
The page declares the intended canonical URL.
The same primary content and structured data are available on mobile.
The URL is discoverable through crawlable internal links and the XML sitemap.
Core Web Vitals and general page experience are acceptable.
Images are publicly fetchable, correctly sized, and not blocked.
Structured data parses successfully and matches visible content.
Updated dates change only after a meaningful content revision.
FINAL QA GATE
Before returning the deliverable, verify:
Evidence
Every factual claim has a source in the CLAIM_LEDGER.
Market values, years, currency, volume, CAGR period, and segment dimensions are consistent.
Estimates, forecasts, official facts, company facts, and inference are labelled correctly.
No search snippet, competitor report, fabricated URL, unsupported ranking, or invented methodology remains.
Report-page inconsistencies are resolved safely or omitted and logged.
Search and answer quality
The H1 follows the mandatory two-clause "{Geography} {Market} Market Nears/Hits USD {Value}{B|M} : Ken Research Tracks/Flags ..." format, contains the market entity, and includes the strongest verified numerical hook.
The article has exactly seven H2 sections and five FAQs.
Each H2 begins with a direct answer.
The market scope is explicitly defined.
Important claims include entity, geography, year, unit, and attribution where applicable.
The article contains original mechanisms, stakeholder implications, and a counter-risk.
No section repeats another section's full fact-and-implication pair.
The article does not duplicate an existing Ken Research page targeting the same intent without a distinct update or angle.
Language is natural, specific, neutral, and free of keyword stuffing.
Visible article length is 1,450-1,600 words.
Links and images
Every link loads, matches its destination, and uses descriptive anchor text.
No competitor market-research link exists.
The article contains every Ken Research link that could be verified, up to 12-14 placements (the two FAQ links included), and no invented URLs.
The primary report appears exactly three times; homepage and Talk to Us appear exactly once each.
Verified Ken Research cluster destinations (ideally five to seven) are used contextually.
One or two unique official external citations are present and counted separately; the count never exceeds two.
Every Ken Research href ends with exactly ?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation — no &amp; entities, no extra "?" or "&", no casing changes.
Official external links contain no UTM parameters.
Image mode and image validation rules are satisfied.
Technical package
Article HTML uses only allowed tags and valid nesting.
All seven H2 sections, five FAQs, two CTAs, Research Basis, Sources, and Disclaimer are complete.
Every opened HTML tag closes, and the final HTML element is the complete Disclaimer paragraph ending with </p>.
ARTICLE_HTML mode uses real line breaks and contains no literal \\n, \\r, or \\t sequences.
ARTICLE_HTML mode contains no metadata or schema.
CMS_PACKAGE mode parses as JSON and contains exactly the required keys.
CMS_PACKAGE article_html is complete and contains no newline escape sequences.
Metadata character limits are met.
Cannibalization alerts and post-publish technical checks are present in CMS_PACKAGE mode.
Schema is absent when CMS-generated or when required inputs are missing.
Schema and FAQs match visible content exactly.
FINAL RESPONSE
For OUTPUT_MODE: ARTICLE_HTML, output EXACTLY ONE line beginning "Description: " (the meta description, built per the DESCRIPTION LINE rule below), then a line break, then the validated HTML fragment — and nothing else.
For OUTPUT_MODE: CMS_PACKAGE, return only the validated JSON object.
Do not add explanations, research notes, validation results, or Markdown fences.
DESCRIPTION LINE (ARTICLE_HTML only) — build it from the locked DATA_SPINE, in EXACTLY this shape and word order:
Description: The {full descriptive market name} worth USD {base or current value} {unit} in {base year} is growing at a CAGR of {published CAGR}% to reach USD {forecast value} {unit} by {forecast year}. {three to five verified market participants from the DATA_SPINE, comma-separated}
Rules for this line: use the FULL descriptive market name (not the short label); pull every number from the DATA_SPINE and never invent one; if the report does not provide a given value, omit only that clause and keep the sentence grammatical (e.g. drop "worth USD ... in {year}" when there is no base value); one line only, plain text, no HTML tags, no markdown.
<INPUTS> REPORT_TITLE: ${reportTitle} REPORT_URL: ${reportUrl}
OUTPUT_MODE: ARTICLE_HTML
LINK_STYLE_MODE: CMS
IMAGE_MODE: OFF
HERO_IMAGE_URL:
SNAPSHOT_IMAGE_URL:
SHOW_BYLINE: OFF
AUTHOR_NAME: Ken Research
PUBLISHED_DATE:
UPDATED_DATE:
CANONICAL_BLOG_URL:
BREADCRUMB_PARENT_URL:
CMS_GENERATES_SCHEMA: YES
</INPUTS>`;
}

// A complete, independent copy of buildMasterPrompt (V1) — not derived from
// it, never sharing code, so V1 or V2 can be edited later without touching
// the other. Identical to V1 except: the H2-heading-wording rule is replaced
// with a mandatory keyword-in-H2 requirement, "UK" is added to the H1
// geography examples, and the two keyword-stuffing-avoidance notes are
// relaxed since V2 deliberately does controlled keyword placement.
function buildMasterPromptV2(reportTitle: string, reportUrl: string): string {
  return `KEN RESEARCH SERP AND AI CITATION MASTER BLOG PROMPT (V2 — KEYWORD-FOCUSED H2s)
HOW TO USE
Paste this prompt into a new chat and change only the final <INPUTS> block.
Use OUTPUT_MODE: ARTICLE_HTML for a clean article body.
Keep OUTPUT_MODE: ARTICLE_HTML for the normal publishing workflow. This is the default and safest mode.
Use OUTPUT_MODE: CMS_PACKAGE only when a JSON-aware automation will decode the response before publishing.
Use IMAGE_MODE: OFF for a completely text-only article.
The only mandatory inputs are REPORT_TITLE and REPORT_URL.
ROLE
You are a senior market-intelligence editor, research analyst, SEO strategist, answer-experience architect, fact-checker, and HTML publishing specialist for Ken Research.
Produce one publication-ready article that is genuinely useful to decision-makers, eligible for search discovery, easy for answer systems to interpret, and defensible under editorial review.
SEO, GAI/GEO/AIO, AXO/AEO, and E-E-A-T are quality disciplines, not ranking tricks. Do not promise rankings, Google AI Overview inclusion, featured snippets, or AI citations.
OUTCOME
Create an evidence-led market article of 1,450-1,600 visible words that:
Answers the market question quickly and accurately.
Uses one consistent set of market values, years, units, segments, and qualifiers.
Adds original commercial interpretation instead of paraphrasing the report page.
Distinguishes Ken Research estimates, official facts, company facts, and editorial inference.
Covers the main executive intents: definition, size, forecast, growth mechanisms, value migration, competition, regulation, risks, and actions.
Uses descriptive headings, compact evidence units, natural entity language, and source-adjacent attribution.
Includes only verified, relevant, crawlable links.
Returns the exact selected output format without commentary.
NON-NEGOTIABLE TRUST RULES
Never invent a figure, date, company, ranking, market share, segment position, regulation, programme, quote, respondent count, methodology, or URL.
Search-result snippets are discovery aids, not evidence. Open the source page.
Never use a competing market-research firm as a source or hyperlink destination.
Do not present an estimate or forecast as a completed fact.
Do not invent first-hand experience, analyst credentials, customer stories, or expert quotations.
If a material claim cannot be verified, omit it or use narrower qualitative wording.
Before concluding the primary report cannot be accessed, retry opening REPORT_URL at least 3 times across a few seconds apart — a single failed load is very often a transient network hiccup, a slow first response, or a temporary bot-check, not a real block. Also try opening the bare domain (kenresearch.com) and re-navigating from there if the direct URL fails. Only after multiple genuine, consistent failures to load ANY page on the domain — or after successfully loading the page and finding its content genuinely does not match the requested market/report — is this a real block.
If, after exhausting those retries, the primary report truly cannot be accessed or its core market identity cannot be verified, do not stop or refuse. Instead, search the open web for the same market (REPORT_TITLE, its geography, and its core scope) and assemble the DATA_SPINE from other reputable, live sources — industry associations, government/regulatory statistics, company filings, reputable trade press. Still write and frame the article as Ken Research's own market intelligence throughout (e.g. "Ken Research estimates...", "According to Ken Research..."), exactly as if the primary report page had loaded normally, using the best-verified web-sourced figures as that estimate. Never name or link to a competing market-research firm (Mordor Intelligence, IMARC, MarketsandMarkets, Technavio, Precedence Research, Future Market Insights, Renub Research, or similar) as a source — if a figure's only available attribution is one of those firms, use the figure without naming its source, or omit that specific claim rather than invent a number. Only return RESEARCH BLOCKED: Primary report could not be verified if the web search itself also fails to turn up any usable, verifiable data for this market — this should be rare.
If REPORT_URL or REPORT_TITLE is a survey, feedback study, methodology page, or service offering rather than a standard market-sizing report, this DOES NOT reduce the requirement for verified market data — widen the web search instead: find verified market-size, CAGR, or forecast data for the closest adjacent, verifiable market or industry (e.g. for a patient feedback survey, search for the patient experience management market, healthcare CX market, or hospital patient satisfaction software market; for any other survey/service page, identify and search the market category it operationally belongs to). Present that verified adjacent-market data exactly as Ken Research's own market intelligence throughout (e.g. "Ken Research estimates...", "According to Ken Research..."), the same as for a standard report. Every figure must still come from a real, verifiable source — never invent one. Only return RESEARCH BLOCKED if this widened search also fails to turn up any usable, verifiable data for the market or its closest adjacent category.
GENERAL FALLBACK (applies to every rule in this prompt): if any source, page or link cannot be opened or verified — the report page, a Ken Research cluster page, an official external source — that never stops the article. Write with what you could verify, omit or soften what you could not, never invent a figure or a URL, and never return a refusal message of any kind. The only acceptable non-article output is RESEARCH BLOCKED, and only when even the widened web search finds no usable data at all.
KEN RESEARCH BRAND AUTHORITY RULES (MANDATORY — the finished article is run through an automated code validator that checks these exact rules and flags the article for review if any are missed, so follow them closely; never withhold the article over them)
Title: the H1 title must naturally contain the words "Ken Research".
Opening paragraph: paragraph 1 must (a) mention "Ken Research", (b) use an approved authority-context phrase from the approved list below in the same sentence, and (c) hyperlink that first Ken Research mention to a kenresearch.com destination (homepage or the primary report).
Approved expressions — use only these when referring to Ken Research as a source: "According to Ken Research analysis", "Ken Research market assessment indicates", "The Ken Research study highlights", "Ken Research estimates".
Banned expressions — never write these: "Ken Research says", "Ken Research thinks", "Ken Research provides reports".
Mention frequency: since this article is always 1,450-1,600 words (above the 1,200-word threshold), the text must contain between 2 and 4 total mentions of "Ken Research" (counting every occurrence in visible text, including the title) — never fewer than 2, never more than 4.
Promotional risk: never use the words "Buy", "Purchase", "Download now", or "Get report" anywhere in the article. Keep the tone strictly editorial.
Every Ken Research mention must be connected to evidence, market intelligence, analysis, or methodology — never a bare/promotional reference.
RESEARCH CONTRACT
Complete the following silently before drafting.
1. Resolve the market entity
Open REPORT_URL and resolve redirects to the final canonical Ken Research report page. If the first attempt fails to load, retry — do not treat one failed request as proof the page or domain is unreachable.
Confirm the exact market, geography, included products or services, excluded scope, currency, and forecast period.
Read the accessible summary, KPI cards, tables, charts, segmentation, competitive coverage, methodology, FAQs, and publication information.
2. Lock the DATA_SPINE
Record the verified values available for:
Base or historical value, currency, year, and status
Current estimate, when available
Forecast value, currency, and year
Published CAGR and exact period
Volume and unit, when available
Largest segment and segmentation dimension
Fastest-growing segment and segmentation dimension
Important demand, pricing, technology, channel, funding, trade, or regulatory indicators
Verified market participants
Verified methodology information
Every repeated figure must match this DATA_SPINE. Recalculate CAGR from the locked values as a reasonableness check, but do not replace a published rate merely because of normal rounding.
3. Build the CLAIM_LEDGER
For every candidate factual claim, record its source URL, publisher, date, geography, year, unit, status, scope, and permitted wording.
Use this source hierarchy:
Ken Research report page for proprietary market estimates, segmentation, forecast, competitive coverage, and methodology.
Government departments, regulators, national statistics offices, public agencies, and primary legal or policy documents.
Official company filings, releases, product pages, and investor materials for company-specific claims.
Recognized multilaterals and industry associations when stronger primary evidence is unavailable.
Reputable trade sources only for non-critical context that cannot be obtained from a primary source.
4. Resolve conflicts and freshness
Use the latest authoritative official source for external policy, demographic, regulatory, funding, budget, and programme facts.
Cross-check the Ken Research page's hero, KPI cards, tables, narrative, charts, and FAQs.
Never combine a value from one year with a CAGR or forecast from another data series.
If one page label conflicts with a consistent value-year combination repeated elsewhere, use the consistent combination and log the isolated label in SOURCE_QA.
If a contradiction cannot be resolved, omit the disputed detail.
Put a verified year beside time-sensitive claims. Avoid unsupported words such as "currently," "recently," or "today."
5. Build the INTENT_AND_ENTITY_MAP
Identify:
Primary query and exact market entity
Likely executive follow-up questions
Related entities, technologies, policies, channels, companies, and buyer groups
The one commercial thesis the evidence best supports
The strongest counter-risk to that thesis
Three stakeholder decisions the article should improve
Use natural entity language.
6. Validate links
Open every intended destination and confirm successful loading, final canonical URL, page-title match, topic relevance, and support for the surrounding statement.
Reject guessed URLs, soft 404s, search pages, generic filter pages, login walls, empty pages, irrelevant redirects, shortened URLs, or fabricated report slugs.
7. Check cannibalization and content uniqueness
Search the Ken Research domain for an existing article targeting the same market and primary query.
If an existing page satisfies the same intent, design this article as a substantive update or choose a clearly distinct executive angle rather than creating a near-duplicate.
In CMS_PACKAGE mode, record the competing internal URL and recommended action in seo.cannibalization_alert.
Do not copy paragraphs from the report page or create near-identical versions for multiple publishing platforms.
SEARCH AND AI-ANSWER WRITING STANDARD
Answer-first construction
The first paragraph must answer what the market is, its verified size or status, forecast direction, and why the result matters.
The first paragraph after every H2 must answer that section's question in approximately 45-80 words.
Follow the answer with deeper evidence and implications. Do not bury the conclusion at the end.
Citation-ready evidence units
Build short, self-contained passages around one claim cluster:
State the claim with the entity, geography, year, and unit.
Attribute the evidence directly.
Explain the mechanism.
State the commercial implication or counter-risk.
Keep Ken Research estimates, official evidence, and analysis visibly distinct with wording such as:
"Ken Research estimates..."
"Official data from [agency] shows..."
"This suggests..."
Original value
The article must contribute at least three forms of original analytical value:
A causal explanation of what moves value, volume, margins, or access
A stakeholder-specific implication
A credible counterpoint, constraint, or downside scenario
Do not merely restate drivers, company names, and market figures from the report page.
E-E-A-T and trust signals
Use a supplied author or organization byline; never invent an analyst.
State the research basis, source types, and data status.
Preserve regulatory and programme status: proposal, recommendation, enacted rule, active programme, or historical measure.
Name sources and dates where they materially improve trust.
Use company claims only for that company and label them accordingly.
Treat trust as the priority when experience, expertise, authority, and promotional language conflict.
Readability and language
Write for senior executives in neutral, concrete language.
Keep paragraphs to two or three sentences and normally below 90 words.
Average roughly 16-24 words per sentence.
Use one idea per paragraph and one clear purpose per section.
Avoid vague consulting phrases, generic introductions, hype, and repeated strategic labels.
Do not use the same statistic and implication in more than two body locations, excluding one FAQ retrieval answer.
Use <strong> selectively for decisive values and conclusions, not every number.
NEW ARTICLE ARCHITECTURE
Use exactly one H1 and exactly seven H2 sections, in this fixed order and role.
H2 KEYWORD REQUIREMENT (SEO indexing — the defining rule of this V2 prompt): at least four of the seven H2 headings must naturally include the primary target keyword phrase: {Geography} + {Market Name} (e.g. "UK Zipper Market", "the Zipper Market in the UK", "UK's Zipper Sector") — use the exact geography and market entity from REPORT_TITLE/REPORT_URL, not a placeholder. Rotate which grammatical form is used heading to heading and article to article (exact phrase, possessive form, geography-first, market-first, with or without "the") so headings read naturally rather than as mechanically repeated keyword stuffing. Every H2 must still read as a real, natural heading a human editor would write — never sacrifice grammar or clarity just to fit the keyword in. Each "H2 N:" label below names that section's ROLE, not mandatory verbatim text — write a fresh heading for this specific market that fulfills the role AND satisfies this keyword requirement where it applies. Keep the section order and count fixed; vary only the wording.
Hero image, conditional
If IMAGE_MODE: ON and HERO_IMAGE_URL passes validation, place a verified hero image before the H1. If the image fails, omit it silently. If IMAGE_MODE: OFF, output no image tags or image discussion.
H1 — MANDATORY TWO-CLAUSE TITLE FORMAT (overrides any generic headline length/shape guidance elsewhere)
The H1 always has exactly two clauses joined by " : " (space, colon, space). Never omit the colon clause — a title without it fails validation.
Clause 1 — the market-size headline:
{GEOGRAPHY} {MARKET NAME} Market {Nears|Hits} USD {VALUE}{B|M}
Use "Nears" when the headline value is an approaching/forecast figure not yet reached. Use "Hits" when the headline value is a current/achieved figure.
{VALUE}{B|M} format: "USD" followed by the number then immediately "B" (billion) or "M" (million) with no space before the letter — e.g. "USD 5.83B", "USD 211B", "USD 99.1M", "USD 1.6B", "USD 14M". Use one or two decimal places only when the verified figure needs them; whole numbers stay whole (e.g. "USD 211B", not "USD 211.0B").
Geography is the short verified market geography (e.g. "India", "Global", "Vietnam", "Thailand", "Middle East", "APAC", "Kuwait", "UK"). Market Name is the concise verified market/report entity.
Clause 2 — the Ken Research analytical hook, in one of exactly two patterns:
Pattern A (Tracks): Ken Research Tracks a/an {2-4 word Insight Noun Phrase}
  Example insight phrases: "a Compliance Race", "a Counterfeit Risk", "a Workforce Gap", "an IT Talent Gap", "a Gastroenterologist Shortage", "a Consolidation Wave", "a Channel Shift", "a Compliance Filter", "a Regulatory Divide".
Pattern B (Flags): Ken Research Flags {Factor} as the Real|Bigger {Consequence Noun Phrase}
  Example: "Ken Research Flags SME Financing as the Real Modernization Bottleneck", "Ken Research Flags Price Volatility as the Bigger Risk", "Ken Research Flags Brand Concentration as the Real Entry Barrier".
Choose whichever pattern the article's strongest counter-risk/thesis fits more naturally — the insight phrase (Pattern A) or factor+consequence (Pattern B) must genuinely reflect the counter-risk identified in the RESEARCH CONTRACT and Decision Framework sections, never a generic or unrelated phrase.
Title-case both clauses (capitalize major words); keep small connector words ("a", "an", "as", "the") lowercase except when starting a clause.
Full worked examples (format only — do not reuse the figures):
"India Sustainable Packaging Market Nears USD 5.83B : Ken Research Tracks a Compliance Race"
"Global Fried Onion Market Hits USD 4.9B : Ken Research Flags Price Volatility as the Bigger Risk"
Do not use vague trend-only endings such as "Shifts to Powered Care," "Enters a New Era," or "Growth Accelerates" in place of clause 2 — clause 2 must always be the "Ken Research Tracks/Flags ..." structure above.
Typical total length runs 80-100 visible characters; up to ~130 is acceptable for a longer Pattern B consequence phrase. There is no fixed 50-60 character cap — the two-clause structure and clarity take priority over brevity.
Wrap only "USD {VALUE}{B|M}" in <strong> inside the H1; leave the rest of the H1 unformatted.
No byline
Never output a byline paragraph (e.g. "By Ken Research", "By [Author]", or any variant) anywhere in the article, regardless of SHOW_BYLINE or AUTHOR_NAME field values. The article body goes directly from the H1 into the opening abstract paragraph.
No citation-tool artifacts
Never output raw citation/browsing-tool markup such as ":contentReference[oaicite:0]{index=0}", "[oaicite:...]", or any other bracket-style citation residue. If a claim needs a source, express it in plain prose (e.g. "According to Ken Research analysis...") or as a proper <a> hyperlink per the LINK ARCHITECTURE rules — never as leftover tool syntax. Reread the full response before returning it and strip any such artifact if one appears.
Opening abstract
Write two paragraphs totaling approximately 140-180 words.
Paragraph 1:
Answer the market definition, size or current status, forecast direction, and time period.
Link the first natural Ken Research mention to the homepage.
Link the market name to the primary report in a separate sentence.
Use no more than three core statistics.
Paragraph 2:
State the main growth mechanism, counter-risk, and central commercial thesis.
Do not summarize every later section.
H2 1: Market Definition and Evidence Snapshot
Begin with a one-sentence definition that clarifies what is included and, when necessary, excluded.
Add exactly five concise bullets: current/base value, forecast and CAGR period, segment structure, one official external signal, and the central implication or risk.
Use complementary evidence rather than repeating the opening word for word.
If IMAGE_MODE: ON and SNAPSHOT_IMAGE_URL passes validation, place it after the definition and before the bullets.
H2 2: Growth Mechanisms and Market Economics
Use two or three H3 subsections selected for the market, covering ground such as:
what is expanding the demand base
how price and volume are interacting
which technology, funding, replacement, or channel mechanism matters most
H3 phrasing is not required to be a question every time — use a question, a direct statement, or a short thematic label, whichever reads most naturally for that specific point; do not mechanically convert every H3 into a question just for formatting consistency, and do not phrase all H3s in a section the same way.
Each subsection must move from evidence to mechanism to commercial consequence.
H2 3: Where Market Value Is Moving
Use two H3 subsections to explain the most decision-relevant shifts across product, technology, application, end user, channel, geography, or price tier. Same H3-phrasing freedom as above — question, statement, or label, whichever fits.
Identify the segmentation dimension explicitly.
Distinguish largest from fastest-growing.
Explain buyer behaviour and why the mix shift matters.
Do not list every segment.
H2 4: Competition, Regulation and Entry Barriers
Use two or three H3 subsections. Same H3-phrasing freedom as above.
Discuss only verified participants and treat them as unranked unless shares or rankings are sourced.
Explain the real basis of competition: access, distribution, service, pricing, technology, procurement, compliance, or customer relationships.
Explain the most material regulation, policy, funding rule, trade condition, or barrier to entry using an official source.
Include the strongest risk to the article's thesis.
After this section, include CTA 1 linking to the canonical primary report. The anchor must describe the destination accurately.
H2 5: Decision Framework and Market Outlook
Use exactly two H3 subsections:
Decision Framework
Signals to Monitor
Requirements:
Translate the evidence into exactly three stakeholder actions.
Present a measured base-case direction and two conditions that could strengthen or weaken it. Do not invent probabilities.
Identify leading indicators to monitor through the forecast period.
Add one or two relevant Ken Research cluster links only when they give useful adjacent-market context.
After this section, include CTA 2 linking to the Ken Research Talk to Us destination. Use exactly one of these two verified URLs (either is acceptable — do not invent or use any other "talk to us"/"contact" URL): https://www.kenresearch.com/book-a-discovery-call or https://www.kenresearch.com/custom-form, each with the mandatory UTM string appended as usual. Keep it consultative.
H2 6: Frequently Asked Questions
Include exactly five unique FAQ pairs. Use an H3 question and one 45-65-word answer for each.
Cover:
Market definition and scope
Size, year, and data status
Forecast value and CAGR period
Segment, competition, or regulation
Primary opportunity or risk
Question format — mandatory: prefix every H3 question with its number in the form "Q1:", "Q2:", "Q3:", "Q4:", "Q5:" (in order), followed by a space, then the question text. Each question must explicitly include the exact market name (e.g. "the Global Welded Metal Bellow Market") rather than a vague pronoun like "the market" or "this segment", and must be phrased the way a real executive searcher would type or ask it — matching the underlying search/answer intent for that FAQ topic (definition intent, sizing intent, forecast intent, segmentation/competition intent, opportunity/risk intent), not a generic templated phrasing.
Example: "Q2: How Large Is the Global Welded Metal Bellow Market in 2025?" — not "Q2: How large is the market?".
Answer directly in the first sentence. Do not add unsupported facts.
FAQ interlinking — mandatory: include exactly two Ken Research hyperlinks across the five FAQ answers — one link each inside two different answers (never both links in the same answer, never more than two total in this section). Link to the primary report or a genuinely relevant Ken Research cluster page, using the same UTM rules as the rest of the article. Use descriptive market-topic anchor text for these two links (e.g. the market/report name) rather than the literal words "Ken Research" — this keeps the article's total "Ken Research" mention count within the mandatory brand-frequency band above. The other three answers stay link-free.
H2 7: Methodology and Sources
Reserve approximately 110-150 words for this final section and write three complete paragraphs:
Research Basis: verified Ken Research methodology and validation information.
Sources: primary report attribution plus the most important official source publishers. Include the third primary-report link placement here.
Disclaimer: a concise statement that the article is for informational purposes and that readers should consult the full report or relevant professionals before making decisions.
Do not claim a confidence level unless the report publishes one.
Do not add a separate caveats section. The article is not complete until the Disclaimer paragraph is fully written and closed with </p>.
COMPLETION LOCK
Draft all seven H2 sections before returning any output.
Reserve the final 110-150 visible words for Methodology and Sources.
If the response approaches the length limit, compress earlier analysis. Never truncate the final section, FAQ answers, CTAs, source attribution, or disclaimer.
The final HTML element must be the complete Disclaimer paragraph.
The final non-whitespace characters in ARTICLE_HTML mode must be </p>.
Count opening and closing <p>, <h1>, <h2>, <h3>, <ul>, <li>, <a>, <strong>, and <em> tags. Every opened tag must close.
Do not return a partial article under any circumstance.
LINK ARCHITECTURE
The finished article should contain 12-14 Ken Research link placements when enough destinations can be verified, separate from official external citations. Fewer verified links is acceptable; invented links never are.
Required Ken Research distribution:
Ken Research homepage: exactly one placement in the opening
Canonical primary report: exactly three placements in the opening, CTA 1, and Sources paragraph
Ken Research Talk to Us: exactly one placement in CTA 2, using either https://www.kenresearch.com/book-a-discovery-call or https://www.kenresearch.com/custom-form (with UTM) — never any other "talk to us"/"contact"/"custom form" URL
Frequently Asked Questions: exactly two placements, one each inside two different FAQ answers
Relevant Ken Research cluster pages: target five to seven placements using five to seven unique destinations — use as many as can actually be verified
Total Ken Research placements: target 12-14
Total unique Ken Research destinations: target at least eight
Use one or two unique official government, regulator, national-statistics, or public-agency links, with two preferred when two strong and directly relevant sources exist. Never use more than two official external citations. These external citations do not count toward the 12-14 Ken Research placements.
Aim for one or two official external citations and never more than two. If no official government, regulator or national-statistics page can be verified for this market, write the article with zero external citations rather than inventing one or refusing — attribute the relevant claims to Ken Research analysis instead.
Distribute internal links across the article:
Opening: homepage and primary report
Market Definition and Evidence Snapshot: one relevant cluster page
Growth Mechanisms and Market Economics: one or two relevant cluster pages
Where Market Value Is Moving: one or two relevant cluster pages
Competition, Regulation and Entry Barriers: one relevant cluster page plus primary-report CTA 1
Decision Framework and Market Outlook: one or two relevant cluster pages plus Talk to Us CTA 2
Frequently Asked Questions: two links, one each inside two different FAQ answers (primary report or a relevant cluster page)
Methodology and Sources: primary report
Prioritize actual related Ken Research report pages. A verified sector, service, report-store category, or Competition Benchmarking page may be used only when it directly fits the surrounding discussion. Never use a generic page merely to reach the count.
If five unique relevant cluster destinations cannot be verified after a genuine search, do not stop and do not refuse. Write the complete article using every Ken Research destination you COULD verify — the homepage, the primary report and the Talk to Us URL are always available, so at minimum those three appear — and simply include fewer cluster links. Never guess or invent a URL to reach a count. Never return "LINK VALIDATION BLOCKED" or any other refusal because of link count: a complete article with fewer verified links is always the correct output; a refusal never is.
Competitor market-research domains are prohibited.
Link quality
Use concise descriptive anchor text, not "click here," "read more," naked URLs, or repeated exact-match anchors.
Place the link next to the claim or context it supports.
Do not put two links in one sentence.
Prefer one link per paragraph.
Related Ken Research pages must be verified, genuinely relevant, and contextually introduced.
External factual links must point to direct primary pages, not government homepages when a specific page is available.
Mandatory UTM rule — EXACT, byte-for-byte, no exceptions
Every Ken Research hyperlink must end with this EXACT UTM string, character for character, with absolutely nothing changed, added, removed, re-encoded, or reordered:
?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation
Example — for the report https://www.kenresearch.com/saudi-arabia-outdoor-play-structures-market, the final href must be exactly:
https://www.kenresearch.com/saudi-arabia-outdoor-play-structures-market?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation
Rules:
Only the base URL (the domain + path, e.g. https://www.kenresearch.com/saudi-arabia-outdoor-play-structures-market) may vary from link to link. The UTM string itself — ?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation — must be pasted identically on every single Ken Research link, with zero variation.
Use a literal "?" to join the base URL and the UTM string — never "&", never "&amp;", never a second "?".
Use a literal "&" between utm_medium and utm_campaign — never "&amp;", never any HTML-entity encoding.
Do not change letter casing anywhere in the UTM string. Do not add, drop, duplicate, or reorder any of the three parameters.
If the base URL already ends with a "/", still join with a single "?" — never leave a stray "/" or "&" before the UTM string.
Apply this to all 12-14 Ken Research placements, including homepage, primary report, related pages, FAQ links, and Talk to Us.
Do not add any query parameters to official external sources.
Reopen every tracked URL and verify it reaches the intended page AND ends with exactly ?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation.
Reject any Ken Research <a> tag whose href does not end with that exact UTM string.
Link markup
For LINK_STYLE_MODE: CMS, use clean crawlable anchors:
<a href='FINAL_URL'><strong>DESCRIPTIVE ANCHOR</strong></a>
For LINK_STYLE_MODE: INLINE, use:
<a href='FINAL_URL' style='color:#0645AD; font-weight:700; text-decoration:underline;' target='_blank' rel='noopener'><strong>DESCRIPTIVE ANCHOR</strong></a>
Use single quotation marks for HTML attributes.
IMAGE RULES
When IMAGE_MODE: OFF:
Output no image tags.
Do not search for, request, generate, or mention images.
When IMAGE_MODE: ON:
Use only supplied image URLs.
Confirm a successful image response and inspect the image.
Reject broken, unreadable, misspelled, truncated, contradictory, outdated, or fabricated visual data.
Prefer a 16:9 hero image at least 1200 pixels wide.
Write concise descriptive alt text based on the actual visual and market entity.
Do not stuff keywords or place unsupported figures in alt text.
Hero markup:
<img src='HERO_IMAGE_URL' alt='VERIFIED DESCRIPTIVE ALT' loading='eager'/>
Snapshot markup:
<img src='SNAPSHOT_IMAGE_URL' alt='VERIFIED DESCRIPTIVE ALT' loading='lazy'/>
OUTPUT MODES
ARTICLE_HTML
Precede the fragment with the single "Description:" line defined in FINAL RESPONSE, then return one clean HTML fragment.
Put each block element on a new real line.
Never output the literal character sequences \\n, \\r, or \\t.
Do not JSON-escape the HTML.
Allowed tags:
<img>, <h1>, <h2>, <h3>, <p>, <ul>, <li>, <a>, <strong>, <em>
Do not output Markdown, code fences, full HTML document wrappers, meta tags, CSS blocks, JavaScript, schema, comments, tables, footnotes, internal ledgers, or commentary.
After the single "Description:" line (see FINAL RESPONSE), the HTML fragment must begin with < and end with the final </p> from the completed Disclaimer paragraph.
CMS_PACKAGE
Return one valid JSON object with exactly these keys:
seo
schema
source_qa
link_manifest
article_html
seo must include:
meta_title: 50-60 characters and include the strongest verified numerical hook
meta_description: 145-155 characters
slug: concise lowercase hyphenated slug
canonical_url: supplied value or null
primary_keyword: exact market entity
secondary_entities: five to eight verified related entities
excerpt: 150-170 characters
author_name: supplied value or null
published_date: supplied value or null
updated_date: supplied value or null
featured_image_alt: verified value or null
cannibalization_alert: verified competing internal URL and recommendation, or null
post_publish_checks: an array covering indexability, canonical rendering, sitemap inclusion, mobile content parity, Core Web Vitals, schema validation, image fetchability, and crawlable internal links
schema must include article, faq, and breadcrumb fields.
If CMS_GENERATES_SCHEMA: YES, return null for all three.
If CMS_GENERATES_SCHEMA: NO, generate valid JSON-LD only when required author, date, canonical URL, image, and breadcrumb inputs are available.
Schema must match visible content exactly. Do not invent missing fields.
Do not create special "AI schema"; use only valid structured data supported by the visible page.
source_qa must be an array of verified source-page contradictions, each containing issue, locations, safe_article_value, and recommended_fix. Use an empty array when none are found.
link_manifest must list each final link's type, anchor, url, section, and verification_status.
article_html must contain the complete validated article as one continuous JSON string. Do not insert \\n, \\r, or \\t escape sequences. The JSON-aware consumer must decode this field before publishing; never publish the raw JSON representation.
PUBLISHING DEPENDENCIES OUTSIDE THE ARTICLE
The content cannot rank or become eligible for AI features if the published page is inaccessible or technically ineligible. The CMS or SEO workflow must separately verify after publication:
The final URL returns HTTP 200 and is not blocked by robots rules or noindex.
The page declares the intended canonical URL.
The same primary content and structured data are available on mobile.
The URL is discoverable through crawlable internal links and the XML sitemap.
Core Web Vitals and general page experience are acceptable.
Images are publicly fetchable, correctly sized, and not blocked.
Structured data parses successfully and matches visible content.
Updated dates change only after a meaningful content revision.
FINAL QA GATE
Before returning the deliverable, verify:
Evidence
Every factual claim has a source in the CLAIM_LEDGER.
Market values, years, currency, volume, CAGR period, and segment dimensions are consistent.
Estimates, forecasts, official facts, company facts, and inference are labelled correctly.
No search snippet, competitor report, fabricated URL, unsupported ranking, or invented methodology remains.
Report-page inconsistencies are resolved safely or omitted and logged.
Search and answer quality
The H1 follows the mandatory two-clause "{Geography} {Market} Market Nears/Hits USD {Value}{B|M} : Ken Research Tracks/Flags ..." format, contains the market entity, and includes the strongest verified numerical hook.
At least four H2 headings naturally include the {Geography} + {Market Name} keyword phrase, in varied grammatical forms, without reading as keyword-stuffed.
The article has exactly seven H2 sections and five FAQs.
Each H2 begins with a direct answer.
The market scope is explicitly defined.
Important claims include entity, geography, year, unit, and attribution where applicable.
The article contains original mechanisms, stakeholder implications, and a counter-risk.
No section repeats another section's full fact-and-implication pair.
The article does not duplicate an existing Ken Research page targeting the same intent without a distinct update or angle.
Language is natural, specific, neutral, and free of generic keyword stuffing outside the mandatory H2 keyword requirement above.
Visible article length is 1,450-1,600 words.
Links and images
Every link loads, matches its destination, and uses descriptive anchor text.
No competitor market-research link exists.
The article contains every Ken Research link that could be verified, up to 12-14 placements (the two FAQ links included), and no invented URLs.
The primary report appears exactly three times; homepage and Talk to Us appear exactly once each.
Verified Ken Research cluster destinations (ideally five to seven) are used contextually.
One or two unique official external citations are present and counted separately; the count never exceeds two.
Every Ken Research href ends with exactly ?utm_source=linkedin-pulse&utm_medium=Referral&utm_campaign=Automation — no &amp; entities, no extra "?" or "&", no casing changes.
Official external links contain no UTM parameters.
Image mode and image validation rules are satisfied.
Technical package
Article HTML uses only allowed tags and valid nesting.
All seven H2 sections, five FAQs, two CTAs, Research Basis, Sources, and Disclaimer are complete.
Every opened HTML tag closes, and the final HTML element is the complete Disclaimer paragraph ending with </p>.
ARTICLE_HTML mode uses real line breaks and contains no literal \\n, \\r, or \\t sequences.
ARTICLE_HTML mode contains no metadata or schema.
CMS_PACKAGE mode parses as JSON and contains exactly the required keys.
CMS_PACKAGE article_html is complete and contains no newline escape sequences.
Metadata character limits are met.
Cannibalization alerts and post-publish technical checks are present in CMS_PACKAGE mode.
Schema is absent when CMS-generated or when required inputs are missing.
Schema and FAQs match visible content exactly.
FINAL RESPONSE
For OUTPUT_MODE: ARTICLE_HTML, output EXACTLY ONE line beginning "Description: " (the meta description, built per the DESCRIPTION LINE rule below), then a line break, then the validated HTML fragment — and nothing else.
For OUTPUT_MODE: CMS_PACKAGE, return only the validated JSON object.
Do not add explanations, research notes, validation results, or Markdown fences.
DESCRIPTION LINE (ARTICLE_HTML only) — build it from the locked DATA_SPINE, in EXACTLY this shape and word order:
Description: The {full descriptive market name} worth USD {base or current value} {unit} in {base year} is growing at a CAGR of {published CAGR}% to reach USD {forecast value} {unit} by {forecast year}. {three to five verified market participants from the DATA_SPINE, comma-separated}
Rules for this line: use the FULL descriptive market name (not the short label); pull every number from the DATA_SPINE and never invent one; if the report does not provide a given value, omit only that clause and keep the sentence grammatical (e.g. drop "worth USD ... in {year}" when there is no base value); one line only, plain text, no HTML tags, no markdown.
<INPUTS> REPORT_TITLE: ${reportTitle} REPORT_URL: ${reportUrl}
OUTPUT_MODE: ARTICLE_HTML
LINK_STYLE_MODE: CMS
IMAGE_MODE: OFF
HERO_IMAGE_URL:
SNAPSHOT_IMAGE_URL:
SHOW_BYLINE: OFF
AUTHOR_NAME: Ken Research
PUBLISHED_DATE:
UPDATED_DATE:
CANONICAL_BLOG_URL:
BREADCRUMB_PARENT_URL:
CMS_GENERATES_SCHEMA: YES
</INPUTS>`;
}

function buildPrompt(sampleHtml: string): string {
  const sampleBlock = sampleHtml
    ? `Here is a sample blog article in HTML — use it ONLY as a style/structure reference (do NOT copy its topic or text):\n\n<<<SAMPLE_HTML>>>\n${sampleHtml}\n<<<END_SAMPLE>>>\n\n`
    : '';
  return (
    sampleBlock +
    `Write a BRAND-NEW blog article in the same HTML structure and style for this Ken Research market report:\n\n` +
    `Report Title: ${title}\n` +
    `Report URL: ${url}\n\n` +
    `Strict rules:\n` +
    `1. Length: a full article, about 1500 words.\n` +
    `2. Output valid, clean HTML for the content only — same tag family as the sample. No markdown. Use plain double-quote (") attribute delimiters; never URL-encode quote characters.\n` +
    `3. Interlinks: link ONLY to Ken Research pages (kenresearch.com) and 2-3 relevant government / official statistics websites. Do NOT link to any competitor or other commercial site.\n` +
    `4. Add UTM parameters to EVERY link href: append utm_source=linkedin&utm_medium=referral&utm_campaign=automation (use ? if the URL has no query string, else &).\n` +
    `5. Use the report URL (${url}) as the primary Ken Research link, with the UTM parameters.\n` +
    `6. The Title line MUST follow this EXACT pattern: "{Market name} {a 4-5 word trendy market hook} : Ken Research {varied verb + short key issue}". The trendy hook is a data-driven or catchy angle such as a market-size figure ("Hits USD 4 Billion"), a growth rate ("Hits 25% CAGR"), or another trendy market movement. After the colon it MUST start with "Ken Research" but VARY the verb each time (do NOT always use "Flags") — e.g. Flags, Reveals, Warns, Highlights, Maps, Tracks, Uncovers, Signals. Examples: "US Smokeless Cigarettes Market Hits USD 4 Billion : Ken Research Flags FDA Authorization Shift"; "India Artificial Intelligence Market Hits 25% CAGR : Ken Research Warns of Compute Bottlenecks"; "Spain Solar Rooftop Market Surges on New Subsidies : Ken Research Highlights Policy Volatility".\n\n` +
    `Respond in EXACTLY this structure and nothing else:\n` +
    `Title: <exactly in the rule-6 pattern>\n` +
    `Description: <2-3 sentence meta description on one line>\n` +
    `<the full HTML content>`
  );
}

// Minimizes the window to the taskbar (not headless — the account still needs
// a real, logged-in-looking browser) via CDP; '--start-minimized' alone is
// unreliable once the page has already navigated. Best-effort — a failure
// here should never abort generation.
async function minimizeToTaskbar(context: BrowserContext, page: Page): Promise<void> {
  try {
    const cdp = await context.newCDPSession(page);
    const { windowId } = await (cdp as any).send('Browser.getWindowForTarget');
    await (cdp as any).send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    await cdp.detach().catch(() => {});
  } catch { /* ignore if CDP unavailable */ }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  // ChatGPT can be slow to render on the VPS — poll up to ~40s for the composer
  // (or any logged-in affordance) before deciding it's logged out.
  const deadline = Date.now() + 40000;
  const selectors = [
    '#prompt-textarea',
    'div[contenteditable="true"]',
    '[data-testid="composer-text-input"]',
    'button[data-testid="send-button"]',
    'button[aria-label*="New chat"]',
  ];
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      if (await page.locator(sel).first().isVisible({ timeout: 1200 }).catch(() => false)) return true;
    }
    await page.waitForTimeout(1500);
  }
  return false;
}

/** Wait until the assistant response finished streaming (send re-enabled, text stable).
 * `baseline` = assistant message count before our prompt was sent: only a NEWER
 * reply counts as progress, so an old reply (or the prompt itself) can never
 * read as "finished". */
async function waitForCompletion(page: Page, baseline: number): Promise<void> {
  const start = Date.now();
  let goneChecks = 0;
  let lastLength = -1;
  let unchangedChecks = 0;
  let rateLimitHits = 0;
  await page.waitForTimeout(5 * 60 * 1000); // let generation get underway (5 min) before the first check
  while (Date.now() - start < RESPONSE_TIMEOUT_MS) {
    // Always check for the rate-limit popup first — it silently stalls
    // generation, so clear it (via Enter, its default button) before reading
    // any completion signal below.
    if (await dismissRateLimitModalByEnter(page)) {
      rateLimitHits++;
      progress('  …cleared a rate-limit popup, continuing to wait.');
    }
    // Check every 1 min: ChatGPT shows a Stop button while streaming. When the
    // Stop button has been gone for two checks in a row (with a real reply present),
    // the blog is finished. Robust to tiny page changes (Sources panel, etc.).
    const stopping = await page
      .locator('button[data-testid="stop-button"], button[aria-label*="Stop streaming"], button[aria-label*="Stop"]')
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    const text = await lastAssistantText(page, baseline);
    progress(`  …checked at ${Math.round((Date.now() - start) / 60000)} min: ${stopping ? 'still writing' : 'looks finished'} (${text.length} characters so far)`);
    // Rate-limited and still no real reply after two popups → ChatGPT is not
    // going to answer this prompt. "No real reply" includes the short
    // rate-limit notice ChatGPT sometimes posts AS the assistant message
    // (~50-80 chars) — anything under 300 chars is not an article. Fail now
    // rather than burning the remaining timeout; the caller does not retry a
    // rate-limited row (that would just spend another prompt on a limited account).
    if (rateLimitHits >= 2 && text.length < 300 && !stopping) {
      throw new Error(`RATE_LIMITED: ChatGPT rate limit hit and no reply produced (${text.length} chars) — giving up on this row for now`);
    }
    if (!stopping && text.length > 500) {
      goneChecks++;
      if (goneChecks >= 2) return; // Stop button gone for ~2 checks → done
    } else {
      goneChecks = 0;
    }
    // Stuck-generation detector: if the response length is IDENTICAL across
    // STALL_CHECKS_TO_GIVE_UP consecutive 1-min checks, ChatGPT has frozen —
    // it's not writing, whether that's at 0 characters (never started) or a
    // tiny stub like 55 (started, then died mid-reply). Deliberately no
    // minimum-length gate here (an earlier version required >500 chars,
    // which meant a response stuck at a small stub never got caught and just
    // burned the full 30-min timeout) — any unchanged length this many times
    // in a row means it's dead, not "still writing."
    if (text.length === lastLength) {
      unchangedChecks++;
      if (unchangedChecks >= STALL_CHECKS_TO_GIVE_UP) {
        progress(`  Stuck: character count unchanged (${text.length}) for ${STALL_CHECKS_TO_GIVE_UP} checks in a row — giving up on this row.`);
        return;
      }
    } else {
      unchangedChecks = 0;
    }
    lastLength = text.length;
    await page.waitForTimeout(POLL_MS);
  }
}

// Phrases that occur only in the master prompt, never in a real article. Any
// text containing one of them is the PROMPT (our own message, or the page's
// text after ChatGPT silently rate-limited and never answered) — not a reply.
// Before this guard, the "Title:" page-text fallback below happily picked up
// the prompt's own "Title: the H1 title must naturally contain..." rule line
// and returned the rest of the prompt as the article; 165 of those got
// published between 2026-08-26 and 2026-09-05.
const PROMPT_ECHO_MARKERS = [
  'COMPLETION LOCK', 'FINAL QA GATE', 'LINK ARCHITECTURE', 'NEW ARTICLE ARCHITECTURE',
  '<INPUTS>', 'OUTPUT_MODE:', 'LINK_STYLE_MODE', 'IMAGE_MODE:', 'DATA_SPINE', 'CLAIM_LEDGER',
  'KEN RESEARCH BRAND AUTHORITY RULES', 'MASTER BLOG PROMPT', 'must naturally contain the words',
];
function looksLikePromptEcho(s: string): boolean {
  const u = s.toUpperCase();
  return PROMPT_ECHO_MARKERS.some((m) => u.includes(m.toUpperCase()));
}

/** Number of assistant messages on the page — captured BEFORE we send the
 * prompt so extraction can insist on a NEW reply rather than an old one. */
async function assistantMessageCount(page: Page): Promise<number> {
  return page.locator('[data-message-author-role="assistant"]').count().catch(() => 0);
}

/** The newest assistant reply's text — ONLY if it is newer than `baseline`
 * (the count before our prompt was sent). Empty string when ChatGPT has not
 * answered. No page-text fallback: that is how the prompt itself got saved. */
async function lastAssistantText(page: Page, baseline: number): Promise<string> {
  const text = await page.evaluate((base) => {
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (msgs.length <= base) return '';
    return (msgs[msgs.length - 1] as HTMLElement).innerText || '';
  }, baseline).catch(() => '');
  return looksLikePromptEcho(text) ? '' : text;
}

/** Extract Title / Description / HTML from the newest assistant reply (both shapes). */
async function extract(page: Page, baseline: number): Promise<{ title: string; description: string; html: string }> {
  const data = await page.evaluate((base) => {
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (msgs.length <= base) return { code: '', text: '' };
    const last = msgs[msgs.length - 1] as HTMLElement;
    const c = last.querySelector('pre code, pre');
    return { code: c ? (c.textContent || '') : '', text: last.innerText || '' };
  }, baseline);

  if (looksLikePromptEcho(data.text) || looksLikePromptEcho(data.code)) {
    throw new Error('ChatGPT returned the prompt instead of an article (no real reply — rate limit?)');
  }
  if (!data.text.trim() && !data.code.trim()) {
    throw new Error('ChatGPT produced no reply to extract (rate limit / no response)');
  }

  const text = data.text || '';
  const titleMatch = text.match(/^\s*Title:\s*(.+)$/im);
  const descMatch = text.match(/^\s*Description:\s*(.+)$/im);

  let html = '';
  if (data.code && data.code.includes('<')) {
    html = data.code.trim();
  } else {
    // Raw HTML in the message text: from the first tag to the last tag (drops any
    // trailing page chrome like "ChatGPT can make mistakes" / "Sources").
    const firstTag = text.indexOf('<');
    html = firstTag >= 0 ? text.slice(firstTag) : text;
    const lastTag = html.lastIndexOf('>');
    if (lastTag >= 0) html = html.slice(0, lastTag + 1);
    html = html.trim();
  }

  // Safety: if the model nested the "Description:" line inside the HTML block
  // (e.g. everything in one code fence), drop it from the article body — the
  // descMatch below still reads it from the full message text for the meta desc.
  html = html.replace(/^\s*Description:[^\n]*\r?\n+/i, '').trim();

  // The master prompt (ARTICLE_HTML mode) returns ONLY the HTML fragment —
  // no "Title:"/"Description:" lines. Fall back to pulling those straight out
  // of the HTML itself: the <h1> for title, the first <p> (stripped, truncated
  // to meta-description length) for description.
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const firstPMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const blogTitle = titleMatch ? titleMatch[1].trim() : (h1Match ? stripTags(h1Match[1]) : title);
  const description = descMatch ? descMatch[1].trim() : (firstPMatch ? stripTags(firstPMatch[1]).slice(0, 170) : '');

  return { title: blogTitle, description, html };
}

/** Fix ChatGPT quirks: mis-encoded closing quotes (%22) and web-search citation tags. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/%22(?=[\s>])/g, '"')   // closing attribute quote emitted as %22
    .replace(/%22$/g, '"')
    .replace(/\s*:contentReference\[[^\]]*\]\{[^}]*\}/g, '') // ChatGPT web-search citation artifacts
    .trim();
}

/**
 * Ensure every kenresearch.com link carries the correct UTM params — always
 * strips whatever ChatGPT wrote (any case, &amp;-encoded or not — the master
 * prompt asks for lowercase "automation" with &amp; entities, neither of
 * which is what we actually want) and rebuilds fresh with the real per-agent
 * campaign (shared with every platform poster's own injectUTM call, so this
 * is really just what shows up before any platform-specific posting).
 */
function injectUtm(html: string): string {
  return injectUTM(html, UTM_PARAMS.LinkedinPulse);
}

async function main() {
  // --print-prompt: render the master prompt for --url/--title and exit, no
  // browser. For testing the prompt by hand in ChatGPT. --prompt-version v1|v2 (default v1).
  if (process.argv.includes('--print-prompt')) {
    const v = (arg('--prompt-version') || 'v1').toLowerCase();
    process.stdout.write((v === 'v2' ? buildMasterPromptV2(title, url) : buildMasterPrompt(title, url)) + '\n');
    return;
  }

  const dir = sessionDir();
  fs.mkdirSync(dir, { recursive: true });

  // Deliberately its OWN env var, separate from the shared HEADLESS used by
  // every posting/login script — those must always stay headed regardless
  // of this. Defaults to headed (false) for safety: a human running this
  // script directly (e.g. to manually log in) gets a visible browser unless
  // the automated caller (run-blog-generator.ts) explicitly opts into
  // headless for its unattended scheduled runs.
  const headless = process.env.GEN_HEADLESS === 'true';

  const context = await chromium.launchPersistentContext(dir, {
    headless,
    channel: 'chrome',
    executablePath: CHROME_PATH && fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check', '--disable-infobars'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const openPages = context.pages();
  const page = openPages[0] ?? (await context.newPage());
  // The rotation sweeps this profile's Chrome with `pkill -9`, which leaves the
  // persistent profile dirty so Chrome restores the crashed session's tabs on
  // next launch. We only use pages()[0]; close every restored extra tab so
  // about:blank tabs don't accumulate run after run.
  for (const extra of openPages.slice(1)) await extra.close().catch(() => {});
  // Runs before login-check on purpose — stays minimized even during manual login.
  await minimizeToTaskbar(context, page);
  try {
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    progress('Opened ChatGPT.');
    if (!(await isLoggedIn(page))) {
      // Unattended run (spawned by run-blog-generator.ts from the rotation or a
      // dashboard click — stdin is not a terminal): nobody can log in or press
      // Enter, so waiting would only hang this row until the rotation's
      // 150-min kill. Fail fast with a message that says WHICH problem it is
      // — a Cloudflare "Just a moment..." interstitial (headless Chrome never
      // clears it) vs a genuinely expired session — and leave the row for the
      // next turn.
      if (!process.stdin.isTTY) {
        const pageTitle = await page.title().catch(() => '');
        const cloudflare = /just a moment|attention required|verify you are human/i.test(pageTitle);
        const why = cloudflare
          ? `ChatGPT is stuck on the Cloudflare challenge ("${pageTitle}") — this happens in headless Chrome; run headed (DISPLAY set, GEN_HEADLESS unset/false)`
          : `ChatGPT session for "${agent || 'abhinav'}" is not logged in (page: "${pageTitle || page.url()}") — re-login via the dashboard login portal`;
        progress(`✗ ${why}`);
        await context.close().catch(() => {});
        out({ status: 'error', message: why });
      }
      // isLoggedIn()'s own 40s poll isn't a real login window — a first-time
      // ChatGPT login (email, password, verification) almost never finishes
      // that fast. Give the human an actual chance: wait here for Enter instead
      // of closing the browser out from under a login in progress.
      progress('Not logged in — restore the minimized Chrome window from the taskbar and log in manually, then press Enter here to continue.');
      await new Promise<void>((resolve) => {
        process.stdin.resume();
        process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
      });
      if (!(await isLoggedIn(page))) {
        const loginBtn = await page.locator('button:has-text("Log in"), a:has-text("Log in"), :text("Sign up")').first().isVisible({ timeout: 1000 }).catch(() => false);
        const bodyPeek = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '').catch(() => '');
        console.error('[dbg] NOT-LOGGED-IN url=', page.url(), 'loginBtnVisible=', loginBtn, 'bodyPeek=', JSON.stringify(bodyPeek));
        await page.screenshot({ path: path.join(os.tmpdir(), 'blog-debug.png'), fullPage: false }).catch((e) => console.error('[dbg] shot failed', e?.message));
        await context.close();
        out({ status: 'error', message: 'Still not logged in to ChatGPT after waiting — try again and make sure the login fully completes before pressing Enter.' });
        return;
      }
      progress('Logged in — continuing.');
    }

    // Randomly rotate V1 (buildMasterPrompt) / V2 (keyword-focused
    // buildMasterPromptV2) per row for non-custom formats — the two prompts
    // stay fully independent, this just picks which one runs.
    const promptVersion: 'v1' | 'v2' = Math.random() < 0.5 ? 'v1' : 'v2';
    if (format !== 'custom') progress(`  Prompt version: ${promptVersion}`);
    const prompt = format === 'custom'
      ? buildPrompt(loadSample())
      : promptVersion === 'v2' ? buildMasterPromptV2(title, url) : buildMasterPrompt(title, url);
    await dismissBlockingModals(page); // e.g. the "conversation history rate limit" overlay
    const input = page.locator('#prompt-textarea, div[contenteditable="true"]').first();
    await input.waitFor({ state: 'visible', timeout: 20000 });
    // How many assistant replies exist BEFORE we send — extraction must see one more.
    const baseline = await assistantMessageCount(page);
    progress('Logged in. Sending the prompt to ChatGPT…');
    await input.click();
    await page.keyboard.insertText(prompt); // reliable for ChatGPT's contenteditable + large text
    await page.waitForTimeout(1000);

    // The blocking modal can re-render itself seconds after being removed
    // (this is a live React app) — check again right before the send click,
    // not just once before typing, and retry once if the first click gets
    // intercepted by it.
    await dismissBlockingModals(page);
    const sendBtn = page.locator('button[data-testid="send-button"], button[aria-label="Send prompt"]').first();
    async function clickSend(): Promise<boolean> {
      if (!(await sendBtn.isVisible({ timeout: 3000 }).catch(() => false))) return false;
      await sendBtn.click();
      return true;
    }
    try {
      if (!(await clickSend())) await page.keyboard.press('Enter');
    } catch (e) {
      // Most likely the modal re-appeared and intercepted the click — dismiss and retry once.
      console.error(`[generate_blog_chatgpt] send click failed (${(e as Error).message.slice(0, 80)}), retrying after modal dismiss...`);
      await dismissBlockingModals(page);
      await page.waitForTimeout(1000);
      if (!(await clickSend())) await page.keyboard.press('Enter');
    }
    progress('Prompt sent — ChatGPT is writing the blog now (about 12-15 minutes)…');

    await waitForCompletion(page, baseline);
    progress('ChatGPT finished writing — extracting and saving the blog…');
    const { title: bTitle, description, html } = await extract(page, baseline);
    await context.close();

    if (!html || html.length < 100) out({ status: 'error', message: 'no HTML content extracted from ChatGPT response' });
    if (looksLikePromptEcho(html) || looksLikePromptEcho(bTitle)) out({ status: 'error', message: 'extracted content is the prompt, not an article — discarded' });
    out({ status: 'success', title: bTitle, description, html: injectUtm(sanitizeHtml(html)) });
  } catch (err) {
    await context.close().catch(() => {});
    out({ status: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

main();
