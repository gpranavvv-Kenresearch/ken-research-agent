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
    prompt = f"""You are a market intelligence analyst posting on behalf of Ken Research. Write a single tweet about this market report.

{context}

STRICT RULES:
- Exactly 200-220 characters (the URL is added separately on a new line — do NOT include it)
- Lead with a specific number: market size, CAGR %, or forecast year value — no vague openers
- Professional, data-first tone — no hype or filler
- 1-2 hashtags max, placed at the end
- FORBIDDEN words: "Check out", "Read more", "Excited to share", "Discover", "Explore", "Learn"
- No em dashes (—) or en dashes (–)
- No quotation marks around the whole tweet

GOOD EXAMPLES:
"India's cold chain market to reach $22B by 2028, driven by 14.2% CAGR. Pharma, e-grocery fuel 73% of capacity adds. #ColdChain #LogisticsIndia"
"Saudi Arabia lubricants market hits $1.4B in 2025, growing at 6.8% CAGR through 2029. Automotive and industrial demand lead. #Lubricants #SaudiArabia"

Return ONLY the tweet text. No explanation, no quotes around it."""
    return call_ai(prompt)


def generate_facebook(context: str) -> str:
    prompt = f"""You are a market intelligence analyst posting on behalf of Ken Research on Facebook. Write an engaging post about this market report.

{context}

STRICT RULES:
- 180-280 words
- Open with a compelling data point or trend — never a generic opener
- Include: market size figure, CAGR, forecast year, 2-3 key growth drivers
- Use short paragraphs (2-3 sentences each) for readability
- 1-2 relevant emojis, placed naturally (not at start of every line)
- End with a clear call to action: "Read the full report below ↓" or "Full report linked below ↓"
- DO NOT include the URL
- No em dashes (—) or en dashes (–)
- No filler phrases: "In today's world", "In an era of", "It is well known that"

STRUCTURE:
Line 1: Striking stat or insight (hook)
Body: Key findings with specific numbers
Closing: 1-line CTA

Return ONLY the post text."""
    return call_ai(prompt)


def generate_linkedin(context: str) -> str:
    prompt = f"""You are a senior B2B market intelligence analyst posting on LinkedIn on behalf of Ken Research. Write a professional post about this market report.

{context}

STRICT RULES:
- 250-350 words
- Written for: investors, CXOs, strategy consultants, sector analysts
- First line MUST be a specific, data-driven insight that stops the scroll — e.g. a surprising CAGR, market size milestone, or unexpected growth driver
- Include at least 3 specific figures: CAGR, market size (USD), forecast year, or segment share %
- Use 1-3 short bullet points (optional) to highlight key segments or drivers
- End with ONE thought-provoking question for professionals OR a forward-looking observation
- 3-5 relevant hashtags on the LAST line only
- No em dashes (—) or en dashes (–)
- No filler: "In today's rapidly evolving", "It goes without saying", "As we all know"
- DO NOT include the report URL in the body

STRUCTURE:
Hook line (data insight)
[blank line]
2-3 body paragraphs with specifics
[blank line]
Closing question or forward observation
[blank line]
#Hashtag1 #Hashtag2 #Hashtag3

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
        timeout=30,
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
