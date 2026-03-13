# Product Requirements Document — Market Midas

## 1. Executive Summary

**Product:** Market Midas
**Type:** Native macOS trading terminal (Tauri 2.0 desktop app)
**Website:** market-midas.vercel.app

Market Midas is a local-first AI-powered trading assistant. It combines technical analysis with AI-driven debate agents to generate trade signals, and uses Playwright browser automation for Robinhood order execution. The app runs entirely on the user's Mac — all positions, alerts, and settings are stored locally.

---

## 2. Core Value Proposition

1. **AI-powered analysis** — Bull and Bear agents debate a stock using real technical data, powered by LiteLLM (supports OpenAI, Anthropic, Google)
2. **Human-in-the-loop execution** — Playwright automates Robinhood but requires explicit user confirmation before submitting any order
3. **Paper + Live modes** — practice with simulated money before risking real capital
4. **Local-first** — no cloud dependency for trading logic. Auth gates access but data stays on device.

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Tauri 2.0 |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | Python 3.12+ FastAPI (port 8000) |
| AI | LiteLLM (multi-provider abstraction) |
| Execution | Playwright (Robinhood browser automation) |
| Auth | JWT token from market-midas.vercel.app |
| Config | Local JSON files (settings.json, logs/) |

---

## 4. Auth & Account Model

- Users create accounts on market-midas.vercel.app (marketing site)
- App validates credentials against the website's auth API on launch
- Token stored locally after successful login — stays logged in until explicit sign out
- No cloud sync of trading data (positions, alerts, settings stay local)
- Multi-device: logging in on a new device starts fresh — no data sync (post-launch roadmap)
- New account flow: login → onboarding → main app
- Returning account flow: login (if token expired) → main app

---

## 5. AI Integration (LiteLLM)

The app uses LiteLLM as a unified interface to multiple AI providers. This means users can connect their own API key from any supported provider.

**Supported providers:**
- OpenAI (default model: gpt-4o)
- Anthropic (default model: claude-sonnet-4-20250514)
- Google (default model: gemini-2.0-flash)

**How it works:**
- User selects provider and enters API key in Settings
- Key stored in `config/settings.json` (local only, never transmitted to our servers)
- Python backend reads provider/key/model from settings.json on each request
- LiteLLM handles the provider-specific API calls transparently

**AI components to be built:**
1. `src/agents/analyst.py` — replace rule-based template strings with real LLM calls for stock analysis summary
2. `src/strategy/debate.py` — replace if/else logic with real multi-turn Bull/Bear conversation

---

## 6. Trading Modes

**Paper Mode:**
- Simulated money, real market data
- Starting balance set during onboarding (default $100,000)
- Balance stored in settings.json `walletBalance`
- Trades logged to `logs/paper_trades.json`
- No Robinhood connection required

**Live Mode:**
- Real Robinhood account
- Buying power scraped via Playwright on trade execution
- Buying power stored in settings.json with timestamp
- Full Playwright automation with human confirmation step

---

## 7. Screen Map

| Screen | Route | Description |
|--------|-------|-------------|
| Login | `/login` | Auth gate, shown if no valid token |
| Onboarding | `/onboarding` | First-run setup, 4 steps |
| Analyze | `/` | Home screen, ticker analysis |
| Debate | `/debate` | Bull vs Bear AI debate |
| Trade | `/trade` | Order review and execution |
| Positions | `/positions` | Portfolio tracker with donut chart |
| Settings | `/settings` | Provider, mode, risk controls |
| Paper Wallet | `/paper-wallet` | → redirects to /positions |
| Alerts | `/alerts` | → redirects to /positions |

---

## 8. Alert System

- Alerts stored in `logs/user_alerts.json`
- Python `alert_engine.py` monitors prices and triggers alerts
- Types: stop_loss (%), price_target ($)
- Global bell icon in title bar — gold dot when triggered
- Alerts panel slides in from right with full-screen blur backdrop
- 36/36 backend tests passing

---

## 9. Risk Controls

- Max position: 5% of total account value per trade (configurable)
- Stop loss: automatic at user-defined % below entry (default 5%)
- Max daily drawdown: configurable (default 5%)
- Human confirmation required before every live order submission

---

## 10. Data & Config Files

| File | Purpose |
|------|---------|
| `config/settings.json` | All user preferences + AI config |
| `logs/paper_trades.json` | Paper trade ledger |
| `logs/user_alerts.json` | Custom price alerts |
| `logs/alert_log.json` | Alert engine audit log |
| `data/raw/` | Immutable OHLCV data (ALCOA+) |

---

## 11. Build Phases

**Completed:**
- Tauri native shell + macOS window ergonomics
- Analyze screen (empty, loading, results states)
- Debate session (streaming, conviction meters, verdict)
- Trade execution (paper + live, 3 states)
- Positions screen (donut chart, master/detail, close position)
- Alerts backend (alert_engine.py, 36/36 tests)
- Global alerts panel + Add Alert modal
- Bell icon in title bar

**In Progress (F-2):**
- Settings screen (provider selector, API key, risk controls)
- Onboarding flow (4 steps)
- Price refresh on Positions (30s polling)
- Buying power auto-fill on Order Review
- Login screen

**Pending:**
- LiteLLM integration (replace analyst.py + debate.py)
- Marketing website auth backend
- App login screen connecting to website auth

**Post-Launch Roadmap:**
- Cloud sync for positions and alerts
- Multi-device support
- Additional broker support beyond Robinhood

---

## 12. Success Metrics

- User completes onboarding and first paper trade in < 5 minutes
- Analysis + debate completes in < 30 seconds
- Zero crashes during trade execution flow
- Alert triggers within 60 seconds of price threshold breach
