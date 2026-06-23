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
import json
import os
import re
import subprocess
import sys
import time
from urllib.parse import urlparse

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


def make_utm_url(url: str, platform_slug: str, name: str = '') -> str:
    sep = '&' if '?' in url else '?'
    campaign = f'Automation{name.strip().title()}' if name else 'Automation'
    return f'{url}{sep}utm_source={platform_slug}&utm_medium=Referral&utm_campaign={campaign}'


def _sanitise(text: str) -> str:
    """Strip every dash variant the model sneaks in."""
    import re as _re
    for char, repl in {
        '—': ' - ', '–': '-', '‑': '-',
        '‒': '-', '―': ' - ', '﹘': '-',
        '﹣': '-', '－': '-',
    }.items():
        text = text.replace(char, repl)
    return _re.sub(r'  +', ' ', text).strip()


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
    """Generate cover image via ChatGPT DALL-E 3 (Playwright) and upload to Cloudinary.

    Calls scripts/generate_image.ts which:
      1. Opens an existing logged-in ChatGPT browser session
      2. Sends a detailed DALL-E 3 prompt (no Ken Research branding)
      3. Downloads the generated image
      4. Uploads to Cloudinary
      5. Returns {"status":"success","cloudinaryUrl":"..."}
    """
    print(f'[generate_blog] Generating DALL-E 3 cover image for: {market_name}', file=sys.stderr)

    repo_root = os.path.join(os.path.dirname(__file__), '..')
    script = os.path.join(repo_root, 'scripts', 'generate_image.ts')

    # On Windows, npm/npx binaries are .cmd files — use npx.cmd so subprocess finds them
    npx = 'npx.cmd' if sys.platform == 'win32' else 'npx'
    cmd = [
        npx, 'tsx', script,
        '--market-name', market_name,
    ]
    if market_size:
        cmd += ['--market-size', market_size]
    if cagr:
        cmd += ['--cagr', cagr]
    if forecast:
        cmd += ['--forecast', forecast]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=repo_root,
            timeout=240,  # 4 minutes: 3 min poll + buffer
        )
        # Last stdout line is the JSON result
        stdout_lines = [l.strip() for l in result.stdout.splitlines() if l.strip()]
        if not stdout_lines:
            print(f'[generate_blog] generate_image.ts produced no output. stderr: {result.stderr[-500:]}', file=sys.stderr)
            return ''

        data = json.loads(stdout_lines[-1])
        if data.get('status') == 'success':
            url = data.get('cloudinaryUrl', '')
            print(f'[generate_blog] Cover image ready: {url}', file=sys.stderr)
            return url
        else:
            print(f'[generate_blog] Image script error: {data.get("message")}', file=sys.stderr)
            return ''
    except subprocess.TimeoutExpired:
        print('[generate_blog] Image generation timed out after 6 minutes', file=sys.stderr)
        return ''
    except json.JSONDecodeError as e:
        print(f'[generate_blog] Image script returned invalid JSON: {e}', file=sys.stderr)
        return ''
    except Exception as e:
        print(f'[generate_blog] generate_image.ts failed: {e}', file=sys.stderr)
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
    name: str = '',
) -> str:

    sample_utm = make_utm_url(sample_url, platform_slug, name)
    kr_home_utm = make_utm_url('https://www.kenresearch.com/', platform_slug, name)

    interlinks_block = '\n'.join(
        f'  {i+1}. URL: {make_utm_url(url, platform_slug)}\n     Anchor: {url_to_anchor(url)}'
        for i, url in enumerate(related_urls)
    )

    link_style = (
        'style="color:#0645AD; font-weight:700; text-decoration:underline;" '
        'target="_blank" rel="noopener"'
    )

    return f"""You are a senior B2B market intelligence writer for Ken Research. Write a complete HTML article for LinkedIn Pulse optimised for Google E-E-A-T, AIO (AI search engines), and GEO (ChatGPT/Gemini/Perplexity citations).

== MARKET DATA ==
Report Title: {title}
Report URL: {target_url}
Market Name: {market_name}
Country/Region: {country}

Page Content (from Ken Research report page):
{page_text[:3000]}

Web Research - Market Size / CAGR / Forecast:
{research.get('market_data', '')[:800]}

Web Research - Key Companies / Market Share:
{research.get('key_players', '')[:500]}

Web Research - Policy / Regulation / Demand Shifts:
{research.get('policies', '')[:500]}

== LINKS TO EMBED ==
Target Report (main CTA): {target_utm}
Sample Report (secondary CTA): {sample_utm}

Related Reports — pick exactly 8 from this list, one per H2 body section:
{interlinks_block}

Cover Image: {cover_image_url or '(none)'}

== ABSOLUTE RULES — VIOLATION = REJECT ==
1. NO em dashes (—) or en dashes (–) anywhere. Use comma or colon instead.
2. ALL numbers, percentages, USD values wrapped in <strong> tags. Zero bare numbers allowed.
3. Exactly 5 FAQ questions (H3). No more, no less.
4. Exactly 10-12 <a href links total across the whole article.
5. Word count: 1,500-1,800 words. Count every word including headings, lists, FAQs.
6. Every H2 body paragraph MUST contain exactly 1 related report interlink (except the at-a-glance box).
7. Use "as per Ken Research" or "as tracked by Ken Research" at least 3 times in body paragraphs.
8. Exactly 2 CTA blocks: first uses "Download Sample Report", second uses "{market_name} Report".
9. No "Ken Research" in any H2 heading text.
10. Every <a> tag: SINGLE QUOTES for href. Include style and target attributes exactly as shown.
11. Article MUST end with the Ken Research branding paragraph as the final element.
12. Use 2026 as the present year. Use historical data only as context.
13. DO NOT include a Research Methodology section, Analyst Perspective section, or any comparison table.

Link format for ALL anchors (copy exactly):
<a href='URL' style="color:#0645AD; font-weight:700; text-decoration:underline;" target="_blank" rel="noopener"><strong>Anchor Text</strong></a>

== BLOG TITLE RULES ==
Blog Title (85-115 chars):
- Ends with " | Ken Research"
- Never starts with "Ken Research"
- Must include a specific number: CAGR %, USD value, or forecast year
- Use active power verbs: Surges, Races, Reshapes, Unlocks, Accelerates, Hits, Crosses
- NOT a question
- CORRECT: "India Cold Chain Market to Hit $22B by 2028 at 14.2% CAGR, Driven by Pharma | Ken Research"
- WRONG: "Ken Research Report on..." or "The Growing Market for..."

H1 Title (100-130 chars):
- Never starts with "Ken Research"
- Ken Research appears in the MIDDLE or END only
- Must include one data figure
- CORRECT: "India Cold Chain Logistics Market Set to Hit $22B by 2028 at 14.2% CAGR: Ken Research Analysis"

== AIO H2 HEADING RULES ==
H2 headings must match how users ask AI engines questions. Use natural language:
- CORRECT: "Why Is the {market_name} Growing So Fast?" (AIO query format)
- CORRECT: "Which Segment Is Driving Growth in the {market_name}?" (AIO query)
- CORRECT: "Top Trends Shaping the {market_name}" (trend discovery query)
- WRONG: "Market Overview" / "Key Growth Drivers" / "Market Analysis" (generic, not AI-query-friendly)

== HTML STRUCTURE — FOLLOW EXACTLY IN THIS ORDER ==

<img src='{cover_image_url or ""}' alt='{market_name} market research'>
<h1>[H1 title 100-130 chars with data figure, Ken Research in middle or end]</h1>

<!-- EXECUTIVE SUMMARY — first paragraph, functions as AIO snippet bait -->
<p>[EXECUTIVE SUMMARY — 5-6 sentences. This must read like a dense briefing note, not an introduction.
S1: Current market size in USD and the forecast value with year. Both figures bolded. E.g. "The {market_name} was valued at <strong>$X billion in 2025</strong> and is projected to reach <strong>$Y billion by 203X</strong>."
S2: CAGR figure bolded. Name the single biggest growth driver with a specific stat or policy reference.
S3: Name the fastest-growing segment and its share or growth rate. Bold the figure.
S4: Name the dominant geography or city tier and its contribution. Bold the figure.
S5: One forward-looking insight — what will change by 2028/2030 and why (policy, tech, demand).
S6: "The complete <a href='{target_utm}' style="color:#0645AD; font-weight:700; text-decoration:underline;" target="_blank" rel="noopener"><strong>{market_name} report</strong></a> by Ken Research covers segment forecasts, competitive benchmarks, and regional breakdown."
DO NOT add: "Ken Research is a leading firm; visit our website". DO NOT add a link to the KR homepage here.]</p>

<p><em>This analysis draws on Ken Research market modelling, [sector] operator disclosures, government data, and third-party estimates.</em></p>

<!-- AT A GLANCE BOX — AIO structured data signal -->
<h2>{market_name} at a Glance</h2>
<ul>
  <li><strong>Market Size (2025/2026):</strong> [USD value — use real number from data, not placeholder]</li>
  <li><strong>Forecast Value:</strong> [USD value by forecast year]</li>
  <li><strong>CAGR:</strong> <strong>[X.X]%</strong></li>
  <li><strong>Fastest Growing Segment:</strong> [specific segment name]</li>
  <li><strong>Dominant Region:</strong> [specific region, city, or country tier]</li>
  <li><strong>Major Growth Driver:</strong> [specific policy, tech, or demand force]</li>
</ul>
<p>[40-60 words. 1-2 sentences contextualising the glance box — what these numbers mean strategically. No interlink here.]</p>

<!-- SECTION 1: Market size — AIO query H2 -->
<h2>[H2: AIO query — e.g. "How Big Is the {market_name} and Where Is It Headed?"]</h2>
<p>[100+ words. 3-4 bolded stats. Use "as per Ken Research". MUST include 1 related report interlink from the list above.]</p>
<ul>
  <li><strong style="color:#000000;">[Segment/Layer Label]:</strong> [detail with bolded stat]</li>
  <li><strong style="color:#000000;">[Segment/Layer Label]:</strong> [detail with bolded stat]</li>
  <li><strong style="color:#000000;">[Segment/Layer Label]:</strong> [detail with bolded stat]</li>
  <li><strong style="color:#000000;">[Segment/Layer Label]:</strong> [detail with bolded stat]</li>
</ul>

<!-- SECTION 2: Growth drivers — AIO query H2 -->
<h2>[H2: AIO query — e.g. "Why Is the {market_name} Growing So Rapidly?"]</h2>
<p>[100+ words. 3+ bolded stats. Use "as tracked by Ken Research". MUST include 1 related report interlink.]</p>
<ul>
  <li><strong style="color:#000000;">[Driver Label]:</strong> [detail with bolded stat or policy name]</li>
  <li><strong style="color:#000000;">[Driver Label]:</strong> [detail with bolded stat]</li>
  <li><strong style="color:#000000;">[Driver Label]:</strong> [detail with bolded stat]</li>
  <li><strong style="color:#000000;">[Driver Label]:</strong> [detail with bolded stat]</li>
</ul>

<div class="cta-block">
  <p>Need granular segment data and company benchmarks? <a href='{sample_utm}' style="color:#0645AD; font-weight:700; text-decoration:underline;" target="_blank" rel="noopener"><strong>Download Sample Report</strong></a> to preview the full methodology and data tables.</p>
</div>

<!-- SECTION 3: Top Trends — AIO discovery queries via H3 -->
<h2>Top Trends Shaping the {market_name}</h2>
<p>[30-40 words. Scene-setting sentence for the trends. MUST include 1 related report interlink.]</p>
<h3>[Trend 1 — specific technology or behaviour name, 4-6 words]</h3>
<p>[60+ words. 1 bolded stat or company name. No interlink.]</p>
<h3>[Trend 2]</h3>
<p>[60+ words. 1 bolded stat or policy. No interlink.]</p>
<h3>[Trend 3]</h3>
<p>[60+ words. 1 bolded stat. No interlink.]</p>
<h3>[Trend 4]</h3>
<p>[60+ words. No interlink.]</p>
<h3>[Trend 5]</h3>
<p>[60+ words. No interlink.]</p>

<!-- SECTION 4: Competitive landscape -->
<h2>[H2: AIO query — e.g. "Who Are the Major Players in the {market_name}?"]</h2>
<ul>
  <li>[Company 1]: [1 sentence — what they do in this market, known market share or recent strategic move]</li>
  <li>[Company 2]: [1 sentence]</li>
  <li>[Company 3]: [1 sentence]</li>
  <li>[Company 4]: [1 sentence]</li>
  <li>[Company 5]: [1 sentence]</li>
  <li>[Company 6]: [1 sentence]</li>
</ul>
<p>[60+ words. Competitive dynamics summary. Use "as per Ken Research". MUST include 1 related report interlink.]</p>

<!-- SECTION 5: Challenges -->
<h2>[H2: AIO query — e.g. "What Challenges Does the {market_name} Face?"]</h2>
<ul>
  <li>[Challenge 1 — specific: include a measurable impact, company name, or policy constraint]</li>
  <li>[Challenge 2]</li>
  <li>[Challenge 3]</li>
  <li>[Challenge 4]</li>
  <li>[Challenge 5]</li>
</ul>
<p>[60+ words. Commentary on how the market is responding to these challenges. MUST include 1 related report interlink.]</p>

<div class="cta-block">
  <p>For the complete competitive landscape and segment-level forecasts, access the <a href='{target_utm}' style="color:#0645AD; font-weight:700; text-decoration:underline;" target="_blank" rel="noopener"><strong>{market_name} Report</strong></a> from Ken Research.</p>
</div>

<!-- CONCLUSION -->
<h2>Conclusion</h2>
<p>[80+ words. Summarise the 3 most important takeaways. Use "as per Ken Research". MUST include 1 related report interlink pointing to the target report.]</p>

<!-- FAQ — 5 questions, Q1/Q3/Q5 have interlinks -->
<h2>Frequently Asked Questions</h2>

<h3>Q1: What is the current size of the {market_name} and what is the projected value by the end of the forecast period?</h3>
<p>[90+ words. At least 2 bolded stats. MUST include 1 related report interlink.]</p>

<h3>Q2: What compound annual growth rate is the {market_name} expected to maintain over the next five to seven years, and what factors sustain this pace?</h3>
<p>[90+ words. Bold the CAGR. Name 2 specific drivers. No interlink.]</p>

<h3>Q3: Which segment within the {market_name} is recording the fastest expansion, and what structural demand forces are behind this acceleration?</h3>
<p>[90+ words. Name the segment, give share or growth rate. MUST include 1 related report interlink.]</p>

<h3>Q4: How are government policies, digital initiatives, or regulatory frameworks in {country} shaping the trajectory of the {market_name}?</h3>
<p>[90+ words. Name the specific policy or initiative, year enacted, and measurable impact. No interlink.]</p>

<h3>Q5: Where can business leaders, investors, and procurement teams access the full forecast data, competitive benchmarks, and segment-level analysis for the {market_name}?</h3>
<p>[70+ words. Direct answer pointing to Ken Research. MUST include link to the target report.]</p>

<p>For the full competitive benchmarking, segment-level forecasts, and regional breakdown, access the <a href='{target_utm}' style="color:#0645AD; font-weight:700; text-decoration:underline;" target="_blank" rel="noopener"><strong>{market_name} Report</strong></a> from Ken Research, a leading market intelligence firm covering [sector] across [region/country].</p>

== OUTPUT FORMAT ==
Return ONLY valid JSON — no markdown fences, no commentary:
{{
  "blog_title": "...",
  "h1_title": "...",
  "html_content": "...",
  "seo_description": "...",
  "linkedin_caption": "..."
}}

blog_title: 85-115 chars, ends with " | Ken Research", includes a number, never starts with "Ken Research"
h1_title: 100-130 chars, Ken Research in middle or end, includes a data figure
html_content: complete HTML from <img> to the final KR branding <p>, no markdown
seo_description: 155-165 chars plain text, no HTML, no em dashes, no placeholder numbers, includes market name and a specific figure

linkedin_caption: 200-260 words. Follow this structure EXACTLY:

LINE 1 (hook — one question): "When [specific business pain], [direct question about their readiness for a specific year]?"

BLANK LINE

PARAGRAPH (2-3 sentences — market size, CAGR, geography angle. Use real numbers if known; write "multi-billion-dollar" if not):

BLANK LINE

BULLETS (3-4 labeled bullets):
- [Label] - [specific insight with real number, company name, or policy name]
- [Label] - [specific insight]
- [Label] - [specific insight]

BLANK LINE

ACTION LINE: "Lock in [specific action] within [timeframe] to [specific benefit]."

BLANK LINE

CTA: "Read the full article: {target_utm}"

BLANK LINE

HASHTAGS: 4-5 hashtags. Always include #KenResearch.

RULES for caption: no em dashes, no en dashes, no placeholder numbers, no "In today's", no "Thrilled to share"
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
    name: str = '',
) -> dict:
    print('[generate_blog] Generating blog HTML content...', file=sys.stderr)

    target_utm = make_utm_url(target_url, platform_slug, name)
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
        name=name,
    )

    raw = call_ai(prompt, max_tokens=10000)

    # Extract JSON from response (handle wrapped in markdown)
    json_match = re.search(r'\{[\s\S]*\}', raw)
    if not json_match:
        raise ValueError(f'AI did not return valid JSON. Response: {raw[:500]}')

    try:
        data = json.loads(json_match.group(0))
    except json.JSONDecodeError as e:
        # AI sometimes emits invalid JSON escapes (e.g. \' or \_ in HTML strings).
        # Replace lone backslashes that aren't followed by valid JSON escape chars.
        import re as _re
        fixed = _re.sub(r'\\([^"\\/bfnrtu])', r'\1', json_match.group(0))
        try:
            data = json.loads(fixed)
        except json.JSONDecodeError:
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
    wc = count_words(html)
    lc = count_links(html)
    fc = count_faqs(html)
    return {
        'no_em_dashes': not has_em_dashes(combined),
        'word_count': wc,
        'link_count': lc,
        'faq_count': fc,
        'char_count': len(html),
        'no_unbolded_stats': not find_unbolded_stats(html),
        'word_count_ok': 1500 <= wc <= 1800,
        'link_count_ok': 10 <= lc <= 12,
        'faq_count_ok': fc == 5,
        'char_count_ok': len(html) < 20000,
        'has_glance_box': 'at a Glance' in html,
    }


def rate_blog(checks: dict, html: str, blog_title: str) -> int:
    """13-point rating system normalized to 10."""
    points = 0

    # 1 (2pts): Zero em dashes — non-negotiable
    if checks['no_em_dashes']:
        points += 2

    # 2: Word count 1500-1800
    if checks['word_count_ok']:
        points += 1

    # 3: Links 10-12
    if checks['link_count_ok']:
        points += 1

    # 4: Exactly 5 FAQs
    if checks['faq_count_ok']:
        points += 1

    # 5: No unbolded stats
    if checks['no_unbolded_stats']:
        points += 1

    # 6: Data density
    para_count = len(re.findall(r'<p>', html))
    strong_count = len(re.findall(r'<strong>', html))
    if para_count > 0 and strong_count / para_count >= 2:
        points += 1

    # 7: H1 and blog title length
    h1_match = re.search(r'<h1>(.*?)</h1>', html, re.DOTALL)
    h1_text = re.sub(r'<[^>]+>', '', h1_match.group(1)) if h1_match else ''
    if 100 <= len(h1_text) <= 130 and 85 <= len(blog_title) <= 115:
        points += 1

    # 8: Both CTAs present
    if 'Download Sample Report' in html and 'cta-block' in html:
        points += 1

    # 9: Ken Research mentioned 4-10 times
    kr_count = html.lower().count('ken research')
    if 4 <= kr_count <= 10:
        points += 1

    # 10: Source attribution
    source_phrases = ['as per ken research', 'as tracked by ken research',
                      'as recorded', 'according to ken']
    if sum(1 for p in source_phrases if p in html.lower()) >= 2:
        points += 1

    # 11: AIO H2s — at least 2 natural-language query H2s
    h2_texts = re.findall(r'<h2>(.*?)</h2>', html, re.IGNORECASE | re.DOTALL)
    if sum(1 for h in h2_texts if re.search(r'\b(why|how|what|which|who|where)\b', h, re.IGNORECASE)) >= 2:
        points += 1

    # 12: At-a-glance box present
    if checks.get('has_glance_box'):
        points += 1

    normalized = round(points / 13 * 10)
    return max(1, normalized)


# ── Repair ─────────────────────────────────────────────────────────────────────

def repair_blog(html: str, blog_title: str, blog_desc: str, checks: dict, research: dict) -> str:
    """Ask AI to fix specific failed checks. Returns repaired HTML."""
    failed = []
    word_expansion_needed = 0

    if not checks['no_em_dashes']:
        failed.append('- Remove ALL em dashes (—) and en dashes (–). Replace each with a comma or colon.')
    if not checks['word_count_ok']:
        wc = checks['word_count']
        if wc < 1500:
            shortage = 1600 - wc
            word_expansion_needed = shortage
            # Identify which H2 sections are short
            sections = re.findall(r'<h2>(.*?)</h2>(.*?)(?=<h2>|<div class="cta|<h2>Frequently|$)',
                                  html, re.DOTALL | re.IGNORECASE)
            short_sections = []
            for heading, body in sections:
                body_words = len(re.sub(r'<[^>]+>', ' ', body).split())
                if body_words < 150:
                    short_sections.append(f'  • "{heading.strip()}" section ({body_words} words, needs 180+)')
            expansion_detail = '\n'.join(short_sections) if short_sections else '  • Expand all FAQ answers to 80+ words'
            failed.append(
                f'- Word count is {wc}, need at least 1,300. Must add ~{shortage} more words.\n'
                f'  Expand these specific short sections:\n{expansion_detail}\n'
                f'  For each short section: add one more substantive paragraph (60-80 words) after the existing paragraph.\n'
                f'  For each FAQ answer: pad to 75+ words by adding 1-2 more sentences with context.\n'
                f'  Use ONLY facts already in the article or from the research below — no invented data.'
            )
        else:
            failed.append(f'- Word count is {wc}, above 2200. Trim bullet point descriptions and shorten FAQ answers.')
    if not checks['link_count_ok']:
        lc = checks['link_count']
        if lc < 10:
            failed.append(f'- Only {lc} links. Need 10-12. Add interlinks to short FAQ answers that have none.')
        else:
            failed.append(f'- {lc} links found, max is 12. Remove 1-2 weakest interlinks from FAQ answers.')
    if not checks['faq_count_ok']:
        failed.append(f'- FAQ count is {checks["faq_count"]}, must be exactly 5 H3 tags.')
    if not checks['no_unbolded_stats']:
        failed.append('- Wrap ALL bare numbers, percentages, and currency figures in <strong> tags.')
    if not checks['char_count_ok']:
        failed.append(f'- HTML is {checks["char_count"]} chars, must be under 14,000. Trim bullet lists first.')

    if not failed:
        return html

    research_context = ''
    if word_expansion_needed > 0:
        research_context = f"""
Additional facts you can use for expansion (do NOT invent new numbers):
{research.get('market_data', '')[:600]}
{research.get('key_players', '')[:300]}
"""

    repair_prompt = f"""You are repairing a blog article HTML. Fix ONLY these issues:

{chr(10).join(failed)}
{research_context}
Current HTML (do NOT change sections that are already correct):
{html}

Output rules:
- Return ONLY the repaired HTML, starting with <img and ending with the last </p>.
- No JSON wrapper, no markdown code blocks, no explanation.
- Keep ALL existing links, bold tags, and CTA blocks exactly as-is.
- Only touch the sections listed above.
"""
    print('[generate_blog] Running repair pass...', file=sys.stderr)
    repaired = call_ai(repair_prompt, max_tokens=12000)
    # Extract HTML block
    if '<img' in repaired:
        start = repaired.find('<img')
        repaired = repaired[start:]
    repaired = repaired.strip()
    if repaired.endswith('```'):
        repaired = repaired[:-3].strip()
    repaired = _sanitise(repaired)
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

    # Step 4: Generate cover image
    # Extract market size / CAGR from Tavily research first, fall back to page_text regex
    combined_text = research.get('market_data', '') + ' ' + page_text
    size_match = re.search(r'(USD\s+\d+\.?\d*\s*(?:billion|million))', combined_text, re.IGNORECASE)
    cagr_match = re.search(r'(\d+\.?\d*\s*%\s*(?:CAGR|growth))', combined_text, re.IGNORECASE)
    forecast_match = re.search(r'(USD\s+\d+\.?\d*\s*(?:billion|million)\s*by\s*20\d\d)', combined_text, re.IGNORECASE)
    market_size = size_match.group(1) if size_match else ''
    cagr = cagr_match.group(1) if cagr_match else ''
    forecast = forecast_match.group(1) if forecast_match else ''
    print(f'[generate_blog] Image data — size={market_size!r} cagr={cagr!r} forecast={forecast!r}', file=sys.stderr)

    cover_image_url = generate_cover_image(market_name, market_size, cagr, forecast)

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
        name=args.name,
    )

    blog_title = data.get('blog_title', '')
    h1_title = data.get('h1_title', '')
    html_content = data.get('html_content', '')
    seo_description = data.get('seo_description', '')
    linkedin_caption = data.get('linkedin_caption', '')

    # Post-process: strip all dash variants from every output field
    blog_title      = _sanitise(blog_title)
    h1_title        = _sanitise(h1_title)
    seo_description = _sanitise(seo_description)
    linkedin_caption = _sanitise(linkedin_caption)
    html_content    = _sanitise(html_content)

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
