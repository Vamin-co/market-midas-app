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

from src.portfolio.store import get_position, get_tracker_snapshot, normalize_mode
from src.services.analyze import analyze_ticker
from src.services.trade import execute_trade

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
SETTINGS_FILE = PROJECT_ROOT / "config" / "settings.json"


def _read_settings_local() -> dict[str, Any]:
    defaults = {
        "walletBalance": 100_000.0,
        "maxDailyDrawdown": 5.0,
        "mode": "paper",
    }
    if SETTINGS_FILE.exists():
        try:
            payload = json.loads(SETTINGS_FILE.read_text())
            return {**defaults, **payload}
        except (json.JSONDecodeError, ValueError):
            return defaults
    return defaults


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
        quant["company_name"] = info.get("longName", ticker)

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


def _generate_daily_report(
    ticker: str,
    latest: pd.Series,
    engine_signal: dict[str, Any],
    action: str,
    trade_result: dict | None,
    debate_obj: Any | None = None,
    sentiment_context: dict[str, Any] | None = None,
    position_shares: int = 0,
    mode: str = "paper",
    cash_value: float = 0.0,
) -> str:
    """Generate a Morning Briefing dashboard — designed for < 30 second decisions.

    Returns:
        Absolute path to the saved report file.
    """
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filepath = ARTIFACTS_DIR / f"daily_report_{date_str}.md"

    mode_label = "📝 PAPER" if normalize_mode(mode) == "paper" else "🔴 LIVE"
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

> **{date_str}** | Mode: {mode_label} | Cash: ${cash_value:,.2f}
"""
        filepath.write_text(header + entry)

    logger.info("Morning briefing saved: %s", filepath)
    return str(filepath)


def run_daily_cycle(
    ticker: str,
    mode: str = "paper",
    wallet_balance: float | None = None,
    max_daily_drawdown_pct: float = 0.05,
    starting_balance: float | None = None,
) -> dict[str, Any]:
    """Legacy compatibility shim for the removed combined pipeline."""
    raise NotImplementedError(
        "run_daily_cycle() is legacy — use /analyze or /analyze/stream for analysis "
        "and /trade for execution."
    )


def main() -> None:
    raise NotImplementedError(
        "src.main is legacy — use /analyze or /analyze/stream for analysis and /trade "
        "for execution."
    )


if __name__ == "__main__":
    main()
