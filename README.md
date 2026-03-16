# Market Midas

Market Midas is a native macOS trading terminal designed for retail investors who want genuine analytical rigor without a Bloomberg subscription. It runs entirely on your Mac — no cloud processing, no telemetry, no subscription required for the core trading logic. You enter a ticker, the app fetches real market data, runs technical analysis, stages an adversarial Bull vs. Bear debate over the trade, and waits for your confirmation before touching your Robinhood account. The AI does the analysis. You make the decision.

---

[Screenshot coming soon]

---

## Current Features

**Analyze Screen**

Enter any ticker and the pipeline runs automatically. The app fetches six months of OHLCV data via yfinance, computes RSI-14, SMA-50, and SMA-200, checks for Golden Cross and Death Cross conditions, and produces a BUY / SELL / HOLD recommendation with a confidence score. Results display in a structured card: current price with daily change, 52-week range, market cap, next earnings date, and a technical indicators panel showing each signal with an Above/Below or Oversold/Overbought chip.

**Debate Session**

When confidence falls in the marginal zone (50–70%), the app opens the Debate screen. Two adversarial agents — Bull and Bear — each receive the same OHLCV data and news sentiment context, then build independent cases from technical indicators, momentum readings, and headline scoring. Both arguments are presented side by side with conviction meters. You read the case, see who won, and decide whether to proceed or abort. This is not AI-generated text today — the current implementation uses rule-based Python logic that evaluates the same indicators a human analyst would. Real LLM calls via LiteLLM are the next major integration milestone.

**Trade Execution**

Paper mode logs trades to a local JSON ledger with no real money at risk. Live mode uses Playwright browser automation to stage a Robinhood order. The app will not submit anything without an explicit confirmation from you. Human confirmation is not optional and cannot be bypassed.

**Positions Tracker**

A portfolio view with an SVG donut chart showing allocation by ticker, a position detail panel with P&L, days held, and order history, and action buttons to add, close, or set alerts on any position.

**Alert System**

Set price-target or stop-loss alerts on any ticker directly from the bell icon in the title bar. A Python scheduler polls prices every 15 minutes and fires the alert when the threshold is crossed. 44 backend tests are currently passing.

**Paper and Live Modes**

Paper mode uses a configurable starting balance (default $100,000) stored locally. Live mode connects to your Robinhood account via Playwright. The mode is always visible in the sidebar — it is never ambiguous which mode you are operating in.

---

## How It Works

```
User enters ticker
  └── yfinance fetches 6 months of OHLCV data
        └── AnalystAgent computes RSI-14, SMA-50, SMA-200, Golden/Death Cross
              └── StrategyEngine produces BUY/SELL/HOLD + confidence score
                    ├── High confidence → Results screen
                    └── Marginal confidence → Debate session
                          └── Bull and Bear agents build adversarial cases
                                └── User reviews, confirms or aborts
                                      └── Paper: logged to paper_trades.json
                                          Live: Playwright stages Robinhood order
                                                → User confirms → Order submitted
```

All processing happens locally. Market data comes from yfinance. News sentiment is scored using a keyword lexicon against RSS feed headlines. No analysis data leaves your machine.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Tauri 2.0 |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | Python 3.12+ FastAPI (port 8000) |
| Market Data | yfinance |
| Execution | Playwright (Robinhood browser automation) |
| AI Layer | LiteLLM — pending integration (OpenAI, Anthropic, Google) |
| Config | Local JSON files (config/settings.json, logs/) |

The design system uses Bodoni Moda (serif, for headlines and prices) paired with Jost (sans-serif, for labels and UI text) against a warm charcoal and alabaster palette. No system fonts. No external UI libraries for charts — the portfolio donut is pure SVG.

---

## Getting Started

### Prerequisites

- macOS 12+
- Node.js 18+
- Python 3.12+
- Rust (for Tauri): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### Install Dependencies

```bash
# Python backend
pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..

# Root scripts
npm install
```

### Run in Development

From the project root:

```bash
npm run dev
```

This starts three processes concurrently:

- `dev:api` — FastAPI backend on port 8000 (uvicorn with reload)
- `dev:next` — Next.js frontend on port 3001 (waits for backend)
- `dev:tauri` — Tauri shell (waits for Next.js)

You can also run the backend and frontend independently:

```bash
# Backend only
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload

# Frontend only (from /frontend)
npm run dev:frontend
```

### Run Tests

```bash
pytest tests/ -v
```

All 44 tests should pass. The test suite covers the alert engine, technical indicator calculations, and the analysis pipeline.

### Build for Production

```bash
npm run build:mac
```

Outputs a signed `.app` bundle in `frontend/src-tauri/target/release/bundle/`.

---

## Configuration

All user preferences live in `config/settings.json`. This file is created on first run.

```json
{
  "provider": "openai",
  "apiKey": "sk-...",
  "model": "gpt-4o",
  "walletBalance": 100000.0,
  "defaultTradeSize": 1000.0,
  "alertThreshold": 5.0,
  "maxDailyDrawdown": 5.0,
  "stopLossThreshold": 5.0,
  "mode": "paper",
  "onboardingComplete": false
}
```

The `provider`, `apiKey`, and `model` fields are reserved for the upcoming LiteLLM integration. They have no effect on the current analysis pipeline.

---

## Roadmap

**LiteLLM Integration (Next)**

The analyst and debate modules currently use rule-based Python logic. The architecture is already built to receive real LLM calls — `analyst.py` and `debate.py` are the two files that will be replaced. Once integrated, users will connect their own API key from any supported provider (OpenAI, Anthropic, Google, DeepSeek, xAI) and the analysis and debate text will be generated by the model of their choice. No model data is sent to Market Midas servers — the call goes directly from your machine to the provider.

**Authentication**

A login screen is in progress. Accounts are created at [market-midas.vercel.app](https://market-midas.vercel.app). The token is stored locally after login — you stay authenticated until you sign out.

**Onboarding Flow**

A first-run setup flow that walks through trading mode selection, starting balance, and stop-loss configuration. Currently routed but not yet wired to the auth backend.

**Cloud Sync (Post-Launch)**

Positions, alerts, and settings are local-only today. Multi-device sync is a post-launch roadmap item.

**Additional Data Providers**

Finnhub is planned as an alternative to yfinance for users who want real-time data rather than end-of-day prices.

**Additional Broker Support**

Robinhood via Playwright is the only execution target today. Additional broker integrations are planned for a future release.

---

## Project Structure

```
Market-Midas/
├── frontend/
│   ├── src/app/              # Next.js pages and API routes
│   ├── src/components/       # UI components
│   ├── src/context/          # AppContext (global state)
│   └── src-tauri/            # Tauri shell configuration
├── src/
│   ├── agents/analyst.py     # Technical analysis (LiteLLM integration pending)
│   ├── strategy/debate.py    # Bull/Bear debate (LiteLLM integration pending)
│   ├── alert_engine.py       # Price alert monitoring
│   └── server.py             # FastAPI server
├── config/
│   └── settings.json         # User configuration
├── logs/
│   ├── paper_trades.json     # Paper trading ledger
│   └── user_alerts.json      # Active price alerts
└── tests/                    # pytest suite (44 tests)
```

---

## Contributing

This project is in active development. If you find a bug or want to contribute, open an issue on GitHub first to discuss the change before submitting a pull request.

---

## License

MIT
