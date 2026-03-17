# Market Midas — Project Context & Coding Standards

## Overview
Market Midas is a native macOS trading terminal built with Tauri 2.0, Next.js 14, and a Python FastAPI backend. It combines rule-based technical analysis with AI-powered debate agents (via LiteLLM) to generate trade signals, and uses Playwright browser automation for Robinhood order execution.

The app is local-first. All data (positions, alerts, settings) lives on the user's machine. Auth is handled via the marketing website at market-midas.vercel.app — the app validates a stored token on launch and requires login before use.

## Tech Stack
- **Shell:** Tauri 2.0 (native macOS window, traffic lights, drag region)
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** Python 3.12+ FastAPI (port 8000)
- **Frontend Dev Server:** Next.js (port 3001)
- **AI Layer:** LiteLLM (multi-provider: OpenAI, Anthropic, Google)
- **Execution:** Playwright (Robinhood browser automation)
- **Design System:** MMDesign.md + MMAppDesign.md (single source of truth)

## Architecture
```
Tauri Shell
  └── Next.js Frontend (port 3001)
        ├── src/app/                  # Page routes
        ├── src/app/api/              # Next.js API routes (thin proxies to Python — DO NOT MODIFY)
        ├── src/components/           # Shared UI components
        ├── src/context/AppContext.tsx # Global state (mode, alerts, preferences)
        └── src/hooks/                # Extracted logic hooks (DO NOT MODIFY)
  └── Python FastAPI Backend (port 8000)
        ├── src/server.py             # Main FastAPI app
        ├── src/agents/analyst.py     # Technical analysis (to be replaced with LiteLLM calls)
        ├── src/strategy/debate.py    # Bull/Bear debate (to be replaced with LiteLLM calls)
        └── src/alert_engine.py       # Alert monitoring (36/36 tests passing)
```

## Routing Map (Current)
| Route | Screen |
|-------|--------|
| `/` | Analyze (home screen) |
| `/debate` | Debate Session |
| `/trade` | Trade Execution |
| `/positions` | Positions + Trade Tracker |
| `/settings` | Settings |
| `/onboarding` | First-run setup (runs once) |
| `/paper-wallet` | → redirects to /positions |
| `/alerts` | → redirects to /positions |

## Global State (AppContext)
AppContext holds and exposes:
- `mode`: 'paper' | 'live'
- `preferences`: UserPreferences from settings.json
- `alerts`: Alert[] — single source of truth for all alert data
- `fetchAlerts()`: refreshes alerts array from backend
- `isLoading`: boolean

No component fetches alerts independently. All alert reads come from AppContext.

## Settings File (config/settings.json)
This is the single config file. Shape:
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

## Alert System
- Schema: `{ id, ticker, type, threshold, thresholdPrice, entryPrice, active, triggered, createdAt }`
- Backend: `src/alert_engine.py` — Python is source of truth
- API: GET/POST `/alerts`, PATCH/DELETE `/alerts/{id}`
- Frontend proxy: `src/app/api/alerts/route.ts` (do not modify)
- Storage: `logs/user_alerts.json` (atomic writes via .tmp + os.replace)

## Global UI Events (window.dispatchEvent)
| Event | Behavior |
|-------|----------|
| `toggle-alerts-panel` | Opens OR closes the alerts panel (bell icon only) |
| `open-alerts-panel` | Always opens the panel, never closes |
| `open-alert-modal` | Opens Add Alert modal, accepts `{ detail: { ticker } }` |

## Auth Pattern
- Login screen shown on app launch if no valid token stored
- Token stored locally after successful auth against market-midas.vercel.app
- Stays logged in until user explicitly signs out
- New account → onboarding flow → main app
- Returning account → main app directly

## Buying Power
- Paper mode: reads `walletBalance` from settings.json
- Live mode: scraped from Robinhood via Playwright on trade execution, stored with timestamp
- Freshness tiers: green (today), gold (≤7 days), red (>7 days)

## Coding Standards
- **Style:** PEP-8 strict for Python. TypeScript strict mode.
- **Imports:** stdlib → third-party → local.
- **Naming:** `snake_case` Python, `camelCase`/`PascalCase` TypeScript.
- **Error Handling:** Never silently swallow exceptions. Log all errors.
- **Testing:** pytest for Python. Tests in `tests/`.

## CRITICAL RULES — Read Before Every Task
1. **NEVER modify** `src/app/api/` routes or `src/hooks/` — these are locked
2. **Always read** MMDesign.md and MMAppDesign.md before writing any UI code
3. **No Inter/Roboto/system fonts** — only Jost (sans) and Bodoni Moda (serif)
4. **No spinners** — use sequential step indicators for loading states
5. **No purple gradients** — palette is strictly charcoal/gold/alabaster
6. **Run** `npx tsc --noEmit` after every task — zero errors required
7. **Delete all existing JSX** before rebuilding a screen — never patch over old code

## Directory Structure
```
Market-Midas/
├── frontend/
│   ├── src/app/              # Next.js pages and API routes
│   ├── src/components/       # UI components
│   ├── src/context/          # AppContext
│   ├── src/hooks/            # Logic hooks (locked)
│   └── src-tauri/            # Tauri config
├── src/
│   ├── agents/               # analyst.py (LiteLLM integration pending)
│   ├── strategy/             # debate.py (LiteLLM integration pending)
│   ├── alert_engine.py       # Alert monitoring
│   └── server.py             # FastAPI
├── config/
│   └── settings.json         # User config
├── logs/
│   ├── paper_trades.json     # Trade ledger
│   ├── alert_log.json        # Alert state
│   └── user_alerts.json      # Custom alerts
└── tests/                    # pytest suite
```
