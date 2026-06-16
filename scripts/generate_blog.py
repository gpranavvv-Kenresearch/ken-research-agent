#!/usr/bin/env python3
"""
generate_blog.py — Automated blog article generator for Ken Research.
Called by the Celery worker for blog jobs (execute_blog_generation task).

Usage:
  python scripts/generate_blog.py \
    --url https://www.kenresearch.com/industry-reports/india-cold-chain \
    --name aniket \
    --row 5 \
    --platforms linkedin-pulse \
    --output-json

Outputs JSON to stdout:
  {
    "blog_title": "...",
    "h1_title": "...",
    "blog_content": "<img ...>...",
    "blog_description": "SEO desc, caption- LinkedIn caption",
    "blog_seo_title": "...",
    "blog_seo_desc": "...",
    "cover_image_url": "https://res.cloudinary.com/...",
    "rating": 8
  }

Also writes Blog Title, Blog Description, Blog Content, blogBatch, Rating
directly to the {Name} Blog tab via sheet_write.py.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from urllib.parse import quote, urlparse

import requests

# ── Env loader ────────────────────────────────────────────────────────────────

def _load_env():
    env_path = os.path.join(os.path.dirname(__file__), '..', 'ken_backend', '.env')
    if os.path.exists(env_path):
        with open(env_path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    os.environ.setdefault(k.strip(), v.strip())


def _pick_key(prefix: str, count: int = 15) -> str | None:
    import random
    candidates = [os.environ.get(prefix)]
    candidates += [os.environ.get(f'{prefix}_{i}') for i in range(1, count + 1)]
    keys = [k for k in candidates if k and k.strip()]
    return random.choice(keys) if keys else None


# ── Web helpers ───────────────────────────────────────────────────────────────

def scrape_url(url: str) -> str:
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
            return soup.get_text(separator='\n', strip=True)[:6000]
        except ImportError:
            text = re.sub(r'<[^>]+>', ' ', resp.text)
            text = re.sub(r'\s+', ' ', text)
            return text[:6000]
    except Exception as exc:
        return f'[Could not scrape: {exc}]'


def tavily_search(query: str) -> str:
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
        snippets = [f"- {r.get('title','')}: {r.get('content','')[:300]}" for r in results[:4]]
        return '\n'.join(snippets)
    except Exception:
        return ''


def search_market_data(market_name: str, country: str) -> dict:
    print(f'[generate_blog] Searching market data for: {market_name}', file=sys.stderr)
    q1 = tavily_search(f'{market_name} market size CAGR {country} 2024 2025 2030 forecast billion')
    q2 = tavily_search(f'{market_name} key players companies market share 2025')
    q3 = tavily_search(f'{market_name} government policy regulation {country} 2024 2025')
    return {
        'market_data': q1,
        'key_players': q2,
        'policies': q3,
    }


# ── AI helpers ────────────────────────────────────────────────────────────────

def call_openrouter(prompt: str, max_tokens: int = 8000) -> str:
    key = _pick_key('OPENROUTER_API_KEY', 15)
    if not key:
        raise RuntimeError('No OPENROUTER_API_KEY')
    resp = requests.post(
        'https://openrouter.ai/api/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://kenresearch.com',
        },
        json={
            'model': 'openai/gpt-oss-120b:free',
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': max_tokens,
            'temperature': 0.7,
        },
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']['content'].strip()


def call_nvidia(prompt: str, max_tokens: int = 8000) -> str:
    key = _pick_key('NVIDIA_API_KEY', 4)
    if not key:
        raise RuntimeError('No NVIDIA_API_KEY')
    resp = requests.post(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
        json={
            'model': 'meta/llama-3.1-70b-instruct',
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': max_tokens,
            'temperature': 0.7,
            'stream': False,
        },
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']['content'].strip()


def call_ai(prompt: str, max_tokens: int = 8000) -> str:
    try:
        return call_openrouter(prompt, max_tokens)
    except Exception as e:
        print(f'[generate_blog] OpenRouter failed ({e}), trying NVIDIA...', file=sys.stderr)
        return call_nvidia(prompt, max_tokens)


# ── Sitemap cache helpers ─────────────────────────────────────────────────────

def load_sitemap_cache(repo_root: str) -> list:
    cache_path = os.path.join(repo_root, 'data', 'sitemap_urls.json')
    if not os.path.exists(cache_path):
        print('[generate_blog] sitemap_urls.json not found — no interlinks', file=sys.stderr)
        return []
    try:
        with open(cache_path, encoding='utf-8') as f:
            cache = json.load(f)
        return [entry['url'] for entry in cache.get('urls', [])]
    except Exception:
        return []


def pick_related_urls(target_url: str, url_pool: list, n: int = 10) -> list:
    if not url_pool:
        return []
    path = urlparse(target_url).path.rstrip('/')
    slug = path.split('/')[-1]
    stop = {'market', 'industry', 'sector', 'report', 'analysis', 'global', 'the', 'a',
            'an', 'in', 'and', 'of', 'for', 'to', 'size', 'outlook', 'forecast', 'trends'}
    words = re.sub(r'[-_]', ' ', slug).lower().split()
    keywords = [w for w in words if w not in stop and len(w) > 2]

    scored = []
    tgt_lower = target_url.lower()
    for url in url_pool:
        if url.lower() == tgt_lower:
            continue
        url_slug = url.lower()
        score = sum(1 for kw in keywords if kw in url_slug)
        if score > 0:
            scored.append((score, url))

    scored.sort(key=lambda x: -x[0])
    return [url for _, url in scored[:n]]


def make_utm_url(url: str, platform_slug: str) -> str:
    sep = '&' if '?' in url else '?'
    return f'{url}{sep}utm_source={platform_slug}&utm_medium=Referral&utm_campaign=Automation'


def url_to_anchor(url: str) -> str:
    """Convert a report URL to anchor text: truncate at first trigger word."""
    path = urlparse(url).path.rstrip('/')
    slug = path.split('/')[-1]
    title = ' '.join(w.capitalize() for w in slug.split('-'))
    triggers = ['market', 'industry', 'sector', 'growth', 'size', 'outlook', 'forecast',
                'trends', 'analysis', 'competition', 'segmentation']
    lower = title.lower()
    for trigger in triggers:
        idx = lower.find(trigger)
        if idx >= 0:
            end = idx + len(trigger)
            return title[:end]
    return title


def extract_market_name(url: str, title: str) -> str:
    if title:
        for trigger in ['market', 'industry', 'sector', 'forecast', 'outlook']:
            idx = title.lower().find(trigger)
            if idx >= 0:
                return title[:idx + len(trigger)].strip()
        return title.strip()
    path = urlparse(url).path.rstrip('/')
    slug = path.split('/')[-1]
    return ' '.join(w.capitalize() for w in slug.split('-'))


def extract_country(url: str, title: str) -> str:
    countries = [
        'India', 'China', 'USA', 'US', 'UK', 'Indonesia', 'Vietnam', 'Thailand',
        'Saudi Arabia', 'UAE', 'Brazil', 'Mexico', 'Philippines', 'Malaysia',
        'South Korea', 'Japan', 'Germany', 'France', 'Australia', 'Nigeria',
        'Kenya', 'South Africa', 'Egypt', 'Turkey', 'Pakistan', 'Bangladesh',
        'Colombia', 'Russia', 'Kuwait', 'Qatar', 'Oman', 'Bahrain',
    ]
    combined = f'{title} {url}'.lower()
    for country in countries:
        if country.lower() in combined:
            return country
    return 'Global'


# ── Cover image generation ────────────────────────────────────────────────────

def generate_cover_image(market_name: str, market_size: str = '', cagr: str = '', forecast: str = '') -> str:
    """Generate cover image via Pollinations free API and upload to Cloudinary."""
    print(f'[generate_blog] Generating cover image for: {market_name}', file=sys.stderr)

    data_line = ' '.join(filter(None, [market_size, cagr, forecast]))[:100]
    prompt = (
        f"Premium editorial data visualization cover image for market intelligence report. "
        f"Title: {market_name}. "
        f"{'Data: ' + data_line + '. ' if data_line else ''}"
        f"Style: dark gradient background deep navy blue, professional consulting grade, "
        f"McKinsey Bloomberg intelligence visual. Left zone: large white title text, data hook line, "
        f"sector badge. Right zone: analytical data chart with colored data points and trajectory. "
        f"Thin blue accent strip at top. Technical blueprint wireframe overlay. "
        f"16:9 landscape 1920x1080. No company logos, no brand names, no watermarks."
    )

    try:
        encoded_prompt = quote(prompt)
        img_url = (
            f'https://image.pollinations.ai/prompt/{encoded_prompt}'
            f'?width=1920&height=1080&model=flux&nologo=true&seed=42'
        )
        img_resp = requests.get(img_url, timeout=120)
        img_resp.raise_for_status()
        image_data = img_resp.content
        print(f'[generate_blog] Image fetched ({len(image_data)} bytes)', file=sys.stderr)
    except Exception as e:
        print(f'[generate_blog] Image generation failed: {e}', file=sys.stderr)
        return ''

    public_id = (
        re.sub(r'[^a-z0-9-]', '-', market_name.lower())
        .strip('-')[:55] + f'-{int(time.time())}'
    )

    try:
        cloud_name = 'dutg2rtvr'
        api_key = '226785248494346'
        api_secret = '6pX9f6a_QAFQmPriZDTCTgwtj0w'
        folder = 'microblogs'
        timestamp = str(int(time.time()))

        sign_string = f'folder={folder}&public_id={public_id}&timestamp={timestamp}{api_secret}'
        signature = hashlib.sha1(sign_string.encode()).hexdigest()

        cloud_resp = requests.post(
            f'https://api.cloudinary.com/v1_1/{cloud_name}/image/upload',
            data={
                'api_key': api_key,
                'timestamp': timestamp,
                'signature': signature,
                'folder': folder,
                'public_id': public_id,
            },
            files={'file': ('cover.png', image_data, 'image/png')},
            timeout=60,
        )
        cloud_resp.raise_for_status()
        secure_url = cloud_resp.json().get('secure_url', '')
        print(f'[generate_blog] Uploaded to Cloudinary: {secure_url}', file=sys.stderr)
        return secure_url
    except Exception as e:
        print(f'[generate_blog] Cloudinary upload failed: {e}', file=sys.stderr)
        return ''


# ── Blog HTML generation ──────────────────────────────────────────────────────

def build_generation_prompt(
    title: str,
    target_url: str,
    page_text: str,
    research: dict,
    related_urls: list,
    platform_slug: str,
    target_utm: str,
    sample_url: str,
    cover_image_url: str,
    market_name: str,
    country: str,
) -> str:

    sample_utm = make_utm_url(sample_url, platform_slug)
    kr_home_utm = make_utm_url('https://www.kenresearch.com/', platform_slug)

    interlinks_block = '\n'.join(
        f'  {i+1}. URL: {make_utm_url(url, platform_slug)}\n     Anchor: {url_to_anchor(url)}'
        for i, url in enumerate(related_urls)
    )

    link_style = (
        'style="color:#0645AD; font-weight:700; text-decoration:underline;" '
        'target="_blank" rel="noopener"'
    )

    return f"""You are a senior B2B market intelligence writer for Ken Research. Write a complete HTML microblog article.

== MARKET DATA ==
Report Title: {title}
Report URL: {target_url}
Market Name: {market_name}
Country/Region: {country}

Page Content (from Ken Research report):
{page_text[:3000]}

Web Research - Market Size/CAGR/Forecast:
{research.get('market_data', '')[:800]}

Web Research - Key Players:
{research.get('key_players', '')[:500]}

Web Research - Policies/Regulations:
{research.get('policies', '')[:500]}

== LINKS TO USE ==
Ken Research Homepage: {kr_home_utm}
Target Report: {target_utm}
Sample Report: {sample_utm}

Related Reports for interlinks (use 8-10 of these spread across body and FAQs):
{interlinks_block}

Cover Image URL: {cover_image_url or ''}

== STRICT RULES ==
1. ZERO em dashes (—) or en dashes (–) anywhere. Use colon, comma, or period instead.
2. ALL numbers, percentages, currency figures wrapped in <strong> tags. No bare numbers.
3. 5 FAQs exactly (H3 tags Q1-Q5), 2-3 with interlinks.
4. 10-12 total links across entire article.
5. Word count: 1200-1400 words in body text.
6. Character count: UNDER 14,000 characters total HTML.
7. Every anchor: <a href='URL' {link_style}><strong>Anchor Text</strong></a>
8. Use SINGLE QUOTES for href values.
9. No Ken Research in any H2 heading.
10. Every H2 must contain a data figure (%, USD, CAGR, billion).
11. Intro sentences 1-2: ZERO anchor links. Both intro anchors in sentence 3+.
12. The target report and KR homepage links MUST be in separate sentences in intro.
13. Exactly 2 CTAs: CTA1 anchor = "Download Sample Report", CTA2 anchor = "{market_name} Report"
14. Article ends with Ken Research branding paragraph (last element after FAQs).
15. Use 2026 as current year for present conditions. Historical data OK as context.
16. No Research Basis section. No source list at bottom.
17. Government programme names NOT in double quotes.

== TITLE RULES ==
H1 Title (100-130 chars):
- Never starts with "Ken Research"
- Ken Research appears in MIDDLE or END as an actor
- Include at least one data figure (CAGR, market size, forecast)
- No em dashes

Blog Title (85-115 chars total):
- Always ends with " | Ken Research"
- Never starts with "Ken Research"
- Include a striking number
- Catchy/punchy words: Surge, Race, Explode, Reshape, Dominate, Unlock
- NOT a question

== HTML STRUCTURE TO FOLLOW ==
<img src='{cover_image_url or ""}' alt='{market_name}'>
<h1>{{H1 title — 100-130 chars}}</h1>

<p>{{INTRO — sentences 1+2 anchor-free; sentence 3: target report link; sentence 4: KR homepage link}}</p>

<p><em>This analysis is based on Ken Research market modelling, operator fleet disclosures, {{sector}} indicators, and third-party {{sector}}-sector estimates.</em></p>

<h2>{{Section 1 heading WITH data figure}}</h2>
<p>{{paragraph — exactly 1 related report interlink, 3-4 stats bolded}}</p>
<ul>
  <li><strong style="color:#000000;">{{Label}}:</strong> {{content with stat}}</li>
  <li>...</li>
</ul>

<h2>{{Section 2 heading WITH data figure}}</h2>
<p>{{paragraph — 1 related report interlink}}</p>
<ul>...</ul>

<div class="cta-block">
  <p>{{hook sentence}}? <a href='{sample_utm}' {link_style}><strong>Download Sample Report</strong></a> {{closing clause}}.</p>
</div>

<h2>{{Section 3 heading — question format ending with ?}}</h2>
<p>{{paragraph — 1 related report interlink}}</p>

<h2>{{Section 4 heading — forward-looking WITH year}}</h2>
<p>{{paragraph — 1 related report interlink}}</p>
<ul>...</ul>

<div class="cta-block">
  <p>{{hook}}? <a href='{target_utm}' {link_style}><strong>{market_name} Report</strong></a> {{closing clause}}.</p>
</div>

<h2>Conclusion</h2>
<p>{{conclusion — MUST include target report UTM link}}</p>

<h2>Frequently Asked Questions</h2>
<h3>Q1: {{question}}</h3>
<p>{{Answer — no interlink, min 2 stats bolded}}</p>
<h3>Q2: {{question}}</h3>
<p>{{Answer WITH 1 interlink}}</p>
<h3>Q3: {{question}}</h3>
<p>{{Answer WITH 1 interlink}}</p>
<h3>Q4: {{question}}</h3>
<p>{{Answer — no interlink}}</p>
<h3>Q5: {{question}}</h3>
<p>{{Answer WITH 1 interlink}}</p>

<p>For the full competitive benchmarking, segment-level forecasts, and regional breakdown, access the <a href='{target_utm}' {link_style}><strong>{market_name} Report</strong></a> from Ken Research, a leading market intelligence firm covering {{sector}} across {{region}}.</p>

== OUTPUT FORMAT ==
Return ONLY valid JSON with these exact keys. No markdown, no code blocks, just JSON:
{{
  "blog_title": "...",
  "h1_title": "...",
  "html_content": "...",
  "seo_description": "...",
  "linkedin_caption": "..."
}}

blog_title: 85-115 chars, ends with " | Ken Research"
h1_title: 100-130 chars, Ken Research in middle or end
html_content: complete HTML starting with <img ...> and ending with the KR branding paragraph
seo_description: 160-180 chars plain text, no HTML, no em dashes
linkedin_caption: 150-300 words, hook line + 3-4 bullet points (use checkmark emoji) + CTA + 5-7 hashtags
"""


def generate_blog_content(
    title: str,
    target_url: str,
    page_text: str,
    research: dict,
    related_urls: list,
    platform_slug: str,
    cover_image_url: str,
    market_name: str,
    country: str,
) -> dict:
    print('[generate_blog] Generating blog HTML content...', file=sys.stderr)

    target_utm = make_utm_url(target_url, platform_slug)
    # Build sample report URL from target slug
    slug = urlparse(target_url).path.rstrip('/').split('/')[-1]
    sample_url = f'https://www.kenresearch.com/sample-report/{slug}'

    prompt = build_generation_prompt(
        title=title,
        target_url=target_url,
        page_text=page_text,
        research=research,
        related_urls=related_urls,
        platform_slug=platform_slug,
        target_utm=target_utm,
        sample_url=sample_url,
        cover_image_url=cover_image_url,
        market_name=market_name,
        country=country,
    )

    raw = call_ai(prompt, max_tokens=10000)

    # Extract JSON from response (handle wrapped in markdown)
    json_match = re.search(r'\{[\s\S]*\}', raw)
    if not json_match:
        raise ValueError(f'AI did not return valid JSON. Response: {raw[:500]}')

    try:
        data = json.loads(json_match.group(0))
    except json.JSONDecodeError as e:
        raise ValueError(f'JSON parse error: {e}. Raw: {raw[:500]}')

    return data


# ── Quality checks ─────────────────────────────────────────────────────────────

def count_words(html: str) -> int:
    text = re.sub(r'<[^>]+>', ' ', html)
    return len(text.split())


def count_links(html: str) -> int:
    return len(re.findall(r'<a\s+href=', html, re.IGNORECASE))


def count_faqs(html: str) -> int:
    return len(re.findall(r'<h3>', html, re.IGNORECASE))


def has_em_dashes(text: str) -> bool:
    return '—' in text or '–' in text


def find_unbolded_stats(html: str) -> bool:
    clean = re.sub(r'<strong[^>]*>.*?</strong>', 'BOLDED', html, flags=re.DOTALL)
    clean = re.sub(r'<[^>]+>', ' ', clean)
    patterns = [
        r'\d+\.?\d*\s*%',
        r'USD\s+\d',
        r'INR\s+\d',
        r'\d+\.?\d*\s+billion',
        r'\d+\.?\d*\s+million',
        r'\bCAGR\b',
    ]
    for p in patterns:
        if re.search(p, clean, re.IGNORECASE):
            return True
    return False


def run_quality_checks(html: str, blog_title: str, blog_desc: str) -> dict:
    combined = html + blog_title + blog_desc
    return {
        'no_em_dashes': not has_em_dashes(combined),
        'word_count': count_words(html),
        'link_count': count_links(html),
        'faq_count': count_faqs(html),
        'char_count': len(html),
        'no_unbolded_stats': not find_unbolded_stats(html),
        'word_count_ok': 1200 <= count_words(html) <= 1400,
        'link_count_ok': 10 <= count_links(html) <= 12,
        'faq_count_ok': count_faqs(html) == 5,
        'char_count_ok': len(html) < 14000,
    }


def rate_blog(checks: dict, html: str, blog_title: str) -> int:
    """13-point rating system normalized to 10."""
    points = 0

    # Check 1 (2pts): Zero em dashes
    if checks['no_em_dashes']:
        points += 2

    # Check 2: Word count 1200-1400
    if checks['word_count_ok']:
        points += 1

    # Check 3: Links 10-12
    if checks['link_count_ok']:
        points += 1

    # Check 4: Exactly 5 FAQs
    if checks['faq_count_ok']:
        points += 1

    # Check 5: No unbolded stats
    if checks['no_unbolded_stats']:
        points += 1

    # Check 6: Data density — at least 3 stats per paragraph (simplified)
    para_count = len(re.findall(r'<p>', html))
    strong_count = len(re.findall(r'<strong>', html))
    if para_count > 0 and strong_count / para_count >= 2:
        points += 1

    # Check 7: H1 100-130 chars AND blog title 85-115 chars
    h1_match = re.search(r'<h1>(.*?)</h1>', html, re.DOTALL)
    h1_text = re.sub(r'<[^>]+>', '', h1_match.group(1)) if h1_match else ''
    h1_ok = 100 <= len(h1_text) <= 130
    bt_ok = 85 <= len(blog_title) <= 115
    if h1_ok and bt_ok:
        points += 1

    # Check 8: Both CTAs present
    has_sample = 'Download Sample Report' in html
    has_report_cta = 'cta-block' in html
    if has_sample and has_report_cta:
        points += 1

    # Check 9: Ken Research mentioned 5-7 times
    kr_count = html.lower().count('ken research')
    if 5 <= kr_count <= 9:
        points += 1

    # Check 10: Implication density (3+ paragraphs with implication clause)
    implication_words = ['signals', 'underpins', 'reshaping', 'validates', 'reflects',
                         'directly', 'rewards', 'accelerating', 'creates a']
    impl_count = sum(1 for w in implication_words if w in html.lower())
    if impl_count >= 3:
        points += 1

    # Check 11: Source attribution (5+ citation signals)
    source_phrases = ['as per ken research', 'as per government', 'as tracked by',
                      'as recorded', 'as per operator', 'as per official',
                      'as per independent', 'according to ken']
    src_count = sum(1 for p in source_phrases if p in html.lower())
    if src_count >= 4:
        points += 1

    # Check 12: Decision-framer H2s (2+ with why/how/what or outcome verbs)
    h2_texts = re.findall(r'<h2>(.*?)</h2>', html, re.IGNORECASE | re.DOTALL)
    decision_h2 = sum(1 for h in h2_texts
                      if re.search(r'\b(why|how|what|reshaping|unlocking|racing|signals|drives|marks)\b', h, re.IGNORECASE))
    if decision_h2 >= 2:
        points += 1

    normalized = round(points / 13 * 10)
    return max(1, normalized)


# ── Repair ─────────────────────────────────────────────────────────────────────

def repair_blog(html: str, blog_title: str, blog_desc: str, checks: dict, research: dict) -> str:
    """Ask AI to fix specific failed checks. Returns repaired HTML."""
    failed = []
    if not checks['no_em_dashes']:
        failed.append('- Remove all em dashes (—) and en dashes (–). Replace with colon or comma.')
    if not checks['word_count_ok']:
        wc = checks['word_count']
        if wc < 1200:
            failed.append(f'- Word count is {wc}, below 1200. Expand body sections and FAQ answers.')
        else:
            failed.append(f'- Word count is {wc}, above 1400. Trim bullet points and FAQ answers.')
    if not checks['link_count_ok']:
        lc = checks['link_count']
        if lc < 10:
            failed.append(f'- Only {lc} links found, need 10-12. Add related report interlinks to FAQ answers.')
        else:
            failed.append(f'- {lc} links found, max is 12. Remove weakest interlinks.')
    if not checks['faq_count_ok']:
        failed.append(f'- FAQ count is {checks["faq_count"]}, must be exactly 5. Adjust.')
    if not checks['no_unbolded_stats']:
        failed.append('- Wrap all bare numbers, percentages, and currency figures in <strong> tags.')
    if not checks['char_count_ok']:
        failed.append(f'- HTML is {checks["char_count"]} chars, must be under 14000. Trim FAQ answers and bullet points first.')

    if not failed:
        return html

    repair_prompt = f"""Repair this blog HTML by fixing ONLY these specific issues:

{chr(10).join(failed)}

Current HTML:
{html}

Rules:
1. Fix ONLY the listed issues. Do not rewrite sections that are correct.
2. Do NOT invent new statistics or data points. Use only what is in the HTML.
3. Return ONLY the fixed HTML, starting with <img and ending with </p>. No JSON, no explanation.
"""
    print('[generate_blog] Running repair pass...', file=sys.stderr)
    repaired = call_ai(repair_prompt, max_tokens=10000)
    # Extract just the HTML
    if '<img' in repaired:
        start = repaired.find('<img')
        repaired = repaired[start:]
    if repaired.endswith('```'):
        repaired = repaired[:-3].strip()
    return repaired


# ── Sheet write ───────────────────────────────────────────────────────────────

def write_to_sheet(name: str, row: int, updates: dict, repo_root: str) -> None:
    script = os.path.join(repo_root, 'scripts', 'sheet_write.py')
    if not os.path.exists(script):
        print(f'[WARN] sheet_write.py not found at {script}', file=sys.stderr)
        return

    # Write updates to a temp file to avoid shell arg length limits
    import tempfile
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump(updates, f, ensure_ascii=False)
        tmp_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, script,
             '--sheet', 'blog',
             '--name', name,
             '--row', str(row),
             '--updates-file', tmp_path],
            cwd=repo_root,
            timeout=30,
            capture_output=True,
            text=True,
        )
        print(f'[generate_blog] Sheet write: {result.stdout.strip()}', file=sys.stderr)
        if result.returncode != 0:
            print(f'[generate_blog] Sheet write error: {result.stderr[:300]}', file=sys.stderr)
    finally:
        os.unlink(tmp_path)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--row', type=int, default=0)
    parser.add_argument('--platforms', default='linkedin-pulse')
    parser.add_argument('--title', default='')
    parser.add_argument('--output-json', action='store_true')
    args = parser.parse_args()

    _load_env()

    repo_root = os.environ.get(
        'REPO_ROOT',
        os.path.join(os.path.dirname(__file__), '..')
    )

    # Determine platform slug for UTM links
    first_platform = args.platforms.split(',')[0].strip().lower()
    platform_slug_map = {
        'linkedin-pulse': 'linkedin-pulse',
        'linkedin_pulse': 'linkedin-pulse',
        'notion': 'notion',
        'medium': 'medium',
        'hackmd': 'hackmd',
    }
    platform_slug = platform_slug_map.get(first_platform, first_platform)

    print(f'[generate_blog] Starting blog generation for: {args.url}', file=sys.stderr)

    # Step 1: Scrape report page
    print('[generate_blog] Scraping report page...', file=sys.stderr)
    page_text = scrape_url(args.url)

    # Extract market name and country from URL + title
    market_name = extract_market_name(args.url, args.title)
    country = extract_country(args.url, args.title)

    # Step 2: Research market data (3 Tavily searches)
    research = search_market_data(market_name, country)

    # Step 3: Load sitemap for interlinks
    url_pool = load_sitemap_cache(repo_root)
    related_urls = pick_related_urls(args.url, url_pool, n=12)
    print(f'[generate_blog] Found {len(related_urls)} related report URLs for interlinks', file=sys.stderr)

    # Step 4: Generate cover image (Pollinations + Cloudinary)
    # Extract market size / CAGR hints from page text for better image
    size_match = re.search(r'(USD\s+\d+\.?\d*\s*(?:billion|million))', page_text, re.IGNORECASE)
    cagr_match = re.search(r'(\d+\.?\d*\s*%\s*CAGR)', page_text, re.IGNORECASE)
    market_size = size_match.group(1) if size_match else ''
    cagr = cagr_match.group(1) if cagr_match else ''

    cover_image_url = generate_cover_image(market_name, market_size, cagr)

    # Step 5: Generate blog HTML content
    data = generate_blog_content(
        title=args.title or market_name,
        target_url=args.url,
        page_text=page_text,
        research=research,
        related_urls=related_urls,
        platform_slug=platform_slug,
        cover_image_url=cover_image_url,
        market_name=market_name,
        country=country,
    )

    blog_title = data.get('blog_title', '')
    h1_title = data.get('h1_title', '')
    html_content = data.get('html_content', '')
    seo_description = data.get('seo_description', '')
    linkedin_caption = data.get('linkedin_caption', '')

    # Combine blog description
    blog_description = f'{seo_description}, caption- {linkedin_caption}'

    # Step 6: Quality checks
    print('[generate_blog] Running quality checks...', file=sys.stderr)
    checks = run_quality_checks(html_content, blog_title, blog_description)
    rating = rate_blog(checks, html_content, blog_title)

    print(
        f'[generate_blog] Checks: em_dash={checks["no_em_dashes"]} '
        f'words={checks["word_count"]} links={checks["link_count"]} '
        f'faqs={checks["faq_count"]} chars={checks["char_count"]} '
        f'rating={rating}/10',
        file=sys.stderr
    )

    # Step 7: Repair if rating < 8 (max 2 attempts)
    for attempt in range(2):
        if rating >= 8:
            break
        failed_checks = {k: v for k, v in checks.items() if not v and k.endswith('_ok')}
        if not failed_checks and checks['no_em_dashes'] and checks['no_unbolded_stats']:
            break
        print(f'[generate_blog] Rating {rating}/10 — repair attempt {attempt+1}/2', file=sys.stderr)
        html_content = repair_blog(html_content, blog_title, blog_description, checks, research)
        checks = run_quality_checks(html_content, blog_title, blog_description)
        rating = rate_blog(checks, html_content, blog_title)
        print(f'[generate_blog] After repair: rating={rating}/10 words={checks["word_count"]} links={checks["link_count"]}', file=sys.stderr)

    # Step 8: Write to sheet
    today = time.strftime('%Y-%m-%d')
    batch_label = f'BLOG-{today}-B1'

    if args.row > 0:
        updates = {
            'Blog Title': blog_title,
            'Blog Description': blog_description,
            'Blog Content': html_content,
            'blogBatch': batch_label,
            'Rating': str(rating),
        }
        write_to_sheet(args.name, args.row, updates, repo_root)

        # Flag red if still below 8 after repairs
        if rating < 8:
            print(f'[generate_blog] Rating {rating}/10 after 2 repairs — flagging red', file=sys.stderr)
            script = os.path.join(repo_root, 'scripts', 'sheet_write.py')
            subprocess.run(
                [sys.executable, script,
                 '--sheet', 'blog',
                 '--name', args.name,
                 '--row', str(args.row),
                 '--flag-red'],
                cwd=repo_root, timeout=15, check=False,
            )

    # Step 9: Output JSON
    output = {
        'blog_title': blog_title,
        'h1_title': h1_title,
        'blog_content': html_content,
        'blog_description': blog_description,
        'blog_seo_title': h1_title,
        'blog_seo_desc': seo_description,
        'cover_image_url': cover_image_url,
        'rating': rating,
        'word_count': checks['word_count'],
        'link_count': checks['link_count'],
        'char_count': checks['char_count'],
        'batch': batch_label,
    }

    print(json.dumps(output))


if __name__ == '__main__':
    main()
