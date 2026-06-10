# Skill: Read Sheet — Pick Unposted Rows

Use this skill to fetch unposted rows from the Google Sheet.
Uses Apps Script Web App — instant HTTP call, no Python needed.

---

## Base URL
```
https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec
```

## Step 1: Fetch Unposted Rows

Call GET:
```
{BASE_URL}?action=unposted
```

This returns JSON with up to 15 rows where any platform status is empty. Each row includes:
- `_dataRow` — data row number (use this for updates)
- `_sheetRow` — actual sheet row number
- `targetUrl`, `title`, `Name`
- All status columns
- `_pending` — array showing which platforms need posting (e.g. `["X","FB","LI"]`)

## Step 2: Get Single Row Details (optional)

Call GET:
```
{BASE_URL}?action=row&n=<data_row>
```

Returns full JSON for one row.

## Step 3: Read All Rows (optional)

Call GET:
```
{BASE_URL}?action=read
```

Returns all rows with headers.

---

## Output

Return a structured list of up to 15 unposted rows with:
- **data row number** (`_dataRow`)
- **targetUrl**
- **title**
- **Name** (account nickname)
- **pending platforms** (`_pending` array)

---

## Important Notes
- Use `WebFetch` to call the URL — it's a simple GET request
- Response is JSON — parse it directly
- **Fallback:** If Web App is down, use `python sheet.py read`
- Row numbers from `_dataRow` are used directly in update operations
