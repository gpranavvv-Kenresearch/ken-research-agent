# LinkedIn Blog Generation — Dedicated Subfolder

This folder contains the complete pipeline for generating and publishing blog articles specifically for **LinkedIn Pulse**.

All files are copied from `skills/` at the time this subfolder was created (2026-05-21) and will be customised independently for LinkedIn-specific requirements.

---

## Files in This Folder

| File | Purpose |
|------|---------|
| `generate-blog.md` | Core blog generation pipeline (scrape → research → image → HTML → QA → sheet write) |
| `generate-image.md` | ChatGPT DALL-E + Cloudinary cover image generation |
| `post-linkedin-pulse.md` | Playwright-based LinkedIn Pulse article publisher |
| `run-blog-batch.md` | Batch orchestrator: picks rows, generates, publishes |
| `sanity-blog.md` | Pre-sheet quality gate — all structural checks before writing to sheet |
| `qa-blog.md` | LinkedIn-specific QA scorer — scores article out of 100, blocks below 88 |
| `repair-blog.md` | LinkedIn-specific repair — fixes all QA failures using fact bank, priority-ordered |
| `blog-intelligence.md` | Living knowledge file: fix history, variation log, standing rules |

---

## How to Use (from CLAUDE.md rules)

Skills in this subfolder are **NOT registered superpowers skills** — use the `Read` tool directly:

```
Read skills/linkedin/run-blog-batch.md        # to run a batch
Read skills/linkedin/generate-blog.md        # to generate a single blog
Read skills/linkedin/post-linkedin-pulse.md  # to publish to Pulse only
Read skills/linkedin/sanity-blog.md          # pre-sheet quality gate (structural)
Read skills/linkedin/qa-blog.md              # QA scorer — returns JSON score/100
Read skills/linkedin/repair-blog.md          # post-QA repair — fixes critical issues
```

---

## Status

Prompts are currently identical to the parent `skills/` folder.
LinkedIn-specific customisation will be added in subsequent iterations.
