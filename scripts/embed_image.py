"""
Usage: python embed_image.py <row> <cloudinary_url> <market_name>
Embeds image in Blog Content and updates sheet.
"""
import sys, requests, re

BASE = "https://script.google.com/macros/s/AKfycbwo76GWlzINViUVE-EAsLiHCFH-wXjrsk_ieMA0oRM374mTPIsj_I-_kbaIEmH6Bq6OEw/exec"

row = int(sys.argv[1])
img_url = sys.argv[2]
market_name = sys.argv[3]

resp = requests.get(f"{BASE}?action=blog-row&n={row}")
data = resp.json()
content = data.get("Blog Content", "")
if not content or len(content) < 50:
    print(f"ERROR: No blog content for row {row}")
    sys.exit(1)

img_tag = f"<img src='{img_url}' alt='{market_name}'>\n"

# Remove existing cover img if present (re-run safe)
content = re.sub(r"<img src='https://res\.cloudinary[^']*'[^>]*>\n?", '', content)

# Insert image before <h1>
if '<h1>' in content:
    updated = re.sub(r'(<h1>)', img_tag + r'\1', content, count=1)
else:
    updated = img_tag + content

payload = {"action": "blog-update", "row": row, "updates": {"Blog Content": updated}}
r = requests.post(BASE, json=payload)
result = r.json()
print(f"Row {row} ({market_name}): {result}")
