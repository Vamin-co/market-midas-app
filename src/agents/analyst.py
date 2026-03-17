"""
The Analyst (Tech-Agent).

Responsible for fetching OHLCV data and calculating technical indicators
(RSI, SMA-50/200) using Python. Generates BUY/SELL/HOLD signals based
on RSI thresholds and Golden/Death Cross patterns.

Tooling: Python Terminal, FileSystem.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from ta.momentum import RSIIndicator
from ta.trend import SMAIndicator

from src.data.ingestion import DataIngestion

logger = logging.getLogger(__name__)


class AnalystAgent:
    """Technical analysis agent for stock evaluation.

    Fetches OHLCV (Open, High, Low, Close, Volume) data via DataIngestion
    and computes the following indicators:
      - SMA-50 / SMA-200 (Golden Cross / Death Cross detection)
      - RSI-14 (Relative Strength Index) — oversold < 30, overbought > 70

    Signal Logic (PRD §4.2):
      - RSI < 30 → BUY
      - RSI > 70 → SELL
      - Golden Cross (SMA_50 crosses above SMA_200) → secondary BUY confirmation
      - Death Cross (SMA_50 crosses below SMA_200) → secondary SELL confirmation
    """

    def __init__(self) -> None:
        self.data_ingestion = DataIngestion()
        logger.info("AnalystAgent initialized.")

    def analyze(self, ticker: str, period: str = "1y") -> dict[str, Any]:
        """Run full technical analysis on a given ticker.

        Fetches OHLCV data, calculates indicators, and generates signals.

        Args:
            ticker: Stock ticker symbol (e.g., 'NVDA', 'SPY').
            period: Data period for yfinance (default '1y').

        Returns:
            dict containing:
                - dataframe: pd.DataFrame with OHLCV + indicator + signal columns
                - signals: dict of latest detected signals
                - data_meta: dict with fetch metadata (path, rows, etc.)
                - summary: human-readable analysis summary
        """
        logger.info("Analyzing %s — fetching OHLCV and computing indicators.", ticker)

        # 1. Fetch data via DataIngestion (ALCOA+ compliant)
        fetch_result = self.data_ingestion.fetch_and_store(ticker, period=period)
        df = fetch_result["dataframe"]

        if df.empty:
            logger.warning("No data returned for %s. Aborting analysis.", ticker)
            return {
                "dataframe": df,
                "signals": self._empty_signals(),
                "data_meta": fetch_result,
                "summary": f"No data available for {ticker}.",
            }

        # 2. Calculate indicators
        df = self.compute_indicators(df)

        # 3. Generate signals
        df = self.generate_signals(df)

        # 4. Extract latest signals
        latest = df.iloc[-1]

        # Determine current price — prefer real-time, fallback to last close
        using_cached_price = False
        try:
            yf_ticker = yf.Ticker(ticker)
            price = yf_ticker.fast_info.last_price
            if price is None or price <= 0:
                raise ValueError("No real-time price")
        except Exception:
            using_cached_price = True
            if df.empty:
                raise ValueError(
                    f"No price data available for {ticker}. "
                    "Please try again later."
                )
            price = float(df.iloc[-1]["Close"])

        signals = {
            "rsi_value": round(latest["RSI_14"], 2) if pd.notna(latest["RSI_14"]) else None,
            "rsi_oversold": latest.get("signal") == "BUY",
            "rsi_overbought": latest.get("signal") == "SELL",
            "sma_50": round(latest["SMA_50"], 2) if pd.notna(latest["SMA_50"]) else None,
            "sma_200": round(latest["SMA_200"], 2) if pd.notna(latest["SMA_200"]) else None,
            "golden_cross": bool(latest.get("golden_cross", False)),
            "death_cross": bool(latest.get("death_cross", False)),
            "latest_signal": latest.get("signal", "HOLD"),
            "latest_close": round(price, 2),
            "using_cached_price": using_cached_price,
        }

        # 5. Build summary
        summary = self._build_summary(ticker, signals)
        logger.info("Analysis complete for %s: %s", ticker, signals["latest_signal"])

        return {
            "dataframe": df,
            "signals": signals,
            "data_meta": {
                "path": fetch_result["path"],
                "rows": fetch_result["rows"],
                "date_range": fetch_result["date_range"],
                "fetch_timestamp": fetch_result["fetch_timestamp"],
                "valid": fetch_result["valid"],
                "using_cached_data": fetch_result.get(
                    "using_cached_data", False),
                "cache_age_days": fetch_result.get(
                    "cache_age_days", None),
            },
            "summary": summary,
        }

    def compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate SMA-50, SMA-200, and RSI-14 on the DataFrame.

        Args:
            df: DataFrame with at least a 'Close' column.

        Returns:
            DataFrame with added SMA_50, SMA_200, and RSI_14 columns.
        """
        close = df["Close"]

        # SMA-50 and SMA-200
        sma_50 = SMAIndicator(close=close, window=50)
        sma_200 = SMAIndicator(close=close, window=200)
        df["SMA_50"] = sma_50.sma_indicator()
        df["SMA_200"] = sma_200.sma_indicator()

        # RSI-14
        rsi = RSIIndicator(close=close, window=14)
        df["RSI_14"] = rsi.rsi()

        logger.info("Computed SMA_50, SMA_200, RSI_14 (%d rows)", len(df))
        return df

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        """Apply signal logic to indicator columns.

        Signal rules:
          - RSI < 30 → 'BUY' (oversold / dip buy)
          - Close > SMA_50 AND 50 < RSI < 70 → 'BUY' (momentum / trend follow)
          - RSI > 70 → 'SELL' (overbought)
          - Otherwise → 'HOLD'

        Cross detection:
          - golden_cross: SMA_50 crosses above SMA_200
          - death_cross: SMA_50 crosses below SMA_200

        Args:
            df: DataFrame with RSI_14, SMA_50, SMA_200, Close columns.

        Returns:
            DataFrame with added 'signal', 'golden_cross', 'death_cross' columns.
        """
        rsi = df["RSI_14"]
        close = df["Close"]
        sma_50 = df["SMA_50"]

        # Dip buy: RSI < 30 (oversold)
        dip_buy = rsi < 30

        # Momentum buy: Close above SMA_50 and RSI in the sweet spot (50-70)
        momentum_buy = (close > sma_50) & (rsi > 50) & (rsi < 70) & sma_50.notna()

        # Sell: RSI > 70 (overbought)
        sell = rsi > 70

        # Priority: SELL > DIP_BUY > MOMENTUM_BUY > HOLD
        df["signal"] = np.select(
            [sell, dip_buy, momentum_buy],
            ["SELL", "BUY", "BUY"],
            default="HOLD",
        )

        # SMA cross detection (current bar vs previous bar)
        sma_valid = df["SMA_50"].notna() & df["SMA_200"].notna()
        sma_above = (df["SMA_50"] > df["SMA_200"]) & sma_valid
        prev_sma_valid = sma_valid.shift(1, fill_value=False)
        sma_above_prev = sma_above.shift(1, fill_value=False)
        df["golden_cross"] = sma_valid & prev_sma_valid & sma_above & ~sma_above_prev
        df["death_cross"] = sma_valid & prev_sma_valid & ~sma_above & sma_above_prev

        buy_count = (df["signal"] == "BUY").sum()
        sell_count = (df["signal"] == "SELL").sum()
        gc_count = df["golden_cross"].sum()
        dc_count = df["death_cross"].sum()

        logger.info(
            "Signals generated: %d BUY, %d SELL, %d Golden Cross, %d Death Cross",
            buy_count, sell_count, gc_count, dc_count,
        )
        return df

    def _build_summary(self, ticker: str, signals: dict[str, Any]) -> str:
        """Build a human-readable analysis summary."""
        parts = [f"📊 {ticker} Technical Analysis"]

        if signals["latest_close"]:
            parts.append(f"  Close: ${signals['latest_close']}")
        if signals["rsi_value"] is not None:
            rsi_label = ""
            if signals["rsi_oversold"]:
                rsi_label = " ⚠️ OVERSOLD"
            elif signals["rsi_overbought"]:
                rsi_label = " ⚠️ OVERBOUGHT"
            parts.append(f"  RSI(14): {signals['rsi_value']}{rsi_label}")
        if signals["sma_50"] is not None:
            parts.append(f"  SMA-50: ${signals['sma_50']}  |  SMA-200: ${signals['sma_200']}")
        if signals["golden_cross"]:
            parts.append("  🟢 GOLDEN CROSS detected (bullish)")
        if signals["death_cross"]:
            parts.append("  🔴 DEATH CROSS detected (bearish)")

        parts.append(f"  Signal: {signals['latest_signal']}")
        return "\n".join(parts)

    @staticmethod
    def _empty_signals() -> dict[str, Any]:
        """Return an empty signals dict for when analysis fails."""
        return {
            "rsi_value": None,
            "rsi_oversold": False,
            "rsi_overbought": False,
            "sma_50": None,
            "sma_200": None,
            "golden_cross": False,
            "death_cross": False,
            "latest_signal": "HOLD",
            "latest_close": None,
            "using_cached_price": False,
        }
