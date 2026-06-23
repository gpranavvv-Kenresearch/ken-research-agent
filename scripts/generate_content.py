#!/usr/bin/env python3
"""
generate_content.py — Generates social content for a Ken Research report URL.
Called by the Celery worker immediately after a form submission.

Usage:
  python scripts/generate_content.py \
    --url https://www.kenresearch.com/... \
    --title "India Cold Chain Logistics Market" \
    --name aniket \
    --row 5 \
    --platforms x,facebook,linkedin \
    --description "optional short description"

Outputs JSON to stdout:
  {"x": "tweet text", "facebook": "fb post", "linkedin": "li post"}

Also writes generated content back to the Google Sheet via sheet_write.py.
"""
import argparse
import json
import os
import random
import subprocess
import sys
import time

import requests

# ── Helpers ──────────────────────────────────────────────────────────────────

def _pick_key(prefix: str, count: int = 15) -> str | None:
    # Support both single key (TAVILY_API_KEY) and numbered keys (TAVILY_API_KEY_1 ... _N)
    candidates = [os.environ.get(prefix)]
    candidates += [os.environ.get(f'{prefix}_{i}') for i in range(1, count + 1)]
    keys = [k for k in candidates if k and k.strip()]
    return random.choice(keys) if keys else None


def scrape_url(url: str) -> str:
    """Fetch report page and extract visible text."""
    try:
        headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 Chrome/120 Safari/537.36'
            )
        }
        resp = requests.get(url, headers=headers, timeout=20)
        resp.raise_for_status()
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(resp.text, 'html.parser')
            for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
                tag.decompose()
            text = soup.get_text(separator='\n', strip=True)
            return text[:4000]
        except ImportError:
            # bs4 not installed — strip tags manually
            import re
            text = re.sub(r'<[^>]+>', ' ', resp.text)
            text = re.sub(r'\s+', ' ', text)
            return text[:4000]
    except Exception as exc:
        return f'[Could not scrape URL: {exc}]'


def tavily_search(query: str) -> str:
    """Search for additional market context using Tavily."""
    key = _pick_key('TAVILY_API_KEY', 10)
    if not key:
        return ''
    try:
        resp = requests.post(
            'https://api.tavily.com/search',
            json={'api_key': key, 'query': query, 'max_results': 5, 'search_depth': 'basic'},
            timeout=20,
        )
        results = resp.json().get('results', [])
        snippets = [f"- {r.get('title','')}: {r.get('content','')[:250]}" for r in results[:4]]
        return '\n'.join(snippets)
    except Exception:
        return ''


def call_openrouter(prompt: str, model: str = 'openai/gpt-oss-120b:free') -> str:
    key = _pick_key('OPENROUTER_API_KEY', 15)
    if not key:
        raise RuntimeError('No OPENROUTER_API_KEY available in environment')
    resp = requests.post(
        'https://openrouter.ai/api/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://kenresearch.com',
        },
        json={
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': 1200,
            'temperature': 0.7,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']['content'].strip()


def call_nvidia(prompt: str, model: str = 'meta/llama-3.1-70b-instruct') -> str:
    key = _pick_key('NVIDIA_API_KEY', 4)
    if not key:
        raise RuntimeError('No NVIDIA_API_KEY available in environment')
    resp = requests.post(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
        },
        json={
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': 1200,
            'temperature': 0.7,
            'stream': False,
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']['content'].strip()


def call_ai(prompt: str) -> str:
    """Try OpenRouter first, fall back to NVIDIA NIM."""
    try:
        return call_openrouter(prompt)
    except Exception as e:
        print(f'[generate_content] OpenRouter failed ({e}), trying NVIDIA...', file=sys.stderr)
        return call_nvidia(prompt)


# ── Text sanitiser ───────────────────────────────────────────────────────────

def _sanitise(text: str) -> str:
    """Remove every dash/hyphen variant the model loves to sneak in."""
    import re as _re
    replacements = {
        '—': ' - ',   # em dash —
        '–': '-',     # en dash –
        '‑': '-',     # non-breaking hyphen ‑
        '‒': '-',     # figure dash ‒
        '―': ' - ',   # horizontal bar ―
        '﹘': '-',     # small em dash ﹘
        '﹣': '-',     # small hyphen-minus ﹣
        '－': '-',     # fullwidth hyphen－
    }
    for char, repl in replacements.items():
        text = text.replace(char, repl)
    # Collapse any accidental double-spaces left behind
    text = _re.sub(r'  +', ' ', text)
    return text.strip()


# ── Content generators ────────────────────────────────────────────────────────

def build_context(title: str, url: str, description: str, page_text: str, web_snippets: str) -> str:
    return f"""Report Title: {title}
Report URL: {url}
Description: {description or 'N/A'}

Page Content (excerpt):
{page_text[:2000]}

Web Research:
{web_snippets[:800]}"""


def generate_x(context: str, url: str = '', name: str = '') -> str:
    # Build UTM URL — appended after tweet body
    sep = '&' if '?' in url else '?'
    campaign = f'Automation{name.strip().title()}' if name else 'Automation'
    utm_url = f'{url}{sep}utm_source=X&utm_medium=Social&utm_campaign={campaign}' if url else ''

    prompt = f"""You are a market intelligence analyst at Ken Research. Write ONE tweet body for this market report.

{context}

MANDATORY FORMAT — TWO SENTENCES ONLY:
Sentence 1: [Market name] [verb] [USD value] [by year] at [X%] CAGR.
Sentence 2: [Key driver or segment] [verb] [specific data point].
Last: #[Tag1] #[Tag2]

ABSOLUTE RULES — BREAKING ANY OF THESE = WRONG:
- DO NOT include any URL or link. The URL is appended automatically.
- DO NOT write any call-to-action. BANNED: "Dive into", "Explore", "Check out", "Read more", "See the full report", "Learn more", "Full picture", "Find out"
- DO NOT use vague language. BANNED: "sees big shifts", "gearing up", "game-changing", "big changes ahead", "surging demand lifts", "set to", "poised to", "is expected to"
- DO NOT include "Ken Research" anywhere in the tweet
- DO NOT use em dashes, en dashes, or non-breaking hyphens
- DO NOT put quotes around the tweet
- Exactly 2 hashtags at the end — specific to market and geography
- 160-190 characters for the tweet body ONLY (URL is added on a separate line)

CORRECT FORMAT (copy this style exactly):
Indonesia animal health market to reach $794M by 2030 at 4.2% CAGR. Government vaccination drives 38% of demand growth. #AnimalHealth #Indonesia

Spain ceramic market valued at $4.0B by 2030 growing at 3.6% CAGR. Residential construction leads with 52% segment share. #Ceramics #Spain

India cold chain market to reach $22B by 2028 at 14.2% CAGR. Pharma and e-grocery drive 73% of capacity adds. #ColdChain #India

WRONG (do not do this):
"Indonesia's animal health sector sees big shifts ahead as surging demand lifts market toward $794M. Dive into: https://..." — WRONG: has CTA, has URL, vague language
"Spain ceramic market is gearing up for a game-changing outlook. Explore the momentum: https://..." — WRONG: has CTA, has URL, vague language

Return ONLY the tweet body text. Two sentences + 2 hashtags. No URL. Nothing else."""
    body = _sanitise(call_ai(prompt))
    import re as _re
    body = _re.sub(r'https?://\S+', '', body).strip()
    if utm_url:
        return f'{body}\n{utm_url}'
    return body


def generate_facebook(context: str, url: str = '', name: str = '') -> str:
    sep = '&' if '?' in url else '?'
    campaign = f'Automation{name.strip().title()}' if name else 'Automation'
    utm_url = f'{url}{sep}utm_source=Facebook&utm_medium=Social&utm_campaign={campaign}' if url else ''

    prompt = f"""You are a market intelligence analyst at Ken Research. Write a Facebook post for this market report.

{context}

MANDATORY STRUCTURE — follow this exactly, section by section:

LINE 1 (hook — one sentence only):
Either: A surprising or counter-intuitive insight about this market.
Or: The single most important number with context.
Examples:
"The Malaysia furniture market is shifting faster than most suppliers realise, and the numbers confirm it."
"Most analysts spotlight residential construction as the main driver of India's PVC pipes market. The real surge is coming from large-scale infrastructure projects in the North-East region."
DO NOT start with: "In today's", "In an era", "The world is witnessing", "It is no secret", "As we navigate"

BLANK LINE

PARAGRAPH (2-3 sentences — market size, CAGR, geography leader):
State the projected market value, CAGR %, forecast year, and dominant region or segment. Be specific.

BLANK LINE

BULLET POINTS (3-4 bullets using this labeled format):
• [Label] - [specific insight with data or company name or policy name]
• [Label] - [specific insight]
• [Label] - [specific insight]
• [Label] - [specific insight, optional]

Label examples: "Residential segment", "Share shift", "Competitor move", "Policy tailwind", "Demand driver", "Key player", "Sustainability angle"
Each bullet must have a concrete fact, number, company name, or policy name.

BLANK LINE

ACTION LINE (1-2 sentences):
Start with "This means..." or "Companies should..." or "Procurement teams must..."
Give a specific, time-bound recommendation for investors, procurement, or strategy teams.

BLANK LINE

CTA LINE (exact format):
Read the full report: {utm_url if utm_url else '[URL]'}

BLANK LINE

HASHTAGS (5-7 tags, last line):
Always include #KenResearch. Add 4-6 tags specific to the market, geography, and theme.

RULES:
- 220-300 words total (not counting hashtag line)
- Use specific numbers, company names, policy names — no vague statements
- No em dashes, no en dashes
- No emojis
- "Ken Research" must NOT appear in the body text (it is in the hashtag only)
- The bullet label format is: "• Label - insight" (dash, not colon)

Return ONLY the post text. Follow the structure above exactly."""
    return _sanitise(call_ai(prompt))


def generate_linkedin(context: str, url: str = '', name: str = '') -> str:
    sep = '&' if '?' in url else '?'
    campaign = f'Automation{name.strip().title()}' if name else 'Automation'
    utm_url = f'{url}{sep}utm_source=LinkedIn&utm_medium=Social&utm_campaign={campaign}' if url else ''

    prompt = f"""You are a senior market intelligence analyst at Ken Research. Write a LinkedIn post for this market report.

{context}

MANDATORY STRUCTURE — follow section by section:

LINE 1 (hook — ONE sentence, must be a question):
Frame it as: "When [specific business pain or operational pressure the reader faces], [direct question about their readiness or decision for a specific year]?"
The question must speak directly to a procurement lead, investor, or strategy director — use their language.

CORRECT hook examples:
"When vehicle downtime starts eating into your service-center margins, which multi-brand car-service contracts have you secured for 2026?"
"When cold-chain failures cost your pharma clients millions per shipment, which logistics partners have you locked in for 2025?"
"When EV fleet adoption outpaces your current charging infrastructure, which energy contracts have you negotiated for 2027?"

WRONG hooks (do not use):
"The India AI market is booming and here is why." — statement, not a question
"Did you know the Indonesia market is growing at 9%?" — weak generic question
"In today's rapidly evolving landscape..." — banned opener

BLANK LINE

PARAGRAPH 1 (market context, 2-3 sentences):
State the market trajectory and key geography or segment angle.
IMPORTANT: If you do not have a precise dollar value, write "multi-billion-dollar" or "multi-crore" — do NOT write "XX billion" or "$0" or any placeholder number.
Mention CAGR % if known. Mention which city tier or region is accelerating fastest.

BLANK LINE

BULLET POINTS (3-4 bullets using this exact format):
• [Specific stat or label] - [insight with real number, company name, or policy name]
• [Specific stat or label] - [insight]
• [Company name or policy name] - [what they announced or what the rule requires]
• [Demand or trend stat] - [insight with number and year]

Each bullet must contain at least one of: a %, a year, a company name, or a policy name.
NEVER write a bullet with only vague language and no data anchor.

BLANK LINE

ACTION LINE (1-2 sentences):
Start with "Lock in", "Evaluate", "Secure", or "Set a".
Give a specific, time-bound recommendation — mention a deadline (90-day window, Q4 2026, etc.)

BLANK LINE

CTA LINE (exact format):
Explore the full report: {utm_url if utm_url else '[URL]'}

RULES:
- 200-270 words total (not counting CTA line)
- No hashtags
- No em dashes, no en dashes
- No emojis
- Do NOT mention "Ken Research" in the body
- Do NOT write placeholder numbers like "XX billion", "$0", "X%"
- BANNED: "In today's rapidly evolving landscape", "It goes without saying", "As we navigate", "Thrilled to share", "Proud to share", "Exciting times"

Return ONLY the post text. Follow the structure above exactly."""
    return _sanitise(call_ai(prompt))


def generate_threads(context: str, url: str = '', name: str = '') -> str:
    sep = '&' if '?' in url else '?'
    campaign = f'Automation{name.strip().title()}' if name else 'Automation'
    utm_url = f'{url}{sep}utm_source=Threads&utm_medium=Social&utm_campaign={campaign}' if url else ''

    prompt = f"""You are a market intelligence analyst at Ken Research. Write a Threads post for this market report.

{context}

MANDATORY FORMAT — 5 lines exactly, then URL and hashtags:

LINE 1 (hook statement): "The real question for [specific audience — procurement teams / investors / operators] is [who/what] will [strategic outcome] as [market dynamic]."
The hook must name a specific competitive or strategic pressure. NOT a question. NOT generic.
CORRECT: "The real question for logistics operators is who will lock in the capacity contracts before regional freight rates spike again."
WRONG: "The market is growing rapidly." / "Have you considered this market?"

LINE 2 (market data): "By [year] the [market name] is projected to [reach/surpass] [value or multi-billion-dollar], driven by [top driver 1] and [top driver 2]."
If no precise USD value is available, write "a multi-billion-dollar valuation" — never write "XX billion" or "$0".

LINE 3: "→ [Specific pain point, blind spot, or competitive pressure that creates urgency for the reader]"
LINE 4: "→ [Second pressure — policy, supply constraint, pricing, or demand shift]"
LINE 5: "→ [Third pressure — margin risk, capacity gap, or regulatory deadline]"

BLANK LINE

URL: {utm_url if utm_url else '[URL]'}

HASHTAGS (3-4 on last line): Always specific to market and geography. No #KenResearch needed.

RULES:
- Lines 1-5 must total 350-420 characters (tight — count carefully)
- No em dashes, no en dashes
- No emojis
- No URL in lines 1-5 (URL goes on its own line after the blank line)
- Arrow must be → (Unicode right arrow), not - or *

Return ONLY the post text in this format. Nothing else."""
    body = _sanitise(call_ai(prompt))
    import re as _re
    body = _re.sub(r'https?://\S+', '', body).strip()
    if utm_url:
        return f'{body}\n\n{utm_url}'
    return body


def generate_instagram(context: str, url: str = '', name: str = '') -> str:
    sep = '&' if '?' in url else '?'
    campaign = f'Automation{name.strip().title()}' if name else 'Automation'
    utm_url = f'{url}{sep}utm_source=Instagram&utm_medium=Social&utm_campaign={campaign}' if url else ''

    prompt = f"""You are a market intelligence analyst at Ken Research. Write an Instagram caption for this market report (the image is already provided separately).

{context}

MANDATORY STRUCTURE:

LINE 1 (hook — 1 sentence): A bold market statement with a specific number. Make it visual and punchy.
CORRECT: "$794M and growing — Indonesia's animal health market is moving faster than most investors realise."
WRONG: "In today's rapidly evolving landscape..." / "Did you know..."

BLANK LINE

PARAGRAPH (3-4 sentences): Market size, CAGR, forecast year, dominant segment or geography. Each stat bolded with emojis allowed here only.
Use real numbers. If no precise value, write "multi-billion-dollar".

BLANK LINE

INSIGHTS (4-5 bullet points using • symbol):
• [Key segment or driver] — [specific stat or company name]
• [Policy or regulation] — [impact with year]
• [Competitive angle] — [specific player or market share]
• [Geographic angle] — [city/region + stat]
• [Forward-looking insight] — [what changes by 2028/2030]

BLANK LINE

CTA LINE: "Full report linked in bio. 🔗" OR "Link in bio for the complete forecast. 📊"

BLANK LINE

HASHTAGS (12-15 tags): Mix of broad (#MarketResearch #BusinessIntelligence) and specific (#IndonesiaAnimalHealth #VetCare).
Always include: #KenResearch #MarketIntelligence

RULES:
- 150-250 words total (not counting hashtags)
- DO NOT include the URL in the caption body (it goes in bio)
- No em dashes, no en dashes
- Up to 5 emojis total (used sparingly, only on data lines and CTA)
- BANNED openers: "In today's", "In an era", "The world is witnessing"

Return ONLY the caption text."""
    return _sanitise(call_ai(prompt))


# ── Sheet write helper ────────────────────────────────────────────────────────

def write_to_sheet(name: str, row: int, updates: dict) -> None:
    repo_root = os.environ.get(
        'REPO_ROOT',
        os.path.join(os.path.dirname(__file__), '..')
    )
    script = os.path.join(repo_root, 'scripts', 'sheet_write.py')
    if not os.path.exists(script):
        print(f'[WARN] sheet_write.py not found at {script}', file=sys.stderr)
        return

    subprocess.run(
        [
            sys.executable, script,
            '--sheet', 'social',
            '--name', name,
            '--row', str(row),
            '--updates', json.dumps(updates),
        ],
        cwd=repo_root,
        timeout=60,
        check=False,
    )


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url',         required=True)
    parser.add_argument('--title',       default='')
    parser.add_argument('--name',        required=True)
    parser.add_argument('--row',         type=int, default=0)
    parser.add_argument('--platforms',   default='x,facebook,linkedin')
    parser.add_argument('--description', default='')
    args = parser.parse_args()

    platforms = [p.strip().lower() for p in args.platforms.split(',') if p.strip()]

    # Load .env if running standalone
    env_path = os.path.join(os.path.dirname(__file__), '..', 'ken_backend', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    os.environ.setdefault(k.strip(), v.strip())

    print(f'[generate_content] Scraping {args.url}', file=sys.stderr)
    page_text = scrape_url(args.url)

    print('[generate_content] Searching web for context', file=sys.stderr)
    web_snippets = tavily_search(f'{args.title} market size CAGR forecast')

    context = build_context(args.title, args.url, args.description, page_text, web_snippets)
    results = {}
    sheet_updates = {}

    if 'x' in platforms:
        print('[generate_content] Generating X tweet...', file=sys.stderr)
        results['x'] = generate_x(context, url=args.url, name=args.name)
        if args.row > 0:
            write_to_sheet(args.name, args.row, {'X Post': results['x']})
            print('[generate_content] X Post written to sheet', file=sys.stderr)
        time.sleep(1)

    if 'facebook' in platforms:
        print('[generate_content] Generating Facebook post...', file=sys.stderr)
        results['facebook'] = generate_facebook(context, url=args.url, name=args.name)
        if args.row > 0:
            write_to_sheet(args.name, args.row, {'FB Post': results['facebook']})
            print('[generate_content] FB Post written to sheet', file=sys.stderr)
        time.sleep(1)

    if 'linkedin' in platforms:
        print('[generate_content] Generating LinkedIn post...', file=sys.stderr)
        results['linkedin'] = generate_linkedin(context, url=args.url, name=args.name)
        if args.row > 0:
            write_to_sheet(args.name, args.row, {'LinkedIn Post': results['linkedin']})
            print('[generate_content] LinkedIn Post written to sheet', file=sys.stderr)
        time.sleep(1)

    if 'threads' in platforms:
        print('[generate_content] Generating Threads post...', file=sys.stderr)
        results['threads'] = generate_threads(context, url=args.url, name=args.name)
        if args.row > 0:
            write_to_sheet(args.name, args.row, {'Thread Post': results['threads']})
            print('[generate_content] Threads Post written to sheet', file=sys.stderr)
        time.sleep(1)

    if 'instagram' in platforms:
        print('[generate_content] Generating Instagram caption...', file=sys.stderr)
        results['instagram'] = generate_instagram(context, url=args.url, name=args.name)
        if args.row > 0:
            write_to_sheet(args.name, args.row, {'Instagram Post': results['instagram']})
            print('[generate_content] Instagram Post written to sheet', file=sys.stderr)
        time.sleep(1)

    # Output results as JSON to stdout (read by Celery task)
    print(json.dumps(results))


if __name__ == '__main__':
    main()
