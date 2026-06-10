#!/usr/bin/env python3
"""
sitemap_cache.py — Fetch all 7 Ken Research product sitemaps and cache eligible URLs.

Extracts only URLs with lastmod >= 2025. Saves to data/sitemap_urls.json.
Run manually or via Monday cron to refresh.

Usage:
    python scripts/sitemap_cache.py             # build/refresh cache
    python scripts/sitemap_cache.py --stats     # print cache stats only
    python scripts/sitemap_cache.py --check     # check if cache needs refresh (exit 0=fresh, 1=stale)
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

try:
    import requests
    from xml.etree import ElementTree as ET
except ImportError:
    print(json.dumps({"ok": False, "error": "Missing requests. Run: pip install requests"}))
    sys.exit(1)

SITEMAPS = [
    "https://www.kenresearch.com/productv0-sitemap.xml",
    "https://www.kenresearch.com/productv1-sitemap.xml",
    "https://www.kenresearch.com/productv0pointone-sitemap.xml",
    "https://www.kenresearch.com/productv0pointone-sitemap.xml?p=2",
    "https://www.kenresearch.com/productv0pointone-sitemap.xml?p=3",
    "https://www.kenresearch.com/productv0pointone-sitemap.xml?p=4",
    "https://www.kenresearch.com/productv0pointone-sitemap.xml?p=5",
]

MIN_YEAR = 2025
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "sitemap_urls.json")
REFRESH_DAYS = 7  # consider cache stale after 7 days


def fetch_sitemap(url: str) -> list:
    """Fetch one sitemap XML and return list of {url, lastmod} dicts."""
    try:
        resp = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        entries = []
        for url_el in root.findall("sm:url", ns):
            loc = url_el.findtext("sm:loc", default="", namespaces=ns)
            lastmod = url_el.findtext("sm:lastmod", default="", namespaces=ns)
            if loc and lastmod:
                year_str = lastmod[:4]
                try:
                    if int(year_str) >= MIN_YEAR:
                        entries.append({"url": loc.strip(), "lastmod": lastmod.strip()})
                except ValueError:
                    pass
        return entries
    except Exception as e:
        print(f"  [WARN] Failed to fetch {url}: {e}", file=sys.stderr)
        return []


def build_cache() -> dict:
    """Fetch all sitemaps in parallel and build the cache object."""
    print(f"Fetching {len(SITEMAPS)} sitemaps in parallel...", file=sys.stderr)
    all_entries = []
    seen_urls = set()

    with ThreadPoolExecutor(max_workers=7) as executor:
        futures = {executor.submit(fetch_sitemap, sm): sm for sm in SITEMAPS}
        for future in as_completed(futures):
            entries = future.result()
            for entry in entries:
                if entry["url"] not in seen_urls:
                    seen_urls.add(entry["url"])
                    all_entries.append(entry)

    # Sort by lastmod descending (newest first)
    all_entries.sort(key=lambda x: x["lastmod"], reverse=True)

    cache = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "count": len(all_entries),
        "min_year": MIN_YEAR,
        "urls": all_entries
    }
    return cache


def save_cache(cache: dict):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


def load_cache() -> dict:
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def cache_age_days(cache: dict) -> float:
    fetched_at = cache.get("fetched_at", "")
    if not fetched_at:
        return float("inf")
    try:
        dt = datetime.fromisoformat(fetched_at)
        now = datetime.now(timezone.utc)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (now - dt).total_seconds() / 86400
    except Exception:
        return float("inf")


def main():
    parser = argparse.ArgumentParser(description="Ken Research sitemap URL cache builder")
    parser.add_argument("--stats", action="store_true", help="Print cache stats and exit")
    parser.add_argument("--check", action="store_true", help="Exit 0 if cache is fresh, 1 if stale/missing")
    args = parser.parse_args()

    if args.stats:
        cache = load_cache()
        if not cache:
            print("Cache not found.")
            sys.exit(1)
        age = cache_age_days(cache)
        print(f"Cache file:  {CACHE_FILE}")
        print(f"Fetched at:  {cache.get('fetched_at', 'unknown')}")
        print(f"Age:         {age:.1f} days")
        print(f"URLs cached: {cache.get('count', 0)} (lastmod >= {cache.get('min_year', MIN_YEAR)})")
        return

    if args.check:
        cache = load_cache()
        age = cache_age_days(cache)
        if cache and age < REFRESH_DAYS:
            print(f"Cache is fresh ({age:.1f} days old). No refresh needed.")
            sys.exit(0)
        else:
            print(f"Cache is stale or missing ({age:.1f} days old). Refresh required.")
            sys.exit(1)

    # Default: build/refresh cache
    t0 = time.time()
    cache = build_cache()
    save_cache(cache)
    elapsed = time.time() - t0

    print(json.dumps({
        "ok": True,
        "count": cache["count"],
        "fetched_at": cache["fetched_at"],
        "elapsed_sec": round(elapsed, 1),
        "cache_file": CACHE_FILE
    }))


if __name__ == "__main__":
    main()
