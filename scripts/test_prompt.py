#!/usr/bin/env python3
"""
test_prompt.py — Quick prompt testing harness for Ken Research blog generation.

Skips image generation so each test run takes ~2-3 min instead of 10 min.
Output is saved to C:/tmp/test_blog_<slug>.html for side-by-side comparison.

Usage examples:
  # Test with current default prompt:
  python scripts/test_prompt.py --url https://www.kenresearch.com/industry-reports/saudi-arabia-education-market

  # Test with a custom prompt override (format 4):
  python scripts/test_prompt.py --url https://www.kenresearch.com/industry-reports/saudi-arabia-education-market --prompt-file C:/tmp/my_prompt.txt

  # Test a different model:
  python scripts/test_prompt.py --url ... --model "openai/gpt-4o-mini"

  # Test with NVIDIA fallback explicitly:
  python scripts/test_prompt.py --url ... --backend nvidia

  # Compare two runs side by side (run twice with different --prompt-file):
  python scripts/test_prompt.py --url ... --prompt-file C:/tmp/prompt_v1.txt --tag v1
  python scripts/test_prompt.py --url ... --prompt-file C:/tmp/prompt_v2.txt --tag v2
  # Then open C:/tmp/test_blog_v1.html and C:/tmp/test_blog_v2.html in browser

Prompt file format:
  Plain text file. If provided, its contents REPLACE the custom section of the prompt
  (injected at the top of the base prompt as editorial preferences). Same as --format custom
  in generate_blog.py.

  To test a full prompt replacement (not just preferences), set --full-replace flag.
"""

import argparse
import json
import os
import re
import sys
import time
from urllib.parse import urlparse

import requests

# ── reuse helpers from generate_blog.py ─────────────────────────────────────

_SCRIPT_DIR = os.path.dirname(__file__)
_REPO_ROOT = os.path.join(_SCRIPT_DIR, '..')


def _load_env():
    for env_file in [
        os.path.join(_REPO_ROOT, '.env'),
        os.path.join(_REPO_ROOT, 'ken_backend', '.env'),
    ]:
        if os.path.exists(env_file):
            with open(env_file, encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, _, v = line.partition('=')
                        os.environ.setdefault(k.strip(), v.strip())


def _pick_key(prefix, count=15):
    import random
    candidates = [os.environ.get(prefix)]
    candidates += [os.environ.get(f'{prefix}_{i}') for i in range(1, count + 1)]
    keys = [k for k in candidates if k and k.strip()]
    return random.choice(keys) if keys else None


def scrape_url(url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'}
        resp = requests.get(url, headers=headers, timeout=20)
        resp.raise_for_status()
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(resp.text, 'html.parser')
            for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
                tag.decompose()
            return soup.get_text(separator='\n', strip=True)[:6000]
        except ImportError:
            text = re.sub(r'<[^>]+>', ' ', resp.text)
            return re.sub(r'\s+', ' ', text)[:6000]
    except Exception as exc:
        return f'[Could not scrape: {exc}]'


def tavily_search(query):
    key = _pick_key('TAVILY_API_KEY', 10)
    if not key:
        print(f'  [WARN] No TAVILY_API_KEY — skipping search: {query[:60]}')
        return ''
    try:
        resp = requests.post(
            'https://api.tavily.com/search',
            json={'api_key': key, 'query': query, 'max_results': 5, 'search_depth': 'basic'},
            timeout=20,
        )
        results = resp.json().get('results', [])
        return '\n'.join(f"- {r.get('title','')}: {r.get('content','')[:300]}" for r in results[:4])
    except Exception:
        return ''


def _all_openrouter_keys():
    keys = []
    base = os.environ.get('OPENROUTER_API_KEY')
    if base:
        keys.append(base)
    for i in range(1, 20):
        k = os.environ.get(f'OPENROUTER_API_KEY_{i}')
        if k:
            keys.append(k)
    return keys


def call_openrouter(prompt, model='openai/gpt-oss-120b:free', max_tokens=10000):
    keys = _all_openrouter_keys()
    if not keys:
        raise RuntimeError('No OPENROUTER_API_KEY found in .env')
    import random
    random.shuffle(keys)
    last_err = None
    for key in keys:
        try:
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
                    'max_tokens': max_tokens,
                    'temperature': 0.7,
                },
                timeout=480,
            )
            if resp.status_code == 429:
                print(f'  [warn] key ...{key[-6:]} rate limited, trying next key')
                last_err = f'429 on key ...{key[-6:]}'
                continue
            resp.raise_for_status()
            data = resp.json()
            usage = data.get('usage', {})
            print(f'  [tokens] in={usage.get("prompt_tokens","?")}  out={usage.get("completion_tokens","?")}')
            return data['choices'][0]['message']['content'].strip()
        except requests.exceptions.Timeout:
            last_err = f'Timeout on key ...{key[-6:]}'
            print(f'  [warn] {last_err}, trying next key')
            continue
        except Exception as e:
            last_err = str(e)
            if '429' not in str(e) and '402' not in str(e):
                raise
            print(f'  [warn] {e}, trying next key')
            continue
    raise RuntimeError(f'All OpenRouter keys failed. Last error: {last_err}')


def call_nvidia(prompt, model='meta/llama-3.1-70b-instruct', max_tokens=10000):
    key = _pick_key('NVIDIA_API_KEY', 4)
    if not key:
        raise RuntimeError('No NVIDIA_API_KEY found in .env')
    resp = requests.post(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
        json={
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': max_tokens,
            'temperature': 0.7,
            'stream': False,
        },
        timeout=480,
    )
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']['content'].strip()


def load_sitemap_urls(n=12, target_url=''):
    cache_path = os.path.join(_REPO_ROOT, 'data', 'sitemap_urls.json')
    if not os.path.exists(cache_path):
        return []
    with open(cache_path, encoding='utf-8') as f:
        cache = json.load(f)
    all_urls = [e['url'] for e in cache.get('urls', [])]
    if not target_url:
        return all_urls[:n]
    slug = urlparse(target_url).path.rstrip('/').split('/')[-1]
    stop = {'market','industry','sector','report','analysis','global','the','a','an','in','and','of','for','to'}
    words = [w for w in re.sub(r'[-_]', ' ', slug).lower().split() if w not in stop and len(w) > 2]
    scored = [(sum(1 for kw in words if kw in u.lower()), u)
              for u in all_urls if u.lower() != target_url.lower()]
    scored = [(s, u) for s, u in scored if s > 0]
    scored.sort(key=lambda x: -x[0])
    return [u for _, u in scored[:n]]


def make_utm_url(url, platform='linkedin-pulse', name=''):
    sep = '&' if '?' in url else '?'
    campaign = f'Automation{name.strip().title()}' if name else 'Automation'
    return f'{url}{sep}utm_source={platform}&utm_medium=Referral&utm_campaign={campaign}'


def url_to_anchor(url):
    slug = urlparse(url).path.rstrip('/').split('/')[-1]
    title = ' '.join(w.capitalize() for w in slug.split('-'))
    for trigger in ['market', 'industry', 'sector', 'growth', 'size', 'outlook', 'forecast', 'trends', 'analysis']:
        idx = title.lower().find(trigger)
        if idx >= 0:
            return title[:idx + len(trigger)]
    return title


def extract_market_name(url, title=''):
    if title:
        for trigger in ['market', 'industry', 'sector', 'forecast', 'outlook']:
            idx = title.lower().find(trigger)
            if idx >= 0:
                return title[:idx + len(trigger)].strip()
        return title.strip()
    slug = urlparse(url).path.rstrip('/').split('/')[-1]
    return ' '.join(w.capitalize() for w in slug.split('-'))


def extract_country(url, title=''):
    countries = [
        'Saudi Arabia', 'South Korea', 'South Africa', 'UAE', 'UK', 'USA',
        'India', 'China', 'Indonesia', 'Vietnam', 'Thailand', 'Brazil', 'Mexico',
        'Philippines', 'Malaysia', 'Japan', 'Germany', 'France', 'Australia',
        'Nigeria', 'Kenya', 'Egypt', 'Turkey', 'Pakistan', 'Bangladesh',
        'Colombia', 'Russia', 'Kuwait', 'Qatar', 'Oman', 'Bahrain', 'US',
    ]
    combined = f'{title} {url}'.lower().replace('-', ' ')
    for c in countries:
        if re.search(r'\b' + re.escape(c.lower()) + r'\b', combined):
            return c
    return 'Global'


# ── Quality scoring (mirrors generate_blog.py) ───────────────────────────────

def score_blog(html, blog_title):
    points = 0
    issues = []

    # 1. No em/en dashes (2pts)
    if '—' not in html and '–' not in html:
        points += 2
    else:
        issues.append('Em/en dash found')

    wc = len(re.sub(r'<[^>]+>', ' ', html).split())
    lc = len(re.findall(r'<a\s+href=', html, re.IGNORECASE))
    fc = len(re.findall(r'<h3>', html, re.IGNORECASE))

    if 1500 <= wc <= 1800:
        points += 1
    else:
        issues.append(f'Word count {wc} (need 1500-1800)')

    if 10 <= lc <= 12:
        points += 1
    else:
        issues.append(f'Links {lc} (need 10-12)')

    if fc == 5:
        points += 1
    else:
        issues.append(f'FAQs {fc} (need 5)')

    # unbolded stats
    clean = re.sub(r'<strong[^>]*>.*?</strong>', 'BOLDED', html, flags=re.DOTALL)
    clean = re.sub(r'<[^>]+>', ' ', clean)
    bare = any(re.search(p, clean, re.IGNORECASE) for p in
               [r'\d+\.?\d*\s*%', r'USD\s+\d', r'\d+\.?\d*\s+billion', r'\bCAGR\b'])
    if not bare:
        points += 1
    else:
        issues.append('Unbolded stats found')

    # data density
    para_count = len(re.findall(r'<p>', html))
    strong_count = len(re.findall(r'<strong>', html))
    if para_count > 0 and strong_count / para_count >= 2:
        points += 1
    else:
        issues.append('Low data density')

    # H1 length
    h1_m = re.search(r'<h1>(.*?)</h1>', html, re.DOTALL)
    h1_text = re.sub(r'<[^>]+>', '', h1_m.group(1)) if h1_m else ''
    if 100 <= len(h1_text) <= 130 and 85 <= len(blog_title) <= 115:
        points += 1
    else:
        issues.append(f'H1 {len(h1_text)} chars (need 100-130) / Title {len(blog_title)} chars (need 85-115)')

    if 'Download Sample Report' in html and 'cta-block' in html:
        points += 1
    else:
        issues.append('CTA blocks missing or wrong anchor')

    kr_count = html.lower().count('ken research')
    if 4 <= kr_count <= 10:
        points += 1
    else:
        issues.append(f'Ken Research mentions: {kr_count} (need 4-10)')

    source_phrases = ['as per ken research', 'as tracked by ken research', 'as recorded', 'according to ken']
    if sum(1 for p in source_phrases if p in html.lower()) >= 2:
        points += 1
    else:
        issues.append('Insufficient source attribution phrases')

    h2_texts = re.findall(r'<h2>(.*?)</h2>', html, re.IGNORECASE | re.DOTALL)
    if sum(1 for h in h2_texts if re.search(r'\b(why|how|what|which|who|where)\b', h, re.IGNORECASE)) >= 2:
        points += 1
    else:
        issues.append('Fewer than 2 AIO-style H2 headings')

    if 'at a Glance' in html:
        points += 1
    else:
        issues.append('Missing at-a-glance box')

    rating = max(1, round(points / 13 * 10))
    return rating, points, wc, lc, fc, len(html), issues


# ── Build prompt (mirrors generate_blog.py but importable here) ──────────────

def build_prompt(title, target_url, page_text, research, related_urls, market_name, country, name='', platform='linkedin-pulse'):
    target_utm = make_utm_url(target_url, platform, name)
    slug = urlparse(target_url).path.rstrip('/').split('/')[-1]
    sample_url = f'https://www.kenresearch.com/sample-report/{slug}'
    sample_utm = make_utm_url(sample_url, platform, name)
    kr_home_utm = make_utm_url('https://www.kenresearch.com/', platform, name)

    interlinks_block = '\n'.join(
        f'  {i+1}. URL: {make_utm_url(url, platform)}\n     Anchor: {url_to_anchor(url)}'
        for i, url in enumerate(related_urls)
    )

    # Import base prompt from generate_blog.py
    sys.path.insert(0, _SCRIPT_DIR)
    from generate_blog import build_generation_prompt
    return build_generation_prompt(
        title=title,
        target_url=target_url,
        page_text=page_text,
        research=research,
        related_urls=related_urls,
        platform_slug=platform,
        target_utm=target_utm,
        sample_url=sample_url,
        cover_image_url='',
        market_name=market_name,
        country=country,
        name=name,
    )


# ── HTML wrapper for browser preview ─────────────────────────────────────────

def wrap_html(content, meta):
    """Return only the generated blog fragment. Published/blog samples must start at <img>."""
    content = (content or '').strip()
    img_pos = content.find('<img')
    return content[img_pos:].strip() if img_pos >= 0 else content


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Test blog generation prompts quickly (no image gen)')
    parser.add_argument('--url', required=True, help='Ken Research report URL')
    parser.add_argument('--title', default='', help='Report title (optional)')
    parser.add_argument('--name', default='test', help='Account name for UTM tags')
    parser.add_argument('--prompt-file', default='', help='Path to custom prompt preferences file')
    parser.add_argument('--full-replace', action='store_true', help='Use prompt-file as the entire prompt (not just preferences overlay)')
    parser.add_argument('--model', default='', help='OpenRouter model ID override (e.g. openai/gpt-4o-mini)')
    parser.add_argument('--backend', default='openrouter', choices=['openrouter', 'nvidia'], help='Which AI backend to use')
    parser.add_argument('--format', default='format1', choices=['format1', 'format2'], help='format1 = frozen base prompt, format2 = new Vercel prompt with short FAQs')
    parser.add_argument('--tag', default='', help='Label for output file (e.g. v1, v2, gpt4o)')
    parser.add_argument('--no-research', action='store_true', help='Skip Tavily searches (faster, uses only scraped page)')
    parser.add_argument('--out-dir', default='C:/tmp', help='Directory to save output HTML')
    args = parser.parse_args()

    _load_env()

    slug = urlparse(args.url).path.rstrip('/').split('/')[-1]
    tag = args.tag or (args.model.replace('/', '-').replace(':', '') if args.model else args.backend)
    out_file = os.path.join(args.out_dir, f'test_blog_{slug}_{tag}.html')

    print(f'\n{"="*60}')
    print(f'  Blog Prompt Tester')
    print(f'  URL:     {args.url}')
    print(f'  Backend: {args.backend}  Model: {args.model or "default"}')
    print(f'  Format:  {args.format}')
    print(f'  Tag:     {tag}')
    print(f'  Output:  {out_file}')
    print(f'{"="*60}\n')

    market_name = extract_market_name(args.url, args.title)
    country = extract_country(args.url, args.title)
    print(f'  Market: {market_name}  |  Country: {country}')

    # Step 1: Scrape
    print('\n[1/4] Scraping report page...')
    page_text = scrape_url(args.url)
    print(f'      {len(page_text)} chars scraped')

    # Step 2: Research
    if args.no_research:
        print('[2/4] Skipping research (--no-research)')
        research = {'market_data': '', 'key_players': '', 'policies': '', 'tech_trends': ''}
    else:
        n_searches = 4 if args.format == 'format2' else 3
        print(f'[2/4] Running {n_searches} Tavily searches...')
        research = {
            'market_data': tavily_search(f'{market_name} market size CAGR {country} 2024 2025 2030 forecast billion'),
            'key_players': tavily_search(f'{market_name} key players companies market share 2025'),
            'policies':    tavily_search(f'{market_name} government policy regulation {country} 2024 2025'),
        }
        if args.format == 'format2':
            research['tech_trends'] = tavily_search(f'{market_name} technology adoption AI digital trends {country} 2025 specific examples')
        _rl = {k: len(v) for k, v in research.items()}
        print(f'      ' + '  '.join(f'{k}={v}' for k, v in _rl.items()))

    # Step 3: Related URLs
    print('[3/4] Loading related URLs from sitemap cache...')
    related_urls = load_sitemap_urls(n=12, target_url=args.url)
    print(f'      {len(related_urls)} related URLs found')

    # Step 4: Build prompt
    custom_prompt = ''
    if args.prompt_file:
        with open(args.prompt_file, encoding='utf-8') as pf:
            custom_prompt = pf.read()
        print(f'      Custom prompt loaded: {len(custom_prompt)} chars from {args.prompt_file}')

    print('[4/4] Calling AI...')
    t0 = time.time()

    if args.full_replace and custom_prompt:
        prompt = custom_prompt
    else:
        sys.path.insert(0, _SCRIPT_DIR)
        if args.format == 'format2':
            from generate_blog import build_generation_prompt_v2, make_utm_url as _utm
            slug_p = urlparse(args.url).path.rstrip('/').split('/')[-1]
            sample_url_p = f'https://www.kenresearch.com/sample-report/{slug_p}'
            target_utm_p = _utm(args.url, 'linkedin-pulse', args.name)
            prompt = build_generation_prompt_v2(
                title=args.title or market_name,
                target_url=args.url,
                page_text=page_text,
                research=research,
                related_urls=related_urls,
                platform_slug='linkedin-pulse',
                target_utm=target_utm_p,
                sample_url=sample_url_p,
                cover_image_url='',
                market_name=market_name,
                country=country,
                name=args.name,
            )
        else:
            prompt = build_prompt(
                title=args.title or market_name,
                target_url=args.url,
                page_text=page_text,
                research=research,
                related_urls=related_urls,
                market_name=market_name,
                country=country,
                name=args.name,
            )
        if custom_prompt:
            prompt = f'EDITORIAL PREFERENCES (apply where not conflicting with rules below):\n{custom_prompt}\n\n{prompt}'

    try:
        if args.backend == 'nvidia':
            nvidia_model = args.model or 'meta/llama-3.1-70b-instruct'
            raw = call_nvidia(prompt, model=nvidia_model)
            used_model = nvidia_model
        else:
            or_model = args.model or 'openai/gpt-oss-120b:free'
            raw = call_openrouter(prompt, model=or_model)
            used_model = or_model
    except Exception as e:
        print(f'\n[ERROR] AI call failed: {e}')
        sys.exit(1)

    elapsed = round(time.time() - t0)
    print(f'      Done in {elapsed}s')

    # Parse JSON response
    json_match = re.search(r'\{[\s\S]*\}', raw)
    if not json_match:
        print('[ERROR] AI did not return JSON. Raw output saved to out_file.')
        with open(out_file, 'w', encoding='utf-8') as f:
            f.write(f'<pre>{raw}</pre>')
        sys.exit(1)

    try:
        data = json.loads(json_match.group(0))
    except json.JSONDecodeError:
        fixed = re.sub(r'\\([^"\\/bfnrtu])', r'\1', json_match.group(0))
        data = json.loads(fixed)

    html_content  = data.get('html_content', '') or data.get('blog_content', '')
    blog_title    = data.get('blog_title', '')
    h1_title      = data.get('h1_title', '')
    seo_desc      = data.get('seo_description', '')
    caption       = data.get('linkedin_caption', '')

    # Score
    rating, raw_pts, wc, lc, fc, cc, issues = score_blog(html_content, blog_title)

    print(f'\n{"="*60}')
    print(f'  RATING: {rating}/10  (raw {raw_pts}/13)')
    print(f'  Words: {wc}  Links: {lc}  FAQs: {fc}  Chars: {cc}')
    print(f'  Blog Title ({len(blog_title)} chars): {blog_title}')
    if issues:
        print(f'  Issues ({len(issues)}):')
        for issue in issues:
            print(f'    x {issue}')
    else:
        print('  All checks passed!')
    print(f'{"="*60}\n')

    # Save HTML
    meta = {
        'model': used_model,
        'backend': args.backend,
        'tag': tag,
        'url': args.url,
        'elapsed': elapsed,
        'rating': rating,
        'raw_points': raw_pts,
        'raw_denom': 14 if args.format == 'format2' else 13,
        'word_count': wc,
        'link_count': lc,
        'faq_count': fc,
        'char_count': cc,
        'blog_title': blog_title,
        'title_len': len(blog_title),
        'market_name': market_name,
        'issues': issues,
    }
    os.makedirs(args.out_dir, exist_ok=True)
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(wrap_html(html_content, meta))
    print(f'  Output saved: {out_file}')
    print(f'  Open in browser to review.\n')

    # Also save raw JSON for debugging
    json_out = out_file.replace('.html', '.json')
    with open(json_out, 'w', encoding='utf-8') as f:
        json.dump({'prompt_chars': len(prompt), 'elapsed': elapsed, **data, **meta}, f, ensure_ascii=False, indent=2)
    print(f'  Raw JSON:     {json_out}')


if __name__ == '__main__':
    main()



