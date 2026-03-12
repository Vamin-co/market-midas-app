"""
Debate Mode — Bull vs Bear Sub-Agent Argumentation.

When the StrategyEngine produces a MARGINAL confidence signal (50-70%),
this module spawns two adversarial sub-agents:

  🐂 Bull Agent — argues FOR the trade using bullish technicals + news
  🐻 Bear Agent — argues AGAINST the trade using bearish technicals + news

Each agent receives the same OHLCV data, technical indicators, AND
sentiment context from the Researcher. The debate produces a structured
transcript saved in the daily report for human review.

This implements "Structured Analytic Technique" (adversarial analysis)
to counter confirmation bias in marginal trades.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class Argument:
    """A single argument from a sub-agent."""

    agent: str           # "BULL" or "BEAR"
    category: str        # e.g., "RSI Analysis", "News Catalyst"
    claim: str           # The argument text
    evidence: str        # Supporting data point
    strength: float      # 0-100 conviction score


@dataclass
class DebateResult:
    """Full debate transcript between Bull and Bear agents."""

    ticker: str
    confidence_pct: float
    bull_score: float
    bear_score: float
    winner: str               # "BULL", "BEAR", or "DRAW"
    recommendation: str       # "PROCEED", "SKIP", "REDUCE_SIZE"
    arguments: list[Argument] = field(default_factory=list)
    bull_best_arg: Argument | None = None
    bear_best_arg: Argument | None = None
    summary: str = ""
    transcript_md: str = ""


class BullAgent:
    """Argues FOR the trade — finds bullish evidence in technicals AND news.

    Instruction: Use bullish headlines to explain why the technical dip
    is a buying opportunity (e.g., 'Oversold RSI aligns with record
    earnings beat').
    """

    def __init__(self) -> None:
        self.name = "🐂 BULL"
        logger.info("BullAgent spawned.")

    def argue(
        self,
        df: pd.DataFrame,
        signal: dict[str, Any],
        sentiment_context: dict[str, Any] | None = None,
    ) -> list[Argument]:
        """Build the bullish case from technicals + news sentiment.

        Args:
            df: OHLCV DataFrame with indicators.
            signal: StrategyEngine signal dict.
            sentiment_context: Optional dict with 'bullish_headlines',
                'bearish_headlines', 'composite_score'.
        """
        args: list[Argument] = []
        latest = df.iloc[-1]
        close = latest["Close"]
        rsi = latest.get("RSI_14", 50.0)
        sma_50 = latest.get("SMA_50", float("nan"))
        sma_200 = latest.get("SMA_200", float("nan"))

        # ── Technical: RSI ──
        if rsi < 40:
            args.append(Argument(
                agent="BULL", category="RSI Oversold",
                claim="RSI is approaching oversold territory — mean reversion likely.",
                evidence=f"RSI({rsi:.1f}) is below 40; historically this often precedes a bounce.",
                strength=75.0,
            ))
        elif rsi < 55:
            args.append(Argument(
                agent="BULL", category="RSI Recovery",
                claim="RSI is recovering from bearish levels — building bullish momentum.",
                evidence=f"RSI({rsi:.1f}) crossed above extreme lows, suggesting sellers are exhausting.",
                strength=55.0,
            ))
        else:
            args.append(Argument(
                agent="BULL", category="RSI Momentum",
                claim="RSI shows healthy bullish momentum without being overbought.",
                evidence=f"RSI({rsi:.1f}) in the 'power zone' (50-70) — trend continuation probable.",
                strength=65.0,
            ))

        # ── Technical: SMA Trend ──
        if pd.notna(sma_50):
            if close > sma_50:
                pct = ((close - sma_50) / sma_50) * 100
                args.append(Argument(
                    agent="BULL", category="Trend Structure",
                    claim="Price is trading above the 50-day moving average — uptrend intact.",
                    evidence=f"Close ${close:.2f} is {pct:.1f}% above SMA50 ${sma_50:.2f}.",
                    strength=70.0,
                ))
            else:
                dist = ((sma_50 - close) / sma_50) * 100
                args.append(Argument(
                    agent="BULL", category="Reversion Opportunity",
                    claim="Price is below SMA50 — potential snap-back rally to the mean.",
                    evidence=f"Close is {dist:.1f}% below SMA50; this gap often closes within 2 weeks.",
                    strength=50.0,
                ))

        # ── Technical: SMA Alignment ──
        if pd.notna(sma_50) and pd.notna(sma_200):
            if sma_50 > sma_200:
                args.append(Argument(
                    agent="BULL", category="Golden Bias",
                    claim="The 50-day MA is above the 200-day MA — long-term uptrend confirmed.",
                    evidence=f"SMA50 ${sma_50:.2f} > SMA200 ${sma_200:.2f}: structural bull market.",
                    strength=75.0,
                ))

        # ── Technical: Momentum ──
        if len(df) >= 6:
            last_5 = df["Close"].tail(6)
            pct_5d = ((last_5.iloc[-1] - last_5.iloc[0]) / last_5.iloc[0]) * 100
            if pct_5d > 0:
                args.append(Argument(
                    agent="BULL", category="Short-Term Momentum",
                    claim=f"Price gained {pct_5d:.1f}% over the last 5 sessions — buyers in control.",
                    evidence=f"${last_5.iloc[0]:.2f} → ${last_5.iloc[-1]:.2f} in 5 days.",
                    strength=min(60 + pct_5d * 5, 90),
                ))
            else:
                args.append(Argument(
                    agent="BULL", category="Capitulation Buy",
                    claim="Recent weakness creates a better entry point with asymmetric upside.",
                    evidence=f"Price dipped {pct_5d:.1f}% in 5 days — potential overselling for a swing trade.",
                    strength=45.0,
                ))

        # ── Technical: Support ──
        if len(df) >= 20:
            recent_low = df["Low"].tail(20).min()
            if close - recent_low < close * 0.03:
                args.append(Argument(
                    agent="BULL", category="Support Level",
                    claim="Price is near the 20-day low — strong support zone.",
                    evidence=f"20-day low ${recent_low:.2f} is close to current ${close:.2f}; buyers likely defend.",
                    strength=65.0,
                ))

        # ── NEWS SENTIMENT ──────────────────────────────────────────
        if sentiment_context:
            bullish_headlines = sentiment_context.get("bullish_headlines", [])
            composite = sentiment_context.get("composite_score", 0.0)

            if bullish_headlines:
                # Use up to 3 top bullish headlines as evidence
                top_headlines = bullish_headlines[:3]
                headline_text = " | ".join(
                    h.title if hasattr(h, 'title') else str(h) for h in top_headlines
                )
                claim_parts = []
                if rsi < 50:
                    claim_parts.append(
                        f"Oversold RSI({rsi:.0f}) aligns with positive news catalysts"
                    )
                else:
                    claim_parts.append(
                        "Bullish news sentiment confirms the technical momentum"
                    )
                claim_parts.append(
                    "— the market narrative supports a buying opportunity."
                )
                args.append(Argument(
                    agent="BULL", category="📰 News Catalyst",
                    claim=" ".join(claim_parts),
                    evidence=f"Bullish headlines ({len(bullish_headlines)} found): {headline_text}",
                    strength=min(65 + len(bullish_headlines) * 3, 90),
                ))

            if composite > 0:
                args.append(Argument(
                    agent="BULL", category="📰 Sentiment Score",
                    claim=f"Net news sentiment is positive ({composite:+.2f}) — "
                          "market consensus leans bullish.",
                    evidence=f"Composite score {composite:+.2f} across "
                             f"{sentiment_context.get('total_headlines', 0)} headlines.",
                    strength=min(55 + composite * 30, 85),
                ))

        return args


class BearAgent:
    """Argues AGAINST the trade — finds bearish evidence in technicals AND news.

    Instruction: Use bearish headlines to explain why the technical drop
    is justified (e.g., 'Price drop confirms negative regulatory news').
    """

    def __init__(self) -> None:
        self.name = "🐻 BEAR"
        logger.info("BearAgent spawned.")

    def argue(
        self,
        df: pd.DataFrame,
        signal: dict[str, Any],
        sentiment_context: dict[str, Any] | None = None,
    ) -> list[Argument]:
        """Build the bearish case from technicals + news sentiment.

        Args:
            df: OHLCV DataFrame with indicators.
            signal: StrategyEngine signal dict.
            sentiment_context: Optional dict with 'bullish_headlines',
                'bearish_headlines', 'composite_score'.
        """
        args: list[Argument] = []
        latest = df.iloc[-1]
        close = latest["Close"]
        rsi = latest.get("RSI_14", 50.0)
        sma_50 = latest.get("SMA_50", float("nan"))
        sma_200 = latest.get("SMA_200", float("nan"))

        # ── Technical: RSI Risk ──
        if rsi > 60:
            args.append(Argument(
                agent="BEAR", category="RSI Warning",
                claim="RSI is elevated — buying into strength risks chasing the move.",
                evidence=f"RSI({rsi:.1f}) above 60 means much of the move may already be priced in.",
                strength=70.0,
            ))
        elif rsi > 45:
            args.append(Argument(
                agent="BEAR", category="RSI Indecision",
                claim="RSI is neutral — no clear directional edge for a bullish entry.",
                evidence=f"RSI({rsi:.1f}) sits in no-man's land; risk/reward is not compelling.",
                strength=55.0,
            ))
        else:
            args.append(Argument(
                agent="BEAR", category="Falling Knife",
                claim="RSI is weak and falling — catching a falling knife is dangerous.",
                evidence=f"RSI({rsi:.1f}) hasn't shown a bottom yet; momentum is still bearish.",
                strength=65.0,
            ))

        # ── Technical: SMA Breakdown ──
        if pd.notna(sma_50) and close < sma_50:
            pct = ((sma_50 - close) / sma_50) * 100
            args.append(Argument(
                agent="BEAR", category="Trend Breakdown",
                claim="Price has broken below the 50-day MA — intermediate trend is bearish.",
                evidence=f"Close ${close:.2f} is {pct:.1f}% below SMA50 ${sma_50:.2f}. "
                         "This often leads to further selling.",
                strength=75.0,
            ))

        # ── Technical: Death Cross Risk ──
        if pd.notna(sma_50) and pd.notna(sma_200):
            if sma_50 < sma_200:
                args.append(Argument(
                    agent="BEAR", category="Death Cross",
                    claim="SMA50 is below SMA200 — long-term bearish structure.",
                    evidence=f"SMA50 ${sma_50:.2f} < SMA200 ${sma_200:.2f}: institutional selling likely.",
                    strength=80.0,
                ))
            elif (sma_50 - sma_200) / sma_200 < 0.02:
                args.append(Argument(
                    agent="BEAR", category="Narrowing Spread",
                    claim="SMA50-SMA200 spread is narrowing — death cross risk on the horizon.",
                    evidence=f"Spread is only {((sma_50-sma_200)/sma_200)*100:.1f}%; "
                             "convergence signals weakening trend.",
                    strength=60.0,
                ))

        # ── Technical: Recent Weakness ──
        if len(df) >= 6:
            last_5 = df["Close"].tail(6)
            pct_5d = ((last_5.iloc[-1] - last_5.iloc[0]) / last_5.iloc[0]) * 100
            if pct_5d <= 0:
                args.append(Argument(
                    agent="BEAR", category="Negative Momentum",
                    claim=f"Price dropped {abs(pct_5d):.1f}% over 5 sessions — sellers dominate.",
                    evidence=f"${last_5.iloc[0]:.2f} → ${last_5.iloc[-1]:.2f}: sustained distribution.",
                    strength=min(60 + abs(pct_5d) * 5, 90),
                ))

        # ── Technical: Resistance ──
        if len(df) >= 20:
            recent_high = df["High"].tail(20).max()
            if recent_high - close < close * 0.02:
                args.append(Argument(
                    agent="BEAR", category="Resistance",
                    claim="Price is near the 20-day high — potential resistance rejection.",
                    evidence=f"20-day high ${recent_high:.2f} may cap upside near ${close:.2f}.",
                    strength=60.0,
                ))

        # ── Technical: Volatility ──
        if len(df) >= 20:
            returns = df["Close"].pct_change().tail(20)
            vol = returns.std() * 100
            if vol > 2.0:
                args.append(Argument(
                    agent="BEAR", category="High Volatility",
                    claim=f"Daily volatility is {vol:.1f}% — elevated risk of whipsaw losses.",
                    evidence="High vol means stop-losses more likely to trigger on noise.",
                    strength=55.0,
                ))

        # ── NEWS SENTIMENT ──────────────────────────────────────────
        if sentiment_context:
            bearish_headlines = sentiment_context.get("bearish_headlines", [])
            composite = sentiment_context.get("composite_score", 0.0)

            if bearish_headlines:
                top_headlines = bearish_headlines[:3]
                headline_text = " | ".join(
                    h.title if hasattr(h, 'title') else str(h) for h in top_headlines
                )
                claim_parts = []
                if rsi > 50:
                    claim_parts.append(
                        f"Despite seemingly healthy RSI({rsi:.0f}), bearish news threatens a reversal"
                    )
                else:
                    claim_parts.append(
                        "The price drop is confirmed by negative news catalysts"
                    )
                claim_parts.append(
                    "— this is not just technical noise, it's fundamental deterioration."
                )
                args.append(Argument(
                    agent="BEAR", category="📰 News Risk",
                    claim=" ".join(claim_parts),
                    evidence=f"Bearish headlines ({len(bearish_headlines)} found): {headline_text}",
                    strength=min(65 + len(bearish_headlines) * 3, 90),
                ))

            if composite < 0:
                args.append(Argument(
                    agent="BEAR", category="📰 Sentiment Score",
                    claim=f"Net news sentiment is negative ({composite:+.2f}) — "
                          "market consensus leans bearish.",
                    evidence=f"Composite score {composite:+.2f} across "
                             f"{sentiment_context.get('total_headlines', 0)} headlines.",
                    strength=min(55 + abs(composite) * 30, 85),
                ))

            # Bear argues even with bullish news — contrarian skepticism
            bullish_headlines = sentiment_context.get("bullish_headlines", [])
            if bullish_headlines and composite > 0:
                args.append(Argument(
                    agent="BEAR", category="📰 Contrarian Warning",
                    claim="Excessive bullish consensus is a contrarian red flag — "
                          "when everyone is bullish, who's left to buy?",
                    evidence=f"{len(bullish_headlines)} bullish headlines suggest crowded trade; "
                             "reversals often start from peak optimism.",
                    strength=50.0,
                ))

        return args


def run_debate(
    ticker: str,
    df: pd.DataFrame,
    signal: dict[str, Any],
    sentiment_context: dict[str, Any] | None = None,
) -> DebateResult:
    """Spawn Bull and Bear agents, collect arguments, and judge the debate.

    Args:
        ticker: Stock ticker.
        df: Full OHLCV DataFrame with indicators.
        signal: Output from StrategyEngine.generate_signal().
        sentiment_context: Optional dict from ResearcherAgent.summarize_sentiment().

    Returns:
        DebateResult with full transcript and recommendation.
    """
    bull = BullAgent()
    bear = BearAgent()

    bull_args = bull.argue(df, signal, sentiment_context)
    bear_args = bear.argue(df, signal, sentiment_context)

    # Score each side
    bull_total = sum(a.strength for a in bull_args) / max(len(bull_args), 1)
    bear_total = sum(a.strength for a in bear_args) / max(len(bear_args), 1)

    # Determine winner
    if bull_total - bear_total > 5:
        winner = "BULL"
        recommendation = "PROCEED"
    elif bear_total - bull_total > 5:
        winner = "BEAR"
        recommendation = "SKIP"
    else:
        winner = "DRAW"
        recommendation = "REDUCE_SIZE"

    # Extract the strongest arguments
    bull_best: Argument | None = None
    bear_best: Argument | None = None
    if bull_args:
        bull_best = max(bull_args, key=lambda a: a.strength)
    if bear_args:
        bear_best = max(bear_args, key=lambda a: a.strength)

    # Build markdown transcript
    transcript = _build_transcript(
        ticker, signal, bull_args, bear_args,
        bull_total, bear_total, winner, recommendation,
        sentiment_context,
    )

    result = DebateResult(
        ticker=ticker,
        confidence_pct=signal.get("confidence_pct", 0),
        bull_score=round(bull_total, 1),
        bear_score=round(bear_total, 1),
        winner=winner,
        recommendation=recommendation,
        arguments=bull_args + bear_args,
        bull_best_arg=bull_best,
        bear_best_arg=bear_best,
        summary=f"{winner} wins ({bull_total:.0f} vs {bear_total:.0f}) → {recommendation}",
        transcript_md=transcript,
    )

    logger.info(
        "Debate for %s: %s wins (%s %.0f vs %s %.0f) → %s",
        ticker, winner, bull.name, bull_total, bear.name, bear_total, recommendation,
    )
    return result


def _build_transcript(
    ticker: str,
    signal: dict[str, Any],
    bull_args: list[Argument],
    bear_args: list[Argument],
    bull_score: float,
    bear_score: float,
    winner: str,
    recommendation: str,
    sentiment_context: dict[str, Any] | None = None,
) -> str:
    """Build a Markdown transcript of the debate."""

    emoji_map = {"BULL": "🐂", "BEAR": "🐻", "DRAW": "⚖️"}
    rec_emoji = {"PROCEED": "✅", "SKIP": "🛑", "REDUCE_SIZE": "⚠️"}

    lines = [
        f"## 🏛️ Debate Mode — {ticker}",
        "",
        f"> Triggered: confidence at **{signal.get('confidence_pct', 0):.0f}%** "
        f"(MARGINAL zone, 50-70%)",
    ]

    # Add sentiment summary header if available
    if sentiment_context:
        n_bull = len(sentiment_context.get("bullish_headlines", []))
        n_bear = len(sentiment_context.get("bearish_headlines", []))
        n_neut = len(sentiment_context.get("neutral_headlines", []))
        score = sentiment_context.get("composite_score", 0)
        lines.append(
            f"> News Sentiment: **{score:+.2f}** "
            f"({n_bull} bullish / {n_bear} bearish / {n_neut} neutral)"
        )

    lines.extend(["", "### 🐂 Bull Case", ""])

    for a in bull_args:
        lines.append(f"**{a.category}** (conviction: {a.strength:.0f}/100)")
        lines.append(f"> {a.claim}")
        lines.append(f"> *Evidence: {a.evidence}*")
        lines.append("")

    lines.extend(["### 🐻 Bear Case", ""])

    for a in bear_args:
        lines.append(f"**{a.category}** (conviction: {a.strength:.0f}/100)")
        lines.append(f"> {a.claim}")
        lines.append(f"> *Evidence: {a.evidence}*")
        lines.append("")

    lines.extend([
        "### Verdict",
        "",
        "| Side | Avg Conviction |",
        "|------|---------------|",
        f"| 🐂 Bull | **{bull_score:.0f}**/100 |",
        f"| 🐻 Bear | **{bear_score:.0f}**/100 |",
        "",
        f"> {emoji_map[winner]} **Winner: {winner}** → "
        f"{rec_emoji.get(recommendation, '')} Recommendation: **{recommendation}**",
    ])

    return "\n".join(lines)
