# Market-Midas — Project Context & Coding Standards

## Overview
Market-Midas is an automated trading assistant that identifies high-probability swing trade opportunities on Robinhood. It combines quantitative technical analysis (Python) with qualitative sentiment analysis (Claude Opus 4.6) to generate trade signals, using Google Antigravity's browser agents for execution.

## Architecture
- **Platform:** Google Antigravity IDE
- **Intelligence:** Claude Opus 4.6 (High/Max effort, 1M token context)
- **Language:** Python 3.12+
- **Brokerage:** Robinhood (web interface via Antigravity Browser Agent)

## Agent Team
| Agent | Role | Responsibilities |
|-------|------|-----------------|
| **Analyst** (Tech-Agent) | Technical Analysis | Fetch OHLCV data, calculate RSI, MACD, Bollinger Bands, SMA-50/200 |
| **Researcher** (Sentiment-Agent) | Sentiment Analysis | Browse news/earnings, score sentiment -1 (Bearish) to +1 (Bullish) |
| **Trader** (Execution-Agent) | Order Execution | Navigate Robinhood UI, stage orders, enforce human-in-the-loop |

## Coding Standards
- **Style:** PEP-8 strict. All functions must have type hints and docstrings.
- **Imports:** stdlib → third-party → local, separated by blank lines.
- **Naming:** `snake_case` for functions/variables, `PascalCase` for classes.
- **Error Handling:** Never silently swallow exceptions. Log all errors.
- **Testing:** `pytest` for all unit tests. Tests live in `tests/`.

## Data Handling (ALCOA+)
All data operations must follow ALCOA+ principles:
- **Attributable:** Every data fetch logged with source and timestamp.
- **Legible:** Raw data stored as clean CSVs in `data/raw/`.
- **Contemporaneous:** Timestamps recorded at time of fetch, not retroactively.
- **Original:** Raw data in `data/raw/` is immutable — never overwrite.
- **Accurate:** Validate data integrity after each fetch (no NaN rows, correct date ranges).

## Decision Output Format
All trade signals must follow this JSON schema:
```json
{
  "ticker": "NVDA",
  "action": "BUY | SELL | HOLD",
  "confidence_score": 0.85,
  "reasoning": "Golden Cross detected with RSI at 28 (oversold). Sentiment +0.7 (bullish earnings).",
  "timestamp": "2026-02-16T22:12:00Z",
  "stop_loss": 120.50,
  "position_size_pct": 4.5
}
```

## Risk Constraints
- **Max position:** 5% of total account value per trade.
- **Stop-loss:** Automatic at 5% below entry price.
- **Execution:** Human approval required before every order submission.

## Directory Structure
```
Market-Midas/
├── src/agents/       # Agent team (analyst, researcher, trader)
├── src/strategy/     # Strategy decision engine
├── src/risk/         # Risk management
├── src/data/         # Data ingestion & validation
├── data/raw/         # Immutable original OHLCV data
├── logs/             # Trade logs & audit trail
└── tests/            # pytest test suite
```

## Logging Convention
- Use Python `logging` module, not `print()`.
- Log level: `INFO` for routine ops, `WARNING` for anomalies, `ERROR` for failures.
- All logs written to `logs/` with ISO-8601 timestamps.
