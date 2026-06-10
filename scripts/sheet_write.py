#!/usr/bin/env python3
"""
sheet_write.py — Fast Google Sheets writer using direct REST API.

Writes ALL columns in a single batchUpdate REST call.
Caches access token and headers to disk so subsequent calls skip expensive re-fetches.

Usage:
    # Small update (inline JSON)
    python scripts/sheet_write.py --sheet main --row 3 --updates '{"X Status":"posted","X Post URL":"https://..."}'

    # Large update — use file for Blog Content HTML to avoid shell arg limits
    python scripts/sheet_write.py --sheet blog --row 5 --updates-file C:/tmp/blog_updates.json

Sheet aliases:
    main      ->  Agentic Sheet
    social    ->  Social Media
    blog      ->  Blogs
    linkedin  ->  Blogs

Row numbering:
    --row is the data row (1-based, not counting header row).
    Row 1 = first data row = sheet row 2.

Output:
    JSON on stdout: {"ok": true, "updatedCells": N, "updatedRanges": M}
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
    print(json.dumps({
        "ok": False,
        "error": "Missing dependencies. Run: pip install google-auth requests"
    }))
    sys.exit(1)

SPREADSHEET_ID = "1p_N3zzJbUx-7t8sjuAtbQsHaUfVmYxytQU_gDd2MGwQ"
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "service_account.json")
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

SHEET_MAP = {
    "main": "Agentic Sheet",
    "social": "Social Media",
    "blog": "Blogs",
    "linkedin": "Blogs",
    "seoli": "Blogs",
}

BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"

# Disk cache paths (tokens last 1 hour, headers rarely change)
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")
TOKEN_CACHE = os.path.join(CACHE_DIR, "gsheet_token.json")
HEADERS_CACHE = os.path.join(CACHE_DIR, "gsheet_headers.json")
HEADERS_TTL = 3600  # re-fetch headers after 1 hour


def _ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)


def _load_json(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_json(path: str, data: dict):
    _ensure_cache_dir()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


def get_token() -> str:
    """Return a valid Bearer token, using disk cache to avoid re-fetching every run."""
    cached = _load_json(TOKEN_CACHE)
    now = time.time()
    # Use cached token if it has more than 60 seconds left
    if cached.get("token") and cached.get("expiry", 0) - now > 60:
        return cached["token"]

    # Fetch fresh token from service account
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    creds.refresh(google_requests.Request())
    _save_json(TOKEN_CACHE, {
        "token": creds.token,
        "expiry": creds.expiry.timestamp() if creds.expiry else now + 3500,
    })
    return creds.token


def sheets_get(path: str, params: dict = None) -> dict:
    resp = requests.get(
        f"{BASE_URL}/{SPREADSHEET_ID}{path}",
        headers={"Authorization": f"Bearer {get_token()}"},
        params=params,
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()


def sheets_post(path: str, body: dict) -> dict:
    resp = requests.post(
        f"{BASE_URL}/{SPREADSHEET_ID}{path}",
        headers={"Authorization": f"Bearer {get_token()}", "Content-Type": "application/json"},
        data=json.dumps(body),
        timeout=60
    )
    resp.raise_for_status()
    return resp.json()


def col_letter(idx: int) -> str:
    result = ""
    n = idx + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result


def get_headers(sheet_name: str) -> list:
    """Return header row, using disk cache (TTL = 1 hour)."""
    cached = _load_json(HEADERS_CACHE)
    entry = cached.get(sheet_name, {})
    if entry.get("headers") and time.time() - entry.get("fetched_at", 0) < HEADERS_TTL:
        return entry["headers"]

    encoded = sheet_name.replace("'", "\\'")
    resp = sheets_get("/values:batchGet", params={
        "ranges": f"'{encoded}'!1:1",
        "majorDimension": "ROWS"
    })
    headers = resp.get("valueRanges", [{}])[0].get("values", [[]])[0]

    cached[sheet_name] = {"headers": headers, "fetched_at": time.time()}
    _save_json(HEADERS_CACHE, cached)
    return headers


def get_sheet_id(sheet_name: str) -> int:
    """Return the numeric sheetId for a given sheet name (needed for format requests)."""
    meta = sheets_get("", params={"fields": "sheets.properties"})
    for s in meta.get("sheets", []):
        if s["properties"]["title"] == sheet_name:
            return s["properties"]["sheetId"]
    raise ValueError(f"Sheet '{sheet_name}' not found in spreadsheet")


def paint_row_red(sheet_name: str, data_row: int, col_name: str = "Rating") -> dict:
    """Paint a single cell background red — used to flag blogs that failed QA after max repair attempts."""
    headers = get_headers(sheet_name)
    sheet_id = get_sheet_id(sheet_name)
    sheet_row = data_row + 1  # header = row 1

    if col_name not in headers:
        return {"ok": False, "error": f"Column '{col_name}' not found in headers"}

    col_idx = headers.index(col_name)
    row_idx = sheet_row - 1  # batchUpdate uses 0-based row index

    body = {
        "requests": [{
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": row_idx,
                    "endRowIndex": row_idx + 1,
                    "startColumnIndex": col_idx,
                    "endColumnIndex": col_idx + 1
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 1.0, "green": 0.2, "blue": 0.2}
                    }
                },
                "fields": "userEnteredFormat.backgroundColor"
            }
        }]
    }

    sheets_post(":batchUpdate", body)
    return {"ok": True, "flagged": f"{sheet_name} row {data_row} col {col_name} painted red"}


def write_updates(sheet_name: str, data_row: int, updates: dict) -> dict:
    """Write all updates in a single batchUpdate REST call (headers cached, 1 write)."""
    headers = get_headers(sheet_name)
    sheet_row = data_row + 1  # header = row 1, data_row 1 -> sheet row 2

    encoded = sheet_name.replace("'", "\\'")
    data = []
    skipped = []
    for col_name, value in updates.items():
        if col_name not in headers:
            skipped.append(col_name)
            continue
        col_idx = headers.index(col_name)
        cell_ref = f"'{encoded}'!{col_letter(col_idx)}{sheet_row}"
        data.append({
            "range": cell_ref,
            "values": [[str(value) if value is not None else ""]]
        })

    if not data:
        return {"ok": False, "error": f"No valid columns found. Skipped: {skipped}"}

    result = sheets_post("/values:batchUpdate", {
        "valueInputOption": "RAW",
        "data": data
    })

    out = {
        "ok": True,
        "sheet": sheet_name,
        "row": data_row,
        "sheetRow": sheet_row,
        "updatedCells": result.get("totalUpdatedCells", 0),
        "updatedRanges": len(data),
    }
    if skipped:
        out["skipped"] = skipped
    return out


def main():
    parser = argparse.ArgumentParser(
        description="Write to Google Sheet via direct REST API (cached token + headers)."
    )
    parser.add_argument(
        "--sheet", choices=list(SHEET_MAP.keys()), default="main",
        help="'main' = Agentic Sheet, 'social' = Social Media, 'blog' = Blogs, 'linkedin' = Blogs"
    )
    parser.add_argument(
        "--row", type=int, required=True,
        help="Data row number (1-based, not counting header)"
    )
    parser.add_argument(
        "--updates", type=str, default=None,
        help='JSON string of {"column": "value"} pairs'
    )
    parser.add_argument(
        "--updates-file", type=str, default=None,
        help="Path to JSON file with {column: value} pairs (for large Blog Content HTML)"
    )
    parser.add_argument(
        "--clear-cache", action="store_true",
        help="Delete token and header caches, force fresh fetch"
    )
    parser.add_argument(
        "--flag-red", action="store_true",
        help="Paint the Rating cell red for this row (used when blog fails QA after max repair attempts)"
    )
    args = parser.parse_args()

    if args.flag_red:
        sheet_name = SHEET_MAP[args.sheet]
        result = paint_row_red(sheet_name, args.row)
        print(json.dumps(result))
        sys.exit(0 if result.get("ok") else 1)

    if args.clear_cache:
        for f in [TOKEN_CACHE, HEADERS_CACHE]:
            if os.path.exists(f):
                os.remove(f)
        print(json.dumps({"ok": True, "cleared": True}))
        return

    if args.updates_file:
        with open(args.updates_file, "r", encoding="utf-8-sig") as f:  # utf-8-sig strips Windows BOM
            updates = json.load(f)
    elif args.updates:
        updates = json.loads(args.updates)
    else:
        print(json.dumps({"ok": False, "error": "Provide --updates or --updates-file"}))
        sys.exit(1)

    sheet_name = SHEET_MAP[args.sheet]

    try:
        result = write_updates(sheet_name, args.row, updates)
        print(json.dumps(result))
        sys.exit(0 if result.get("ok") else 1)
    except requests.HTTPError as e:
        print(json.dumps({"ok": False, "error": f"HTTP {e.response.status_code}: {e.response.text[:300]}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
