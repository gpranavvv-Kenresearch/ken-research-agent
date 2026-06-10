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

try:
    import requests
    from google.oauth2 import service_account
    import google.auth.transport.requests as google_requests
except ImportError:
    print(json.dumps({"ok": False, "error": "Missing dependencies. Run: pip install google-auth requests"}))
    sys.exit(1)

SPREADSHEET_ID = "1p_N3zzJbUx-7t8sjuAtbQsHaUfVmYxytQU_gDd2MGwQ"
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "service_account.json")
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

SHEET_MAP = {
    "main": "Agentic Sheet",
    "blog": "Blogs",
}

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
    for i, h in enumerate(headers):
        d[h] = row[i] if i < len(row) else ""
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
    parser.add_argument("--action", choices=["all", "row", "blog-unprocessed", "unposted"], default="blog-unprocessed")
    parser.add_argument("--row", type=int, default=None, help="Data row number (for --action row)")
    parser.add_argument("--limit", type=int, default=15, help="Max rows to return")
    args = parser.parse_args()

    sheet_name = SHEET_MAP[args.sheet]

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
