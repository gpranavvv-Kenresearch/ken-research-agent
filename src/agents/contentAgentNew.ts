/**
 * contentAgentNew.ts — Content Generation Agent
 * Generates platform-specific posts using OpenRouter.
 *
 * Functions:
 *   generateTweet()   — used by X batch
 *   generateFbPost()  — used by FB batch
 *   generateLiPost()  — used by LI batch
 *   runContentAgent() — legacy: generates all 4 at once (for weekly recheck)
 */

import fs from 'fs';
import path from 'path';
import type { SheetRow } from '../sheets/sheets.js';
import { UTM_PARAMS, injectUTM } from '../utils/utm.js';
import { callTavily } from '../config/tavilyClient.js';

// ── Tweet history (per URL) ────────────────────────────────────────────────────
// Stores up to 5 past tweets per URL so the LLM can avoid repeating angles.

const TWEET_HISTORY_FILE = path.resolve('.sessions/tweet-history.json');
const MAX_HISTORY = 5;

function loadTweetHistory(): Record<string, string[]> {
  try { return JSON.parse(fs.readFileSync(TWEET_HISTORY_FILE, 'utf-8')); }
  catch { return {}; }
}

function getPastTweets(url: string): string[] {
  const all = loadTweetHistory();
  return all[url] ?? [];
}

function saveTweetToHistory(url: string, tweet: string): void {
  try {
    const all = loadTweetHistory();
    const list = all[url] ?? [];
    list.push(tweet);
    // Keep only the last MAX_HISTORY entries
    all[url] = list.slice(-MAX_HISTORY);
    fs.mkdirSync(path.dirname(TWEET_HISTORY_FILE), { recursive: true });
    fs.writeFileSync(TWEET_HISTORY_FILE, JSON.stringify(all, null, 2));
  } catch { /* non-critical */ }
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const OPENROUTER_MODEL = 'openai/gpt-oss-120b:free';
const NVIDIA_MODEL = 'meta/llama-3.1-70b-instruct';

interface ApiKey {
  key: string;
  baseUrl: string;
  model: string;
  label: string;
}

export interface ContentResult {
  tweet: string;
  fbPost: string;
  liPost: string;
  blog: string;
  seoScore: number;
  sanityIssues: string[];
}

export interface ContentParams {
  url: string;
  title: string;
  seoRanking: number;
  priority: string;
  marketValue?: string;
  row?: SheetRow;
}

// ── Unified API key pool ───────────────────────────────────────────────────────
// OpenRouter keys (1-12) + NVIDIA keys — all in one flat pool, no fallback concept.

function buildKeyPool(): ApiKey[] {
  const pool: ApiKey[] = [];

  for (let i = 1; i <= 15; i++) {
    const k = process.env[`OPENROUTER_API_KEY_${i}`]?.trim();
    if (k) pool.push({ key: k, baseUrl: OPENROUTER_BASE_URL, model: OPENROUTER_MODEL, label: `OpenRouter-${i}` });
  }

  for (let i = 1; i <= 4; i++) {
    const envKey = i === 1 ? 'NVIDIA_API_KEY' : `NVIDIA_API_KEY_${i}`;
    const k = process.env[envKey]?.trim();
    if (k) pool.push({ key: k, baseUrl: NVIDIA_BASE_URL, model: NVIDIA_MODEL, label: `NVIDIA-${i}` });
  }

  return pool;
}

// ── Core LLM caller ────────────────────────────────────────────────────────────
// Rotates through all keys (OpenRouter + NVIDIA) as one pool — no fallback.

function pickRandomCaption(raw: string): string {
  // Split on "---" separator used between the 5 captions
  const parts = raw.split(/\n?---\n?/).map(p => p.trim()).filter(p => p.length > 50);
  if (parts.length === 0) return raw.trim();
  return parts[Math.floor(Math.random() * parts.length)];
}

function isRefusal(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.startsWith("i'm sorry") ||
    t.startsWith("i am sorry") ||
    t.startsWith("i cannot") ||
    t.startsWith("i can't") ||
    t.startsWith("i'm unable") ||
    t.startsWith("i am unable") ||
    t.startsWith("unfortunately") ||
    t.includes("cannot complete this request") ||
    t.includes("can't complete this request") ||
    t.includes("does not contain any concrete") ||
    t.includes("no concrete numbers") ||
    t.includes("as specified because") ||
    t.length < 100
  );
}

async function callLLMWithRetry(prompt: string, maxTokens: number, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await callLLM(prompt, maxTokens);
    if (!isRefusal(result)) return result;
    console.warn(`   ⚠️ LLM returned a refusal on attempt ${attempt}/${retries} — retrying...`);
    await new Promise(r => setTimeout(r, 2000));
  }
  // Return last result even if it's a refusal, so the caller can decide what to do
  return await callLLM(prompt, maxTokens);
}

async function callLLM(prompt: string, maxTokens = 512): Promise<string> {
  const pool = buildKeyPool();
  if (pool.length === 0) throw new Error('No API keys found. Set OPENROUTER_API_KEY_1…_12 or NVIDIA_API_KEY in .env');

  for (let i = 0; i < pool.length; i++) {
    const { key, baseUrl, model, label } = pool[i];
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.7,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (res.status === 402 || res.status === 429) {
        console.log(`   ⚠️  ${label} (${i + 1}/${pool.length}): ${res.status === 402 ? 'no credits' : 'rate limited'} — rotating`);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        console.log(`   ⚠️  ${label} (${i + 1}/${pool.length}): status ${res.status} → ${text.slice(0, 80)} — rotating`);
        continue;
      }

      const json = await res.json() as { choices: Array<{ message: { content: string } }> };
      const raw = json.choices?.[0]?.message?.content?.trim() ?? '';
      const text = raw.replace(/\s*—\s*/g, ' ').replace(/–/g, '-').trim();
      if (text) return text;
    } catch (err: any) {
      console.log(`   ⚠️  ${label} (${i + 1}/${pool.length}): ${err.message} — rotating`);
      continue;
    }
  }

  throw new Error('All API keys exhausted (OpenRouter + NVIDIA). Add credits or new keys.');
}

// ── Market data fetcher ────────────────────────────────────────────────────────
// Searches Tavily for market size, CAGR, and top competitors. Returns a compact
// context string injected into LLM prompts. Returns empty string on failure.

async function fetchMarketData(title: string): Promise<string> {
  try {
    const query = `${title} market size CAGR value 2024 2025 2030 competition`;
    const res = await callTavily({ query, search_depth: 'basic', include_answer: true, max_results: 3 });
    const snippets: string[] = [];
    if (res.answer) snippets.push(res.answer);
    for (const r of res.results.slice(0, 2)) {
      if (r.content) snippets.push(r.content.slice(0, 300));
    }
    return snippets.join(' | ').slice(0, 800);
  } catch {
    return '';
  }
}

// ── Platform-specific generators ───────────────────────────────────────────────

/**
 * Generate a tweet for a Ken Research report using the exact brand format.
 * The UTM URL is injected directly into the prompt — the LLM outputs it verbatim.
 * Text content (excl. URL) must be ≤ 180 chars; X counts every URL as 23 chars.
 */
export async function generateTweet(params: {
  url: string;
  title: string;
  seoRanking: number;
  priority: string;
  marketValue?: string;
  overLimitBy?: number; // if set, tighten the char limit by this amount
}): Promise<string> {
  const utmUrl = `${params.url}${UTM_PARAMS.X}`;

  const mv = (params.marketValue ?? '').trim();
  const marketValueLine = mv && mv !== '0' && mv !== 'null'
    ? mv
    : '(not available — skip any market size number)';

  const marketData = await fetchMarketData(params.title);
  const marketDataSection = marketData
    ? `REAL MARKET DATA (from web search — use specific numbers if present):\n${marketData}`
    : 'No web data available — use general market language.';

  const pastTweets = getPastTweets(params.url);
  const pastTweetsSection = pastTweets.length > 0
    ? `──────────────────────
PREVIOUSLY POSTED TWEETS FOR THIS URL (${pastTweets.length} total) — DO NOT reuse:
- Same opening word or phrase
- Same CTA phrase
- Same power phrase
- Same sentence structure or angle

Past tweets:
${pastTweets.map((t, i) => `[${i + 1}] ${t}`).join('\n')}
──────────────────────`
    : '';

  const prompt = `You are a market insights social media writer for X (Twitter).

STEP 1 – Extract the market name from this URL:
${params.url}

Rules:
- Take only the last path segment
- Replace hyphens with spaces
- Keep ALL words including geo (country, region) – do NOT remove any words
- Example: "bahrain-aerogel-market" → "Bahrain aerogel market"
- Example: "australia-renewable-hydrogen-transport-market" → "Australia renewable hydrogen transport market"

STEP 2 – Write the X post in this EXACT style:

Study these real examples carefully – match the tone, structure, and phrasing:

Example A: "Aerogel market in Bahrain is gearing up for a game-changing outlook with surging demand and innovation accelerating growth. Explore the momentum building now: https://example.com #Aerogel #BahrainMarket"

Example B: "Global woodpulp market valued at $52B is set for a 4.2% CAGR through 2030 as sustainable packaging demand and Asia-Pacific capacity expansion reshape the competitive landscape. See what's driving the shift: https://example.com #WoodPulp #Sustainability"

Example C: "Big shifts ahead in the oil gas epc services market as industry momentum builds with exciting changes on the horizon. Full outlook: https://example.com #OilGas #EPCServices"

──────────────────────
FORMAT RULES:
- ONE flowing block – no blank lines anywhere in the tweet body
- 1 or 2 sentences max – no em dashes; use "with", "as", "while", "and" for flow
- If real market data has CAGR, market size, or competitor names – weave ONE specific number naturally into the tweet
- End with a short CTA phrase + colon, then the URL on the same line
- Then a space, then two hashtags
- Rotate CTA phrases: "Explore the momentum building now:", "Explore the surge shaping the future:", "Full outlook:", "Dive into the full picture:", "See what's driving the shift:"
- Hashtag 1 = core market keyword (no geo), Hashtag 2 = industry sector or geo

──────────────────────
POWER PHRASES – use and rotate:
- "game-changing outlook"
- "big shifts ahead"
- "industry momentum builds"
- "surging demand"
- "exciting changes on the horizon"
- "gearing up for"
- "innovation accelerating growth"

──────────────────────
MARKET VALUE (from sheet):
${marketValueLine}

${marketDataSection}

Priority: weave in CAGR or market size from web data if available. If no numbers found, use general language.

──────────────────────
CHARACTER RULE:
The full tweet text (excluding the URL) must be ${230 - (params.overLimitBy ?? 0)} characters or fewer.
The URL does not count toward this limit.${params.overLimitBy ? `\nPrevious attempt was ${params.overLimitBy} characters over — write a shorter, more concise version.` : ''}

──────────────────────
OUTPUT RULES:
- First character must be a letter
- No quotes around the output
- No JSON, no labels, no explanation
- No emojis
- No bullet points
- Output ONLY the tweet text, nothing else
- The URL in your output must be exactly: ${utmUrl}
- Never use: "projected to reach", "anticipated to grow", "value expected to reach", "driving innovation", "growing demand for"
- Every tweet must feel unique – vary the opening structure each time

${pastTweetsSection}`;

  const raw = await callLLM(prompt, 400);
  const tweet = raw.trim();

  // Safety check: ensure the full UTM URL is present (LLM must not truncate it)
  let finalTweet = tweet;
  if (!finalTweet.includes(utmUrl)) {
    const fixed = finalTweet.replace(/https?:\/\/[^\s]+kenresearch[^\s]*/gi, utmUrl);
    finalTweet = fixed.includes(utmUrl) ? fixed : `${finalTweet}\n${utmUrl}`;
  }

  // Save to history so future calls for the same URL avoid this angle
  saveTweetToHistory(params.url, finalTweet);

  return finalTweet;
}

/**
 * Generate a 3-5 tweet thread for a Ken Research report.
 * Returns an array of tweet strings. Last tweet contains the UTM URL.
 */
export async function generateXThread(params: {
  url: string;
  title: string;
  marketValue?: string;
}): Promise<string[]> {
  const utmUrl = `${params.url}${UTM_PARAMS.X}`;
  const marketData = await fetchMarketData(params.title);
  const mv = (params.marketValue ?? '').trim();

  const prompt = `You are a market insights writer creating an X (Twitter) thread for a Ken Research report.

Report: ${params.title}
URL: ${params.url}
Market value: ${mv || 'not available'}
${marketData ? `Web data: ${marketData}` : ''}

Write a thread of exactly 4 tweets. Return ONLY a valid JSON array of 4 strings. No explanation, no markdown, no code blocks.

CHARACTER LIMIT: Each tweet body MUST be 220 characters or fewer. The URL in tweet 4 goes on a NEW LINE and does NOT count toward the 220 limit. Stay well under 220 — aim for 160-210 chars per tweet body.

Thread structure:
- Tweet 1 (Hook): ≤220 chars. Open with the headline figure (market size + CAGR), then 1 short sentence of context. NO URL. End with "🧵".
- Tweet 2 (Insight): ≤220 chars. Pack in 2-3 specific numbers — segment share %, regional growth rate, or end-use figure. Name the top geography. NO URL.
- Tweet 3 (Detail): ≤220 chars. Name 1 specific company or geography. Add concrete figures — capacity, revenue share, adoption rate. Include a forward-looking year. NO URL.
- Tweet 4 (CTA): Body ≤220 chars (excluding URL). One punchy sentence with a number, then "Full report:" then a NEWLINE then ${utmUrl} then a NEWLINE then two hashtags.

Rules:
- Every tweet MUST contain at least 2 numbers (dollar figure, %, CAGR, year, or specific count)
- Tweet body ≤220 chars — count carefully, do not exceed
- Tweet 4: put the URL on its own line (use \\n in the JSON string) so it does not count toward the 220 body limit
- No em dashes — use "with", "as", "and" for flow
- No emojis except 🧵 at end of tweet 1
- No "projected to reach", "anticipated to grow", "driving innovation"
- Tweet 4 URL must be exactly: ${utmUrl}

Output format: ["tweet1", "tweet2", "tweet3", "tweet4 body\\n${utmUrl}\\n#hash1 #hash2"]`;

  const raw = await callLLM(prompt, 1000);

  // Parse JSON array from response
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('generateXThread: LLM did not return a JSON array');

  const tweets: string[] = JSON.parse(match[0]);
  if (!Array.isArray(tweets) || tweets.length < 2) {
    throw new Error('generateXThread: invalid thread array from LLM');
  }

  // Ensure last tweet has the UTM URL
  const last = tweets[tweets.length - 1];
  if (!last.includes(utmUrl)) {
    tweets[tweets.length - 1] = last.replace(/https?:\/\/\S+/g, utmUrl);
    if (!tweets[tweets.length - 1].includes(utmUrl)) {
      tweets[tweets.length - 1] = `${last} ${utmUrl}`;
    }
  }

  return tweets;
}

/**
 * Generate a Facebook post for a Ken Research report.
 * Used by FB batch.
 */
const FB_STYLES = [
  {
    hook: 'Opening Hook – one strong insight-driven sentence leading with a specific market size or CAGR figure (e.g. "The [market] crossed $X billion in [year], growing at X% CAGR").',
    body: `2. Context and Scale – 1-2 sentences on market value, growth rate, and geographic dynamics using real numbers.
3. Key Highlights – exactly 4 bullet points, each starting with a number or percentage from web data. Format: "• [number/stat] — [one-line insight]"
4. Future-Oriented Closing – 2 sentences: first on consolidation or investment trends; second on demand drivers or geographic expansion through a specific year.`,
  },
  {
    hook: 'Opening Hook – a warning-tone sentence signalling a market shift faster than most players realise (e.g. "The [market] is shifting faster than most suppliers realise — and the numbers confirm it.").',
    body: `2. What the data shows – 2 sentences with specific market size, CAGR, and the dominant region from web data.
3. Three forces reshaping the market – exactly 3 bullet points covering: a segment share shift with a %, a top competitor move (name the company), and a regulatory or geographic demand driver. Format: "• [stat or company] — [one sharp insight]"
4. What this means now – 2 sentences on near-term procurement or investment action required, referencing a specific year or threshold figure.`,
  },
  {
    hook: 'Opening Hook – lead with the single most striking number from web data as a standalone sentence (e.g. "$X billion. That is what the [market] is worth today, and it is still accelerating.").',
    body: `2. Why this number matters – 2 sentences framing the growth rate, geography, and what is driving the figure.
3. Key signals – exactly 4 bullet points: a segment breakout stat, a named competitor action, an ESG or regulatory pressure, and a geography-specific demand spike. Format: "• [stat or company] — [one-line insight]"
4. The bottom line – 2 sentences on what procurement teams or investors should prioritise before the next capacity cycle.`,
  },
  {
    hook: 'Opening Hook – a contrarian angle that challenges a common assumption (e.g. "Most coverage focuses on [X segment]. The real growth in [market] is happening somewhere else entirely.").',
    body: `2. The overlooked reality – 2 sentences with specific market size, CAGR, and the under-reported region or segment driving outperformance.
3. Four data points that change the picture – exactly 4 bullet points covering: the overlooked segment's share shift with a %, a competitor expanding into it (name the company), a policy or ESG tailwind, and a demand driver in a specific end-use or geography. Format: "• [stat or company] — [one sharp insight]"
4. Strategic takeaway – 2 sentences on repositioning procurement or portfolio allocation before the opportunity closes.`,
  },
  {
    hook: 'Opening Hook – a forward-looking prediction sentence anchored to a specific year and figure (e.g. "By [year], the [market] will look completely different — here is what the data says is coming.").',
    body: `2. Current baseline – 2 sentences on today\'s market size, CAGR, and dominant region to anchor the forecast.
3. The four forces behind the shift – exactly 4 bullet points: a segment acceleration stat, a named company leading the change, a regulatory or ESG catalyst, and a geographic demand wave. Format: "• [stat or company] — [one sharp insight]"
4. Action window – 2 sentences on the specific procurement contracts or investment positions to secure before the inflection point arrives.`,
  },
];

// ── LinkedIn / FB caption prompt pool (randomly picked per run) ─────────────

const CAPTION_PROMPT_STYLES: Array<{
  label: string;
  optionLabels: string[];
  buildPrompt: (utmUrl: string, marketDataSection: string, currentYear: number, optionIndex: number, platform: 'li' | 'fb') => string;
}> = [
  {
    label: 'KenResearch-Style-1',
    optionLabels: ['Sharp Executive-Style Caption', 'Data-Led and Insight-Heavy Caption', 'CXO Pain-Point Focused Caption'],
    buildPrompt: (utmUrl, marketDataSection, currentYear, optionIndex, _platform) => `
Act as a Senior LinkedIn Content Strategist for a B2B consulting and market research firm (Ken Research).

URL: ${utmUrl}

${marketDataSection}

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
CURRENT YEAR: ${currentYear}

IMPORTANT — YEAR RULE: Always reference the forecast period or the current/upcoming year (${currentYear} or beyond). Do not use stale figures as current.

Your task:
First, silently analyze the URL/market data and extract key statistics, market numbers, growth signals, business pain points, and strategic implications.
Then, output ONLY ONE finished LinkedIn caption — ${['Option 1: Sharp Executive-Style Caption', 'Option 2: Data-Led and Insight-Heavy Caption', 'Option 3: CXO Pain-Point Focused Caption'][optionIndex]}.

Caption must follow this structure:
Hook → Data/Stat → Business Pain Point → Strategic Implication → Ken Research Positioning → CTA → Hashtags

Caption Rules:
- 120–180 words.
- Start with a strong, high-impact hook. Avoid weak openers like "The market is growing rapidly" or "This report talks about".
  Good hooks: "The real opportunity isn't market growth. It's where the next profit pool is shifting." / "For CXOs, this market is no longer about expansion. It's about margin protection." / "Growth is visible. Profitability is where the real question begins."
- Include 1–2 statistics or market signals from the URL/data.
- Reference at least one business pain point (margin pressure, demand uncertainty, competitive intensity, market entry risk).
- Include ONE subtle Ken Research positioning line, e.g.: "At Ken Research, we help businesses decode such market shifts through intelligence-led strategy."
- End with CTA: "Explore the full report here: ${utmUrl}"
- Add 3–5 professional hashtags.
- Tone: professional, consulting-led, CXO-focused, data-backed, human-written. Not sales-heavy or generic.
- Do NOT use em dashes (—). Use commas, colons, or periods instead.

MANDATORY FORMATTING (never skip):
- Each section (Hook / Data / Pain Points / Implication / Positioning / CTA / Hashtags) must be separated by a blank line.
- List pain points or signals as arrow bullets, one per line: "→ first point\n→ second point\n→ third point"
- Hashtags must use plain # symbol. Write #MarketResearch NOT hashtag#MarketResearch
- CTA must be on its own line after a blank line.
- No walls of text. Every distinct idea gets its own paragraph or line.

Output ONLY the caption. No headings, no analysis, no numbering, no explanation.`,
  },
  {
    label: 'KenResearch-Style-2',
    optionLabels: ['Sharp Executive-Style Caption', 'Data-Led and Insight-Heavy Caption', 'CXO Pain-Point Focused Caption'],
    buildPrompt: (utmUrl, marketDataSection, currentYear, optionIndex, _platform) => `
Act as a Senior LinkedIn Content Strategist for a B2B consulting and market research firm (Ken Research).

URL: ${utmUrl}

${marketDataSection}

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
CURRENT YEAR: ${currentYear}

IMPORTANT — YEAR RULE: Always reference the forecast period or the current/upcoming year (${currentYear} or beyond).

Your task:
Silently analyze the URL/market data. Extract key statistics, market numbers, growth signals, business pain points, and strategic implications.
Then output ONLY ONE finished LinkedIn caption — ${['Option 1: Sharp Executive-Style (market opportunity, boardroom relevance, strategic positioning)', 'Option 2: Data-Led and Insight-Heavy (statistics, market numbers, operational meaning)', 'Option 3: CXO Pain-Point Focused (decision-making risks, margin pressure, competition, market entry concerns)'][optionIndex]}.

Structure: Hook → Data/Stat → Business Pain Point → Strategic Implication → Ken Research Positioning → CTA → Hashtags

Rules:
- 120–180 words.
- Hook must be sharp and boardroom-ready. Never start with "The market is growing" or "This report talks about".
  Strong openers: "The companies that understand this shift early will not just enter the market. They will shape it." / "The real question for decision-makers is not whether this market will grow. It is who captures the margin." / "Market size is the headline. Profitability is the story beneath it."
- Use 1–2 data points from the provided market data. Do NOT invent numbers.
- Reference at least one pain point relevant to CXOs (weak market visibility, competitive pressure, margin compression, demand uncertainty).
- Include ONE Ken Research positioning line: "Ken Research supports decision-makers in assessing market size, competitive intensity, and growth pathways with clarity."
- CTA: "For deeper competitive intelligence, read the complete insight: ${utmUrl}"
- 3–5 professional, topic-relevant hashtags.
- Tone: sharp, consulting-grade, data-backed, human-written. Not promotional, not generic, not academic.
- Do NOT use em dashes (—). Replace with commas, colons, or periods.

MANDATORY FORMATTING (never skip):
- Each section (Hook / Data / Pain Points / Implication / Positioning / CTA / Hashtags) must be separated by a blank line.
- List pain points or signals as arrow bullets, one per line: "→ first point\n→ second point\n→ third point"
- Hashtags must use plain # symbol. Write #IndonesiaMarket NOT hashtag#IndonesiaMarket
- CTA must be on its own line after a blank line.
- No walls of text. Every distinct idea gets its own paragraph or line.

Output ONLY the caption text. No analysis section, no headings, no separators.`,
  },
];

const LI_STYLES = [
  {
    hook: 'Hook – one sharp, provocative line challenging a B2B blind spot. Start with "If you assume" or "If your team still treats". Reference a specific market figure in the same sentence.',
    sections: `2. Market reality – 2 sentences with exact figures (market size in USD, CAGR %, dominant region) from web data. Frame as intelligence a decision-maker needs.
3. What B2B leaders must watch – exactly 4 bullet points using "•": a segment shift with a %, a named competitor move, a regulatory or ESG pressure, a demand driver in a specific geography. Format: "• [stat or company name] — [one sharp insight]"
4. Strategic implication – 1-2 sentences on procurement, investment, or competitive positioning. Make it directly actionable.`,
  },
  {
    hook: 'Hook – open with the single most striking number from web data as a standalone sentence, then a second sentence naming who is already acting on it (e.g. "The [market] hit $X billion in [year]. Leading procurement teams are already locking in supply contracts."). No "If you assume" phrasing.',
    sections: `2. Why this number is a signal, not a statistic – 2 sentences linking the figure to a structural shift: segment consolidation, geography expansion, or regulatory pressure. Use specific numbers.
3. Four moves shaping the competitive landscape – exactly 4 bullet points using "•": a segment share shift with a %, a named company\'s strategic action, an ESG or compliance pressure with a specific year or target, a demand surge in a named geography or end-use. Format: "• [stat or company name] — [one sharp insight]"
4. The decision window – 1-2 sentences on what procurement heads or investors must do before the market tightens, referencing a specific threshold or deadline.`,
  },
  {
    hook: 'Hook – a contrarian opening that names what "everyone" is focused on versus where the real opportunity lies (e.g. "Everyone is tracking [X]. The actual value in [market] is concentrating somewhere else entirely."). Include one specific figure.',
    sections: `2. The overlooked segment – 2 sentences with market size, CAGR, and the under-reported region or sub-segment outperforming the headline number.
3. Four data points that change the thesis – exactly 4 bullet points using "•": the hidden segment\'s share shift with a %, a competitor already moving there (name the company), a policy or ESG tailwind with a date or target, a geography-specific demand spike. Format: "• [stat or company name] — [one sharp insight]"
4. Portfolio implication – 1-2 sentences on reallocating procurement spend or investment weight toward the overlooked segment before consolidation closes the window.`,
  },
  {
    hook: 'Hook – a forward-looking prediction anchored to a specific year and dollar figure (e.g. "By [year], the [market] will be unrecognisable. $X billion in new capacity is already being committed."). No "If you assume" phrasing.',
    sections: `2. Today\'s baseline – 2 sentences on current market size, CAGR, and the region leading growth, to set the scale of the coming shift.
3. Four forces driving the transformation – exactly 4 bullet points using "•": a segment accelerating beyond the overall CAGR with a %, a named company leading the buildout, a regulatory or ESG mandate with a specific year or threshold, a geographic demand wave tied to infrastructure or policy. Format: "• [stat or company name] — [one sharp insight]"
4. First-mover window – 1-2 sentences on the specific contracts, partnerships, or positions that early movers must secure now to capture disproportionate value.`,
  },
  {
    hook: 'Hook – open with a direct question that forces a procurement or investment decision (e.g. "When [market condition hits], which supply contracts do you have locked in?"). Follow immediately with the market size figure.',
    sections: `2. The pressure building – 2 sentences on market size, CAGR, and the geographic or segment dynamic creating the urgency behind the question.
3. Four signals procurement and investors cannot ignore – exactly 4 bullet points using "•": a capacity or volume shift with a %, a named player expanding or exiting, an ESG or compliance deadline, a demand driver tied to a specific region or end-use. Format: "• [stat or company name] — [one sharp insight]"
4. The answer – 1-2 sentences with a concrete, actionable response to the opening question, referencing specific thresholds, timelines, or criteria.`,
  },
  {
    hook: 'Hook – open with a short declarative statement naming what is quietly happening in the market right now, without "If you assume" (e.g. "The [market] is consolidating faster than most procurement teams have updated their supplier lists."). Include a specific figure.',
    sections: `2. The scale of the shift – 2 sentences with exact market size in USD, CAGR, and the dominant region, framed as the context for the consolidation or shift.
3. What is driving it – exactly 4 bullet points using "•": a segment share movement with a %, a named company making a strategic move, a regulatory or ESG pressure with a specific year or target, a geography or end-use pulling disproportionate demand. Format: "• [stat or company name] — [one sharp insight]"
4. Strategic implication – 1-2 sentences on what procurement heads or investors must do differently in the next quarter, referencing a specific deadline or capacity threshold.`,
  },
];

// ── FB_STYLES prompt builder (styles 3–7 in the pool) ───────────────────────
function buildFbStylePrompt(
  utmUrl: string,
  marketDataSection: string,
  currentYear: number,
  styleIndex: number,
): string {
  const style = FB_STYLES[styleIndex];
  return `You are a Senior Facebook Content Writer for Ken Research, a global market intelligence firm.

Report URL: ${utmUrl}

${marketDataSection}

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
CURRENT YEAR: ${currentYear}

IMPORTANT — YEAR RULE: Always reference the forecast period or the current/upcoming year (${currentYear} or beyond). Do not present past figures as current.

Write ONE professional Facebook post following this exact structure:

1. ${style.hook}
${style.body}
5. Ken Research CTA – one sentence ending with: "Read the full report: ${utmUrl}"
6. Hashtags – 5–7 relevant professional hashtags.

Hard rules:
- Use ONLY data from the web search results. Do NOT invent numbers.
- Do NOT use em dashes (—). Replace with a comma, colon, or period.
- No emojis. No generic filler phrases ("rapidly growing", "exciting opportunity").
- Tone: professional, research-led, consulting-style.
- Output ONLY the post. No preamble, no labels, no commentary.`;
}

// ── Original FB prompt (style 0) ────────────────────────────────────────────
function buildOriginalFbPrompt(utmUrl: string, marketDataSection: string, currentYear: number): string {
  return `You are a Senior SEO Content Strategist and Facebook Post Caption Writer for Ken Research.

Report URL: ${utmUrl}

${marketDataSection}

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
CURRENT YEAR: ${currentYear}

IMPORTANT — YEAR RULE:
- If the market data contains previous year figures, do NOT use them as current. Always reference the forecast period or the current/upcoming year (${currentYear} or beyond).
- Frame all statistics as forward-looking or current-year projections.

Your task is to generate ONE professional Facebook caption for this Ken Research report.

Caption Requirements:
1. Strong hook in the opening line.
2. Use the market name naturally in the first 1-2 lines.
3. Include important report information: market size/value, forecast period, key growth drivers, major segments, leading regions, technology/demand trends, business opportunities.
4. Add 4-6 bullet-style market highlights.
5. Keep all text plain. Do NOT use markdown bold markers such as ** around words, numbers, or phrases.
6. Tone: professional, research-led, consulting-style.
7. No emojis.
8. Do NOT use em dashes (—) anywhere. Use a comma, colon, or period instead.
9. Do not sound promotional or generic.
10. End with this CTA:
    Read the full [Market Name] Report by Ken Research:
    ${utmUrl}
11. Add 5-7 relevant SEO hashtags at the end.

Caption Structure:
- Opening Hook (1-2 strong lines introducing the market opportunity)
- Information Paragraph (market size, key demand drivers, why this market matters)
- Market Highlights (4-6 bullets with clear strategic points)
- Business Relevance (why this matters for investors, manufacturers, distributors, consultants)
- CTA + URL
- Hashtags

Output ONLY the single caption. No numbering, no separators, no explanation before or after.
STRICT: Do NOT use em dashes (—) anywhere. Replace with a comma, colon, or period.`;
}

export async function generateFbPost(params: {
  url: string;
  title: string;
  seoRanking: number;
  priority: string;
}): Promise<string> {
  const utmUrl = `${params.url}${UTM_PARAMS.Facebook}`;
  const marketData = await fetchMarketData(params.title);
  const marketDataSection = marketData
    ? `REAL MARKET DATA (from web search — use specific numbers, CAGR, market size, competitors if present):\n${marketData}`
    : 'No web data available — use general market language without inventing numbers.';

  const currentYear = new Date().getFullYear();

  // Pool:
  //   0           = original FB prompt (structured bullets + bold keywords)
  //   1–2         = CAPTION_PROMPT_STYLES (KenResearch-Style-1 & -2, 3 options each)
  //   3–7         = FB_STYLES[0–4] (5 hook/body variations)
  // Total slots: 1 + 2 + 5 = 8
  const poolSize = 1 + CAPTION_PROMPT_STYLES.length + FB_STYLES.length;
  const pick = Math.floor(Math.random() * poolSize);

  let prompt: string;
  if (pick === 0) {
    console.log(`   [FB] Prompt style: Original`);
    prompt = buildOriginalFbPrompt(utmUrl, marketDataSection, currentYear);
  } else if (pick <= CAPTION_PROMPT_STYLES.length) {
    const style = CAPTION_PROMPT_STYLES[pick - 1];
    const optionIndex = Math.floor(Math.random() * style.optionLabels.length);
    console.log(`   [FB] Prompt style: ${style.label} / ${style.optionLabels[optionIndex]}`);
    prompt = style.buildPrompt(utmUrl, marketDataSection, currentYear, optionIndex, 'fb');
  } else {
    const fbStyleIndex = pick - 1 - CAPTION_PROMPT_STYLES.length;
    console.log(`   [FB] Prompt style: FB_STYLES[${fbStyleIndex}]`);
    prompt = buildFbStylePrompt(utmUrl, marketDataSection, currentYear, fbStyleIndex);
  }

  return await callLLMWithRetry(prompt, 1000);
}

/**
 * Generate a LinkedIn post for a Ken Research report.
 * Used by LI batch.
 */
// ── Original LI prompt (style 0 — uses LI_STYLES rotation) ─────────────────
function buildOriginalLiPrompt(utmUrl: string, marketDataSection: string, currentYear: number): string {
  const style = LI_STYLES[Math.floor(Math.random() * LI_STYLES.length)];
  return `You are a Senior B2B LinkedIn Content Writer for Ken Research, a global market intelligence firm.

Report URL: ${utmUrl}

${marketDataSection}

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
CURRENT YEAR: ${currentYear}

IMPORTANT — YEAR RULE:
- If the market data contains previous year figures, do NOT use them as current. Always reference the forecast period or the current/upcoming year (${currentYear} or beyond).
- Frame all statistics as forward-looking or current-year projections.

Write ONE LinkedIn post (250–350 words) strictly following this structure:

1. ${style.hook}
${style.sections}
5. Ken Research CTA – one sentence ending with: "Explore the full report: ${utmUrl}"
6. Hashtags – 4–6 professional hashtags relevant to the market topic.

Hard rules:
- Use only data from the web search results. Do NOT invent numbers.
- Do NOT use em dashes (—). Replace with a comma, colon, or period.
- No emojis. No generic phrases ("rapidly growing", "exciting opportunity"). No filler sentences.
- Output ONLY the LinkedIn post. No preamble, no labels, no commentary.`;
}

export async function generateLiPost(params: {
  url: string;
  title: string;
  seoRanking: number;
  priority: string;
}): Promise<string> {
  const utmUrl = `${params.url}${UTM_PARAMS.LinkedIn}`;
  const marketData = await fetchMarketData(params.title);
  const marketDataSection = marketData
    ? `REAL MARKET DATA (from web search — use specific numbers, CAGR, market size, top competitors if present):\n${marketData}`
    : 'No web data available — use general market language without inventing numbers.';

  const currentYear = new Date().getFullYear();

  // Pool: 0 = original LI style (6 sub-styles), 1 = KenResearch-Style-1, 2 = KenResearch-Style-2
  const poolSize = 1 + CAPTION_PROMPT_STYLES.length; // 3 total
  const pick = Math.floor(Math.random() * poolSize);

  let prompt: string;
  if (pick === 0) {
    prompt = buildOriginalLiPrompt(utmUrl, marketDataSection, currentYear);
  } else {
    const style = CAPTION_PROMPT_STYLES[pick - 1];
    const optionIndex = Math.floor(Math.random() * style.optionLabels.length);
    console.log(`   [LI] Prompt style: ${style.label} / ${style.optionLabels[optionIndex]}`);
    prompt = style.buildPrompt(utmUrl, marketDataSection, currentYear, optionIndex, 'li');
  }

  return await callLLMWithRetry(prompt, 1000);
}

/**
 * Generate Medium post — uses pre-written content from sheet (no LLM)
 */
export async function generateMediumPost(row: SheetRow): Promise<string> {
  const content = (row.blogContent || '').trim();
  if (!content) {
    throw new Error('No blog content provided (Blog Content for all column is empty)');
  }
  // Inject UTM parameters into the content
  return injectUTM(content, UTM_PARAMS.Medium);
}

/**
 * Generate Google Sites post — uses pre-written content from sheet (no LLM)
 */
export async function generateGoogleSitePost(row: SheetRow): Promise<string> {
  const content = (row.blogContent || '').trim();
  if (!content) {
    throw new Error('No blog content provided (Blog Content for all column is empty)');
  }
  // Inject UTM parameters into the content
  return injectUTM(content, UTM_PARAMS.GoogleSite);
}

/**
 * Generate Dev.to post — uses pre-written content from sheet (no LLM)
 */
export async function generateDevtoPost(row: SheetRow): Promise<string> {
  const content = (row.blogContent || '').trim();
  if (!content) {
    throw new Error('No blog content provided (Blog Content for all column is empty)');
  }
  // Inject UTM parameters into the content
  return injectUTM(content, UTM_PARAMS.Devto);
}

/**
 * Generate LinkedIn Pulse article — uses pre-written content from sheet (no LLM)
 * Returns: { title, html, seoTitle, seoDescription }
 */
export async function generateLinkedinPulsePost(row: SheetRow): Promise<{ title: string; html: string; seoTitle: string; seoDescription: string }> {
  // Use Main Title from sheet (blog headline)
  const mainTitle = (row.descriptionTitle || row.title || '').trim();
  if (!mainTitle) {
    throw new Error('No Main Title (descriptionTitle) or title found');
  }

  // Use Blog Content for all (article body)
  const blogContent = (row.blogContent || '').trim();
  if (!blogContent) {
    throw new Error('No blog content provided (Blog Content for all column is empty)');
  }

  // Use Description column as SEO description / share text
  const finalSeoDesc = row.description?.trim() || blogContent.replace(/<[^>]*>/g, '').slice(0, 160);

  return {
    title: mainTitle,
    html: injectUTM(blogContent, UTM_PARAMS.LinkedIn),
    seoTitle: mainTitle, // Use Main Title as SEO title
    seoDescription: finalSeoDesc || 'Explore the latest market insights and analysis',
  };
}

/**
 * Generate Calisthenics post — uses pre-written content from sheet (no LLM)
 */
export async function generateCalisthenicsPost(row: SheetRow): Promise<string> {
  const content = (row.blogContent || '').trim();
  if (!content) {
    throw new Error('No blog content provided (Blog Content for all column is empty)');
  }
  // Inject UTM parameters into the content
  return injectUTM(content, UTM_PARAMS.Calisthenics);
}

/**
 * Generate Substack post — uses pre-written content from sheet (no LLM)
 */
export async function generateSubstackPost(row: SheetRow): Promise<string> {
  const content = (row.blogContent || '').trim();
  if (!content) {
    throw new Error('No blog content provided (Blog Content for all column is empty)');
  }
  // Inject UTM parameters into the content
  return injectUTM(content, UTM_PARAMS.Substack);
}

/**
 * Generate Linkmate post — uses pre-written content from sheet (no LLM)
 */
export async function generateLinkmatePost(row: SheetRow): Promise<string> {
  const content = (row.blogContent || '').trim();
  if (!content) {
    throw new Error('No blog content provided (Blog Content for all column is empty)');
  }
  return injectUTM(content, UTM_PARAMS.Linkmate);
}

/**
 * Generate HackMD post — uses pre-written content from sheet (no LLM)
 */
export async function generateHackmdPost(row: SheetRow): Promise<string> {
  const content = (row.blogContent || '').trim();
  if (!content) {
    throw new Error('No blog content provided (Blog Content for all column is empty)');
  }
  // Inject UTM parameters into the content
  return injectUTM(content, UTM_PARAMS.HackMD);
}

// ── Legacy: generate all 4 posts at once (used by weekly recheck) ──────────────

export async function runContentAgent(params: ContentParams): Promise<ContentResult> {
  const prompt = `Generate social media content for this Ken Research market report.
Return ONLY valid JSON (no markdown, no extra text).

Title: ${params.title}
URL: ${params.url}
Priority: ${params.priority}
Rank: ${params.seoRanking}

JSON format:
{
  "tweet": "tweet max 280 chars with URL and hashtags",
  "fbPost": "facebook post 2-3 paragraphs",
  "liPost": "linkedin post 3-4 paragraphs with hashtags",
  "blog": "blog post 200-300 words"
}`;

  const raw = await callLLM(prompt, 1500);

  let parsed: any;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*?"blog"[\s\S]*?\}/);
    if (!jsonMatch) throw new Error(`No valid JSON in response: ${raw.slice(0, 150)}`);
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error(`Could not parse JSON: ${jsonMatch[0].slice(0, 150)}`);
    }
  }

  if (!parsed.tweet) throw new Error('Incomplete content: missing tweet field');

  return {
    tweet: String(parsed.tweet).slice(0, 280),
    fbPost: String(parsed.fbPost || ''),
    liPost: String(parsed.liPost || ''),
    blog: String(parsed.blog || ''),
    seoScore: 75,
    sanityIssues: [],
  };
}
