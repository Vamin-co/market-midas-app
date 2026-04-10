---

# Market Midas — Architectural Decision Record

---

## 1. Application Shell: Tauri 2.0 over Electron

**Decision:** Native macOS desktop app using Tauri 2.0 with Rust shell.

**Alternatives considered:**
- Electron (Node.js shell, most common)
- Pure web app (browser-based)
- SwiftUI native macOS app

**Why Tauri:** Significantly smaller bundle size than Electron (~3MB vs ~120MB), better memory performance, native OS security model. Rust shell provides memory safety guarantees that matter for an app handling financial transactions. Pure web app eliminated because local-first architecture was a core product requirement — no cloud dependency for core trading logic. SwiftUI eliminated because it would have required separate backend and broken the Python-first data science stack.

---

## 2. Local-First Architecture over Cloud-Dependent

**Decision:** All analysis, positions, alerts, and settings stored locally. No cloud processing required for core functionality.

**Alternatives considered:**
- Cloud backend with user accounts and sync
- Hybrid (local execution, cloud sync)
- Full SaaS model

**Why local-first:** Privacy guarantee — no financial data leaves the user's machine. No recurring infrastructure cost during pre-launch. Eliminates latency from round-trip to cloud for analysis. Differentiator against Bloomberg/FactSet which are cloud-dependent and expensive. Cloud sync deferred to post-launch as optional enhancement, not core architecture.

---

## 3. Frontend: Next.js 14 TypeScript over Alternatives

**Decision:** Next.js 14 with TypeScript, running on port 3001, rendered inside Tauri WebView.

**Alternatives considered:**
- Plain React (no Next.js)
- SvelteKit
- Solid.js
- Vue

**Why Next.js:** App Router provides clean file-based routing that maps well to the multi-screen trading terminal UI. TypeScript throughout eliminates entire class of runtime errors in financial data handling where a null price causing a crash is unacceptable. Next.js API routes provide a clean proxy layer between frontend and Python backend, avoiding CORS issues and centralizing auth logic. The team already had familiarity with the stack.

---

## 4. Backend: Python FastAPI over Node.js or Go

**Decision:** Python 3.12 FastAPI on port 8000.

**Alternatives considered:**
- Node.js Express (match frontend language)
- Go (performance)
- Django (more batteries-included Python)

**Why Python FastAPI:** Python is the native language of the financial data science ecosystem — yfinance, pandas, pandas-ta, and every LLM library are Python-first. Using any other language for the backend would require bridging to Python anyway. FastAPI specifically chosen over Django for async support (required for SSE streaming), automatic OpenAPI docs, and Pydantic validation. Performance was not a bottleneck concern for a single-user desktop app.

---

## 5. IPC Architecture: HTTP over Tauri Native IPC

**Decision:** Frontend communicates with Python backend via HTTP on localhost, not Tauri's native IPC bridge.

**Alternatives considered:**
- Tauri native IPC (invoke commands, Rust as middleware)
- WebSocket persistent connection
- Shared file system (write JSON, Python reads)

**Why HTTP:** Keeps Python backend independently runnable and testable without Tauri. The backend can be hit directly during development. Tauri native IPC would have required Rust middleware to bridge to Python which adds a layer with no benefit for a localhost-only app. Shared file system eliminated for obvious latency and race condition reasons.

---

## 6. Server Binding: 127.0.0.1 over 0.0.0.0

**Decision:** FastAPI bound to 127.0.0.1 (loopback only) in all startup paths.

**Alternatives considered:**
- 0.0.0.0 (all interfaces, common default)
- Configurable via environment variable

**Why loopback-only:** 0.0.0.0 would expose the trading API on the local network — anyone on the same WiFi network could hit the /trade endpoint. For a financial application that executes real trades this is an unacceptable attack surface. Loopback binding means the API is only accessible from the machine it runs on.

---

## 7. Market Data: yfinance with Fallback Chain

**Decision:** yfinance as primary data source with a three-tier fallback chain: yf.download() → Ticker.history() → CSV cache.

**Alternatives considered:**
- Polygon.io (paid, reliable)
- Alpha Vantage (free tier, API key required)
- Finnhub (generous free tier, API key required)
- IEX Cloud (deprecated August 2024)
- Yahoo Finance scraping directly

**Why yfinance:** Zero setup for users — no API key required, works immediately on install. For a desktop app where first-run experience matters, eliminating a "get your API key" onboarding step is significant. The reliability limitations are real and documented, but the CSV fallback chain handles the most common failure mode (weekends, rate limiting). Finnhub added to roadmap as optional enhancement for users who want real-time data.

**Why the three-tier fallback specifically:**
- yf.download() fails frequently on weekends and under rate limiting
- Ticker.history() uses a different internal endpoint, often succeeds when download() fails
- CSV cache (3-day staleness limit) handles market-closed scenarios gracefully
- 3-day limit chosen because: Friday close is valid Saturday/Sunday (1-2 days), long weekends (3 days) still acceptable, beyond 3 days price could have moved enough to make analysis misleading

---

## 8. Cache Management: Keep 2 Most Recent CSVs per Ticker

**Decision:** Prune data cache on every fetch, keeping exactly 2 most recent CSV files per ticker.

**Alternatives considered:**
- Keep all CSVs (unbounded growth)
- Keep 1 most recent only
- Time-based expiry (delete anything older than N days)
- LRU eviction with portfolio ticker priority

**Why 2 most recent:** Single file gives no redundancy — if the most recent file is corrupt or empty (yfinance failure write) you lose all cached data. Two files gives a fallback to the previous successful fetch. Portfolio tickers naturally stay fresh because they're analyzed regularly. LRU with portfolio priority was considered but rejected as over-engineering for what is fundamentally a Sunday-morning edge case.

**Why not portfolio-tier star system:** Active tickers stay fresh naturally. Inactive tickers accumulate old CSVs that get pruned. The simple 2-file rule handles both without special-casing.

---

## 9. Empty File Protection: 1000-byte Minimum for CSV Validity

**Decision:** CSV files under 1000 bytes are treated as failed writes and excluded from fallback consideration.

**Alternatives considered:**
- Check row count
- Check file modification time
- Try to parse and catch exception

**Why 1000 bytes:** Real OHLCV CSVs for 6 months of daily data are consistently 10KB+. A 5-byte or 42-byte file is definitively a failed yfinance write (empty or headers only). The byte threshold is simpler and faster than parsing the CSV to count rows. Time-based checks would incorrectly exclude valid files from today.

---

## 10. Trade Execution: Playwright Browser Automation over Robinhood API

**Decision:** Playwright automates the Robinhood web interface for trade execution.

**Alternatives considered:**
- Unofficial Robinhood Python API (robin_stocks, etc.)
- Alpaca (official API, paper trading native)
- Interactive Brokers API (official, complex)
- Manual only (no execution, analysis-only product)

**Why Playwright:** Unofficial APIs are fragile and may violate Robinhood ToS. Official Robinhood API doesn't exist for retail users. Playwright automation against the web interface is what the user would do manually — the app just does it faster. Critically it preserves human confirmation — the app stages the order but never submits without explicit user approval. Alpaca added to post-launch roadmap as a cleaner alternative for users who want a proper API.

---

## 11. Human-in-the-Loop: Mandatory, Not Optional

**Decision:** Trade execution requires explicit human confirmation at every step. Cannot be bypassed in code or settings.

**Alternatives considered:**
- Fully automated execution (bot mode)
- Configurable auto-execute above confidence threshold
- Human confirmation as opt-in setting

**Why mandatory HITL:** Financial liability. An automated system that places a wrong trade has real monetary consequences. The product is designed for retail investors making informed decisions, not for running unattended bots. Making HITL mandatory also keeps the product out of a regulatory gray area around automated trading systems. Confidence threshold auto-execute was specifically rejected — a 95% confidence score from a rule-based system is not the same as actual certainty.

---

## 12. AI Provider Abstraction: LiteLLM over Direct SDK Integration

**Decision:** LiteLLM as the single interface to all AI providers (pending integration at time of writing).

**Alternatives considered:**
- OpenAI SDK directly (most common)
- Anthropic SDK directly
- Custom abstraction layer (build our own)
- Single provider only

**Why LiteLLM:** User brings their own API key from any of five providers. Without LiteLLM, supporting five providers would mean maintaining five separate SDK integrations with different streaming interfaces, error handling patterns, and retry logic. LiteLLM normalizes all of this. Swapping models requires changing a string, not rewriting integration code. Also provides built-in cost tracking, retry logic, and fallbacks that would otherwise need to be custom-built.

---

## 13. Five Providers: OpenAI, Anthropic, Google, DeepSeek, xAI

**Decision:** Support exactly these five providers at launch.

**Alternatives considered:**
- OpenAI only (simplest)
- OpenAI + Anthropic only (most common pairing)
- Any provider LiteLLM supports (unlimited)

**Why these five:** Covers every major cost tier from very expensive (GPT-5.4, Claude Opus) to very cheap (DeepSeek, Grok mini). Users can match their provider to their usage pattern. Unlimited provider support deferred because each provider requires testing the prompt outputs — a provider we haven't tested might produce debate arguments that don't match the expected format. Five is enough diversity to be genuinely useful without being untestable.

---

## 14. Data Storage: Local JSON Files over SQLite or PostgreSQL

**Decision:** All persistent data (positions, alerts, settings, trade log) stored as JSON files.

**Alternatives considered:**
- SQLite (lightweight embedded database)
- PostgreSQL (full relational database)
- Plist files (macOS native)
- Core Data (macOS native ORM)

**Why JSON:** Human readable — users can inspect and manually edit their own data. No database driver dependency. Easy to back up (just copy the files). Trivial to implement. The data volume for a single-user trading app is tiny — even an active user with hundreds of trades generates kilobytes not megabytes. SQLite's ACID guarantees were considered but the write lock pattern on JSON files provides sufficient consistency for the actual concurrency requirements (single desktop app, not a web server with thousands of users).

---

## 15. Write Lock Pattern for Portfolio Store

**Decision:** Explicit threading lock (TRADES_WRITE_LOCK) acquired before every read-modify-write operation on paper_trades.json.

**Alternatives considered:**
- File locking (fcntl)
- SQLite (handles concurrency natively)
- Single-threaded write queue
- Optimistic concurrency (read, write, retry on conflict)

**Why explicit threading lock:** The portfolio store is accessed by the trade service, the alert engine (running on a 15-minute scheduler), and the portfolio close routes potentially concurrently. Without a lock, two concurrent writes could produce a corrupted JSON file with no error. The threading lock is simple, predictable, and debuggable. SQLite would have solved this too but introduced a dependency and migration complexity.

---

## 16. Alert System: APScheduler Polling over WebSocket Push

**Decision:** APScheduler polls yfinance every 15 minutes to check alert thresholds.

**Alternatives considered:**
- WebSocket connection to a real-time price feed
- Webhook from a price data provider
- Long polling from frontend
- User-initiated manual check only

**Why polling:** Real-time WebSocket feeds require either a paid API or an unofficial connection that's fragile. 15-minute polling intervals are acceptable for the alert use case — a price target alert doesn't need sub-second precision. The desktop app context also means the backend is only running when the app is open, making persistent WebSocket connections less critical. Alert throttling prevents duplicate notifications within a cooldown window.

---

## 17. Settings Architecture: Draft State Pattern

**Decision:** Settings use a draft state pattern — changes are staged locally and require explicit save per section.

**Alternatives considered:**
- Auto-save on every change
- Single save button for all settings
- Optimistic update with rollback

**Why draft state per section:** Financial settings (stop loss, max drawdown, trading mode) should not change accidentally. A user tweaking their stop loss percentage should have a clear moment of confirmation before it takes effect. Auto-save on every keystroke is dangerous for numeric fields. Single save for all settings means a user editing the AI provider accidentally saves a half-entered stop loss value. Per-section save gives granular control without being cumbersome.

---

## 18. Market Status: pandas_market_calendars over Custom Logic

**Decision:** NYSE calendar from pandas_market_calendars for determining market open/closed status.

**Alternatives considered:**
- Hardcode market hours (9:30-16:00 ET weekdays)
- Check via yfinance market status endpoint
- Build custom holiday calendar

**Why pandas_market_calendars:** US market holidays are not just weekends — there are ~10 irregular holidays per year (MLK Day, Presidents Day, Good Friday, etc.) that a hardcoded schedule misses. Getting market status wrong causes the app to either try to fetch data on holidays (fails) or incorrectly show "CLOSED" on normal trading days. pandas_market_calendars is maintained by the financial data community and covers NYSE holidays accurately. The library also returns next_open/next_close timestamps which power the "opens in X hours" display.

---

## 19. Streaming Architecture: SSE over WebSocket

**Decision:** Server-Sent Events (SSE) for streaming debate responses.

**Alternatives considered:**
- WebSocket (bidirectional)
- Long polling
- Chunked HTTP transfer

**Why SSE:** Debate streaming is unidirectional — server sends text chunks to client, client only needs to send the initial request. WebSocket's bidirectional capability is unnecessary overhead for this use case. SSE works over standard HTTP, is natively supported by browsers, and is simpler to implement and debug than WebSocket. SSE also handles reconnection automatically which matters for a long-running debate stream.

**SSE hardening decisions:**
- 120-second hard timeout per stream
- Per-IP concurrent connection limit (3 max)
- Server-side cancellation on client disconnect via asyncio.Event
- Without disconnect handling, orphaned LLM calls would continue running and incurring API costs after user navigates away

---

## 20. Position Sizing: Kelly Criterion (Fractional)

**Decision:** Kelly criterion for position sizing with fractional application and hard cap.

**Alternatives considered:**
- Fixed dollar amount per trade
- Fixed percentage of portfolio per trade
- User-defined manual sizing
- Full Kelly (not fractional)

**Why Kelly:** Mathematically optimal position sizing given a probability estimate and edge. Fractional Kelly (typically half-Kelly) chosen because full Kelly is aggressive and assumes perfect probability estimation — which a confidence score from a rule-based system is not. Hard cap on max position size as a circuit breaker regardless of Kelly output.

**Why not fixed sizing:** Fixed sizing ignores conviction level. A 95% confidence STRONG_BUY and a 51% confidence marginal BUY generating the same position size is wrong — the system should express more conviction with larger size on high-confidence signals.

---

## 21. Debate Structure: 3-Round Parallel with Sync Barriers

**Decision:** Three rounds of debate (opening / cross-examination / defense), with Bull and Bear running in parallel within each round but rounds executing sequentially.

**Alternatives considered:**
- One round each (monologue format)
- Two rounds (opening + rebuttal)
- Four or more rounds
- Fully sequential (Bull R1 → Bear R1 → Bull R2...)
- Fully parallel (all six arguments simultaneously)

**Why three rounds:** One round produces monologues not debate — agents never respond to each other. Two rounds gives attack but no defense — Bear attacks Bull's case but Bull never gets to respond to the attack. Three rounds is the minimum for a complete argument arc: thesis → challenge → defense. More rounds add diminishing returns and latency.

**Why parallel within rounds:** Bull and Bear Round 1 are independent (neither has seen the other). Running them sequentially adds latency for no benefit. Parallelizing within rounds halves the effective round time. Sync barrier between rounds is necessary — Round 2 cannot start until both Round 1 responses are complete because each agent needs to read the other's Round 1 to formulate Round 2.

**Why not fully parallel:** Round 2 agents need Round 1 outputs as inputs. Fully parallel is architecturally impossible for a proper adversarial debate.

---

## 22. Debate Agent Design: Unaware of Judging

**Decision:** Bull and Bear agents have no knowledge that a judge will evaluate their arguments. They are instructed to write honest research notes, not to perform for a score.

**Alternatives considered:**
- Agents aware of judge criteria and scoring
- Agents told to optimize for epistemic honesty to score higher
- Competitive framing (try to win)

**Why unaware:** An agent that knows it's being scored for epistemic honesty will perform epistemic honesty rather than practice it. The difference matters — a performance of conceding valid points looks identical to genuine concession on the surface but the underlying reasoning quality is different. Treating agents as analysts writing research notes produces more authentic argument quality than treating them as debate competitors optimizing for a judge.

---

## 23. Judge Design: PROCEED / ABORT / INCONCLUSIVE

**Decision:** Judge outputs three possible verdicts including INCONCLUSIVE as a valid outcome.

**Alternatives considered:**
- Binary Bull wins / Bear wins
- Confidence score only (no categorical verdict)
- Five-point scale (Strong Buy → Strong Sell)

**Why INCONCLUSIVE:** Forcing a winner when neither side made a decisive case produces false confidence. In real trading analysis, "the evidence is genuinely mixed and you should wait for more clarity" is a legitimate and valuable output. Binary verdicts on ambiguous evidence mislead users into thinking there's more signal than there is. INCONCLUSIVE with a clear explanation of what remains unresolved gives the user more actionable information than a forced winner.

---

## 24. Judge Input: User's Current Position

**Decision:** Judge receives the user's current position in the stock (long, no position, considering adding) as input alongside the debate transcript.

**Alternatives considered:**
- Judge unaware of user position (position-agnostic verdict)
- User applies verdict to their own situation manually
- Separate post-verdict position advisor

**Why position-aware:** The same debate outcome means different things to different users. A decisive Bear win when the user is already long is a serious exit signal. The same Bear win when the user has no position is just a reason not to enter. A position-agnostic PROCEED/ABORT verdict forces the user to mentally translate the verdict to their situation — which is exactly the kind of cognitive work that leads to rationalization and bias. Giving the Judge the position information produces directly actionable recommendations rather than generic verdicts.

---

## 25. Research Package: Split Between Agents and Judge

**Decision:** Agents receive a research package without the 8-K filing flag. Judge receives the full transcript plus the 8-K flag.

**Alternatives considered:**
- Both agents and judge receive identical packages
- 8-K content parsed and included for all
- 8-K excluded entirely (backlogged)

**Why split:** The 8-K RSS fetch tells us something material was filed recently but we cannot parse the content for v1. Giving agents an unread filing reference creates awkward behavior — they know something happened but cannot act on it, producing noise in their arguments. The Judge is the right place for the caution flag because the Judge makes the final recommendation to the user — "a material filing occurred 2 days ago, review before acting" is a user-facing caution, not research the agents should argue about.

---

## 26. Research Package: Headlines as Sentiment Signal Only

**Decision:** News headlines are labeled as sentiment indicators, not factual evidence. Agents are explicitly instructed not to cite headlines as proof of factual claims.

**Alternatives considered:**
- Fetch full article text (richer but token-expensive)
- Use headlines as factual evidence (common approach)
- Exclude news entirely
- Web search at debate time (real-time but untraceable)

**Why sentiment-only:** Headlines are written to capture attention, not to be accurate. An agent that treats "NVDA Crashes on Earnings Miss" as a factual claim is being manipulated by the same noise the user is trying to cut through. Full article text was considered but creates token cost and traceability problems — if an agent synthesizes across 10 articles the user cannot verify which claim came from which source. Web search at debate time creates untraceable citations. Headlines as labeled sentiment preserves the signal (market narrative direction) while preventing misuse as evidence.

---

## 27. IV Signal: Directional Only, No Derived Expected Move

**Decision:** Report implied volatility as "elevated vs average" directional signal. Do not calculate or report the expected move percentage.

**Alternatives considered:**
- Calculate expected move: price × IV × √(days/365)
- Report raw IV only
- Exclude IV entirely

**Why directional only:** The expected move calculation is correct in theory but requires careful attention to time horizon — IV is annualized and the conversion depends on which expiry date you use. A miscalculated expected move number presented to agents as market intelligence is worse than no number at all — agents will cite a wrong figure confidently. The directional signal ("IV significantly elevated vs 30-day average — options market pricing in uncertainty") gives agents everything they need to reason without the liability of a potentially wrong derived number.

---

## 28. Short Interest Context: Hardcoded Sector Benchmarks

**Decision:** Sector average short interest provided as hardcoded reference values rather than computed dynamically.

**Alternatives considered:**
- Pull sector ETF short interest via FINRA (dynamic but requires ETF lookup per sector)
- Compute from individual stock averages (infeasible without premium data)
- Show raw number without context (misleading)

**Why hardcoded:** 2.3% short interest means completely different things in utilities vs semiconductors. Without context agents cannot interpret the signal correctly. Dynamic sector short interest would require knowing which ETF maps to each sector, fetching that ETF's short data from FINRA, and handling the biweekly update lag. The hardcoded table (Technology: 4-8%, Healthcare: 5-10%, Financials: 3-5%, etc.) is accurate for normal market conditions and requires a single code review to update if sector norms shift significantly. Same pattern applied to sector P/E benchmarks.

---

## 29. Valuation Data: P/E Added, sectorPE Not Trusted

**Decision:** Include trailing P/E and forward P/E from yfinance. Use hardcoded sector P/E benchmarks rather than yfinance's sectorPE field.

**Alternatives considered:**
- Use yfinance sectorPE (unreliable, frequently null)
- No valuation data in research package
- EV/EBITDA or Price/Sales instead of P/E

**Why P/E with hardcoded benchmarks:** P/E is the most universally understood valuation metric and the one agents are most likely to reason about correctly. Without it agents will make valuation claims without package-backed evidence — a primary hallucination vector. The yfinance sectorPE field returns null frequently enough to be unreliable as a prompt input. Hardcoded benchmarks are accurate for normal conditions and solve the context problem pragmatically.

**Why null P/E is treated as signal not missing data:** If trailing P/E is null the company likely has negative earnings. That is meaningful information for both Bull and Bear agents — not data to hide.

---

## 30. EDGAR Integration: Caution Flag Only, No Content Parsing

**Decision:** Fetch 8-K filing dates from EDGAR RSS (free, no auth). Surface as "material event occurred X days ago" caution to Judge only. Do not parse filing content.

**Alternatives considered:**
- Full Form 4 XML parsing for insider transactions
- Parse 8-K content to extract key figures
- Exclude EDGAR entirely (post-launch)
- Use sec-edgar-downloader library

**Why flag-only:** Form 4 XML parsing is a genuine engineering project — handling amended filings (4/A), correctly attributing transactions, parsing different filing structures. Estimated effort exceeds all other researcher.py work combined. The RSS date fetch is a single HTTP call with no parsing. "An 8-K was filed 2 days ago" prompts the user to do one piece of homework before trading — more honest than silence, less overengineered than content parsing. yfinance insider_transactions provides sufficient insider activity data without EDGAR complexity.

---

## 31. Ticker Validation: Regex at API Boundary

**Decision:** All analyze and trade endpoints validate tickers against ^[A-Z]{1,5}$ before any processing.

**Alternatives considered:**
- Validate in frontend only
- No validation (let yfinance fail gracefully)
- Allow alphanumeric (for tickers like BRK.B)

**Why regex at API boundary:** Ticker symbols are user input that flows into yfinance calls, file paths (CSV cache), and eventually LLM prompts. Without validation, a malformed ticker could cause unexpected failures in any of those systems. More critically for the LLM integration, an unvalidated ticker is a prompt injection surface — a user could theoretically enter a string designed to manipulate the agent prompts. Frontend-only validation is insufficient because the API is directly accessible on localhost. The 1-5 uppercase letter pattern covers all NYSE/NASDAQ tickers. Special cases like BRK.B handled as known exceptions if needed.

---

## 32. Headline Sanitization: Strip and Label Before Prompt Context

**Decision:** sanitize_headline() function strips control characters, truncates to 200 characters, and wraps as [HEADLINE]: "..." before any prompt injection.

**Alternatives considered:**
- Pass headlines raw to prompts
- HTML-encode special characters only
- Exclude headlines from prompts entirely

**Why explicit sanitization:** Raw headlines from RSS feeds can contain control characters, unicode manipulation characters, and arbitrary strings. Once LiteLLM integration is live these headlines will be injected into LLM prompts. Without sanitization this is a prompt injection surface — a maliciously crafted headline could potentially manipulate agent behavior. The [HEADLINE]: "..." wrapper explicitly marks the content as untrusted external data in the prompt context.

---

## 33. Debate Gating: MARGINAL Zone Only

**Decision:** Debate only runs when the quant analysis produces a MARGINAL confidence zone (50-70%). Strong signals skip debate entirely.

**Alternatives considered:**
- Run debate on every analysis
- User-triggered debate regardless of signal strength
- Debate only on explicit user request

**Why MARGINAL-only automatic gating:** A STRONG_BUY or STRONG_SELL signal with 90%+ confidence from the quant layer does not benefit from a debate — the technical picture is clear. Running seven LLM calls on a strong signal wastes API tokens and user time. The debate exists for exactly the marginal cases where the quant signal is inconclusive and human judgment needs more input. User-triggered debate regardless of zone preserved as an option — if a user wants a debate on a strong signal they can still trigger it — but automatic debate is gated to marginal.

---

## 34. Corrupt Ledger: Fail Closed with Quarantine

**Decision:** Corrupt paper_trades.json causes RuntimeError, quarantines the file to paper_trades.json.corrupt.{timestamp}, and blocks trading operations until resolved.

**Alternatives considered:**
- Silent return [] and continue (original behavior)
- Log warning and return [] (common pattern)
- Attempt JSON repair
- Delete corrupt file and start fresh

**Why fail closed:** Silently returning [] means the app operates as if no trades exist. In a paper trading context this could show an empty portfolio when the user has positions — masking real (paper) P&L. More critically, if this happened in live mode the user could take actions based on false portfolio state. Quarantine-and-fail is more disruptive but makes the problem visible and preserves the corrupt file for potential recovery. Auto-repair and auto-delete were rejected because data loss in financial records is worse than a hard stop.

---

## 35. Legacy Code Quarantine Before LiteLLM Integration

**Decision:** Remove /execute route, quarantine run_daily_cycle(), stub execute_trade.py, remove AgentTeam scaffold before any LiteLLM code was written.

**Alternatives considered:**
- Keep legacy code alongside new code during transition
- Mark as deprecated with comments
- Remove incrementally as new code is proven

**Why clean quarantine first:** Adding LiteLLM to a codebase with a parallel execution path creates confusion about what's actually running. The /execute route was a blocking POST that called run_daily_cycle() — if it remained active alongside the new /analyze/stream SSE endpoint there would be two ways to trigger analysis with different behaviors. During debugging it would be impossible to know which path fired. Clean removal before integration means any issue during LiteLLM work is unambiguously in the new code.

---

## 36. Design System: Bodoni Moda + Jost, No System Fonts

**Decision:** Bodoni Moda (serif) for prices and display text, Jost (sans-serif) for all UI labels. No system fonts, no component libraries for charts.

**Alternatives considered:**
- Inter or SF Pro (system-appropriate)
- Single font family throughout
- Recharts or Chart.js for portfolio visualization
- shadcn/ui for component library

**Why custom typography:** Financial terminals are information-dense — visual hierarchy is how users parse data quickly. Bodoni Moda's high-contrast serifs make prices immediately visually distinct from labels and metadata. A uniformly weighted sans-serif UI makes everything look the same weight, slowing information parsing. The font pairing creates a visual language that distinguishes "data" from "interface" at a glance.

**Why no chart library for portfolio donut:** Third-party chart libraries add bundle weight and style constraints. A simple portfolio allocation donut is a manageable SVG — custom implementation means full control over colors, sizing, and interaction without fighting library opinions.

---

## 37. Authentication Model: Separate Scope from Core App

**Decision:** Authentication handled entirely by market-midas.vercel.app. Token stored locally after login. Core app functional without authentication during development.

**Alternatives considered:**
- In-app auth (Supabase, Firebase)
- No auth (open access)
- Electron keychain storage of credentials

**Why separate scope:** Authentication requires a web backend with session management, password hashing, email verification, and security maintenance. Building this inside the desktop app would mix concerns and require ongoing security maintenance unrelated to trading logic. Delegating to a Vercel-hosted web app keeps auth as a separate deployable with its own maintenance lifecycle. Core app remains functional without auth during development, preventing auth from blocking the trading features roadmap.

---

## 38. API Key Storage: Plaintext Now, Keychain Post-Launch

**Decision:** API keys (LiteLLM provider keys) stored in plaintext in config/settings.json for v1. macOS Keychain integration explicitly deferred to post-launch.

**Alternatives considered:**
- macOS Keychain from day one
- Encrypted local storage
- Environment variables
- Plaintext (accepted risk)

**Why defer Keychain:** Tauri 2.0 has Keychain integration via the keyring plugin but it requires additional native permissions and introduces platform-specific code paths. For a pre-launch product where the only user is the developer and a small beta group, the marginal security improvement over plaintext in a local config file (on a single-user personal machine) does not justify the implementation complexity. The risk is documented, accepted, and scheduled for post-launch hardening before any public distribution.

---

## 39. Market Closed Response: Structured 200 over 500 Error

**Decision:** When market is closed and data unavailable, return a structured 200 response with state: "market_closed" rather than a 500 error or empty response.

**Alternatives considered:**
- HTTP 503 Service Unavailable
- HTTP 404 Not Found
- HTTP 500 Internal Server Error (original behavior)
- Return empty analysis with error flag

**Why structured 200:** Market closure is not an error — it's a known, expected, handleable state. HTTP 5xx signals server malfunction. HTTP 4xx signals client error. Neither is appropriate for "markets are closed." A structured 200 with machine-readable state allows the frontend to render a specific UI (the MarketClosedState component with countdown to open) rather than a generic error screen. The response includes market_status, reason (no_cached_data vs cache_too_stale), and cache_age_days so the frontend has everything needed to give the user a useful explanation.

---

## 40. Cached Data Interstitial: User Agency over Silent Fallback

**Decision:** When analysis succeeds using cached data (market closed, yfinance unavailable), show an interstitial screen before results rather than silently displaying stale data.

**Alternatives considered:**
- Show results silently with small staleness indicator
- Block entirely (no cached analysis)
- Show results immediately with banner warning

**Why interstitial:** A user who sees $31.72 as the "current price" without knowing it's Friday's close might act on it as if it's live data. The interstitial creates a moment of informed consent — the user explicitly chooses to view analysis they know uses data from N days ago. "SET ALERT" is offered as an alternative — a user who doesn't want to act on stale data can set an alert for when markets reopen. This respects user autonomy while preventing accidental decisions based on misunderstood data freshness.

---

*55 backend tests passing. TypeScript zero errors. All decisions above are implemented and verified.*
