# Implementation Plan — SEO Execution Model → LinkedIn Blog Pipeline

**Source doc:** `Ken_Research_SEO_Execution_Model.pdf` (v1.0, May 2026)
**Target:** the LinkedIn blog pipeline (`linkedin/` skills: `generate-blog.md`, `qa-blog.md`, `sanity-blog.md`, `repair-blog.md`)
**Test surface:** validate every change in `testing-demo/` first, then port to `linkedin/`.
**Status:** Plan only. No pipeline files changed yet.

---

## 1. Objective

Apply the *applicable* parts of the SEO Execution Model to the blog generator so each article is **intent-complete, anchor-diverse, and vertical-targeted** — WITHOUT breaking the enforced quality gates that already make these blogs publishable.

---

## 2. Scope

### In scope (PDF parts that apply to blog CONTENT)
- §7 Page Breakdown — structured market/buyer/intent brief
- §8–11 Keyword Cluster → Section mapping — lock the 4 body segments to money intents
- §16 Anchor Text Strategy — diversify interlink anchors
- §22 CTA Mapping by Market Type — vertical → service CTA
- §21 Page Upgrade Requirements — used as a WARN-level completeness checklist only

### Out of scope (separate SEO system, NOT the blog)
- §5–6 Page selection — picks which kenresearch.com page to optimize
- §12–15 Niche citation engine — off-site link building for report pages
- §17–19, §24 Daily/weekly/monthly cadence + tracker — SEO ops workflow
- §20 Internal linking FROM other KR pages — a site-CMS task
- §23 Outreach pitch templates — citation engine
- §25 Ken Niche Citation Agent — a separate future automation tool

> If the citation engine (§12–25) is wanted, it is a **second project** with its own sheet tab and skills — not part of this blog plan.

---

## 3. Hard constraints (MUST NOT break)

Enforced by `sanity-blog.md` + `qa-blog.md` before any sheet write. The PDF fits INSIDE these — it never overrides them.

| Gate | Rule | Source |
|---|---|---|
| Word count | 1000–1300, CRITICAL FAIL over 1300 | sanity 4.1 |
| CTA blocks | exactly 2 `<hr><blockquote>` (no `div.cta-block`) | sanity 2.6 |
| Total links | 8–9 (KR + external combined), all with UTM | sanity 3.1 |
| External links | 0–2, government only, body text only | sanity 3.9 |
| FAQs | exactly 5, each ≥2 stats | sanity 2.5 |
| Question H2 | exactly 1 H2 ending in `?` | sanity 2.7 |
| KR mentions | 3–5 in body | sanity 4.2 |
| Every H2 | must contain a data figure | sanity 4.13 |
| Em/en dashes | zero anywhere | sanity pre-check |

**Core principle: REPURPOSE existing slots, do not APPEND new ones.** No new sections, no extra CTAs, no word-count inflation.

---

## 4. Phased rollout

Each phase = one isolated change, tested in `testing-demo` on a real URL, then ported to `linkedin`.

### Phase 1 — §7 Page Breakdown brief (foundation)
- **File:** `generate-blog.md` → Step 2 (Research Market Data)
- **Change:** extend the existing research JSON with structured fields:
  `industry, market_name, country, main_buyer, primary_kw, secondary_kw, commercial_intent, competitor_type`
- **Why:** deterministic inputs for Phase 2 (section intent) and Phase 4 (CTA). No output change yet.
- **Acceptance:** JSON contains all 8 fields; existing sanity/QA still pass unchanged.

### Phase 2 — Lock the 4 segments to §8–11 intents
- **File:** `generate-blog.md` → Step 6 (LOCKED HTML STRUCTURE)
- **Change:** keep 4 segments + "What X Must Do" exactly as-is structurally, but bind their TOPICS:
  - Segment 1 → **Market Size & Forecast** (size + forecast groups)
  - Segment 2 → **Market Segmentation** (segmentation group — currently weakest)
  - Segment 3 (mandatory `?` H2) → **Competitive Landscape & Key Players**
  - Segment 4 (forward-looking) → **Trends & Growth Drivers**; fold **regional comparison** into one bullet or an FAQ
- **Why:** guarantees every blog covers the high-value intents instead of free-form pattern headings.
- **Acceptance:** word count still ≤1300; every H2 still has a number; 1 question H2; sanity PASS.

### Phase 3 — §16 anchor-text variation
- **Files:** `generate-blog.md` (Step 6 interlink plan) + `sanity-blog.md` (new check)
- **Change:** when assigning the 8–9 interlinks, vary anchor TYPE toward the §16 mix
  (exact 25% / country+market 20% / report-intent 15% / research 15% / brand+market 10% / generic 10% / naked 5%).
  Add a WARN check: flag if >50% of KR anchors are exact-match.
- **Why:** real SEO miss today — anchors skew exact-match; this looks more natural and ranks better.
- **Acceptance:** link count stays 8–9; all UTM intact; new WARN fires only on over-optimized anchors.

### Phase 4 — §22 vertical → CTA mapping
- **File:** `generate-blog.md` → Step 6 CTA block
- **Change:** CTA 2 wording selected by `industry` (Phase 1 field) via lookup:
  Technology→"Customized Technology Market Assessment", Consumer goods→"Brand Perception Study",
  Healthcare→"Market Access Study", Logistics→"Supply Chain Benchmarking", Education→"Demand Assessment",
  Retail→"Consumer Behavior Study", BFSI→"Customer Experience Study", Real estate→"Feasibility Assessment",
  Automotive→"Dealer/Customer Voice Study", Energy→"Market Opportunity Assessment".
  Still exactly 2 blockquote CTAs — only the wording changes.
- **Why:** sharper lead-gen; ties the article to the right Ken service.
- **Acceptance:** still exactly 2 CTAs in blockquote format; CTA 2 anchor in `<strong>`; sanity PASS.

### Phase 5 — §21 completeness checklist (WARN-level)
- **File:** `qa-blog.md`
- **Change:** add a non-blocking checklist scoring coverage of: size, segmentation, competitive,
  trends/drivers, buyer use case, FAQs, report CTA, service CTA. Feed into the existing /100 score, not as new CRITICAL fails.
- **Why:** measures intent completeness over time without rejecting otherwise-good blogs.
- **Acceptance:** score rubric still totals 100; no blog that passed before now fails purely on this.

---

## 5. Schema markup note (§21) — conditional, likely SKIP

PDF §21 lists "schema markup." LinkedIn Pulse **strips `<script>`/JSON-LD**, so Article/FAQPage schema is useless on Pulse. Only add schema if these blogs are ALSO published to a site Ken controls (WordPress/Notion). **Decision needed** before doing any schema work — default: skip for the LinkedIn surface.

---

## 6. Rollout & safety

1. Make each phase's edit in `testing-demo/` only.
2. Generate 1 blog on a real URL → run `sanity-blog.md` + `qa-blog.md` → must PASS / score ≥88.
3. Diff the output against a current `linkedin/` blog to confirm no regression.
4. Only after PASS, port the identical edit to `linkedin/`.
5. One phase at a time — never stack two unverified edits.

---

## 7. Open decisions (need your call)

- [ ] **Schema markup** — skip (LinkedIn-only) or include (multi-platform publishing)?
- [ ] **Regional comparison** — bullet inside Segment 4, or an FAQ?
- [ ] **Citation engine (§12–25)** — build as a separate project later, or leave out entirely?
- [ ] **Order** — start with Phase 3 (anchor variation, fastest SEO win) or Phase 1→5 in sequence?
