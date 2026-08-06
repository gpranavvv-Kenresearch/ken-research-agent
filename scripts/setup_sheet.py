"""
One-time script: creates all 22 tabs (Social + Blog) for each team member
in the shared Google Sheet, with correct column headers.

Run from the agents/ directory:
  python scripts/setup_sheet.py
"""

import json, os, sys
from google.oauth2 import service_account
from googleapiclient.discovery import build

# ── Config ────────────────────────────────────────────────────────────────────

SHEET_ID = "1ZTgKCRs6Hcmi4pymYa6pZOerxX5cqT23FS1Z8c-RwJU"

SA_PATH = os.path.join(os.path.dirname(__file__), "..", ".accounts", "google-service-account.json")

TEAM = [
    "Krishi", "Sameeksha", "Aniket", "Vansh", "Abhinav",
    "Hritika", "Meenakshi", "Sanya", "Shivani", "Vijay", "Shrey",
]

SOCIAL_HEADERS = [
    "targetUrl", "Title", "Name", "Format", "Submitted At", "Priority", "Platforms",
    "X Post", "X Post URL", "X Status", "X Batch", "X Error", "lastPostedX",
    "FB Post", "FB Post URL", "FB Status", "FB Batch", "FB Error", "lastPostedFb",
    "LinkedIn Post", "LinkedIn Post URL", "LinkedIn Status", "LI Batch", "LinkedIn Error", "lastPostedLi",
]

BLOG_HEADERS = [
    "targetUrl", "Blog Title", "Name", "Format", "Custom Prompt", "Submitted At",
    "Blog Description", "Blog Caption", "Cover Image URL", "Blog Content", "Rating", "Platforms",
    # Shared blog-posting slots — every blog platform posts through these same
    # 2 slots per row (max 2 platforms/row), instead of a dedicated column set
    # per platform, so one row promotes 2 distinct platforms, not all of them.
    "Blog Platform 1", "Blog URL 1", "Blog Platform 2", "Blog URL 2",
    "Blog Status", "Blog Batch", "Blog Error", "Last Posted Blog",
]

# ── Auth ──────────────────────────────────────────────────────────────────────

def get_service():
    creds = service_account.Credentials.from_service_account_file(
        SA_PATH,
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)

# ── Helpers ───────────────────────────────────────────────────────────────────

def existing_tabs(service):
    meta = service.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
    return {s["properties"]["title"] for s in meta["sheets"]}

def create_tab(service, title, existing):
    if title in existing:
        print(f"  [!] Already exists - skipping: {title}")
        return None
    return {"addSheet": {"properties": {"title": title}}}

def write_headers(service, tab_title, headers):
    body = {"values": [headers]}
    service.spreadsheets().values().update(
        spreadsheetId=SHEET_ID,
        range=f"'{tab_title}'!A1",
        valueInputOption="RAW",
        body=body,
    ).execute()

def bold_header_row(service, sheet_id_int):
    return {
        "repeatCell": {
            "range": {"sheetId": sheet_id_int, "startRowIndex": 0, "endRowIndex": 1},
            "cell": {
                "userEnteredFormat": {
                    "textFormat": {"bold": True},
                    "backgroundColor": {"red": 0.91, "green": 0.94, "blue": 0.98},
                }
            },
            "fields": "userEnteredFormat(textFormat,backgroundColor)",
        }
    }

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"\n[*] Connecting to sheet: {SHEET_ID}\n")
    service = get_service()
    existing = existing_tabs(service)
    print(f"   Found {len(existing)} existing tab(s): {', '.join(sorted(existing)) or 'none'}\n")

    # Build addSheet requests for missing tabs
    add_requests = []
    tabs_to_create = []
    for name in TEAM:
        for suffix, _ in [("Social", SOCIAL_HEADERS), ("Blog", BLOG_HEADERS)]:
            title = f"{name} {suffix}"
            req = create_tab(service, title, existing)
            if req:
                add_requests.append(req)
                tabs_to_create.append(title)

    if add_requests:
        print(f"   Creating {len(add_requests)} new tab(s)…")
        service.spreadsheets().batchUpdate(
            spreadsheetId=SHEET_ID,
            body={"requests": add_requests},
        ).execute()
        print(f"   [OK] Tabs created.\n")
    else:
        print("   All tabs already exist.\n")

    # Write headers + bold formatting to every tab
    meta = service.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
    tab_map = {s["properties"]["title"]: s["properties"]["sheetId"] for s in meta["sheets"]}

    format_requests = []
    print("   Writing headers…")
    for name in TEAM:
        for suffix, headers in [("Social", SOCIAL_HEADERS), ("Blog", BLOG_HEADERS)]:
            title = f"{name} {suffix}"
            write_headers(service, title, headers)
            format_requests.append(bold_header_row(service, tab_map[title]))
            print(f"     [+] {title}  ({len(headers)} columns)")

    # Apply bold formatting in one batch call
    service.spreadsheets().batchUpdate(
        spreadsheetId=SHEET_ID,
        body={"requests": format_requests},
    ).execute()

    print(f"\n[DONE] {len(TEAM) * 2} tabs ready with headers.\n")
    print("   NOTE: Make sure the service account email has Editor access to this sheet.")
    print("   Service account JSON:", os.path.abspath(SA_PATH))

if __name__ == "__main__":
    main()
