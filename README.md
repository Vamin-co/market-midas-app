# 🏛️ Market-Midas

Market-Midas is an AI-powered, modular, "human-in-the-loop" automated trading assistant that combines quantitative technical analysis with real-time news sentiment and adversarial debate logic. Built for safe execution, the bot stages orders in a browser but explicitly waits for a human to confirm.

---

## 🚀 Features

*   **Multi-Agent Architecture**: Separate specialized agents (Analyst, Strategy Engine, Researcher, Risk Manager, and Trader) power the trading pipeline.
*   **Adversarial "Debate Mode"**: For trades with marginal confidence (50-70%), the system spawns **🐂 Bull** and **🐻 Bear** sub-agents to argue the case utilizing both technical data and live news sentiment, mitigating confirmation bias.
*   **Real-time Sentiment Analysis (Sentinel)**: Scrapes, parses, and scores headlines from Google News and Yahoo Finance RSS feeds using financial keyword lexicons.
*   **Executive Dashboard (Morning Briefing)**: A premium, institution-grade Next.js web dashboard featuring solid colors, crisp typography (`Cormorant`/`Poppins`), and automated data visualization (Technical Confidence vs Sentiment).
*   **Browser-Based Trade Staging (Playwright)**: When in `LIVE` mode, the bot opens Robinhood, waits for 2FA, navigates to the stock, scrapes the live price, and fills out the order form.
*   **Air-Gapped Safety Constraints**: The exact "Review Order", "Submit", and "Confirm" buttons are strictly blacklisted. The web dashboard pauses awaiting explicit human authorization (Kill-Switch or Confirm Execution) before the Playwright payload is sent.
*   **Dual-Mode Execution**: Built-in toggle between `PAPER` (simulated execution JSON logging) and `LIVE` (browser-assisted) trading directly from the Landing Page.

---

## ⚙️ How It Works (The Pipeline)

When `python -m src.main NVDA` is run, the Daily Cycle Coordinator executes the following:

1.  **Technical Ingestion (Analyst Agent)**
    *   Fetches the latest 6-month OHLCV data via `yfinance`.
    *   Computes core indicators: **SMA-50**, **SMA-200** (checking for Golden/Death crosses), and **RSI-14**.
2.  **Composite Scoring (Strategy Engine)**
    *   Weights the technicals (RSI 40%, SMA trend 30%, Crosses 20%, Momentum 10%) into a final **Confidence Score (0-100%)**.
    *   Classifies the trade into zones: `STRONG` (≥70%), `MARGINAL` (50-70%), or `NEUTRAL` (<50%).
3.  **Fundamental Context (Researcher/Sentinel Agent)**
    *   Fetches the top ~15 headlines for the ticker.
    *   Produces a composite News Sentiment score between `-1.0` (Max Bearish) and `+1.0` (Max Bullish).
4.  **Structured Analytic Technique (Debate Mode)**
    *   Triggers automatically if the trade is in the `MARGINAL` zone.
    *   **Bull** combines oversold technicals with bullish headlines to argue *for* the trade.
    *   **Bear** uses momentum drops and bearish headlines (plus contrarian warnings) to argue *against* it.
    *   Calculates a final conviction score, resulting in either a `PROCEED`, `SKIP`, or `REDUCE_SIZE` (on a draw) recommendation.
5.  **Position Sizing (Risk Manager)**
    *   Operates using fractional Kelly-criterion logic, capping maximum allocation per trade to **25% of total portfolio cash**.
6.  **Human-in-the-Loop Execution (Trader Agent)**
    *   **If PAPER:** Evaluates the trade, deducts simulated cash, updates the simulated portfolio, and logs to `logs/paper_trades.json`.
    *   **If LIVE:** Launches Playwright, navigates Robinhood, fills the order form, and **halts completely**, throwing a bold red warning awaiting `ENTER` to confirm or `CTRL+C` to cancel.

---

## 📊 Backtesting Results & Metrics

During early design phases, Market-Midas suffered from severe "cash drag"—it stayed primarily in cash because its RSI parameters were too strict (only buying on `RSI < 30`).

We implemented two major optimizations:
1.  **Relaxed Risk Constraints:** Increased maximum position allocation from strict 5% chunks to **25%** chunks.
2.  **Momentum Buy Signals:** Added logic to buy swing momentum (`Close > SMA_50` AND `50 < RSI < 70`), catching uptrends rather than waiting exclusively for deep oversold dips.

### Comparative Baseline (NVDA Backtest Optimization)
*(Ran over 2 years of daily data)*

| Metric | Conservative (Baseline) | Momentum & 25% Size (Optimized) | Delta |
| :--- | :--- | :--- | :--- |
| **Total Return** | +1.27% | **+11.92%** | **+10.65% 📈** |
| **Max Drawdown** | -18.40% | **-6.69%** | **+11.71% 🛡️** |
| **Cash Drag Exposure** | Extreme (>95% cash) | Balanced | Greatly Improved |

The implementation of position sizing increases and momentum signals fundamentally changed the profile: yielding roughly 10x the returns while structurally cutting the max drawdown by more than half, thanks to more agile entries and exits above the 50-day moving average.

---

## 🛠 Project Structure

```text
Market-Midas/
├── artifacts/
│   └── daily_report_{date}.md       # Executive Morning Briefings / Dashboards
├── logs/
│   └── paper_trades.json            # Simulated trading ledger
├── src/
│   ├── agents/
│   │   ├── analyst.py               # Technical data ingestion & indicators
│   │   ├── researcher.py            # Sentinel (News fetching & sentiment scoring)
│   │   └── trader.py                # Playwright execution and kill-switch
│   ├── risk/
│   │   └── manager.py               # Portfolio sizing (25% cap logic)
│   ├── strategy/
│   │   ├── engine.py                # Confidence weighting (0-100%)
│   │   └── debate.py                # Bull vs Bear adversarial logic
│   └── main.py                      # Daily Cycle orchestrator and CLI
└── README.md                        # Project documentation (You are here)
```
