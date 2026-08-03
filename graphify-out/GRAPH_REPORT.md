# Graph Report - src  (2026-07-27)

## Corpus Check
- 136 files · ~130,592 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1498 nodes · 3609 edges · 95 communities (79 shown, 16 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 146 edges (avg confidence: 0.81)
- Token cost: 795,664 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Post Content Generation|Post Content Generation]]
- [[_COMMUNITY_Google Sheets IO|Google Sheets I/O]]
- [[_COMMUNITY_Account Session Dirs|Account Session Dirs]]
- [[_COMMUNITY_Content Gen & Error KB|Content Gen & Error KB]]
- [[_COMMUNITY_Error Interception & Auto-Fix|Error Interception & Auto-Fix]]
- [[_COMMUNITY_Login Portal & Account Checks|Login Portal & Account Checks]]
- [[_COMMUNITY_Account Health & Caps|Account Health & Caps]]
- [[_COMMUNITY_Login Portal ServerConfig|Login Portal Server/Config]]
- [[_COMMUNITY_Blog Platform Posters|Blog Platform Posters]]
- [[_COMMUNITY_CDP Login Pool|CDP Login Pool]]
- [[_COMMUNITY_LLM Content Prompts|LLM Content Prompts]]
- [[_COMMUNITY_CalisthenicsLinkmate Sessions|Calisthenics/Linkmate Sessions]]
- [[_COMMUNITY_VNC Display Login Pool|VNC Display Login Pool]]
- [[_COMMUNITY_SEO Analysis & SERP|SEO Analysis & SERP]]
- [[_COMMUNITY_Blog Batch Agents|Blog Batch Agents]]
- [[_COMMUNITY_Account Health Ledger|Account Health Ledger]]
- [[_COMMUNITY_Dev.to Login Cache|Dev.to Login Cache]]
- [[_COMMUNITY_FBLI Batch Agents|FB/LI Batch Agents]]
- [[_COMMUNITY_Browser Login Dispatch|Browser Login Dispatch]]
- [[_COMMUNITY_Resilient Browser|Resilient Browser]]
- [[_COMMUNITY_Patreon Sessions|Patreon Sessions]]
- [[_COMMUNITY_LinkedIn Login2FA|LinkedIn Login/2FA]]
- [[_COMMUNITY_X Posting & Popup Guard|X Posting & Popup Guard]]
- [[_COMMUNITY_Report to Content Generator|Report to Content Generator]]
- [[_COMMUNITY_Content Sanity Checks|Content Sanity Checks]]
- [[_COMMUNITY_SEO Agent|SEO Agent]]
- [[_COMMUNITY_Report Data (Tavily)|Report Data (Tavily)]]
- [[_COMMUNITY_Browser Tool Registry|Browser Tool Registry]]
- [[_COMMUNITY_WordPress Sessions|WordPress Sessions]]
- [[_COMMUNITY_Daily Tracker & Teams|Daily Tracker & Teams]]
- [[_COMMUNITY_Note Sessions|Note Sessions]]
- [[_COMMUNITY_Multi-Platform Posters|Multi-Platform Posters]]
- [[_COMMUNITY_Instagram Batch|Instagram Batch]]
- [[_COMMUNITY_X Login Sessions|X Login Sessions]]
- [[_COMMUNITY_Substack Sessions|Substack Sessions]]
- [[_COMMUNITY_Portal PIN Auth|Portal PIN Auth]]
- [[_COMMUNITY_Notion Sessions|Notion Sessions]]
- [[_COMMUNITY_Account Checker|Account Checker]]
- [[_COMMUNITY_Articlescad Sessions|Articlescad Sessions]]
- [[_COMMUNITY_Prompt Style Library|Prompt Style Library]]
- [[_COMMUNITY_Google Sites Sessions|Google Sites Sessions]]
- [[_COMMUNITY_Paragraph Sessions|Paragraph Sessions]]
- [[_COMMUNITY_AccountPost CLIs|Account/Post CLIs]]
- [[_COMMUNITY_Daily Usage Counters|Daily Usage Counters]]
- [[_COMMUNITY_Medium Sessions|Medium Sessions]]
- [[_COMMUNITY_Chrome Launch & Kill|Chrome Launch & Kill]]
- [[_COMMUNITY_Blog Login Dispatch|Blog Login Dispatch]]
- [[_COMMUNITY_Blogger Sessions|Blogger Sessions]]
- [[_COMMUNITY_HackMD Sessions|HackMD Sessions]]
- [[_COMMUNITY_Facebook Login|Facebook Login]]
- [[_COMMUNITY_X Login CLI|X Login CLI]]
- [[_COMMUNITY_FBLI Posters|FB/LI Posters]]
- [[_COMMUNITY_OpenRouter Client|OpenRouter Client]]
- [[_COMMUNITY_Notion Poster|Notion Poster]]
- [[_COMMUNITY_Blog Cycle Runner|Blog Cycle Runner]]
- [[_COMMUNITY_Browser Slot Governor|Browser Slot Governor]]
- [[_COMMUNITY_Post Cycle Runner|Post Cycle Runner]]
- [[_COMMUNITY_Dev.to Login|Dev.to Login]]
- [[_COMMUNITY_HackMD Account Check|HackMD Account Check]]
- [[_COMMUNITY_Bulk X Login|Bulk X Login]]
- [[_COMMUNITY_FB Account Check|FB Account Check]]
- [[_COMMUNITY_LI Account Check|LI Account Check]]
- [[_COMMUNITY_SEO Tools|SEO Tools]]
- [[_COMMUNITY_HackMD Poster|HackMD Poster]]
- [[_COMMUNITY_Batch Schedule|Batch Schedule]]
- [[_COMMUNITY_API Key Rotation|API Key Rotation]]
- [[_COMMUNITY_Credential Auto-Fill|Credential Auto-Fill]]
- [[_COMMUNITY_Browser Cap & Scheduler|Browser Cap & Scheduler]]
- [[_COMMUNITY_Calisthenics Posting|Calisthenics Posting]]
- [[_COMMUNITY_Proxy Pool|Proxy Pool]]
- [[_COMMUNITY_Login Teardown|Login Teardown]]
- [[_COMMUNITY_X Account Check|X Account Check]]
- [[_COMMUNITY_Dev.to Poster|Dev.to Poster]]
- [[_COMMUNITY_Articlescad Poster|Articlescad Poster]]
- [[_COMMUNITY_Chrome Kill Utils|Chrome Kill Utils]]
- [[_COMMUNITY_DOM Fallback Pattern|DOM Fallback Pattern]]
- [[_COMMUNITY_HackMD Debug|HackMD Debug]]
- [[_COMMUNITY_Cluster 77|Cluster 77]]
- [[_COMMUNITY_Cluster 78|Cluster 78]]
- [[_COMMUNITY_Cluster 79|Cluster 79]]
- [[_COMMUNITY_Cluster 80|Cluster 80]]
- [[_COMMUNITY_Cluster 81|Cluster 81]]
- [[_COMMUNITY_Cluster 82|Cluster 82]]
- [[_COMMUNITY_Cluster 83|Cluster 83]]
- [[_COMMUNITY_Cluster 84|Cluster 84]]
- [[_COMMUNITY_Cluster 85|Cluster 85]]
- [[_COMMUNITY_Cluster 86|Cluster 86]]
- [[_COMMUNITY_Cluster 87|Cluster 87]]
- [[_COMMUNITY_Cluster 88|Cluster 88]]
- [[_COMMUNITY_Cluster 89|Cluster 89]]
- [[_COMMUNITY_Cluster 90|Cluster 90]]
- [[_COMMUNITY_Cluster 91|Cluster 91]]
- [[_COMMUNITY_Cluster 92|Cluster 92]]
- [[_COMMUNITY_Cluster 93|Cluster 93]]
- [[_COMMUNITY_Cluster 94|Cluster 94]]

## God Nodes (most connected - your core abstractions)
1. `executeBrowserTool()` - 76 edges
2. `getSheetsClient()` - 63 edges
3. `getColumnMap()` - 63 edges
4. `main()` - 55 edges
5. `withRetry()` - 42 edges
6. `runRetryRow()` - 41 edges
7. `injectUTM()` - 41 edges
8. `col()` - 34 edges
9. `humanDelay()` - 33 edges
10. `killChromeForProfile()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `printTodaySummary()`  [INFERRED]
  index.ts → tracker.ts
- `main()` --calls--> `postTodaySummaryToTeams()`  [INFERRED]
  index.ts → tracker.ts
- `main()` --calls--> `runMonitorCycle()`  [INFERRED]
  index.ts → monitor.ts
- `main()` --calls--> `loginToX()`  [INFERRED]
  index.ts → browser/twitter/login.ts
- `main()` --calls--> `loginToFacebook()`  [INFERRED]
  index.ts → browser/facebook/login.ts

## Hyperedges (group relationships)
- **Self-healing error KB + resolution loop** — errorinterceptor_module, monitor_runMonitorCycle, autofix_applyFix [INFERRED 0.85]
- **Row-driven blog batch posting agents** — hackmdbatchagentnew, notebatchagentnew, notionbatchagentnew, paragraphbatchagentnew, patreonbatchagentnew [INFERRED 0.85]
- **Tweet generation + grounding + QA pipeline** — reportdataagent, contentgenerator_module, seoagent, sanityagent [INFERRED 0.75]
- **Platform login modules (persistent-context, nickname lookup, session restore)** — ameba_login_loginToAmeba, articlescad_login_loginToArticlescad, blogger_login_loginToBlogger, calisthenics_login_loginCalisthenics, devto_login_loginToDevto, facebook_login_loginToFacebook, googlesite_login_loginToGoogleSite [INFERRED 0.85]
- **Blog posters that injectUTM before publishing** — ameba_poster_postToAmeba, blogger_poster_postToBlogger, calisthenics_poster_postToCalisthenics, devto_poster_postToDevto [INFERRED 0.85]
- **X posting agent variants (login then post via browser tool)** — xAgentNew_runXThreadAgent, xAgentNew_runXAgent, xPostingAgent_postTweetToX [INFERRED 0.75]
- **Per-platform login: getAccountByNickname + persistent Chrome context + isLoggedIn check + credential/manual fallback** — hackmd_loginToHackMD, instagram_loginToInstagram, linkedin_loginToLinkedIn, linkmate_loginToLinkmate, medium_loginToMedium, note_loginToNote, notion_loginToNotion, paragraph_loginToParagraph, patreon_loginToPatreon [INFERRED 0.85]
- **Per-platform poster: minimize window via CDP + navigate composer + fill title + paste HTML body + publish + capture URL** — googlesite_postToGoogleSite, hackmd_postToHackMD, linkedinpulse_postToLinkedinPulse, linkmate_postToLinkmate, medium_postToMedium, note_postToNote, notion_postToNotion, paragraph_postToParagraph [INFERRED 0.85]
- **Blog posters share injectUTM(UTM_PARAMS.X) safety net before posting** — googlesite_postToGoogleSite, hackmd_postToHackMD, linkedinpulse_postToLinkedinPulse, linkmate_postToLinkmate, medium_postToMedium, note_postToNote, notion_postToNotion, paragraph_postToParagraph, utm_injectUTM [INFERRED 0.85]
- **Anti-ban system: health gate + sticky proxy/fingerprint + coordinator** — accounthealth_canpost, proxypool_identitylaunchoverrides, mastercoordinator_healthgate [INFERRED 0.85]
- **Coordinator drives per-platform batch agents via executeBrowserTool** — mastercoordinator_runxbatch, mastercoordinator_runfbbatch, browsertools_executebrowsertool [INFERRED 0.75]
- **Config clients implement API key rotation on exhaustion** — openrouterclient_callopenrouter, serpapiclient_callserpapi, tavilyclient_calltavily [INFERRED 0.85]
- **Embedded login flow (server→pool→resolver→creds)** — server_loginRoute, cdpPool_startLogin, resolver_getFleetCredentials, fill_fillCredentials [INFERRED 0.85]
- **Defense-in-depth request gating** — auth_requireDashboardSecret, agentAuth_requireAgentToken, server_loginRoute [INFERRED 0.85]
- **Interactive session viewer** — cdpPool_startLogin, screencast_startScreencastServer, config_SCREENCAST_PORT_POOL [INFERRED 0.75]
- **Claude CLI intervention posters (resilientBrowser)** — posttox_tool, posttofacebook_tool, posttolinkedin_tool [INFERRED 0.85]
- **Per-platform blog row runners (login->post->saveUnified)** — rungooglesiterows_tool, runnoterow_tool, runnotionrow_tool, runwordpressrow_tool, runlinkedinpulserow_tool [INFERRED 0.85]
- **X login/session-saver CLIs** — loginx_tool, loginxall_tool, checkxaccounts_tool [INFERRED 0.75]
- **Shared browser-launch discipline (fingerprint + cap + resource block)** — chromeargs_getChromeLaunchArgs, stealth_installStealth, browserslots_acquireBrowserSlot [INFERRED 0.85]
- **Chrome process cleanup safety net** — prockill_gracefulKillByNeedle, prockill_killPostingChrome, killchrome_killChromeForProfile [INFERRED 0.85]
- **Manual per-platform posting test tools** — testameba_tool, testfbshare_tool, testnotion_tool, testpatreon_tool [INFERRED 0.75]

## Communities (95 total, 16 thin omitted)

### Community 0 - "Post Content Generation"
Cohesion: 0.05
Nodes (116): generateCalisthenicsPost(), generateDevtoPost(), generateGoogleSitePost(), generateHackmdPost(), generateLinkedinPulsePost(), generateLinkmatePost(), generateMediumPost(), generateSubstackPost() (+108 more)

### Community 1 - "Google Sheets I/O"
Cohesion: 0.07
Nodes (109): runWeeklySerpRecheck(), appendRowsToSheet(), appendValue(), assignFbRowsBatch(), assignLiRowsBatch(), assignRowsBatch(), assignXRowsBatch(), batchWrite() (+101 more)

### Community 2 - "Account Session Dirs"
Cohesion: 0.08
Nodes (40): AmebaAccount, closeAmebaBrowser(), getActiveAmebaAccount(), getAmebaAccountByNickname(), getAmebaAccounts(), loginToAmeba(), SESSION_ROOT, sessionDirFor() (+32 more)

### Community 3 - "Content Gen & Error KB"
Cohesion: 0.07
Nodes (43): applyFix Resolution Executor, Row-driven login-then-post blog batch pattern, executeBrowserTool, Content Agent (OpenRouter/NVIDIA pool), Legacy Content Generator, executeContentTool, debugHackmd selector probe, Error Interceptor + Knowledge Base (+35 more)

### Community 4 - "Error Interception & Auto-Fix"
Cohesion: 0.08
Nodes (39): ErrorReason, appendHumanAlert(), clearSessionDir(), FixResult, HUMAN_ALERTS_FILE, isAccountSkipped(), loadSkipAccounts(), resolveSessionDir() (+31 more)

### Community 5 - "Login Portal & Account Checks"
Cohesion: 0.06
Nodes (41): requireAgentToken, requireDashboardSecret, autoLoginX tool, startCycle (blog loop), browserTools aggregator, cdp loginQueue, cdp startLogin, checkAccounts (blog platforms) (+33 more)

### Community 6 - "Account Health & Caps"
Cohesion: 0.06
Nodes (40): canPost, classify (signal), effectiveCap, account health ledger (health.json), markNew, record, per-account daily cap (SAFE_CAP), accountHealth.selfcheck (+32 more)

### Community 7 - "Login Portal Server/Config"
Cohesion: 0.06
Nodes (31): requireDashboardSecret(), API_PORT, DISPLAY_POOL, DisplaySlotDef, PLATFORMS, PortalPlatform, SCREENCAST_PORT_POOL, ScreencastPortSlot (+23 more)

### Community 8 - "Blog Platform Posters"
Cohesion: 0.14
Nodes (19): postToAmeba(), sleep(), postToBlogger(), sleep(), gotoWithRetry(), postToGoogleSite(), sleep(), postToLinkmate() (+11 more)

### Community 9 - "CDP Login Pool"
Cohesion: 0.1
Nodes (26): active, ActiveLogin, buildViewerUrl(), busy, findActiveFor(), freeSlot(), isAlive(), killChromeGracefully() (+18 more)

### Community 10 - "LLM Content Prompts"
Cohesion: 0.11
Nodes (26): ApiKey, buildFbStylePrompt(), buildKeyPool(), buildOriginalFbPrompt(), buildOriginalLiPrompt(), callLLM(), callLLMWithRetry(), CAPTION_PROMPT_STYLES (+18 more)

### Community 11 - "Calisthenics/Linkmate Sessions"
Cohesion: 0.12
Nodes (25): ACCOUNTS_FILE, CalisthenicsAccount, closeCaliBrowser(), getCalisthenicsAccountByNickname(), getCalisthenicsAccounts(), loginCalisthenics(), sleep(), attemptPost() (+17 more)

### Community 12 - "VNC Display Login Pool"
Cohesion: 0.13
Nodes (27): active, ActiveLogin, autofillOverCdp(), buildNovncUrl(), busy, CHROME_ARGS, findActiveFor(), freeSlot() (+19 more)

### Community 13 - "SEO Analysis & SERP"
Cohesion: 0.13
Nodes (25): Platform, runSeoAnalysis(), SeoAnalysisResult, callProvider(), callSerpApi(), callSerpApiProvider(), callSerpstack(), callZenserp() (+17 more)

### Community 14 - "Blog Batch Agents"
Cohesion: 0.09
Nodes (20): HackMDBatchResult, postToHackMDAccount(), runHackMDBatchAgent(), NoteBatchResult, postToNoteAccount(), runNoteBatchAgent(), NotionBatchResult, postToNotionAccount() (+12 more)

### Community 15 - "Account Health Ledger"
Cohesion: 0.16
Nodes (25): AccountHealth, allAccounts(), canPost(), classify(), daysBetween(), effectiveCap(), getOrInit(), istDay() (+17 more)

### Community 16 - "Dev.to Login Cache"
Cohesion: 0.15
Nodes (21): PLATFORM_KEYS, CACHE_FILE, CacheEntry, getCached(), inFlight, isDevtoLoggedInCached(), readCache(), runDeepCheck() (+13 more)

### Community 17 - "FB/LI Batch Agents"
Cohesion: 0.18
Nodes (18): FbBatchResult, postToFbAccount(), runFbBatchAgent(), LiBatchResult, postToLiAccount(), runLiBatchAgent(), addAccount(), cliAdd() (+10 more)

### Community 18 - "Browser Login Dispatch"
Cohesion: 0.13
Nodes (23): loginToAmeba, loginToArticlescad, blockHeavyResources, loginToBlogger, loginToDevto, executeBrowserTool, loginToFacebook, postToFacebook (+15 more)

### Community 19 - "Resilient Browser"
Cohesion: 0.24
Nodes (18): classifyError(), ClickOptions, evaluateFindAndClick(), findInSnapshot(), resilientClick(), ResilientResult, resilientType(), saveScreenshot() (+10 more)

### Community 20 - "Patreon Sessions"
Cohesion: 0.18
Nodes (18): closePatreonBrowser(), getActivePatreonAccount(), getPatreonAccountByNickname(), getPatreonAccounts(), isLoggedIn(), loginToPatreon(), main(), PatreonAccount (+10 more)

### Community 21 - "LinkedIn Login/2FA"
Cohesion: 0.18
Nodes (18): closeLinkedInBrowser(), detectTwoFactorBlock(), ensureLoggedIn(), getActiveLinkedInAccount(), LinkedInAccount, loginToLinkedIn(), randomDelay(), SESSION_ROOT (+10 more)

### Community 22 - "X Posting & Popup Guard"
Cohesion: 0.23
Nodes (14): batchPostToX(), postTweetAndSaveResult(), postTweetToX(), XPostingResult, clearPopups(), PopupGuardConfig, startPopupGuard(), humanDelay() (+6 more)

### Community 23 - "Report to Content Generator"
Cohesion: 0.22
Nodes (17): buildUtmUrl(), fetchReportViaTavily(), fetchWebStats(), generateBlogFromKen(), generateFacebookPost(), generateLinkedInPost(), generateTweet(), generateTweetFromReport() (+9 more)

### Community 24 - "Content Sanity Checks"
Cohesion: 0.16
Nodes (16): ALLOWED_DOMAINS, BatchContext, checkUrlReachable(), computeXCharCount(), CTA_SHORTENERS, extractDomain(), extractUrls(), FILLER_WORDS (+8 more)

### Community 25 - "SEO Agent"
Cohesion: 0.16
Nodes (17): computeXCharCount(), decidePlatforms(), FORBIDDEN_WORDS, generateKeywordPhrases(), Platform, PLATFORMS_ENABLED, runSeoAnalysis(), runSeoOptimize() (+9 more)

### Community 26 - "Report Data (Tavily)"
Cohesion: 0.19
Nodes (15): enrichWithTavily(), extractFromText(), extractReportData(), ReportData, scrapeWithPlaywright(), scrapeWithTavily(), callTavily(), loadKeys() (+7 more)

### Community 27 - "Browser Tool Registry"
Cohesion: 0.18
Nodes (15): closeDevtoBrowser(), closeHackMDBrowser(), postToMedium(), closeNoteBrowser(), closeParagraphBrowser(), BROWSER_TOOLS, loginDevtoTool(), loginHackmdTool() (+7 more)

### Community 28 - "WordPress Sessions"
Cohesion: 0.23
Nodes (15): loginWordpressTool(), postWordpressTool(), closeWordpressBrowser(), getActiveWordpressAccount(), getWordpressAccountByNickname(), getWordpressAccounts(), loginToWordpress(), SESSION_ROOT (+7 more)

### Community 29 - "Daily Tracker & Teams"
Cohesion: 0.16
Nodes (14): ColMap, getCell(), getSheetsClient(), pad(), PLATFORMS, PlatformStats, postTodaySummaryToTeams(), printPlatformRow() (+6 more)

### Community 30 - "Note Sessions"
Cohesion: 0.24
Nodes (13): saveNoteSession(), getActiveNoteAccount(), getNoteAccountByNickname(), getNoteAccounts(), isAlreadyLoggedIn(), loginToNote(), main(), NoteAccount (+5 more)

### Community 31 - "Multi-Platform Posters"
Cohesion: 0.15
Nodes (15): postToAmeba, postToBlogger, postToDevto, gotoWithRetry, postToGoogleSite, postToHackMD, nativeClickByText, postToLinkedIn (+7 more)

### Community 32 - "Instagram Batch"
Cohesion: 0.26
Nodes (12): __dirname, downloadImage(), InstagramBatchResult, pickInstagramAccount(), runInstagramBatchAgent(), closeInstagramBrowser(), getInstagramAccountByNickname(), getInstagramAccounts() (+4 more)

### Community 33 - "X Login Sessions"
Cohesion: 0.26
Nodes (14): Account, loginXTool(), postThreadTool(), CHROME_LAUNCH_ARGS, closeBrowser(), getSessionProfileDir(), getSessionStatePath(), hasLoggedInXUi() (+6 more)

### Community 34 - "Substack Sessions"
Cohesion: 0.29
Nodes (13): saveSubstackSession(), closeSubstackBrowser(), getActiveSubstackAccount(), getSubstackAccountByNickname(), getSubstackAccounts(), isLoggedIn(), loginToSubstack(), main() (+5 more)

### Community 35 - "Portal PIN Auth"
Cohesion: 0.25
Nodes (13): AUTH_FILE, AuthStore, b64url(), hashPin(), hmacKey(), loadStore(), mintToken(), pinMatches() (+5 more)

### Community 36 - "Notion Sessions"
Cohesion: 0.25
Nodes (12): getActiveNotionAccount(), getNotionAccountByNickname(), getNotionAccounts(), isLoggedIn(), loginToNotion(), main(), NotionAccount, SESSION_ROOT (+4 more)

### Community 37 - "Account Checker"
Cohesion: 0.15
Nodes (12): active, bad, checkOne(), CONCURRENCY, filterName, [platformArg, ...rest], PlatformConfig, PLATFORMS (+4 more)

### Community 38 - "Articlescad Sessions"
Cohesion: 0.28
Nodes (11): ArticlescadAccount, getActiveArticlescadAccount(), getArticlescadAccountByNickname(), getArticlescadAccounts(), isAlreadyLoggedIn(), loginToArticlescad(), main(), SESSION_ROOT (+3 more)

### Community 39 - "Prompt Style Library"
Cohesion: 0.24
Nodes (12): callLLM(), currentYear, FB_STYLE_HOOKS, fbCaption1(), fbCaption2(), fbStylePrompt(), LI_STYLE_DEFS, liCaption1() (+4 more)

### Community 40 - "Google Sites Sessions"
Cohesion: 0.32
Nodes (11): saveGoogleSiteSession(), closeGoogleSiteBrowser(), getActiveGoogleSiteAccount(), getGoogleSiteAccountByNickname(), getGoogleSiteAccounts(), GoogleSiteAccount, loginToGoogleSite(), SESSION_ROOT (+3 more)

### Community 41 - "Paragraph Sessions"
Cohesion: 0.3
Nodes (10): getActiveParagraphAccount(), getParagraphAccountByNickname(), getParagraphAccounts(), isLoggedIn(), loginToParagraph(), ParagraphAccount, SESSION_ROOT, sessionDirFor() (+2 more)

### Community 42 - "Account/Post CLIs"
Cohesion: 0.23
Nodes (12): .accounts/accounts.json, checkXAccounts CLI, config/accounts, facebook/login, linkedin/login, loginX CLI, loginXAll CLI, postToFacebook CLI (+4 more)

### Community 43 - "Daily Usage Counters"
Cohesion: 0.27
Nodes (11): COUNTS_FILE, DailyCounts, getAvailableFbAccount(), getAvailableLinkedInAccount(), getCount(), incrementCount(), LIMITS, loadCounts() (+3 more)

### Community 44 - "Medium Sessions"
Cohesion: 0.33
Nodes (10): closeMediumBrowser(), getActiveMediumAccount(), getMediumAccountByNickname(), getMediumAccounts(), loginToMedium(), MediumAccount, SESSION_ROOT, sessionDirFor() (+2 more)

### Community 45 - "Chrome Launch & Kill"
Cohesion: 0.24
Nodes (11): blockHeavyResources, getChromeLaunchArgs, loginToInstagram, killChromeForProfile, loginToNotion, loginToParagraph, loginToPatreon, gracefulKillByNeedle (+3 more)

### Community 46 - "Blog Login Dispatch"
Cohesion: 0.2
Nodes (11): getHackMDAccountByNickname, loginToHackMD, ensureLoggedIn, getLinkedInAccountByNickname, loginToLinkedIn, loginToLinkedInPulse, postToLinkedinPulse, getNoteAccountByNickname (+3 more)

### Community 47 - "Blogger Sessions"
Cohesion: 0.33
Nodes (10): BloggerAccount, closeBloggerBrowser(), getActiveBloggerAccount(), getBloggerAccountByNickname(), getBloggerAccounts(), loginToBlogger(), SESSION_ROOT, sessionDirFor() (+2 more)

### Community 48 - "HackMD Sessions"
Cohesion: 0.35
Nodes (10): saveHackmdSession(), getActiveHackMDAccount(), getHackMDAccountByNickname(), getHackMDAccounts(), HackMDAccount, isAlreadyLoggedIn(), loginToHackMD(), SESSION_ROOT (+2 more)

### Community 49 - "Facebook Login"
Cohesion: 0.45
Nodes (9): closeFacebookBrowser(), FacebookAccount, getActiveFacebookAccount(), getFacebookAccountByNickname(), getFacebookAccounts(), loginToFacebook(), loginFbTool(), main() (+1 more)

### Community 50 - "X Login CLI"
Cohesion: 0.38
Nodes (10): XAccount, clickNext(), isLoggedIn(), isSessionOnDisk(), loginFlow(), main(), reactType(), saveDebug() (+2 more)

### Community 51 - "FB/LI Posters"
Cohesion: 0.33
Nodes (7): postToFacebook(), nativeClickByText(), postToLinkedIn(), postFbTool(), postLiTool(), preparePlainSocialPost(), stripMarkdownBold()

### Community 52 - "OpenRouter Client"
Cohesion: 0.29
Nodes (9): callOpenRouter(), loadKeys(), loadState(), makeRequest(), OpenRouterMessage, OpenRouterParams, OpenRouterResponse, saveState() (+1 more)

### Community 53 - "Notion Poster"
Cohesion: 0.31
Nodes (7): closeNotionBrowser(), postToNotion(), sleep(), loginNotionTool(), postNotionTool(), errPath, screenshotPath

### Community 54 - "Blog Cycle Runner"
Cohesion: 0.47
Nodes (8): CycleState, cycleStatus(), LOG_FILE_FOR(), PID_FILE_FOR(), readState(), startCycle(), stopCycle(), writeState()

### Community 55 - "Browser Slot Governor"
Cohesion: 0.39
Nodes (8): acquireBrowserSlot(), isAlive(), makeRelease(), maxSlots(), poll(), SLOTS_DIR, tryAcquireBrowserSlot(), tryTake()

### Community 56 - "Post Cycle Runner"
Cohesion: 0.47
Nodes (8): CycleState, LOG_FILE_FOR(), postCycleStatus(), readState(), startPostCycle(), STATUS_FILE_FOR(), stopPostCycle(), writeState()

### Community 57 - "Dev.to Login"
Cohesion: 0.47
Nodes (8): clickContinueWithGoogle(), DevtoAccount, getActiveDevtoAccount(), getDevtoAccountByNickname(), getDevtoAccounts(), isLoggedInToDevto(), loginToDevto(), sleep()

### Community 58 - "HackMD Account Check"
Cohesion: 0.22
Nodes (7): accounts, active, bad, filterName, results, sessionDir, url

### Community 59 - "Bulk X Login"
Cohesion: 0.31
Nodes (8): accounts, fail, isLoggedIn(), isSessionOnDisk(), loginAccount(), ok, results, sleep()

### Community 60 - "FB Account Check"
Cohesion: 0.25
Nodes (6): accounts, active, bad, results, sessionDir, url

### Community 61 - "LI Account Check"
Cohesion: 0.25
Nodes (6): accounts, active, bad, results, sessionDir, url

### Community 62 - "SEO Tools"
Cohesion: 0.32
Nodes (7): Tool, executeSeoTool(), searchGoogle(), searchTavily(), SEO_TOOLS, SerpApiResult, TavilyResult

### Community 63 - "HackMD Poster"
Cohesion: 0.48
Nodes (6): highlightClick(), paste(), postToHackMD(), require, sleep(), TurndownService

### Community 64 - "Batch Schedule"
Cohesion: 0.29
Nodes (4): BATCH_SCHEDULE, BatchSlot, FB_SCHEDULE, LI_SCHEDULE

### Community 65 - "API Key Rotation"
Cohesion: 0.53
Nodes (6): API key rotation on credit exhaustion, callOpenRouter, callSerpApi, SERP provider round-robin (SerpAPI/Zenserp/Serpstack), settings config, callTavily

### Community 66 - "Credential Auto-Fill"
Cohesion: 0.4
Nodes (5): fillCredentials(), firstVisible(), FORMS, LoginForm, FleetCredentials

### Community 67 - "Browser Cap & Scheduler"
Cohesion: 0.33
Nodes (6): acquireBrowserSlot, Posting Scheduler, printDiagnostics, box-wide single-Chrome cap, isTransientTimeoutError, retryOnSelectorTimeout

### Community 68 - "Calisthenics Posting"
Cohesion: 0.33
Nodes (6): loginCalisthenics, attemptPost, postToCalisthenics, loginToLinkmate, loginToMedium, applyStealth

### Community 69 - "Proxy Pool"
Cohesion: 0.33
Nodes (6): checkProxies, getProxy, proxySummary, rotateProxy, proxyRotate self-check, proxy list/test/rotate routes

### Community 70 - "Login Teardown"
Cohesion: 0.33
Nodes (6): cdp killChromeGracefully, cdp teardown, display teardown, SIGTERM-first cookie flush before readiness, sessionReadyForDir, POST /login/:token/finish

### Community 71 - "X Account Check"
Cohesion: 0.33
Nodes (4): accounts, active, results, suspended

### Community 72 - "Dev.to Poster"
Cohesion: 0.8
Nodes (4): gotoWithRetry(), htmlToMarkdown(), postToDevto(), sleep()

### Community 73 - "Articlescad Poster"
Cohesion: 0.5
Nodes (4): ArticlescadPostInput, ArticlescadPostResult, postToArticlescad(), sleep()

### Community 74 - "Chrome Kill Utils"
Cohesion: 0.7
Nodes (3): killChromeForProfile(), gracefulKillByNeedle(), killPostingChrome()

### Community 75 - "DOM Fallback Pattern"
Cohesion: 0.5
Nodes (5): 5-Layer DOM Fallback Pattern, classifyError, resilientClick, resilientType, saveScreenshot

### Community 77 - "Cluster 77"
Cohesion: 0.5
Nodes (4): testAmeba, testFbShare, UTM_PARAMS, ensureTargetUrl

### Community 78 - "Cluster 78"
Cohesion: 0.67
Nodes (4): cdpLoginPool, displayPool (Xvfb+x11vnc), CDP screencast login (no X11), per-display VNC login (legacy)

### Community 79 - "Cluster 79"
Cohesion: 0.67
Nodes (3): mintToken, verifyOrSetPin, POST /agent/:agent/auth

## Ambiguous Edges - Review These
- `POST /api/agent/:agent/login` → `cdp startLogin`  [AMBIGUOUS]
  src/login-portal/server.ts · relation: calls

## Knowledge Gaps
- **395 isolated node(s):** `HUMAN_ALERTS_FILE`, `SKIP_ACCOUNTS_FILE`, `FixResult`, `RUNTIME_LOG`, `KB_FILE` (+390 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `POST /api/agent/:agent/login` and `cdp startLogin`?**
  _Edge tagged AMBIGUOUS (relation: calls) - confidence is low._
- **Why does `main()` connect `Post Content Generation` to `X Login Sessions`, `Google Sheets I/O`, `Error Interception & Auto-Fix`, `Notion Sessions`, `Google Sites Sessions`, `Calisthenics/Linkmate Sessions`, `HackMD Sessions`, `FB/LI Batch Agents`, `Facebook Login`, `Patreon Sessions`, `LinkedIn Login/2FA`, `Dev.to Login`, `Daily Tracker & Teams`, `Note Sessions`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `SheetRow` connect `Blog Batch Agents` to `Post Content Generation`, `Google Sheets I/O`, `LLM Content Prompts`, `FB/LI Batch Agents`, `Report to Content Generator`, `Content Sanity Checks`, `SEO Agent`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `humanDelay()` connect `X Posting & Popup Guard` to `X Login Sessions`, `Facebook Login`, `X Login CLI`, `FB/LI Posters`, `Resilient Browser`, `Bulk X Login`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 42 inferred relationships involving `main()` (e.g. with `runMonitorCycle()` and `runXBatch()`) actually correct?**
  _`main()` has 42 INFERRED edges - model-reasoned connections that need verification._
- **What connects `HUMAN_ALERTS_FILE`, `SKIP_ACCOUNTS_FILE`, `FixResult` to the rest of the system?**
  _395 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Post Content Generation` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._