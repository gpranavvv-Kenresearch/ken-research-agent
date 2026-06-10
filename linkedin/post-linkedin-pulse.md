# Skill: Post to LinkedIn Pulse (Article)

Publish a long-form blog article on LinkedIn as a LinkedIn Article (Pulse).

---

## Inputs
- `blogTitle` — generated blog title
- `blogContent` — full blog text (1200-1800 words)
- `account` — object with: nickname, email, password
- `rowNumber` — blog sheet data row number (1-based)

## Browser Rule
Uses Playwright MCP (Google Chrome). One fresh browser per post. Navigate → use → close. Always.

---

## Step 0: Validate
- If email or password is blank → return error
- If blogTitle or blogContent is blank → return error: "Blog not generated yet"

---

## Step 1: Login to LinkedIn

1. `browser_navigate` → `https://www.linkedin.com/login`
2. `browser_snapshot` → see login page
3. `browser_type` → enter email
4. `browser_type` → enter password
5. `browser_click` → "Sign in"
6. `browser_snapshot` → wait for home feed (up to 15s)

**Login failure / checkpoint / CAPTCHA:**
→ `browser_close` → return error

---

## Step 2: Navigate to Article Editor

1. `browser_navigate` → `https://www.linkedin.com/article/new/`
   (This directly opens the LinkedIn article editor)
2. `browser_snapshot` → wait for the article editor to load
3. Verify you see the editor with a title field and body area

**If editor doesn't load:**
Try alternative path:
1. Go to `https://www.linkedin.com/feed/`
2. Click "Write article" button (usually below the post composer)
3. `browser_snapshot` → verify editor loaded

---

## Step 3: Write Article Title

1. `browser_click` → click the Title field (top of editor, placeholder "Title" or "Headline")
2. `browser_type` → type the blog title exactly as stored in the sheet
3. Wait 1 second, take snapshot to confirm title is entered

---

## Step 4: Write Article Body (Render → Copy → Paste Trick)

LinkedIn's article editor does NOT accept raw HTML tags — pasting `<h2>Title</h2>` shows literal tag text. Use this technique:

### Step 4a: Render HTML in a temp tab
1. Open a new browser tab → navigate to `about:blank`
2. Run this JavaScript to inject the blog HTML:
   ```js
   document.body.style.fontFamily='Arial,sans-serif';document.body.style.fontSize='16px';document.body.style.lineHeight='1.6';document.body.style.padding='20px';document.body.innerHTML=`FULL_HTML_CONTENT_HERE`;
   ```
3. `browser_press_key` → `Ctrl+A` — selects ALL rendered visual content
4. `browser_press_key` → `Ctrl+C` — copies the RENDERED rich text (not raw HTML)
5. Navigate back to the LinkedIn article tab

### Step 4b: Clear body and Paste into LinkedIn
6. Switch back to the LinkedIn article editor tab
7. `browser_click` → click ONCE in the body/content area
8. `browser_press_key` → `Ctrl+A` — select ALL existing body content (IMPORTANT: clear any old content first)
9. `browser_press_key` → `Delete` — delete any existing body content
10. Wait 1 second to confirm body is empty
11. `browser_press_key` → `Ctrl+V` — pastes rich text with headings, bullets, bold preserved
12. Wait 3 seconds
13. `browser_snapshot` → verify content rendered correctly with NO duplicates and NO agent artifacts

**If duplicates appear:** Ctrl+Z to undo, then repeat steps 7-12.

---

## Step 5: Open Manage → Settings (SEO)

1. Find the **"Manage"** button near the top right of the editor (it is a dropdown — there will also be a "Next" button next to it)
2. Click **"Manage"** to open the dropdown
3. Click **"Settings"** from the dropdown
4. A small settings panel/window will open
5. In the **SEO Title** field: enter the `Blog Title` from the sheet (it is keyword-rich with a data figure and Ken Research in middle or end — suitable as the SEO title)
   - Max 60 characters recommended; trim if Blog Title exceeds 60 chars by dropping the last clause
6. In the **SEO Description** field: enter the `Blog Description` from the sheet (max 160 chars, plain text)
7. Click **Save** to save the SEO settings
8. Take a snapshot to confirm settings were saved

---

## Step 6: Click Next

1. Click the **"Next"** button (top right of the editor)
2. A publishing panel/dialog will open
3. Take a snapshot to see the publishing options

---

## Step 7: Add Caption and Publish

1. In the publishing panel, find the caption/description field (LinkedIn often shows a text area to add a comment/caption for the article post)
2. Paste or type the **Blog Caption** from the sheet (`Blog Caption` column)
3. Click **"Publish"** button
4. Wait up to 20 seconds for the article to publish and redirect
5. Take a final snapshot and copy the published article URL from the address bar

---

## Step 8: CLOSE BROWSER
`browser_close`. Mandatory. Even on failure.

---

## Step 8: Update Sheet

Write the result to the **`Blogs`** tab via `sheet_write.py` (column names are case-sensitive — note `Linkedin`, not `LinkedIn`):

**On success:**
```
python scripts/sheet_write.py --sheet linkedin --row <data_row> --updates '{"Linkedin Pulse URL":"<article_url>","Linkedin Pulse Status":"posted","Linkedin Pulse Error":"","Linkedin Pulse Batch":"<batch_label>","lastPosted linkedin Pulse":"<IST timestamp>"}'
```

**On error:**
```
python scripts/sheet_write.py --sheet linkedin --row <data_row> --updates '{"Linkedin Pulse Status":"error","Linkedin Pulse Error":"<error_message>"}'
```

---

## Return
```
status: posted | error
account: {nickname} ({email})
articleTitle: {title}
articleUrl: {url}
error: {if failed}
```
