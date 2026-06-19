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


# ── Content generators ────────────────────────────────────────────────────────

def build_context(title: str, url: str, description: str, page_text: str, web_snippets: str) -> str:
    return f"""Report Title: {title}
Report URL: {url}
Description: {description or 'N/A'}

Page Content (excerpt):
{page_text[:2000]}

Web Research:
{web_snippets[:800]}"""


def generate_x(context: str) -> str:
    prompt = f"""You are a market intelligence analyst at Ken Research. Write ONE tweet for this market report.

{context}

MANDATORY FORMAT:
[Country/Region] [market name] [market size OR CAGR fact]. [Second key finding or driver]. #[Tag1] #[Tag2]

HARD RULES:
- 200-220 characters TOTAL (count carefully — URL is added separately, do NOT include it)
- First word group MUST be a number: market size in USD, CAGR %, or YoY growth rate
- "Ken Research" must NOT appear in the tweet (it will be on the account profile)
- Exactly 2 hashtags — specific to the market and geography
- BANNED: "projected to", "is set to", "poised to", "expected to outpace", "revenues are"
  Use direct statements: "market hits", "to reach", "grows at", "valued at"
- No em dashes, no en dashes, no quotes around the tweet

CORRECT EXAMPLES (count characters before posting):
India cold chain market to reach $22B by 2028 at 14.2% CAGR. Pharma and e-grocery drive 73% of capacity adds. #ColdChain #India
Saudi Arabia e-learning market at $380M in 2021, growing 12.4% CAGR through 2026. Mobile-first adoption leads. #Edtech #SaudiArabia
Philippines casino GGR hits $2.1B in 2022 at 9.3% CAGR. Integrated resort expansion drives 68% of revenue. #GamingAsia #Philippines

Return ONLY the tweet text. No quotes around it, no explanation."""
    return call_ai(prompt)


def generate_facebook(context: str) -> str:
    prompt = f"""You are a market intelligence analyst at Ken Research. Write a Facebook post for this market report.

{context}

MANDATORY STRUCTURE (follow exactly):

LINE 1 (hook): One sentence with a specific market figure. Start with the number.
Example: "$2.1B — that is the size of the Philippines casino market in 2022, growing at 9.3% CAGR."

PARAGRAPH 2 (market overview, 3-4 sentences):
- Total market size and CAGR
- Forecast year and projected value
- Top 1-2 growth drivers with data

PARAGRAPH 3 (key insights, 3-4 sentences):
- Key market segment driving growth
- Regional or competitive angle
- Any policy, regulation, or demand shift worth noting

CLOSING LINE: "Full report linked below."

RULES:
- 160-220 words total
- 1 emoji max, only if it fits naturally (not at the start of every line)
- Mention "Ken Research" once as the source: "as per Ken Research" or "according to Ken Research"
- No em dashes, no en dashes
- No URL in body
- BANNED openers: "In today's", "In an era of", "The world is witnessing", "It is no secret"

Return ONLY the post text."""
    return call_ai(prompt)


def generate_linkedin(context: str) -> str:
    prompt = f"""You are a senior market intelligence analyst at Ken Research. Write a LinkedIn post for this market report.

{context}

MANDATORY STRUCTURE:

LINE 1 (scroll-stopper): A single bold data statement. No question. No filler.
Example: "The Thailand catering market is valued at $4.8B in 2022 and growing at 8.1% CAGR through 2027."

[blank line]

PARAGRAPH 1 (market context, 3-4 sentences):
What is driving this market? Quantify the top 2 drivers with % or USD figures.
Use: "As per Ken Research analysis..." or "Ken Research estimates..."

PARAGRAPH 2 (segments and players, 3-4 sentences):
Which segment leads? Which geography or player is winning? What is the market share split?
At least 2 data points with numbers.

PARAGRAPH 3 (outlook, 2-3 sentences):
What changes in policy, tech, or consumer behavior will shape the next 3-5 years?
Forward-looking but grounded in data from the report.

[blank line]

CLOSING (1 sentence): A sharp question for professionals — investment angle, competitive strategy, or policy implication.

[blank line]

HASHTAGS: Exactly 4-5 hashtags relevant to the market and region. Last line only.

RULES:
- 220-300 words total (tight and dense — no padding)
- At least 4 specific numbers across the post (CAGR, USD value, %, year)
- No em dashes, no en dashes
- No URL in body
- BANNED: "In today's rapidly evolving landscape", "It goes without saying", "As we navigate",
  "Exciting times", "Proud to share", "Thrilled to announce"

Return ONLY the post text."""
    return call_ai(prompt)


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
        results['x'] = generate_x(context)
        if args.row > 0:
            write_to_sheet(args.name, args.row, {'X Post': results['x']})
            print('[generate_content] X Post written to sheet', file=sys.stderr)
        time.sleep(1)

    if 'facebook' in platforms:
        print('[generate_content] Generating Facebook post...', file=sys.stderr)
        results['facebook'] = generate_facebook(context)
        if args.row > 0:
            write_to_sheet(args.name, args.row, {'FB Post': results['facebook']})
            print('[generate_content] FB Post written to sheet', file=sys.stderr)
        time.sleep(1)

    if 'linkedin' in platforms:
        print('[generate_content] Generating LinkedIn post...', file=sys.stderr)
        results['linkedin'] = generate_linkedin(context)
        if args.row > 0:
            write_to_sheet(args.name, args.row, {'LinkedIn Post': results['linkedin']})
            print('[generate_content] LinkedIn Post written to sheet', file=sys.stderr)
        time.sleep(1)

    # Output results as JSON to stdout (read by Celery task)
    print(json.dumps(results))


if __name__ == '__main__':
    main()
