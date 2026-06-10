# Seo-li — LinkedIn Article Pipeline (v1.2)

This folder implements the **v1.2 LinkedIn Article Indexing Workflow** — Ken Research's Search Everywhere Optimization (SEO + AEO + AIO + GEO + SXO + Query Fan-Out) pipeline for generating high-quality, indexing-friendly LinkedIn Articles.

**This is NOT the same pipeline as `../linkedin/`.** The `linkedin/` folder continues to handle the legacy Pulse microblog flow with 1000-1300 word HTML + 8-9 KR interlinks + auto-publish. This `Seo-li/` folder handles full LinkedIn Articles with v1.2 structure, **exactly 1 Ken Research link**, and manual browser publishing.

---

## Files in This Folder

| File | Purpose |
|------|---------|
| `generate-blog.md` | v1.2 article generator: Executive Summary + Velocity bullets + 4 question H2s + Strategic Outlook + 1 Ken link |
| `generate-image.md` | ChatGPT DALL-E + Cloudinary cover image (reused from legacy pipeline, unchanged) |
| `generate-caption.md` | LinkedIn feed caption (<=150 words, curiosity-gap, no "link in comments") |
| `sanity-blog.md` | 17 v1.2 validation flags across SEO/AEO/AIO/GEO/SXO + fan-out 5-of-8 |
| `qa-blog.md` | v1.2 scoring rubric out of 100 with anti-pattern rejection rules |
| `repair-blog.md` | Priority-ordered repair for QA failures, max 2 attempts |
| `run-blog-batch.md` | Batch orchestrator for the shared Blogs tab |
| `post-linkedin-pulse.md` | Legacy auto-publisher (NOT used in v1.2 — publishing is manual) |
| `blog-intelligence.md` | Living knowledge file for fix history and variation log |

---

## v1.2 Key Differences vs Legacy `linkedin/` Pipeline

| Aspect | Legacy `linkedin/` | v1.2 `Seo-li/` |
|---|---|---|
| Article structure | H1 + intro + 3 body H2s + 2 CTAs + 5 FAQs + branding paragraph | Executive Summary + Velocity bullets + 4 question H2s + Strategic Outlook + 1 Ken link |
| Ken Research links | 8-9 | **exactly 1** |
| Target word count | 1000-1300 | 800-1100 |
| FAQs | 5 mandatory `<h3>` Q+A blocks | none (question-style H2 subheads instead) |
| CTA blocks | 2 `<hr><blockquote>` CTAs | none (one source line at end) |
| UTM campaign | `Automation` | `AN` |
| Output destination | shared `Blogs` Google Sheet tab + auto-publish via `post-linkedin-pulse.ts` | same shared `Blogs` Google Sheet tab + markdown files in `outputs/linkedin_articles/` + manual browser publish |
| Validation rules | sanity (6 blocks) + qa (100 pts) | sanity (17 SEO/AEO/AIO/GEO/SXO flags + fan-out 5-of-8) + qa (100 pts v1.2 rubric) |
| Feed caption | 150-300 words with bullets | <=150 words curiosity-gap, ZERO "link in comments" |
| Publishing | Automated via Playwright | Manual via browser by operator |

---

## How to Use

Skills in this folder are NOT registered superpowers skills. Read each file directly:

```
Read Seo-li/run-blog-batch.md      # orchestrator, start here for a batch
Read Seo-li/generate-blog.md       # single article generator
Read Seo-li/sanity-blog.md         # 17 v1.2 validation flags
Read Seo-li/qa-blog.md             # v1.2 scoring rubric
Read Seo-li/repair-blog.md         # repair failed QA
Read Seo-li/generate-caption.md    # LinkedIn feed caption
Read Seo-li/generate-image.md      # ChatGPT + Cloudinary cover image
```

---

## Quick Trigger Phrase

When the user says **"generate N articles"** (or "generate N seo articles"), this pipeline runs. When they say **"generate N blogs"**, the legacy `linkedin/` pipeline runs. Both coexist.

---

## Sheet Setup

Seo-li and linkedin/ both write to the shared `Blogs` Google Sheet tab using the same Blog Title/Blog Description/Blog Content/Blog Caption columns. No separate tab to create.

`scripts/sheet_write.py` aliases — `linkedin`, `seoli`, and `blog` all resolve to `Blogs`:

```python
SHEET_MAP = {
    "main": "Agentic Sheet",
    "social": "Social Media",
    "blog": "Blogs",
    "linkedin": "Blogs",
    "seoli": "Blogs",
}
```

---

## Output Files

Each generated article saves two markdown files to disk:

```
outputs/linkedin_articles/{vertical-slug}/{report-slug}.md           # article (with YAML frontmatter)
outputs/linkedin_articles/{vertical-slug}/{report-slug}_caption.md   # caption (paste-ready, no frontmatter)
```

The operator opens these files, strips the article's YAML frontmatter, pastes the body into LinkedIn's article editor, publishes, then pastes the caption into a separate LinkedIn feed post that references the article.

---

## Status

v1.2 pipeline implemented. Writes to shared `Blogs` tab. Ready to run.

---

## Spec Deviations from v1.2

This implementation diverges from the v1.2 spec in two intentional ways:

1. **File naming (§16):** Uses kebab-case slugs and drops the `_linkedin_article` suffix. Path is `outputs/linkedin_articles/{vertical-slug}/{report-slug}.md` instead of spec's `outputs/linkedin_articles/{vertical_slug}/{report_slug}_linkedin_article.md`. Reason: shorter, cleaner paths consistent with kebab-case used elsewhere in the codebase.
2. **Sheet destination:** Shares the `Blogs` Google Sheet tab with the legacy `linkedin/` pipeline instead of using a dedicated tab. Reason: operator decision to unify schemas across both pipelines (2026-05-28).

All other rules (em-dash ban, bold-stat rule, QA-88 gate, 800-1100 word range, 14k char ceiling, Jaccard dedup, ChatGPT cover image) are stricter extensions of v1.2, not deviations.

---

## Research Basis (v1.2 §3I)

Pipeline rules derive from:
- Google Search Central: AI features and your website
- Google Search Central: Optimizing your website for generative AI features
- Google Search Central: Creating helpful, reliable, people-first content
- Google Search Central: Spam policies for Google web search
- Google Search Central: Core Web Vitals and page experience
- Google Search Central: Site reputation abuse clarification
- Search Engine Land: Query fan-out optimization guidance
- Semrush: Search Everywhere Optimization framework

Operational interpretation: AEO/GEO are SEO quality extensions, not shortcuts. Strongest durable pattern = expert, entity-rich, non-commodity content technically discoverable. For third-party platforms, platform fit + unique angles beat volume distribution.

---

## Success Metrics (tracked outside the sheet)

The shared `Blogs` tab does NOT carry monitoring columns. Track these externally if needed:
- LinkedIn indexing (Google search operators after 24-72h)
- AI Overview / LLM mentions (manual prompt checks)
- GSC impressions/clicks for Ken Research report URL
- GA4 referral sessions from linkedin.com
- Sample/download/discuss form leads
- Fan-out angle count (from sanity Block 7.2)
- Duplicate Jaccard score (from sanity Block 7.3)

---

## What Seo-li Does NOT Do (Out of Scope)

- **Other platforms** (Medium / Blogger / Hashnode / HackMD) — Seo-li is LinkedIn Articles only. Spec §7 platform routing is not implemented; build a separate pipeline if needed.
- **Automated indexing API** — banned by v1.2 §3 for LinkedIn URLs.
- **Auto-publishing** — publishing is manual via browser; `post-linkedin-pulse.ts` is NOT invoked.
