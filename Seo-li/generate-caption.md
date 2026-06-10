# Skill: Generate LinkedIn Article Caption (Seo-li v1.2)

Generates a short LinkedIn feed caption that promotes the published LinkedIn Article. Called from `Seo-li/generate-blog.md` Step 10.

**Critical: this is NOT the article body.** The caption is a teaser designed to make users click the LinkedIn Article. The article is the depth layer; the caption is the hook.

---

## Inputs

- `articleTitle` — the LinkedIn Article title (H1)
- `factBank` — structured fact bank from research (market name, key stat, contrarian angle, regulator, audience)
- `strategicOutlook` — the 2-3 sentence Strategic Outlook from the article (informs the curiosity gap)

---

## Caption Writing Rules

```json
{
  "max_word_count": 150,
  "style": "punchy_conversational_b2b",
  "opening_line": "must_create_curiosity",
  "paragraph_length": "1_to_2_lines",
  "must_include_market_tension": true,
  "must_include_specific_question": true,
  "must_avoid_external_link_comment_cta": true,
  "must_not_use_full_analysis_linked_in_comments": true,
  "must_push_reader_to_open_linkedin_article": true
}
```

### Hard caps
- Word count: **<= 150 words**
- Em/en dashes: ZERO
- Hashtags: 5-7
- Specific question: exactly 1
- External URLs in caption body: 0 (the LinkedIn Article itself is the destination)

---

## Caption Structure (mandatory format)

```text
[LINE 1 = HARD STAT + URGENCY MARKER — must hook in the LinkedIn preview window]

[LINE 2 = a second stat OR a deadline/timeframe — reinforces urgency before "see more" cut-off]

[Market/category + why this matters in 1-2 short lines]

[Main tension or bottleneck — 1-2 lines]

[Question that invites opinion or makes the reader choose a side]

[Soft article-click CTA]

[5-7 hashtags]
```

Mobile-first paragraphing. Each "paragraph" is 1-2 short lines, blank line between. No walls of text.

### THE 200-CHAR RULE (CRITICAL)

LinkedIn truncates feed captions at ~210 characters (about 3 lines on mobile) before the "...see more" link. **Everything that hooks the reader MUST sit in the first 200 characters.**

Hard requirements for line 1 + line 2 combined (the visible-without-clicking zone):
- MUST contain at least 1 hard data figure (currency, %, year, multiplier)
- MUST contain at least 1 urgency marker (a year, deadline, "by 2026", "before X", "now", "lands in", "ticking")
- MUST avoid generic openers like "Did you know", "In today's world", "Let me explain"
- MUST NOT bury the stat in line 3 or later

---

## Allowed Soft CTAs (pick ONE)

```text
I've broken this down in the full LinkedIn Article.
I explored the market signals behind this in the article.
The full article covers what this means for suppliers, investors, and market-entry teams.
Read the article to see where the opportunity is really opening up.
I've mapped the key growth signals inside the article.
```

---

## BANNED CTAs (REJECT if present)

```text
Full analysis linked in comments.
Click the link in comments.
Check comments for the full report.
Download the full analysis now.
Link in bio.
DM me for the report.
```

The caption should drive the reader INTO the LinkedIn Article (which lives on the same surface), not to a separate URL.

---

## Opening-Line Patterns (DATA + URGENCY first)

Pick a pattern where line 1 = stat, line 2 = deadline/urgency. The preview window (~200 chars) MUST contain both.

```text
PATTERN A — Money + Year
USD {X}B today. USD {Y}B by {forecast year}.
{Policy/event} lands in {year}.

PATTERN B — Multiplier + Deadline
{Market} is on track to {N}x by {year}.
The window for {action} closes in {year}.

PATTERN C — Share + Inflection
{X}% of {market} controlled by {N} players.
That changes in {year} when {trigger}.

PATTERN D — Growth + Risk
{Market} growth: {CAGR}%.
{Cost/regulation/constraint} growth: {higher figure}%.
The gap closes in {year}.

PATTERN E — Counter-stat
Everyone watches {obvious metric}: {figure}.
The number that actually moves margin: {hidden figure}, by {year}.
```

Hard bans for line 1:
- Generic ("Did you know", "Have you ever wondered", "Let me share")
- Conceptual without numbers ("X's next big shift", "The real story")
- Vague time markers without a year ("Soon", "Coming up", "On the horizon")
- Brand-led ("At Ken Research, we...", "Our latest report shows...")

---

## Banned Phrases in Caption Body

Same AI-fluff ban as the article:
- "in today's fast-paced world"
- "delve deep" / "delve into"
- "revolutionizing"
- "dynamic landscape"
- "testament to"
- "game changer"
- "unlock potential"
- "cutting-edge"
- "robust ecosystem"

Plus caption-specific bans:
- "Stay tuned"
- "Don't miss out"
- "Spoiler alert"
- "You won't believe"

---

## Claude Prompt for Caption Generation

When the controller invokes this skill, pass this prompt:

```text
Generate a short LinkedIn feed caption to promote the LinkedIn Article titled:

"{articleTitle}"

Market: {market_name}
Contrarian angle: {one-sentence summary of the article's main insight}
Key stat to hint at: {one striking number from the fact bank}
Target audience: {audience list from fact bank}

Rules:
1. Under 150 words.
2. **LINE 1 MUST be a hard data figure (USD, %, year, multiplier).** LINE 2 MUST add a second stat or a deadline. The first 200 characters (line 1 + line 2) are the only zone LinkedIn shows before the "...see more" cut-off, so the hook MUST sit there. No conceptual or vague opener.
3. Punchy, mobile-first paragraphs (1-2 lines each, blank line between).
4. Choose one opening pattern from Seo-li/generate-caption.md (PATTERN A-E). All are data + urgency driven.
5. DO NOT summarize the article. Build curiosity around the market opportunity, bottleneck, or strategic tension AFTER the data hook lands.
6. Include exactly 1 specific question that invites expert opinion.
7. NEVER write "full analysis linked in comments" or "link in comments" or any variation.
8. Use one of the approved soft CTAs (see Seo-li/generate-caption.md).
9. End with 5-7 relevant hashtags.
10. Zero em dashes or en dashes (use commas, colons, periods).
11. No banned AI fluff phrases.
12. No conceptual openers like "X's next big shift may not be...", "The real story is...", "Everyone is watching X but...". These bury the stat.

Return only the caption text. No prefix, no metadata, no explanation.
```

---

## Example Caption (v1.2 reference — data + urgency lead)

```text
USD 98.5M today. USD 197.6M by 2030. 12.3% CAGR.

Vietnam's mycorrhizal biofertilizer market is doubling in five years, and Decree 84/2019 is rewriting who can sell what by 2026.

The Mekong Delta's export-grade rice and fruit cultivation is driving the demand signal.

But the real bottleneck is not product availability. It is farmer trust, education, and last-mile distribution.

For agri-input vendors, sustainable farming investors, and Southeast Asia market entry teams:

Where does the next pricing advantage sit, product quality, distribution reach, or farmer awareness?

I've mapped the full market signal stack inside the article.

#Vietnam #Agritech #Biofertilizer #SoutheastAsia #SustainableFarming #MarketResearch #KenResearch
```

What works here:
- Line 1 = three hard stats, no preamble. Reader sees the size + growth instantly in the LinkedIn preview window.
- Line 2 = market name + an explicit deadline ("by 2026") for urgency.
- Lines 3-4 = tension after the data has already landed.
- Word count ~125. One question. One soft CTA. 7 hashtags. No em dashes. No "link in comments".

---

## Validation Checklist (before save)

```text
[ ] Caption is under 150 words
[ ] Caption has zero em/en dashes
[ ] LINE 1 contains a hard data figure (USD, %, year, multiplier, or "Nx")
[ ] LINE 1 + LINE 2 fit inside ~200 characters (the LinkedIn preview cut-off)
[ ] LINE 2 contains either a second stat OR a year/deadline urgency marker
[ ] Opening uses PATTERN A-E (no conceptual / "next big shift" / "real story" openers)
[ ] Mobile-first paragraphing (1-2 lines per block, blank lines between)
[ ] Includes one specific question
[ ] Uses one approved soft CTA
[ ] Does NOT use any banned CTA phrase
[ ] 5-7 hashtags present
[ ] No external URLs in body
[ ] No banned AI fluff phrases
[ ] No "best/top/leading" promotional claims
```

Run these via the inline Python sanity helper in `Seo-li/sanity-blog.md` Block 9.

---

## Output

Save the caption as a separate markdown file alongside the article:

```
outputs/linkedin_articles/{vertical-slug}/{report-slug}_caption.md
```

The caption file has NO YAML frontmatter — it is paste-ready content only.

The article file has YAML frontmatter for tracking. The caption file does not.

---

## Operator Use

After the LinkedIn Article is published via browser:
1. Operator copies the article URL from LinkedIn
2. Operator creates a NEW LinkedIn feed post
3. Operator pastes the caption from `..._caption.md` into the feed post
4. Operator attaches/references the Linkedin Pulse URL in the feed post (LinkedIn auto-renders the article preview card)
5. Operator publishes the feed post

The caption is what users see in the LinkedIn feed. The article preview card (auto-generated by LinkedIn) is what they click. The caption + preview card together drive article reads.
