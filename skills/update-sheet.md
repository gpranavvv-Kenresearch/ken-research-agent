# Skill: Update Sheet Row

Use this skill to write posting results back to the Google Sheet after each post.
Uses `sheet_write.py` — direct Sheets API, fast, no Apps Script overhead.

---

## Command Format

```
python scripts/sheet_write.py --sheet <alias> --row <data_row> --updates-file <path>
```

| Alias | Tab |
|-------|-----|
| `social` | Social Media |
| `blog` | Blogs |
| `main` | Agentic Sheet |

Always write updates to a temp JSON file first, then call the script.

---

## For X (Twitter) — sheet: `social`

### On success:
```json
{
  "X Post": "<tweet text>",
  "X Post URL": "<posted url>",
  "X Status": "posted",
  "xBatch": "<batch label>",
  "lastPostedX": "<IST timestamp e.g. 2026-05-05 10:30:00 IST>"
}
```
```
python scripts/sheet_write.py --sheet social --row <data_row> --updates-file C:/tmp/x_updates_<row>.json
```

### On error:
```json
{
  "X Status": "error",
  "X Error": "<error message>"
}
```
```
python scripts/sheet_write.py --sheet social --row <data_row> --updates-file C:/tmp/x_updates_<row>.json
```

---

## For Facebook — sheet: `social`

### On success:
```json
{
  "FB Post": "<post text>",
  "FB Post URL": "<posted url>",
  "FB Status": "posted",
  "fbBatch": "<batch label>",
  "lastPostedFb": "<IST timestamp>"
}
```
```
python scripts/sheet_write.py --sheet social --row <data_row> --updates-file C:/tmp/fb_updates_<row>.json
```

### On error:
```json
{
  "FB Status": "error",
  "FB Error": "<error message>"
}
```

---

## For LinkedIn — sheet: `social`

### On success:
```json
{
  "LinkedIn Post": "<post text>",
  "LinkedIn Post URL": "<posted url>",
  "LinkedIn Status": "posted",
  "liBatch": "<batch label>",
  "lastPostedLi": "<IST timestamp>"
}
```
```
python scripts/sheet_write.py --sheet social --row <data_row> --updates-file C:/tmp/li_updates_<row>.json
```

### On error:
```json
{
  "LinkedIn Status": "error",
  "LinkedIn Error": "<error message>"
}
```

---

## Generic Update (any columns, any sheet)
```json
{ "column_name": "value", ... }
```
```
python scripts/sheet_write.py --sheet <alias> --row <data_row> --updates-file C:/tmp/updates_<row>.json
```

---

## IST Timestamp

Generate before writing:
```
python -c "from datetime import datetime,timezone,timedelta; ist=timezone(timedelta(hours=5,minutes=30)); print(datetime.now(ist).strftime('%Y-%m-%d %H:%M:%S IST'))"
```

## Notes
- `row` = data row number (1-based, row 1 = first row after header)
- Always use `--updates-file` for any payload containing post text (can be long)
- Response JSON: `{"ok": true, "sheet": "Social Media", "updatedCells": N}`
- Exit 0 = success, exit 1 = error
