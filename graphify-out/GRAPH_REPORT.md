# Graph Report - .  (2026-05-11)

## Corpus Check
- Large corpus: 161 files · ~1,031,105 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 454 nodes · 503 edges · 111 communities (92 shown, 19 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.81)
- Token cost: 194,771 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Browser Automation Core|Browser Automation Core]]
- [[_COMMUNITY_Blog & Social Artifacts|Blog & Social Artifacts]]
- [[_COMMUNITY_Blog URL Scraper|Blog URL Scraper]]
- [[_COMMUNITY_Sheet & Batch Config|Sheet & Batch Config]]
- [[_COMMUNITY_Posting Agent Orchestration|Posting Agent Orchestration]]
- [[_COMMUNITY_Apps Script Web App|Apps Script Web App]]
- [[_COMMUNITY_XLinkedIn Posting Scripts|X/LinkedIn Posting Scripts]]
- [[_COMMUNITY_LinkedIn Pulse Posting|LinkedIn Pulse Posting]]
- [[_COMMUNITY_Cloudinary Image Pipeline|Cloudinary Image Pipeline]]
- [[_COMMUNITY_Playwright Node Sessions|Playwright Node Sessions]]
- [[_COMMUNITY_Facebook Posting Scripts|Facebook Posting Scripts]]
- [[_COMMUNITY_Account Login Handler A|Account Login Handler A]]
- [[_COMMUNITY_Account Login Handler B|Account Login Handler B]]
- [[_COMMUNITY_India Blog Image Assets|India Blog Image Assets]]
- [[_COMMUNITY_Platform Session Manager|Platform Session Manager]]
- [[_COMMUNITY_Module 15|Module 15]]
- [[_COMMUNITY_Module 16|Module 16]]
- [[_COMMUNITY_Module 17|Module 17]]
- [[_COMMUNITY_Module 18|Module 18]]
- [[_COMMUNITY_Module 19|Module 19]]
- [[_COMMUNITY_Module 20|Module 20]]
- [[_COMMUNITY_Module 21|Module 21]]
- [[_COMMUNITY_Module 58|Module 58]]
- [[_COMMUNITY_Module 59|Module 59]]
- [[_COMMUNITY_Module 60|Module 60]]
- [[_COMMUNITY_Module 61|Module 61]]
- [[_COMMUNITY_Module 62|Module 62]]
- [[_COMMUNITY_Module 99|Module 99]]
- [[_COMMUNITY_Module 100|Module 100]]
- [[_COMMUNITY_Module 101|Module 101]]
- [[_COMMUNITY_Module 102|Module 102]]
- [[_COMMUNITY_Module 103|Module 103]]
- [[_COMMUNITY_Module 104|Module 104]]
- [[_COMMUNITY_Module 105|Module 105]]
- [[_COMMUNITY_Module 106|Module 106]]
- [[_COMMUNITY_Module 107|Module 107]]
- [[_COMMUNITY_Module 108|Module 108]]
- [[_COMMUNITY_Module 109|Module 109]]
- [[_COMMUNITY_Module 110|Module 110]]

## God Nodes (most connected - your core abstractions)
1. `findElement()` - 16 edges
2. `X Posting Agent â€” End to End (CLAUDE.md)` - 16 edges
3. `saveArtifacts()` - 14 edges
4. `writeResumeFile()` - 10 edges
5. `getHeaders()` - 9 edges
6. `postToSheet()` - 9 edges
7. `write_updates()` - 9 edges
8. `doPost()` - 8 edges
9. `Blog System (Multi-Platform)` - 8 edges
10. `getSheet()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `DOM Snapshot HTML Artifact` --references--> `Playwright MCP Browser Automation`  [INFERRED]
  scripts/artifacts/dom-snapshot.html → CLAUDE.md
- `X Login Failed DOM Snapshot â€” Sanya Account` --references--> `X Watchdog Agent`  [INFERRED]
  scripts/artifacts/login-x-sanya-failed.html → agents/x-agent.md
- `X Post Row 10 â€” KSA Logistics Market` --implements--> `Tweet Generation Rules`  [INFERRED]
  scripts/artifacts/x_post_row10.txt → CLAUDE.md
- `X Post Row 10 â€” KSA Logistics Market` --references--> `Skill: post-x`  [INFERRED]
  scripts/artifacts/x_post_row10.txt → CLAUDE.md
- `Facebook Post Draft â€” India Part-Time MBA Market` --references--> `Skill: post-facebook`  [INFERRED]
  scripts/artifacts/post-tmp.txt → CLAUDE.md

## Hyperedges (group relationships)
- **Watchdog Agent Pattern: Read Artifacts â†’ Diagnose â†’ MCP Takeover â†’ Update Sheet â†’ Fix Script** — facebook_agent_md, linkedin_pulse_agent_md, x_agent_md [EXTRACTED 1.00]
- **Multi-Platform Batch Posting Pipeline: Agentic Sheet â†’ Credential Lookup â†’ Post X/FB/LI â†’ Update Sheet** — claudemd_agentic_sheet, claudemd_batch_logic, claudemd_apps_script_webapp [EXTRACTED 1.00]
- **Blog Generation and Publish Flow: Generate Blog â†’ Write Sheet â†’ Post LinkedIn Pulse/Notion** — claudemd_skill_generate_blog, claudemd_skill_run_blog_batch, claudemd_agentic_blogs_sheet [EXTRACTED 1.00]
- **Blog Generation Pipeline: Generate Image + Generate Blog + Sanity Check** — skill_generate_image, skill_generate_blog, skill_sanity_blog [EXTRACTED 0.95]
- **Social Posting Orchestration: Run Batch calls Read Sheet + Post X/FB/LI + Update Sheet** — skill_run_batch, skill_read_sheet, skill_post_x, skill_post_facebook, skill_post_linkedin, skill_update_sheet [EXTRACTED 1.00]
- **UAE Market Research Report Cluster** — x_post_row6_uae_cold_chain_market, x_post_row13_uae_diagnostic_devices_market, x_post_row14_uae_cep_market, x_post_row16_uae_medical_devices_market [INFERRED 0.85]
- **ChatGPT Image Generation Workflow for Blog 247 (Chile FM Market)** — blog247_chatgpt_chatgpt_image_generation_session, blog247_chatgpt2_generated_chile_fm_cover, chile_facility_management_market [EXTRACTED 1.00]
- **India Market Blog Article Asset Set (Hero + Leaders + Article Image)** — blog_india_market_article, india_hero_background_mumbai_skyline, india_article_image_placeholder, india_leader_ananya_sharma, india_leader_arjun_mehta, india_leader_dr_priya_iyer, india_leader_rohan_bhat, india_leader_vikram_reddy [INFERRED 0.85]
- **Indonesia Market Blog Article Asset Set (Hero + Leader + Article Image)** — blog_indonesia_market_article, indonesia_hero_background_jakarta, indonesia_article_image_port, indonesia_leader_budi_santoso [INFERRED 0.85]
- **X Platform Login Failure Sequence for Account Sanya** — login_x_sanya_failed_signin_screen, screenshot_x_account_not_exist, account_sanya_x, x_platform_posting_agent [INFERRED 0.85]
- **Ken Research Market Intelligence Output Artifacts** — ken_research_market_intelligence, south_africa_education_market_infographic, chile_facility_management_market, uae_nutritional_supplements_market [INFERRED 0.75]

## Communities (111 total, 19 thin omitted)

### Community 0 - "Browser Automation Core"
Cohesion: 0.05
Nodes (53): ARTIFACTS_DIR, closeExtraTabs(), dismissXPopups(), ensureArtifactsDir(), findElement(), pasteText(), postToSheet(), saveArtifacts() (+45 more)

### Community 1 - "Blog & Social Artifacts"
Cohesion: 0.06
Nodes (44): Blog HTML Artifact Row 6 â€” South Africa Education Market, DOM Snapshot HTML Artifact, India Article Image Asset (base64), X Login Failed DOM Snapshot â€” Sanya Account, Notion Content Artifact â€” Saudi Arabia Last Mile EV Market, Facebook Post Draft â€” India Part-Time MBA Market, South Africa Education Market Image Asset (base64), X Post Row 10 â€” KSA Logistics Market (+36 more)

### Community 2 - "Blog URL Scraper"
Cohesion: 0.13
Nodes (22): get_target_url(), main(), Reads targetUrl from each compose_blog script and writes it to the targetUrl col, find_first_blank_row(), main(), Reads today's 24 blog JSON files (blog7-30) and writes them to Agentic Blogs tab, find_first_blank_row(), main() (+14 more)

### Community 3 - "Sheet & Batch Config"
Cohesion: 0.09
Nodes (18): all, allBtns, BATCH, bottomLeft, btn, btns, candidates, CONTENT_FILE (+10 more)

### Community 4 - "Posting Agent Orchestration"
Cohesion: 0.18
Nodes (22): Apps Script Web App (Sheet API Gateway), Multi-Platform Batch Posting Schedule, Three Distinct Blog Titles Rule, Cloudinary Image Upload Pipeline, Playwright MCP Browser Automation, SERP-Based Content Priority (P1/P2/P3), sheet_write.py Direct Sheets API Script, UTM Parameter Tracking Convention (+14 more)

### Community 5 - "Apps Script Web App"
Cohesion: 0.29
Nodes (20): blogUpdate(), colIndex(), doGet(), doPost(), getBlogSheet(), getHeaders(), getSheet(), initBlogSheet() (+12 more)

### Community 6 - "X/LinkedIn Posting Scripts"
Cohesion: 0.11
Nodes (12): accounts, ARTIFACTS_DIR, autoSave, clickFirstLocator(), fillXLogin(), force, nickname, sessionFile (+4 more)

### Community 7 - "LinkedIn Pulse Posting"
Cohesion: 0.12
Nodes (14): articleUrl, BATCH, CAPTION, contentMatch, DRAFT_URL, EMAIL, HTML_CONTENT, HTML_FILE (+6 more)

### Community 8 - "Cloudinary Image Pipeline"
Cohesion: 0.25
Nodes (9): cloudinarySign(), downloadUrl(), imagePrompt, main(), OUTPUT_DIR, PROMPT_FILE, PUBLIC_ID, sleep() (+1 more)

### Community 9 - "Playwright Node Sessions"
Cohesion: 0.29
Nodes (7): { chromium }, crypto, fs, https, path, run(), sleep()

### Community 10 - "Facebook Posting Scripts"
Cohesion: 0.29
Nodes (7): { chromium }, { execSync }, fs, https, path, run(), sleep()

### Community 11 - "Account Login Handler A"
Cohesion: 0.29
Nodes (6): ACCOUNTS, askUser(), handleIfCheckpoint(), nickname, sessionFile, SESSIONS_DIR

### Community 12 - "Account Login Handler B"
Cohesion: 0.29
Nodes (6): ACCOUNTS, askUser(), handleIfCheckpoint(), nickname, sessionFile, SESSIONS_DIR

### Community 13 - "India Blog Image Assets"
Cohesion: 0.25
Nodes (8): India Market Blog Article (with Leader Profiles), India Article Image Placeholder (Magic Wand / AI Generation Icon), India Hero Background - Mumbai Skyline at Sunset, India Leader Profile - Ananya Sharma (Professional Headshot, Woman), India Leader Profile - Arjun Mehta (Professional Headshot, Man), India Leader Profile - Dr. Priya Iyer (Professional Headshot, Woman, Blue Blazer), India Leader Profile - Rohan Bhat (Professional Headshot, Young Man, Blue Blazer), India Leader Profile - Vikram Reddy (Professional Headshot, Man, Black Suit)

### Community 14 - "Platform Session Manager"
Cohesion: 0.29
Nodes (5): NICKNAME, PLATFORM, SESSION_FILE, url, URLS

### Community 15 - "Module 15"
Cohesion: 0.29
Nodes (6): ACCOUNTS, failed, loginAccount(), results, saved, SESSIONS_DIR

### Community 16 - "Module 16"
Cohesion: 0.38
Nodes (7): ChatGPT Generated Cover - Chile Facility Management Market, ChatGPT Image Generation Session - Blog 247, ChatGPT Generated Cover - UAE Nutritional Supplements Market, Chile Facility Management Market (USD 1.89B by 2030, 4.3% CAGR), Ken Research Strategic Intelligence Brand, South Africa Education Sector Market Infographic (USD 2.54B to 5.43B, 8.85% CAGR 2024-2033), UAE Nutritional Supplements Market (USD 570M, 11.5% CAGR)

### Community 17 - "Module 17"
Cohesion: 0.4
Nodes (5): Indonesia Market Blog Article (Logistics / Trade Focus), Indonesia Article Image - Container Port / Shipping Logistics, Indonesia Hero Background - Jakarta Skyline at Sunset, Indonesia Leader Profile - Budi Santoso (Professional Headshot, Senior Man), South Korea E-Commerce Logistics Market - Coupang Fulfillment Center with Drones

### Community 18 - "Module 18"
Cohesion: 0.83
Nodes (4): X Account: Sanya (Varsha_Jain1), X (Twitter) Sign-In Screen - Login Attempt for Account Sanya (Stalled at Credentials Entry), X Profile Error - Account Does Not Exist (Post-Login Navigation Failure), X (Twitter) Posting Agent Automation

### Community 20 - "Module 20"
Cohesion: 0.67
Nodes (3): Egypt Diagnostic Devices Market (Blood Gas Analyzer), UAE Diagnostic Devices Market (POC Immunoassay), UAE Medical Devices Market

## Ambiguous Edges - Review These
- `South Korea E-Commerce Logistics Market - Coupang Fulfillment Center with Drones` → `Indonesia Market Blog Article (Logistics / Trade Focus)`  [AMBIGUOUS]
  scripts/artifacts/south-korea-e-commerce-logistics-market.png · relation: semantically_similar_to

## Knowledge Gaps
- **168 isolated node(s):** `Reads targetUrl from each compose_blog script and writes it to the targetUrl col`, `ARTIFACTS_DIR`, `StepError`, `PLATFORM`, `NICKNAME` (+163 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `South Korea E-Commerce Logistics Market - Coupang Fulfillment Center with Drones` and `Indonesia Market Blog Article (Logistics / Trade Focus)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `findElement()` connect `Browser Automation Core` to `Sheet & Batch Config`, `LinkedIn Pulse Posting`, `Account Login Handler A`, `Account Login Handler B`, `Module 15`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `saveArtifacts()` connect `Browser Automation Core` to `Sheet & Batch Config`, `LinkedIn Pulse Posting`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `Reads targetUrl from each compose_blog script and writes it to the targetUrl col`, `ARTIFACTS_DIR`, `StepError` to the rest of the system?**
  _168 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Browser Automation Core` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Blog & Social Artifacts` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Blog URL Scraper` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._