#!/usr/bin/env python3
"""
sheet_read.py — Read rows from Google Sheets via direct REST API.

Usage:
    # Get unprocessed blog rows (targetUrl set, Blog Content empty)
    python scripts/sheet_read.py --sheet blog --action blog-unprocessed

    # Get all rows from a sheet
    python scripts/sheet_read.py --sheet blog --action all

    # Get a single row
    python scripts/sheet_read.py --sheet blog --action row --row 3

    # Get unposted social rows (X/FB/LI Status empty)
    python scripts/sheet_read.py --sheet main --action unposted

Sheet aliases:
    main  ->  Agentic Sheet
    blog  ->  Blogs

Output:
    JSON on stdout.
    Exit 0 on success, exit 1 on error.
"""

import argparse
import json
import os
import sys
import time

# Force UTF-8 output on Windows (prevents charmap encode errors for non-ASCII sheet data)
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

try:
    import requests
    from google.oauth2 import service_account
    import google.auth.transport.requests as google_requests
except ImportError:
    print(json.dumps({"ok": False, "error": "Missing dependencies. Run: pip install google-auth requests"}))
    sys.exit(1)

# Load .env so GOOGLE_APPLICATION_CREDENTIALS is available before _find_service_account()
def _load_env():
    for candidate in [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ken_backend', '.env'),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'),
    ]:
        path = os.path.normpath(candidate)
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, _, v = line.partition('=')
                        os.environ.setdefault(k.strip(), v.strip())
            break

_load_env()

SPREADSHEET_ID = "1ZTgKCRs6Hcmi4pymYa6pZOerxX5cqT23FS1Z8c-RwJU"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

def _find_service_account() -> str:
    # 1. Explicit env var (set in .env as GOOGLE_APPLICATION_CREDENTIALS)
    env_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    if env_path and os.path.exists(env_path):
        return env_path
    # 2. scripts/service_account.json (legacy location)
    legacy = os.path.join(os.path.dirname(os.path.abspath(__file__)), "service_account.json")
    if os.path.exists(legacy):
        return legacy
    # 3. .accounts/google-service-account.json (Pranav's machine)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alt = os.path.join(repo_root, ".accounts", "google-service-account.json")
    if os.path.exists(alt):
        return alt
    raise FileNotFoundError(
        "Service account JSON not found. Set GOOGLE_APPLICATION_CREDENTIALS in ken_backend/.env "
        f"or place it at {legacy}"
    )

SERVICE_ACCOUNT_FILE = _find_service_account()

SHEET_MAP = {
    "social": "Social",
    "main":   "Social",
    "blog":   "Blog",
}

def resolve_tab(sheet_alias: str, name: str) -> str:
    suffix = SHEET_MAP.get(sheet_alias)
    if not suffix:
        raise ValueError(f"Unknown --sheet alias: {sheet_alias}")
    return f"{name.strip().title()} {suffix}"

BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")
TOKEN_CACHE = os.path.join(CACHE_DIR, "gsheet_token_read.json")


def _load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_json(path, data):
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


def get_token():
    cached = _load_json(TOKEN_CACHE)
    now = time.time()
    if cached.get("token") and cached.get("expiry", 0) - now > 60:
        return cached["token"]
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    creds.refresh(google_requests.Request())
    _save_json(TOKEN_CACHE, {
        "token": creds.token,
        "expiry": creds.expiry.timestamp() if creds.expiry else now + 3500,
    })
    return creds.token


def sheets_get(path, params=None):
    resp = requests.get(
        f"{BASE_URL}/{SPREADSHEET_ID}{path}",
        headers={"Authorization": f"Bearer {get_token()}"},
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def get_all_rows(sheet_name):
    encoded = sheet_name.replace("'", "\\'")
    resp = sheets_get("/values:batchGet", params={
        "ranges": f"'{encoded}'",
        "majorDimension": "ROWS",
    })
    rows = resp.get("valueRanges", [{}])[0].get("values", [])
    if not rows:
        return [], []
    headers = rows[0]
    data_rows = rows[1:]
    return headers, data_rows


def row_to_dict(headers, row, data_row_num):
    d = {"_dataRow": data_row_num, "_sheetRow": data_row_num + 1}
    seen_lower = {}  # lowercase → first canonical header already added to d
    for i, h in enumerate(headers):
        h_stripped = h.strip()
        if not h_stripped:
            continue
        h_lower = h_stripped.lower()
        val = row[i] if i < len(row) else ""
        if h_lower in seen_lower:
            # Case-insensitive duplicate (e.g. "Linkedin Pulse URL" vs "LinkedIn Pulse URL")
            # Keep the existing key; only update value if current cell is non-empty and existing is empty
            existing = seen_lower[h_lower]
            if val and not d.get(existing):
                d[existing] = val
        else:
            seen_lower[h_lower] = h_stripped
            d[h_stripped] = val
    return d


def action_all(sheet_name):
    headers, data_rows = get_all_rows(sheet_name)
    result = [row_to_dict(headers, r, i + 1) for i, r in enumerate(data_rows)]
    return {"ok": True, "count": len(result), "rows": result}


def action_row(sheet_name, data_row):
    headers, data_rows = get_all_rows(sheet_name)
    idx = data_row - 1
    if idx < 0 or idx >= len(data_rows):
        return {"ok": False, "error": f"Row {data_row} not found"}
    return {"ok": True, "row": row_to_dict(headers, data_rows[idx], data_row)}


def action_blog_unprocessed(sheet_name, limit=15):
    """
    Returns rows where targetUrl is set but Blog Content is empty (< 50 chars).
    These are ready for blog generation.
    """
    headers, data_rows = get_all_rows(sheet_name)

    url_col = "targetUrl"
    content_col = "Blog Content"

    if url_col not in headers:
        return {"ok": False, "error": f"Column '{url_col}' not found in sheet"}

    result = []
    for i, row in enumerate(data_rows):
        d = row_to_dict(headers, row, i + 1)
        target_url = d.get("targetUrl", "").strip()
        blog_content = d.get("Blog Content", "").strip()

        if target_url and len(blog_content) < 50:
            result.append(d)
            if len(result) >= limit:
                break

    return {
        "ok": True,
        "count": len(result),
        "rows": result,
        "_note": f"Rows with targetUrl set and Blog Content empty (limit {limit})"
    }


def action_unposted_main(sheet_name, limit=15):
    """
    Returns rows from Agentic Sheet where any of X/FB/LI Status is empty.
    """
    headers, data_rows = get_all_rows(sheet_name)

    status_cols = ["X Status", "FB Status", "LinkedIn Status"]
    result = []
    for i, row in enumerate(data_rows):
        d = row_to_dict(headers, row, i + 1)
        if not d.get("targetUrl", "").strip():
            continue
        pending = [p for p in status_cols if not d.get(p, "").strip()]
        if pending:
            d["_pending"] = [p.replace(" Status", "") for p in pending]
            result.append(d)
            if len(result) >= limit:
                break

    return {"ok": True, "count": len(result), "rows": result}


def main():
    parser = argparse.ArgumentParser(description="Read rows from Google Sheet via REST API.")
    parser.add_argument("--sheet", choices=list(SHEET_MAP.keys()), default="blog")
    parser.add_argument("--name", type=str, required=True,
                        help="Person name (e.g. 'aniket') — tab becomes '{Name} Social' or '{Name} Blog'")
    parser.add_argument("--action", choices=["all", "row", "blog-unprocessed", "unposted"], default="blog-unprocessed")
    parser.add_argument("--row", type=int, default=None, help="Data row number (for --action row)")
    parser.add_argument("--limit", type=int, default=15, help="Max rows to return")
    args = parser.parse_args()

    sheet_name = resolve_tab(args.sheet, args.name)

    try:
        if args.action == "all":
            result = action_all(sheet_name)
        elif args.action == "row":
            if args.row is None:
                print(json.dumps({"ok": False, "error": "--row required for action=row"}))
                sys.exit(1)
            result = action_row(sheet_name, args.row)
        elif args.action == "blog-unprocessed":
            result = action_blog_unprocessed(sheet_name, args.limit)
        elif args.action == "unposted":
            result = action_unposted_main(sheet_name, args.limit)
        else:
            result = {"ok": False, "error": f"Unknown action: {args.action}"}

        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if result.get("ok") else 1)

    except requests.HTTPError as e:
        print(json.dumps({"ok": False, "error": f"HTTP {e.response.status_code}: {e.response.text[:300]}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
