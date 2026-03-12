"""
Strategy Engine.

Combines technical indicators into a composite confidence score and
produces a final trade decision: BUY, SELL, or HOLD.

When confidence falls in the MARGINAL zone (50-70%), the engine
triggers Debate Mode — spawning Bull and Bear sub-agents to argue
the case before a final decision is made.

Output format:
    {
        "ticker": str,
        "action": "BUY" | "SELL" | "HOLD",
        "confidence_pct": float (0-100),
        "zone": "STRONG_BUY" | "MARGINAL" | "NEUTRAL" | "STRONG_SELL",
        "reasoning": str,
        "debate": str | None   # populated only in marginal zone
    }
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


class StrategyEngine:
    """Merges technical signals into trade decisions with confidence scoring.

    Confidence is computed from multiple factors:
      - RSI distance from oversold/overbought thresholds
      - Price position relative to SMA-50 and SMA-200
      - Golden Cross / Death Cross presence
      - Volume trend (if available)

    Zones:
      - STRONG_BUY:  confidence >= 70%  → execute immediately
      - MARGINAL:    confidence 50-70%  → trigger Debate Mode
      - NEUTRAL:     confidence < 50%   → HOLD
      - STRONG_SELL: confidence >= 70% bearish → execute SELL
    """

    # Weights for the composite score
    RSI_WEIGHT = 0.40
    SMA_TREND_WEIGHT = 0.30
    CROSS_WEIGHT = 0.20
    MOMENTUM_WEIGHT = 0.10

    # Zone thresholds
    STRONG_THRESHOLD = 70.0
    MARGINAL_THRESHOLD = 50.0

    def __init__(self) -> None:
        logger.info("StrategyEngine initialized.")

    def generate_signal(
        self,
        ticker: str,
        df: pd.DataFrame,
    ) -> dict[str, Any]:
        """Generate a trade signal with confidence scoring.

        Args:
            ticker: Stock ticker symbol.
            df: DataFrame with Close, RSI_14, SMA_50, SMA_200,
                signal, golden_cross, death_cross columns.

        Returns:
            Trade signal dict with action, confidence, zone, reasoning.
        """
        latest = df.iloc[-1]
        rsi = latest.get("RSI_14", 50.0)
        close = latest["Close"]
        sma_50 = latest.get("SMA_50", float("nan"))
        sma_200 = latest.get("SMA_200", float("nan"))
        raw_signal = latest.get("signal", "HOLD")
        golden = latest.get("golden_cross", False)
        death = latest.get("death_cross", False)

        # ── Compute component scores (0-100 scale) ──

        # 1. RSI score: how far from thresholds
        rsi_score = self._score_rsi(rsi)

        # 2. SMA trend score: price position relative to moving averages
        sma_score = self._score_sma_trend(close, sma_50, sma_200)

        # 3. Cross score: golden/death cross bonus
        cross_score = self._score_cross(golden, death, df)

        # 4. Momentum score: recent price direction
        momentum_score = self._score_momentum(df)

        # ── Composite confidence ──
        bullish_confidence = (
            rsi_score["bullish"] * self.RSI_WEIGHT
            + sma_score["bullish"] * self.SMA_TREND_WEIGHT
            + cross_score["bullish"] * self.CROSS_WEIGHT
            + momentum_score["bullish"] * self.MOMENTUM_WEIGHT
        )
        bearish_confidence = (
            rsi_score["bearish"] * self.RSI_WEIGHT
            + sma_score["bearish"] * self.SMA_TREND_WEIGHT
            + cross_score["bearish"] * self.CROSS_WEIGHT
            + momentum_score["bearish"] * self.MOMENTUM_WEIGHT
        )

        # Determine direction and confidence
        if bullish_confidence > bearish_confidence:
            direction = "BUY"
            confidence = bullish_confidence
        elif bearish_confidence > bullish_confidence:
            direction = "SELL"
            confidence = bearish_confidence
        else:
            direction = "HOLD"
            confidence = 50.0

        # Determine zone
        if confidence >= self.STRONG_THRESHOLD:
            zone = f"STRONG_{direction}"
            action = direction
        elif confidence >= self.MARGINAL_THRESHOLD:
            zone = "MARGINAL"
            action = direction  # tentative — debate may override
        else:
            zone = "NEUTRAL"
            action = "HOLD"

        reasoning = self._build_reasoning(
            ticker, rsi, close, sma_50, sma_200,
            rsi_score, sma_score, cross_score, momentum_score,
            direction, confidence,
        )

        signal = {
            "ticker": ticker,
            "action": action,
            "confidence_pct": round(confidence, 1),
            "zone": zone,
            "direction": direction,
            "reasoning": reasoning,
            "debate": None,
            "components": {
                "rsi_score": rsi_score,
                "sma_score": sma_score,
                "cross_score": cross_score,
                "momentum_score": momentum_score,
            },
            "indicators": {
                "rsi": round(rsi, 1),
                "close": round(close, 2),
                "sma_50": round(sma_50, 2) if pd.notna(sma_50) else None,
                "sma_200": round(sma_200, 2) if pd.notna(sma_200) else None,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        logger.info(
            "Signal for %s: %s (confidence: %.1f%%, zone: %s)",
            ticker, action, confidence, zone,
        )
        return signal

    # ─── Component Scoring ───────────────────────────────────────────

    @staticmethod
    def _score_rsi(rsi: float) -> dict[str, float]:
        """Score RSI for bullish/bearish strength (0-100)."""
        if pd.isna(rsi):
            return {"bullish": 50.0, "bearish": 50.0}

        if rsi < 30:
            # Deeply oversold = strongly bullish
            bullish = 80 + (30 - rsi)  # 80-110 (capped at 100)
            return {"bullish": min(bullish, 100), "bearish": 10.0}
        elif rsi > 70:
            # Overbought = strongly bearish
            bearish = 80 + (rsi - 70)
            return {"bullish": 10.0, "bearish": min(bearish, 100)}
        elif 50 < rsi < 70:
            # Mildly bullish momentum
            bullish = 50 + (rsi - 50) * 0.5
            return {"bullish": bullish, "bearish": 100 - bullish}
        elif 30 < rsi < 50:
            # Mildly bearish momentum
            bearish = 50 + (50 - rsi) * 0.5
            return {"bullish": 100 - bearish, "bearish": bearish}
        else:
            return {"bullish": 50.0, "bearish": 50.0}

    @staticmethod
    def _score_sma_trend(
        close: float, sma_50: float, sma_200: float,
    ) -> dict[str, float]:
        """Score price position relative to SMAs (0-100)."""
        bullish = 50.0

        if pd.notna(sma_50):
            pct_above_50 = ((close - sma_50) / sma_50) * 100
            bullish += pct_above_50 * 5  # 5 points per 1% above SMA50

        if pd.notna(sma_200):
            pct_above_200 = ((close - sma_200) / sma_200) * 100
            bullish += pct_above_200 * 3

        bullish = max(0, min(100, bullish))
        return {"bullish": bullish, "bearish": 100 - bullish}

    @staticmethod
    def _score_cross(
        golden: bool, death: bool, df: pd.DataFrame,
    ) -> dict[str, float]:
        """Score based on recent golden/death cross events (0-100)."""
        # Check last 10 bars for crosses
        recent = df.tail(10)
        recent_golden = recent["golden_cross"].any() if "golden_cross" in recent.columns else False
        recent_death = recent["death_cross"].any() if "death_cross" in recent.columns else False

        if golden or recent_golden:
            return {"bullish": 85.0, "bearish": 15.0}
        elif death or recent_death:
            return {"bullish": 15.0, "bearish": 85.0}

        # Base on SMA relationship
        latest = df.iloc[-1]
        sma_50 = latest.get("SMA_50", float("nan"))
        sma_200 = latest.get("SMA_200", float("nan"))
        if pd.notna(sma_50) and pd.notna(sma_200):
            if sma_50 > sma_200:
                return {"bullish": 65.0, "bearish": 35.0}
            else:
                return {"bullish": 35.0, "bearish": 65.0}

        return {"bullish": 50.0, "bearish": 50.0}

    @staticmethod
    def _score_momentum(df: pd.DataFrame) -> dict[str, float]:
        """Score recent price momentum over last 5 bars (0-100)."""
        if len(df) < 6:
            return {"bullish": 50.0, "bearish": 50.0}

        recent_close = df["Close"].tail(6)
        pct_change = ((recent_close.iloc[-1] - recent_close.iloc[0])
                      / recent_close.iloc[0]) * 100

        # +/-5% = max score
        bullish = 50 + pct_change * 10
        bullish = max(0, min(100, bullish))
        return {"bullish": bullish, "bearish": 100 - bullish}

    @staticmethod
    def _build_reasoning(
        ticker, rsi, close, sma_50, sma_200,
        rsi_score, sma_score, cross_score, momentum_score,
        direction, confidence,
    ) -> str:
        """Build a concise human-readable reasoning string."""
        parts = []

        # RSI
        if rsi < 30:
            parts.append(f"RSI({rsi:.0f}) is oversold → strong buy signal")
        elif rsi > 70:
            parts.append(f"RSI({rsi:.0f}) is overbought → strong sell signal")
        elif rsi > 50:
            parts.append(f"RSI({rsi:.0f}) shows bullish momentum")
        else:
            parts.append(f"RSI({rsi:.0f}) shows bearish momentum")

        # SMA relationship
        if pd.notna(sma_50):
            if close > sma_50:
                parts.append(f"Price ${close:.0f} above SMA50 ${sma_50:.0f} (bullish)")
            else:
                parts.append(f"Price ${close:.0f} below SMA50 ${sma_50:.0f} (bearish)")

        return f"{direction} @ {confidence:.0f}% confidence. " + "; ".join(parts) + "."
