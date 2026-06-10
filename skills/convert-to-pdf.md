# Skill: convert-to-pdf

Convert a blog row's HTML content into a PDF with universal UTM parameters.

## Purpose
Fetch blog HTML from the sheet, replace all UTMs with universal pdf UTMs, render via Playwright, save PDF locally, and update the sheet.

## UTM Convention
All links in the PDF use:
- `utm_source=pdf`
- `utm_medium=Referral`
- `utm_campaign=Automation`

## Steps

### Step 1 — Fetch blog content from sheet

```
GET {APPS_SCRIPT_URL}?action=blog-row&n=<row>
```

Extract `Blog Title` and `Blog Content` fields.

### Step 2 — Fix UTMs and write HTML file

Replace all UTM parameters in the content:
- Any `utm_source=*` → `utm_source=pdf`
- Any `utm_medium=*` → `utm_medium=Referral`
- Any `utm_campaign=*` → `utm_campaign=Automation`

Wrap content in full HTML document with this CSS:
```css
body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 20px 40px; color: #222; line-height: 1.7; }
h1 { font-size: 26px; color: #1a1a2e; margin-bottom: 20px; }
h2 { font-size: 20px; color: #333; margin-top: 30px; }
p { margin: 14px 0; font-size: 15px; }
img { max-width: 100%; height: auto; margin: 20px 0; border-radius: 6px; }
a { color: #0645AD; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
th { background: #f5f5f5; }
blockquote { border-left: 4px solid #0645AD; padding-left: 16px; color: #555; margin: 20px 0; }
```

Save to: `scripts/pdfs/blog_row_<N>.html`

### Step 3 — Convert HTML to PDF via Playwright

Run from `scripts/` directory (where playwright node_modules lives):

```js
const { chromium } = require('playwright');
const page = await browser.newPage();
await page.goto('file:///...path/blog_row_N.html', { waitUntil: 'networkidle' });
await page.pdf({
  path: 'scripts/pdfs/blog_row_N.pdf',
  format: 'A4',
  margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
  printBackground: true
});
```

### Step 4 — Update sheet

```
POST {APPS_SCRIPT_URL}
{
  "action": "blog-update",
  "row": <N>,
  "updates": {
    "PDF Path": "C:\\...\\scripts\\pdfs\\blog_row_N.pdf",
    "PDF Status": "generated"
  }
}
```

On error:
```json
{ "action": "blog-update", "row": N, "updates": { "PDF Status": "error", "PDF Error": "<message>" } }
```

## Notes
- Always run node from `scripts/` directory — playwright is installed there
- PDF files saved to `scripts/pdfs/` folder
- HTML temp files can be deleted after PDF is generated (optional)
- One PDF per blog row — rerun overwrites the existing file
