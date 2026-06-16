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

def _pick_key(prefix: str, count: int) -> str | None:
    keys = [os.environ.get(f'{prefix}_{i}') for i in range(1, count + 1)]
    keys = [k for k in keys if k and k.strip()]
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


def call_openrouter(prompt: str, model: str = 'anthropic/claude-3.5-sonnet') -> str:
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
    prompt = f"""Generate a tweet for this Ken Research market report.

{context}

Rules:
- Max 220 characters (the URL will be added on a new line separately — do NOT include it)
- Professional, insightful tone
- Lead with a key finding or stat
- 1–2 relevant hashtags only
- No filler: "Check out", "Read more", "Excited to share", "Discover"
- No em dashes

Return ONLY the tweet text, nothing else."""
    return call_openrouter(prompt)


def generate_facebook(context: str) -> str:
    prompt = f"""Generate a Facebook post for this Ken Research market report.

{context}

Rules:
- 150–280 words
- Professional but engaging
- Include key market insights — CAGR, market size, forecast year if available
- 1–2 relevant emojis maximum
- End with a short call to action (e.g. "Read the full report ↓")
- Do NOT include the URL

Return ONLY the post text, nothing else."""
    return call_openrouter(prompt)


def generate_linkedin(context: str) -> str:
    prompt = f"""Generate a LinkedIn post for this Ken Research market report.

{context}

Rules:
- 200–350 words
- Professional B2B tone, written for analysts, investors and industry leaders
- Open with a striking market insight or surprising stat
- Include data points: CAGR, market size, key growth drivers, forecast year
- End with a thought-provoking question or insight
- 3–5 relevant hashtags at the very end (separate line)
- No em dashes
- Do NOT include the URL in the body

Return ONLY the post text, nothing else."""
    return call_openrouter(prompt)


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
        print('[generate_content] Generating X tweet', file=sys.stderr)
        results['x'] = generate_x(context)
        sheet_updates['X Post'] = results['x']
        time.sleep(1)

    if 'facebook' in platforms:
        print('[generate_content] Generating Facebook post', file=sys.stderr)
        results['facebook'] = generate_facebook(context)
        sheet_updates['FB Post'] = results['facebook']
        time.sleep(1)

    if 'linkedin' in platforms:
        print('[generate_content] Generating LinkedIn post', file=sys.stderr)
        results['linkedin'] = generate_linkedin(context)
        sheet_updates['LinkedIn Post'] = results['linkedin']
        time.sleep(1)

    # Write generated content back to the Social sheet
    if args.row > 0 and sheet_updates:
        print(f'[generate_content] Writing to sheet row {args.row}', file=sys.stderr)
        write_to_sheet(args.name, args.row, sheet_updates)

    # Output results as JSON to stdout (read by Celery task)
    print(json.dumps(results))


if __name__ == '__main__':
    main()
