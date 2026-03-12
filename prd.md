# Product Requirements Document (PRD): Project "Market-Midas"

## 1. Executive Summary
**Product Name:** Market-Midas
**Goal:** Develop an automated trading assistant that identifies high-probability swing trade opportunities on the Robinhood platform.
**Core Value:** The system combines quantitative technical analysis (Python) with qualitative sentiment analysis (Claude Opus 4.6) to generate trade signals. It utilizes Google Antigravity’s browser agents to execute or stage trades directly on the Robinhood web interface.

## 2. System Architecture & Tech Stack
*   **Platform:** Google Antigravity IDE (Agent-First Development Environment).
*   **Core Intelligence:** Claude Opus 4.6 (via API/Antigravity integration).
    *   *Configuration:* Set `effort` to "High" or "Max" for deep reasoning on financial data [1][2].
    *   *Context:* Utilization of the **1M token window** for analyzing historical data and earnings reports [3][4].
*   **Language:** Python 3.12+.
*   **Key Libraries:** `pandas` (data manipulation), `yfinance` (market data), `ta` (technical analysis), `playwright` (browser automation backup).
*   **Brokerage:** Robinhood (Web Interface interaction via Antigravity Browser Agent).

## 3. Agent Team Structure (Antigravity Specific)
To maximize Opus 4.6’s capabilities, the system will use the **Agent Teams** feature to parallelize work [5][6][7]. The Team Lead (you/main agent) will coordinate the following sub-agents:

1.  **The Analyst (Tech-Agent):**
    *   *Role:* Responsible for fetching OHLCV (Open, High, Low, Close, Volume) data and calculating technical indicators (RSI, MACD, Bollinger Bands) using Python.
    *   *Tooling:* Python Terminal, FileSystem.
2.  **The Researcher (Sentiment-Agent):**
    *   *Role:* Uses Opus 4.6's "extended thinking" to browse news and earnings transcripts. Scores market sentiment from -1 (Bearish) to +1 (Bullish).
    *   *Context:* Leverages the 1M token window to ingest full 10-K reports if necessary [3].
3.  **The Trader (Execution-Agent):**
    *   *Role:* Manages the Antigravity Browser to log in to Robinhood, verify account balance, and stage orders.
    *   *Constraint:* Must operate strictly under "Human-in-the-Loop" protocols for final execution [8].

## 4. Functional Requirements

### 4.1 Data Ingestion & Integrity (ALCOA+)
*   **Requirement:** System must fetch historical data for a user-defined watchlist (e.g., SPY, NVDA, TSLA).
*   **Standard:** Apply **ALCOA+ principles** (Attributable, Legible, Contemporaneous, Original, Accurate) to data handling [9].
    *   *Implementation:* All data fetches must be logged with timestamps to ensure model decisions are traceable.
    *   *Action:* Write a Python script using `yfinance` to pull 6 months of daily data and store it in a `data/raw` directory (preserving the "Original" record).

### 4.2 The Strategy Engine (Logic)
*   **Technical Logic:**
    *   Calculate a 50-day and 200-day Simple Moving Average (SMA).
    *   Identify "Golden Cross" (50 SMA > 200 SMA) or "Death Cross" events.
    *   Calculate RSI (Relative Strength Index). Buy signal if RSI < 30 (Oversold); Sell if RSI > 70 (Overbought).
*   **Sentiment Logic:**
    *   Ingest recent news headlines for the target ticker.
    *   Opus 4.6 must reason through the headlines to determine if a price drop is a "panic sell" (Buy opportunity) or a "fundamental failure" (Avoid).
*   **Decision Output:** The system must output a JSON artifact containing: `{Ticker, Action (BUY/SELL/HOLD), Confidence_Score, Reasoning}`.

### 4.3 Risk Management
*   **Position Sizing:** Never allocate more than 5% of total account value to a single trade.
*   **Stop Loss:** Automatically calculate a stop-loss price at 5% below the entry price.
*   **Validation:** Implementation of a **Unit Test** suite to verify that buy signals are not generated if the account balance is insufficient [10].

### 4.4 Execution (Antigravity Browser)
*   **Requirement:** The agent must be able to navigate the Robinhood web UI using the Antigravity internal browser [11].
*   **Workflow:**
    1.  Agent launches the internal Antigravity Browser.
    2.  Navigates to the stock detail page.
    3.  Inputs the dollar amount or share quantity.
    4.  **Constraint:** The agent must *pause* and request human approval via an **Artifact** (Screenshot/Walkthrough) before clicking the final "Review Order" or "Submit" button [12].

## 5. Implementation Roadmap for Opus 4.6

**Phase 1: Project Scaffolding & Context**
*   *Prompt:* "Read @prd.md. Initialize the project with a `CLAUDE.md` file to store project context and coding standards [13]. Create directories for `src/`, `data/`, `logs/`, and a `requirements.txt`."

**Phase 2: The Logic Core (Analyst Agent)**
*   *Prompt:* "Spawn an Analyst agent. Write a Python function `analyze_stock(ticker)` that pulls data, calculates RSI and SMA-50/200. Return a pandas DataFrame. Ensure code follows PEP-8."

**Phase 3: The Integration (Trader Agent)**
*   *Prompt:* "Spawn a Trader agent. Create an Antigravity browser automation script. Goal: Log in to Robinhood (wait for me to handle 2FA), navigate to a stock page, and verify you can read the current price from the DOM. **Do not execute trades.**"

**Phase 4: Backtesting & Verification**
*   *Prompt:* "Create a backtesting script that runs our strategy against the last 1 year of data [14]. Generate a report Artifact showing 'Win Rate' and 'Max Drawdown'."

## 6. Success Metrics & Artifacts
*   **Artifact 1:** `strategy_report.md` - Daily report summarizing market conditions and trade recommendations.
*   **Artifact 2:** `backtest_results.csv` - Historical profitability proof.
*   **Artifact 3:** `trade_log.json` - A contemporaneous log of all bot actions for audit purposes.

***