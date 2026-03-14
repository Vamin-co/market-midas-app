"""
Market-Midas Main Loop — Daily Cycle Orchestrator.

Coordinates the Analyst, StrategyEngine, Debate, and Trader agents:
  1. Analyst fetches data + computes indicators.
  2. StrategyEngine scores confidence (0-100%).
  3. If MARGINAL (50-70%): Bull/Bear debate triggers.
  4. Risk Manager calculates position size.
  5. Trader stages the order (paper or live).
  6. Daily report saved to artifacts/.

Usage:
    python -m src.main NVDA          # single ticker
    python -m src.main SPY NVDA AAPL # multiple tickers
"""

from __future__ import annotations

import logging
import sys
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.agents.analyst import AnalystAgent
from src.agents.trader import TraderAgent, PAPER_TRADING
from src.risk.manager import RiskManager
from src.agents.researcher import ResearcherAgent
from src.strategy.engine import StrategyEngine
from src.strategy.debate import run_debate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("src.data.ingestion").setLevel(logging.WARNING)
logging.getLogger("src.risk.manager").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"


def _fetch_quant_data(ticker: str, current_price: float) -> dict[str, Any]:
    """Fetch supplementary quant data from yfinance for the frontend.

    All fields are extracted defensively — if yfinance returns ``None`` or
    raises, the corresponding field is set to ``None`` rather than crashing.

    Args:
        ticker: Stock ticker symbol (e.g. ``"NVDA"``).
        current_price: Current closing price from the analyst dataframe.

    Returns:
        Dict with keys: ``daily_change_percent``, ``fifty_two_week_high``,
        ``fifty_two_week_low``, ``volume_24h``, ``avg_volume_10d``,
        ``market_cap``, ``next_earnings_date``.
    """
    quant: dict[str, Any] = {
        "daily_change_percent": None,
        "fifty_two_week_high": None,
        "fifty_two_week_low": None,
        "volume_24h": None,
        "avg_volume_10d": None,
        "market_cap": None,
        "next_earnings_date": None,
    }

    try:
        info = yf.Ticker(ticker).info
        if not info:
            return quant

        # daily_change_percent
        prev_close = info.get("previousClose")
        if prev_close and prev_close > 0 and current_price:
            quant["daily_change_percent"] = round(
                ((current_price - prev_close) / prev_close) * 100, 4
            )

        quant["fifty_two_week_high"] = info.get("fiftyTwoWeekHigh")
        quant["fifty_two_week_low"] = info.get("fiftyTwoWeekLow")
        quant["volume_24h"] = info.get("volume")
        quant["avg_volume_10d"] = info.get("averageVolume10days")
        quant["market_cap"] = info.get("marketCap")

        # next_earnings_date — may be a list, datetime, or int timestamp
        raw_earnings = info.get("earningsDate")
        if raw_earnings is not None:
            from datetime import datetime as _dt

            if isinstance(raw_earnings, list) and len(raw_earnings) > 0:
                raw_earnings = raw_earnings[0]
            if isinstance(raw_earnings, (int, float)):
                quant["next_earnings_date"] = _dt.fromtimestamp(
                    raw_earnings
                ).strftime("%Y-%m-%d")
            elif hasattr(raw_earnings, "strftime"):
                quant["next_earnings_date"] = raw_earnings.strftime("%Y-%m-%d")
            elif isinstance(raw_earnings, str):
                quant["next_earnings_date"] = raw_earnings[:10]

    except Exception as exc:
        logger.warning("yfinance quant fetch failed for %s: %s", ticker, exc)

    return quant


# Simulated portfolio state
PORTFOLIO: dict[str, Any] = {
    "cash": 10_000.0,
    "positions": {},
}


def _generate_daily_report(
    ticker: str,
    latest: pd.Series,
    engine_signal: dict[str, Any],
    action: str,
    trade_result: dict | None,
    debate_obj: Any | None = None,
    sentiment_context: dict[str, Any] | None = None,
    position_shares: int = 0,
) -> str:
    """Generate a Morning Briefing dashboard — designed for < 30 second decisions.

    Returns:
        Absolute path to the saved report file.
    """
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filepath = ARTIFACTS_DIR / f"daily_report_{date_str}.md"

    mode_label = "📝 PAPER" if PAPER_TRADING else "🔴 LIVE"
    close = latest["Close"]
    rsi = latest.get("RSI_14", float("nan"))
    sma_50 = latest.get("SMA_50", float("nan"))
    sma_200 = latest.get("SMA_200", float("nan"))
    golden = latest.get("golden_cross", False)
    death = latest.get("death_cross", False)
    confidence = engine_signal.get("confidence_pct", 0)
    zone = engine_signal.get("zone", "NEUTRAL")
    signal_action = engine_signal.get("action", "HOLD")

    # ── Emoji coding ──
    def _zone_emoji(z: str) -> str:
        if "STRONG_BUY" in z: return "🟢"
        if "STRONG_SELL" in z: return "🔴"
        if z == "MARGINAL": return "🟡"
        return "⚪"

    def _rsi_emoji(r: float) -> str:
        if r < 30: return "🟢"
        if r > 70: return "🔴"
        if 30 <= r < 45: return "🟡"
        if 55 < r <= 70: return "🟡"
        return "⚪"

    def _sma_emoji(price: float, sma: float) -> str:
        if pd.isna(sma): return "⚪"
        return "🟢" if price > sma else "🔴"

    def _sent_emoji(score: float) -> str:
        if score > 0.15: return "🟢"
        if score < -0.15: return "🔴"
        return "🟡"

    # ── Sentiment data ──
    sent_score = 0.0
    n_bull = n_bear = n_total = 0
    top_bull_headline = "—"
    top_bear_headline = "—"
    if sentiment_context:
        sent_score = sentiment_context.get("composite_score", 0)
        bull_hl = sentiment_context.get("bullish_headlines", [])
        bear_hl = sentiment_context.get("bearish_headlines", [])
        n_bull = len(bull_hl)
        n_bear = len(bear_hl)
        n_total = sentiment_context.get("total_headlines", 0)
        if bull_hl:
            h = bull_hl[0]
            top_bull_headline = h.title if hasattr(h, 'title') else str(h)
        if bear_hl:
            h = bear_hl[0]
            top_bear_headline = h.title if hasattr(h, 'title') else str(h)

    # ── Debate data ──
    debate_winner = "—"
    debate_rec = "—"
    bull_best_arg = None
    bear_best_arg = None
    bull_score = bear_score = 0.0
    if debate_obj:
        debate_winner = debate_obj.winner
        debate_rec = debate_obj.recommendation
        bull_score = debate_obj.bull_score
        bear_score = debate_obj.bear_score
        # Find strongest argument from each side
        bull_args = [a for a in debate_obj.arguments if a.agent == "BULL"]
        bear_args = [a for a in debate_obj.arguments if a.agent == "BEAR"]
        if bull_args:
            bull_best_arg = max(bull_args, key=lambda a: a.strength)
        if bear_args:
            bear_best_arg = max(bear_args, key=lambda a: a.strength)

    # ═══════════════════════════════════════════════════════════════
    # BUILD THE MORNING BRIEFING
    # ═══════════════════════════════════════════════════════════════

    entry_lines = [
        "",
        "---",
        "",
        f"## {_zone_emoji(zone)} {ticker} — {date_str}",
        "",
        f"> **{signal_action}** @ **{confidence:.0f}%** confidence "
        f"| Zone: **{zone}** | Action: **{action.upper()}**",
        "",
        "### § 1 — Scorecard",
        "",
        "| | Indicator | Signal | Confidence | Source |",
        "|---|-----------|--------|------------|--------|",
        f"| {_rsi_emoji(rsi)} | RSI (14) | **{rsi:.1f}** | "
        f"{'Oversold' if rsi < 30 else 'Overbought' if rsi > 70 else 'Neutral'} | "
        f"Technical |",
        f"| {_sma_emoji(close, sma_50)} | SMA-50 | ${sma_50:.2f} | "
        f"Price {'above' if close > sma_50 else 'below'} "
        f"({((close - sma_50) / sma_50 * 100):+.1f}%) | Technical |",
    ]

    if pd.notna(sma_200):
        entry_lines.append(
            f"| {_sma_emoji(close, sma_200)} | SMA-200 | ${sma_200:.2f} | "
            f"Price {'above' if close > sma_200 else 'below'} "
            f"({((close - sma_200) / sma_200 * 100):+.1f}%) | Technical |"
        )

    if golden:
        entry_lines.append("| 🟢 | Golden Cross | ✅ Active | Strong bullish | Technical |")
    if death:
        entry_lines.append("| 🔴 | Death Cross | ✅ Active | Strong bearish | Technical |")

    if sentiment_context:
        entry_lines.append(
            f"| {_sent_emoji(sent_score)} | News Sentiment | **{sent_score:+.2f}** | "
            f"{n_bull}B / {n_bear}Bear / {n_total} total | Researcher |"
        )
        if top_bull_headline != "—":
            # Truncate to 60 chars for table readability
            trunc = top_bull_headline[:60] + ("…" if len(top_bull_headline) > 60 else "")
            entry_lines.append(
                f"| 🟢 | Top Bullish | — | {trunc} | News |"
            )
        if top_bear_headline != "—":
            trunc = top_bear_headline[:60] + ("…" if len(top_bear_headline) > 60 else "")
            entry_lines.append(
                f"| 🔴 | Top Bearish | — | {trunc} | News |"
            )

    entry_lines.append(
        f"| {_zone_emoji(zone)} | **Composite** | **{signal_action}** | "
        f"**{confidence:.0f}%** ({zone}) | Engine |"
    )

    # ── § 2 — Debate Highlights ──
    if debate_obj:
        rec_emoji = {"PROCEED": "✅", "SKIP": "🛑", "REDUCE_SIZE": "⚠️"}.get(debate_rec, "")
        winner_emoji = {"BULL": "🐂", "BEAR": "🐻", "DRAW": "⚖️"}.get(debate_winner, "")

        entry_lines.extend([
            "",
            "### § 2 — Debate Highlights",
            "",
            f"> {winner_emoji} **{debate_winner}** wins "
            f"(🐂 {bull_score:.0f} vs 🐻 {bear_score:.0f}) "
            f"→ {rec_emoji} **{debate_rec}**",
            "",
        ])

        if bull_best_arg:
            entry_lines.extend([
                f"**🐂 Strongest Bull Argument** — *{bull_best_arg.category}* "
                f"({bull_best_arg.strength:.0f}/100)",
                "",
                f"> {bull_best_arg.claim}",
                f"> *{bull_best_arg.evidence}*",
                "",
            ])

        if bear_best_arg:
            entry_lines.extend([
                f"**🐻 Strongest Bear Argument** — *{bear_best_arg.category}* "
                f"({bear_best_arg.strength:.0f}/100)",
                "",
                f"> {bear_best_arg.claim}",
                f"> *{bear_best_arg.evidence}*",
                "",
            ])

    # ── § 3 — Trade Execution Status ──
    if trade_result:
        status = trade_result.get("status", "N/A")
        details = trade_result.get("order_details", {})
        entry_lines.extend([
            "### § 3 — Trade Execution",
            "",
            f"| Status | Action | Qty | Price | Cost | Mode |",
            f"|--------|--------|-----|-------|------|------|",
            f"| **{status.upper()}** | {details.get('action', 'N/A')} | "
            f"{details.get('quantity', 'N/A')} | ${details.get('price', close):.2f} | "
            f"${details.get('quantity', 0) * details.get('price', close):.2f} | {mode_label} |",
            "",
        ])

    # ── § 4 — One-Click Action Commands ──
    entry_lines.extend([
        "### § 4 — Quick Actions",
        "",
    ])

    if signal_action == "BUY" and action.upper() != "HOLD":
        qty = position_shares if position_shares > 0 else "?"
        entry_lines.extend([
            f"**✅ Execute this trade:**",
            "```bash",
            f"python -m src.execute_trade --ticker {ticker} --action BUY --qty {qty} --price {close:.2f}",
            "```",
            "",
        ])
    elif signal_action == "SELL" and action.upper() != "HOLD":
        qty = position_shares if position_shares > 0 else "?"
        entry_lines.extend([
            f"**🔴 Execute this trade:**",
            "```bash",
            f"python -m src.execute_trade --ticker {ticker} --action SELL --qty {qty} --price {close:.2f}",
            "```",
            "",
        ])
    else:
        entry_lines.extend([
            "**⏸️ No trade action required.** Signal is HOLD.",
            "",
        ])

    # Always add a manual override command
    entry_lines.extend([
        "**Manual overrides:**",
        "```bash",
        f"# Force BUY",
        f"python -m src.execute_trade --ticker {ticker} --action BUY --qty 10 --price {close:.2f}",
        f"# Force SELL",
        f"python -m src.execute_trade --ticker {ticker} --action SELL --qty 10 --price {close:.2f}",
        f"# Full pipeline re-run",
        f"python -m src.main {ticker}",
        "```",
        "",
    ])

    # ── § 5 — News Feed ──
    if sentiment_context:
        bull_hl = sentiment_context.get("bullish_headlines", [])
        bear_hl = sentiment_context.get("bearish_headlines", [])
        entry_lines.extend(["### § 5 — News Feed", ""])
        for h in bull_hl[:3]:
            title = h.title if hasattr(h, 'title') else str(h)
            entry_lines.append(f"- 🟢 {title}")
        for h in bear_hl[:3]:
            title = h.title if hasattr(h, 'title') else str(h)
            entry_lines.append(f"- 🔴 {title}")
        entry_lines.append("")

    entry = "\n".join(entry_lines)

    # Append if file exists (multi-ticker), else create with header
    if filepath.exists():
        with open(filepath, "a") as f:
            f.write(entry)
    else:
        header = f"""# 🏛️ Market-Midas — Morning Briefing

> **{date_str}** | Mode: {mode_label} | Cash: ${PORTFOLIO['cash']:,.2f}
"""
        filepath.write_text(header + entry)

    logger.info("Morning briefing saved: %s", filepath)
    return str(filepath)


def run_daily_cycle(
    ticker: str,
    wallet_balance: float | None = None,
    max_daily_drawdown_pct: float = 0.05,
    starting_balance: float | None = None,
) -> dict[str, Any]:
    """Execute one daily analysis + trade cycle for a ticker.

    Args:
        ticker: Stock ticker symbol.
        wallet_balance: User's current wallet balance from frontend settings.
            Falls back to PORTFOLIO['cash'] if None (CLI backward compat).
        max_daily_drawdown_pct: Maximum allowed daily loss as a decimal (0.05 = 5%).
        starting_balance: Balance at start of trading day. If None, equals wallet_balance.

    Steps:
      1. Analyst: Fetch & compute indicators.
      2. StrategyEngine: Score confidence, classify zone.
      3. Debate: If MARGINAL (50-70%), run Bull vs Bear debate.
      4. Trade: If actionable, stage or paper-trade the order.
      5. Report: Save to artifacts/.
    """
    analyst = AnalystAgent()
    trader = TraderAgent()
    risk_mgr = RiskManager()
    engine = StrategyEngine()
    researcher = ResearcherAgent()

    mode_label = "📝 PAPER" if PAPER_TRADING else "🔴 LIVE"

    print(f"\n{'='*60}")
    print(f"  🔁 DAILY CYCLE: {ticker} ({mode_label} MODE)")
    print(f"{'='*60}")

    # ── Step 1: Analyst ──
    logger.info("Step 1: Running Analyst for %s...", ticker)
    analysis = analyst.analyze(ticker)

    if "error" in analysis:
        print(f"\n  ❌ Analysis failed: {analysis['error']}")
        return {"ticker": ticker, "signal": "ERROR", "action": "none", "result": None}

    df = analysis["dataframe"]
    latest = df.iloc[-1]
    current_price = latest["Close"]
    rsi = latest.get("RSI_14", float("nan"))
    sma_50 = latest.get("SMA_50", float("nan"))

    # ── Step 2: Strategy Engine ──
    logger.info("Step 2: Running StrategyEngine for %s...", ticker)
    engine_signal = engine.generate_signal(ticker, df)
    signal = engine_signal["action"]
    confidence = engine_signal["confidence_pct"]
    zone = engine_signal["zone"]

    print(f"\n  📊 ANALYST + STRATEGY REPORT")
    print(f"  {'─'*56}")
    print(f"  Ticker      : {ticker}")
    print(f"  Price       : ${current_price:.2f}")
    print(f"  RSI(14)     : {rsi:.1f}")
    print(f"  SMA(50)     : ${sma_50:.2f}")
    print(f"  Confidence  : \033[1m{confidence:.0f}%\033[0m ({zone})")
    print(f"  Signal      : \033[1m{signal}\033[0m")

    # ── Step 2.5: Fetch news sentiment (for debate context) ──
    sentiment_context = None
    logger.info("Step 2.5: Fetching news sentiment for %s...", ticker)
    try:
        sentiment_summary = researcher.summarize_sentiment(ticker)
        sentiment_context = {
            "bullish_headlines": sentiment_summary.bullish_headlines,
            "bearish_headlines": sentiment_summary.bearish_headlines,
            "neutral_headlines": sentiment_summary.neutral_headlines,
            "composite_score": sentiment_summary.composite_score,
            "total_headlines": sentiment_summary.total_headlines,
        }
        n_bull = len(sentiment_summary.bullish_headlines)
        n_bear = len(sentiment_summary.bearish_headlines)
        print(f"\n  📰 NEWS SENTIMENT")
        print(f"  {'─'*56}")
        print(f"  Headlines   : {sentiment_summary.total_headlines} total")
        print(f"  Bullish     : {n_bull}")
        print(f"  Bearish     : {n_bear}")
        print(f"  Score       : \033[1m{sentiment_summary.composite_score:+.2f}\033[0m")
    except Exception as e:
        logger.warning("News fetch failed (%s), proceeding without sentiment.", e)

    # ── Step 3: Debate Mode (Always generate for UI, but only override if MARGINAL) ──
    print(f"\n  🏛️  Generating Adversarial Synthesis...")
    print(f"  {'─'*56}")
    debate_obj = run_debate(ticker, df, engine_signal, sentiment_context)

    print(f"\n  🐂 Bull Avg Conviction : {debate_obj.bull_score:.0f}/100")
    print(f"  🐻 Bear Avg Conviction : {debate_obj.bear_score:.0f}/100")
    print(f"  Winner                 : {debate_obj.winner}")
    print(f"  Recommendation         : \033[1m{debate_obj.recommendation}\033[0m")

    # Debate only overrides automated execution if confidence was MARGINAL
    if zone == "MARGINAL":
        if debate_obj.recommendation == "SKIP":
            signal = "HOLD"
            engine_signal["action"] = "HOLD"
            print(f"\n  🐻 Bear wins — overriding to \033[1mHOLD\033[0m")
        elif debate_obj.recommendation == "REDUCE_SIZE":
            print(f"\n  ⚖️  Draw — reducing position size by 50%")
        # PROCEED keeps the original signal

    current_position = PORTFOLIO["positions"].get(ticker)
    cash = wallet_balance if wallet_balance is not None else PORTFOLIO["cash"]
    action = "hold"
    trade_result = None
    position_shares = 0

    # ── Circuit Breaker Check ──
    cb_starting = starting_balance if starting_balance is not None else cash
    cb_result = risk_mgr.check_circuit_breaker(
        current_balance=cash,
        starting_balance=cb_starting,
        max_drawdown_pct=max_daily_drawdown_pct,
    )

    if cb_result["tripped"]:
        print(f"\n  ⛔ CIRCUIT BREAKER TRIPPED — ALL TRADING HALTED")
        print(f"     {cb_result['reason']}")
        # Short-circuit: return kill-switch response with full analysis data
        # but action forced to HALT — no trade will be executed
        risk_position = risk_mgr.calculate_position_size(cash, current_price)
        risk_stop_loss = risk_mgr.calculate_stop_loss(current_price)
        return {
            "ticker": ticker,
            "confidence": confidence,
            "zone": zone,
            "technicals": {
                "rsi": rsi if pd.notna(rsi) else None,
                "sma_50": sma_50 if pd.notna(sma_50) else None,
                "price": current_price,
            },
            "sentiment": {
                "score": sentiment_context.get("composite_score", 0.0) if sentiment_context else 0.0,
                "sources": sentiment_sources,
            },
            "debate": {
                "bull_argument": "",
                "bear_argument": "",
                "bull_score": 0.0,
                "bear_score": 0.0,
                "winner": "NONE",
            },
            "risk": {
                "recommended_dollars": 0,
                "recommended_shares": 0,
                "position_pct": 0,
                "max_position_pct": risk_mgr.MAX_POSITION_PCT,
                "wallet_balance": cash,
                "stop_loss": risk_stop_loss,
            },
            "circuit_breaker": {
                "tripped": True,
                "drawdown_pct": cb_result["drawdown_pct"],
                "drawdown_dollars": cb_result["drawdown_dollars"],
                "max_drawdown_pct": cb_result["max_drawdown_pct"],
                "reason": cb_result["reason"],
            },
            "status": {
                "awaiting_human_approval": False,
                "action": "CIRCUIT_BREAKER_HALT",
            },
        }

    # ── Step 4: Trade execution ──
    if signal == "BUY" and current_position is None:
        portfolio_value = cash
        position = risk_mgr.calculate_position_size(portfolio_value, current_price)
        shares = position["max_shares"]

        # Debate may reduce size
        if debate_obj and zone == "MARGINAL":
            if debate_obj.recommendation == "REDUCE_SIZE":
                shares = max(1, shares // 2)

        if shares > 0 and (shares * current_price) <= cash:
            cost = round(shares * current_price, 2)
            action = "BUY"
            position_shares = shares

            print(f"\n  💰 POSITION SIZING")
            print(f"  {'─'*56}")
            print(f"  Cash Available : ${cash:,.2f}")
            print(f"  Shares to Buy  : {shares}")
            print(f"  Total Cost     : ${cost:,.2f}")

            if not PAPER_TRADING:
                print("\n  🌐 Launching browser for live trade...")
                nav_result = trader.login_and_navigate(ticker)
                if not nav_result["authenticated"]:
                    print("  ❌ Authentication failed.")
                    return {"ticker": ticker, "signal": signal, "action": "error", "result": None}

            trade_result = trader.stage_order(
                action="BUY", ticker=ticker,
                quantity=shares, price=current_price,
            )

            if trade_result["status"] == "paper_traded":
                PORTFOLIO["cash"] -= cost
                PORTFOLIO["positions"][ticker] = {
                    "shares": shares,
                    "entry_price": current_price,
                }
        else:
            print(f"\n  ⚠️ Insufficient cash for {ticker}")
            action = "skip"

    elif signal == "SELL" and current_position is not None:
        shares = current_position["shares"]
        entry = current_position["entry_price"]
        pnl = round((current_price - entry) * shares, 2)
        action = "SELL"
        position_shares = shares

        print(f"\n  📤 SELLING POSITION")
        print(f"  {'─'*56}")
        print(f"  Shares Held : {shares}")
        print(f"  Entry Price : ${entry:.2f}")
        print(f"  Exit Price  : ${current_price:.2f}")
        print(f"  P&L         : ${pnl:+,.2f}")

        if not PAPER_TRADING:
            print("\n  🌐 Launching browser for live trade...")
            nav_result = trader.login_and_navigate(ticker)
            if not nav_result["authenticated"]:
                print("  ❌ Authentication failed.")
                return {"ticker": ticker, "signal": signal, "action": "error", "result": None}

        trade_result = trader.stage_order(
            action="SELL", ticker=ticker,
            quantity=shares, price=current_price,
        )

        if trade_result and trade_result["status"] == "paper_traded":
            PORTFOLIO["cash"] += shares * current_price
            del PORTFOLIO["positions"][ticker]

    else:
        reason = ("already holding" if current_position and signal == "BUY"
                  else "no position" if signal == "SELL"
                  else "HOLD signal")
        print(f"\n  ⏸️  NO ACTION — {reason}")

    report_path = _generate_daily_report(
        ticker, latest, engine_signal, action, trade_result,
        debate_obj=debate_obj,
        sentiment_context=sentiment_context,
        position_shares=position_shares,
    )
    print(f"\n  📄 Morning Briefing: {report_path}")

    # Helper to serialize complex objects
    def _safe_serialize(obj: Any) -> Any:
        if hasattr(obj, "__dict__"): return obj.__dict__
        return str(obj)

    # Build sentiment sources correctly for the UI
    sentiment_sources = []
    if sentiment_context:
        for h in sentiment_context.get("bullish_headlines", []) + sentiment_context.get("bearish_headlines", []):
            sentiment_sources.append({
                "title": getattr(h, "title", str(h)),
                "url": getattr(h, "url", ""),
                "source": getattr(h, "source", "News")
            })

    # ── Export JSON for Next.js Frontend (Contract-First Strict Schema) ──
    bull_arg_text = ""
    bear_arg_text = ""
    if debate_obj:
        if debate_obj.bull_best_arg:
            bull_arg_text = f"{debate_obj.bull_best_arg.claim} Evidence: {debate_obj.bull_best_arg.evidence}"
        if debate_obj.bear_best_arg:
            bear_arg_text = f"{debate_obj.bear_best_arg.claim} Evidence: {debate_obj.bear_best_arg.evidence}"

    # Compute risk recommendation for frontend
    risk_position = risk_mgr.calculate_position_size(cash, current_price)
    risk_stop_loss = risk_mgr.calculate_stop_loss(current_price)

    # Fetch supplementary quant data for the frontend
    quant_data = _fetch_quant_data(ticker, current_price)

    # Enhanced technicals — include fields already computed by the analyst
    sma_200_val = latest.get("SMA_200", float("nan"))
    golden_cross_val = bool(latest.get("golden_cross", False))
    death_cross_val = bool(latest.get("death_cross", False))
    sentiment_score_val = (
        sentiment_context.get("composite_score", 0.0)
        if sentiment_context else 0.0
    )

    frontend_data = {
        "ticker": ticker,
        "confidence": confidence,
        "zone": zone,
        "technicals": {
            "rsi": rsi if pd.notna(rsi) else None,
            "sma_50": sma_50 if pd.notna(sma_50) else None,
            "sma_200": sma_200_val if pd.notna(sma_200_val) else None,
            "price": current_price,
            "golden_cross": golden_cross_val,
            "death_cross": death_cross_val,
            "sentiment_score": sentiment_score_val,
        },
        "quant": quant_data,
        "sentiment": {
            "score": sentiment_context.get("composite_score", 0.0) if sentiment_context else 0.0,
            "sources": sentiment_sources
        },
        "debate": {
            "bull_argument": bull_arg_text,
            "bear_argument": bear_arg_text,
            "bull_score": debate_obj.bull_score if debate_obj else 0.0,
            "bear_score": debate_obj.bear_score if debate_obj else 0.0,
            "winner": debate_obj.winner if debate_obj else "NONE"
        },
        "risk": {
            "recommended_dollars": risk_position["max_dollars"],
            "recommended_shares": risk_position["max_shares"],
            "position_pct": risk_position["position_pct"],
            "max_position_pct": risk_mgr.MAX_POSITION_PCT,
            "wallet_balance": cash,
            "stop_loss": risk_stop_loss,
        },
        "status": {
            "awaiting_human_approval": True if zone == "MARGINAL" else False,
            "action": action
        }
    }
    
    json_path = ARTIFACTS_DIR / "latest_run.json"
    with open(json_path, "w") as f:
        json.dump(frontend_data, f, indent=2)
    print(f"  💾 JSON Export: {json_path}")

    return frontend_data


def main() -> None:
    tickers = sys.argv[1:] if len(sys.argv) > 1 else ["NVDA"]

    mode_label = "📝 PAPER" if PAPER_TRADING else "🔴 LIVE"
    print(f"\n{'='*60}")
    print(f"  🏛️  MARKET-MIDAS — {mode_label} TRADING")
    print(f"  Tickers: {', '.join(tickers)}")
    print(f"  Cash: ${PORTFOLIO['cash']:,.2f}")
    print(f"{'='*60}")

    for ticker in tickers:
        run_daily_cycle(ticker)

    print(f"\n{'='*60}")
    print(f"  📊 PORTFOLIO SUMMARY")
    print(f"  {'─'*56}")
    print(f"  Cash        : ${PORTFOLIO['cash']:,.2f}")
    for t, pos in PORTFOLIO["positions"].items():
        print(f"  Position    : {pos['shares']} x {t} @ ${pos['entry_price']:.2f}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
