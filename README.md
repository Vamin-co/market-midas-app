# Market-Midas

Market-Midas is a powerful, local-first, AI-driven desktop application designed to act as your ultimate "human-in-the-loop" trading and equity research assistant. By combining quantitative technical analysis with real-time news sentiment and adversarial AI debate logic, Market-Midas provides institutional-grade insights directly from your desktop.

🔗 **[Download the App](https://market-midas.vercel.app)** *(Currently optimized for macOS, with Windows and Linux support via Tauri)*

---

## Features

*   **Native Desktop Experience**: Built using Tauri, delivering a lightning-fast, lightweight, and secure desktop application that runs locally on your machine.
*   **Bring Your Own Agent (BYOA) with LiteLLM**: Market-Midas integrates seamlessly with LiteLLM, allowing you to plug in your preferred AI models (Anthropic Claude, OpenAI ChatGPT, Google Gemini, or local models) to power your trading agents. 
*   **Multi-Agent Architecture**: Separate specialized agents (Analyst, Strategy Engine, Researcher, Risk Manager, and Trader) power the analysis pipeline.
*   **Adversarial "Debate Mode"**: For ambiguous market conditions, the system spawns **🐂 Bull** and **🐻 Bear** sub-agents to argue the case utilizing both technical data and live news sentiment, mitigating confirmation bias before you make a decision.
*   **Real-time Sentiment Analysis (Sentinel)**: Scrapes, parses, and scores headlines using financial keyword lexicons to give you the fundamental context behind the price action.
*   **Air-Gapped Safety Constraints**: Explicit "human-in-the-loop" design. The AI scopes the trades, analyzes the data, and stages the logic, but explicitly waits for a human to confirm before any action is executed.

---

## How It Works (The Pipeline)

When you research a ticker in the Market-Midas desktop app, the system executes the following cycle locally:

1.  **Technical Ingestion (Analyst Agent)**
    *   Fetches the latest OHLCV data.
    *   Computes core indicators: **SMA-50**, **SMA-200** (checking for Golden/Death crosses), and **RSI-14**.
2.  **Composite Scoring (Strategy Engine)**
    *   Weights the technicals (RSI, SMA trend, Crosses, Momentum) into a final **Confidence Score**.
3.  **Fundamental Context (Researcher/Sentinel Agent)**
    *   Fetches the top latest headlines for the ticker.
    *   Produces a composite News Sentiment score between `-1.0` (Max Bearish) and `+1.0` (Max Bullish).
4.  **Structured Analytic Technique (Debate Mode)**
    *   Leverages your chosen LiteLLM model.
    *   **Bull** combines oversold technicals with bullish headlines to argue *for* the trade.
    *   **Bear** uses momentum drops and bearish headlines to argue *against* it.
    *   Calculates a final conviction score and presents the summarized debate in the UI.
5.  **Position Sizing (Risk Manager)**
    *   Operates using fractional Kelly-criterion logic, recommending safe maximum allocations based on your portfolio.

---

## 📊 Performance & Optimization Philosophy

Market-Midas isn't a black-box trading bot—it's an intelligence augmentation tool. During our development and backtesting, we optimized the logic to prevent "cash drag" (holding cash too long during bull markets) by:
1.  **Relaxed Risk Constraints:** Implementing an optimized position sizing algorithm allowing up to 25% chunks based on conviction.
2.  **Momentum Buy Signals:** Adding logic to buy swing momentum rather than waiting exclusively for deep oversold dips.

By marrying these quantitative principles with robust AI reasoning via LiteLLM, Market-Midas helps retail traders make highly analytical decisions without emotional bias.

---

## 🛠 Tech Stack

*   **Frontend UI**: React / Next.js
*   **Desktop Framework**: Tauri (Rust)
*   **Backend Logic**: Python
*   **AI Integration**: LiteLLM (Supports Anthropic, OpenAI, Gemini, etc.)

---

## 📄 License
MIT License
