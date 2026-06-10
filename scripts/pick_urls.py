#!/usr/bin/env python3
"""
pick_urls.py — Pick N fresh URLs from the sitemap cache for blog generation.

Reads data/sitemap_urls.json (cache) and data/picked_urls.json (log).
Returns URLs not already picked or present in the Blogs sheet.
Writes chosen URLs to the picked log immediately to prevent re-use.

Usage:
    python scripts/pick_urls.py --count 5
    python scripts/pick_urls.py --count 1
    python scripts/pick_urls.py --count 5 --vertical education   # pick only from a priority vertical
    python scripts/pick_urls.py --list          # show all picked URLs
    python scripts/pick_urls.py --reset         # clear picked log (use with care)

Priority verticals (--vertical):
    education            — education / e-learning / edtech / tutoring reports
    warehousing          — warehousing / warehouse reports
    ecommerce-logistics  — e-commerce logistics / fulfillment reports
    furniture            — furniture reports
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

try:
    import requests
    from google.oauth2 import service_account
    import google.auth.transport.requests as google_requests
except ImportError:
    pass  # sheet check is optional — will skip if unavailable

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_FILE = os.path.join(BASE_DIR, "data", "sitemap_urls.json")
PICKED_LOG = os.path.join(BASE_DIR, "data", "already_posted.json")

# Priority blog verticals — slug keyword sets. Used by --vertical.
VERTICALS = {
    "education": ["education", "e-learning", "elearning", "edtech", "tutoring", "online-learning"],
    "warehousing": ["warehousing", "warehouse"],
    "ecommerce-logistics": ["e-commerce-logistics", "ecommerce-logistics",
                             "e-commerce-fulfillment", "ecommerce-fulfillment", "e-commerce-delivery"],
    "furniture": ["furniture"],
}

# Google Sheet config (to cross-check Blogs sheet)
SPREADSHEET_ID = "1p_N3zzJbUx-7t8sjuAtbQsHaUfVmYxytQU_gDd2MGwQ"
SERVICE_ACCOUNT_FILE = os.path.join(BASE_DIR, "scripts", "service_account.json")
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


def load_json(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_json(path: str, data: dict):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_sheet_blogged_urls() -> set:
    """Fetch targetUrl column from Blogs sheet to avoid re-blogging."""
    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
        creds.refresh(google_requests.Request())
        resp = requests.get(
            f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/Blogs!A:A",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=15
        )
        resp.raise_for_status()
        rows = resp.json().get("values", [])
        # First row is header, rest are data
        urls = set()
        for row in rows[1:]:
            if row and row[0].strip():
                urls.add(row[0].strip().rstrip("/"))
        return urls
    except Exception as e:
        print(f"[WARN] Could not read Blogs sheet: {e}", file=sys.stderr)
        return set()


def normalize(url: str) -> str:
    return url.strip().rstrip("/")


def main():
    parser = argparse.ArgumentParser(description="Pick fresh blog URLs from sitemap cache")
    parser.add_argument("--count", type=int, default=1, help="Number of URLs to pick")
    parser.add_argument("--vertical", type=str, default=None, choices=list(VERTICALS.keys()),
                        help="Pick only from a priority vertical (education, warehousing, ecommerce-logistics, furniture)")
    parser.add_argument("--list", action="store_true", help="List all picked URLs")
    parser.add_argument("--reset", action="store_true", help="Clear the picked log")
    args = parser.parse_args()

    # Load picked log
    log = load_json(PICKED_LOG)
    picked_entries = log.get("picked", [])
    picked_urls = {normalize(e["url"]) for e in picked_entries}

    if args.list:
        print(f"Picked URLs ({len(picked_entries)} total):")
        for e in picked_entries:
            print(f"  [{e['picked_at'][:10]}] {e['url']}")
        return

    if args.reset:
        save_json(PICKED_LOG, {"picked": []})
        print(json.dumps({"ok": True, "message": "Picked log cleared"}))
        return

    # Load sitemap cache
    cache = load_json(CACHE_FILE)
    if not cache or not cache.get("urls"):
        print(json.dumps({"ok": False, "error": "Cache file missing. Run: python scripts/sitemap_cache.py"}))
        sys.exit(1)

    # Get already-blogged URLs from sheet
    blogged_urls = get_sheet_blogged_urls()

    # All excluded URLs
    excluded = picked_urls | {normalize(u) for u in blogged_urls}

    # Optional vertical filter — only consider URLs whose slug matches the vertical keywords
    vertical_kw = VERTICALS.get(args.vertical) if args.vertical else None

    # Pick N fresh URLs
    chosen = []
    for entry in cache["urls"]:
        if len(chosen) >= args.count:
            break
        url = normalize(entry["url"])
        if url in excluded:
            continue
        if vertical_kw and not any(k in url.lower() for k in vertical_kw):
            continue
        chosen.append({"url": url, "lastmod": entry["lastmod"]})
        excluded.add(url)

    if len(chosen) < args.count:
        print(json.dumps({
            "ok": False,
            "error": f"Only {len(chosen)} fresh URLs available"
                     + (f" for vertical '{args.vertical}'" if args.vertical else "")
                     + f" (requested {args.count})",
            "urls": chosen
        }))
        sys.exit(1)

    # Write chosen URLs to picked log immediately
    now = datetime.now(timezone.utc).isoformat()
    for item in chosen:
        picked_entries.append({
            "url": item["url"],
            "lastmod": item["lastmod"],
            "picked_at": now
        })
    save_json(PICKED_LOG, {"picked": picked_entries})

    print(json.dumps({
        "ok": True,
        "count": len(chosen),
        "urls": chosen,
        "total_picked_ever": len(picked_entries)
    }))


if __name__ == "__main__":
    main()
