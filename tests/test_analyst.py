"""
Tests for the Analyst Agent.

Uses mock DataFrames (no yfinance calls) to verify that:
  1. RSI signal logic correctly labels BUY when RSI < 30
  2. RSI signal logic correctly labels SELL when RSI > 70
  3. RSI between 30-70 produces HOLD
  4. Golden Cross detection works
  5. Death Cross detection works
"""

import numpy as np
import pandas as pd
import pytest

from src.agents.analyst import AnalystAgent


@pytest.fixture
def analyst() -> AnalystAgent:
    """Create an AnalystAgent instance (data_ingestion not used in unit tests)."""
    return AnalystAgent()


def _make_ohlcv_df(close_prices: list[float], n: int | None = None) -> pd.DataFrame:
    """Helper: build a mock OHLCV DataFrame from a list of close prices.

    Args:
        close_prices: List of closing prices.
        n: Optional override for number of rows.

    Returns:
        DataFrame with Date index and Open, High, Low, Close, Volume columns.
    """
    if n is None:
        n = len(close_prices)
    dates = pd.bdate_range(end="2026-02-16", periods=n)
    close = np.array(close_prices[-n:], dtype=float)
    return pd.DataFrame(
        {
            "Open": close * 0.99,
            "High": close * 1.02,
            "Low": close * 0.97,
            "Close": close,
            "Volume": [1_000_000] * n,
        },
        index=dates,
    )


class TestComputeIndicators:
    """Test indicator computation (SMA, RSI)."""

    def test_sma_columns_added(self, analyst: AnalystAgent) -> None:
        """SMA_50, SMA_200, RSI_14 columns should be present after compute."""
        prices = list(range(100, 300))  # 200 prices
        df = _make_ohlcv_df(prices)
        result = analyst.compute_indicators(df)

        assert "SMA_50" in result.columns
        assert "SMA_200" in result.columns
        assert "RSI_14" in result.columns

    def test_sma_50_value(self, analyst: AnalystAgent) -> None:
        """SMA_50 should be valid after 50 data points."""
        prices = list(range(100, 160))  # 60 prices: 100..159
        df = _make_ohlcv_df(prices)
        result = analyst.compute_indicators(df)

        # SMA_50 should be non-NaN at index 55 (56th element)
        actual = result["SMA_50"].iloc[55]
        assert pd.notna(actual), f"SMA_50 at row 55 should not be NaN, got {actual}"

        # Manually verify: SMA_50 at row 55 = mean(Close[6:56]) = mean(106..155) = 130.5
        expected = np.mean(list(range(106, 156)))
        assert abs(actual - expected) < 0.01, f"Expected {expected}, got {actual}"


class TestSignalGeneration:
    """Test RSI-based BUY/SELL/HOLD signal logic."""

    def test_buy_signal_when_rsi_below_30(self, analyst: AnalystAgent) -> None:
        """RSI < 30 should produce a BUY signal."""
        df = pd.DataFrame({
            "Close": [100.0] * 5,
            "RSI_14": [25.0, 28.0, 29.9, 31.0, 45.0],
            "SMA_50": [100.0] * 5,
            "SMA_200": [100.0] * 5,
        })
        result = analyst.generate_signals(df)

        assert result["signal"].iloc[0] == "BUY"   # RSI 25
        assert result["signal"].iloc[1] == "BUY"   # RSI 28
        assert result["signal"].iloc[2] == "BUY"   # RSI 29.9

    def test_sell_signal_when_rsi_above_70(self, analyst: AnalystAgent) -> None:
        """RSI > 70 should produce a SELL signal."""
        df = pd.DataFrame({
            "Close": [100.0] * 5,
            "RSI_14": [71.0, 75.0, 85.0, 65.0, 50.0],
            "SMA_50": [100.0] * 5,
            "SMA_200": [100.0] * 5,
        })
        result = analyst.generate_signals(df)

        assert result["signal"].iloc[0] == "SELL"  # RSI 71
        assert result["signal"].iloc[1] == "SELL"  # RSI 75
        assert result["signal"].iloc[2] == "SELL"  # RSI 85

    def test_hold_signal_rsi_between_30_and_70(self, analyst: AnalystAgent) -> None:
        """RSI between 30 and 70 (inclusive boundaries at 30/70) should produce HOLD."""
        df = pd.DataFrame({
            "Close": [100.0] * 5,
            "RSI_14": [30.0, 45.0, 50.0, 69.9, 70.0],
            "SMA_50": [100.0] * 5,
            "SMA_200": [100.0] * 5,
        })
        result = analyst.generate_signals(df)

        assert result["signal"].iloc[0] == "HOLD"  # RSI exactly 30
        assert result["signal"].iloc[1] == "HOLD"  # RSI 45
        assert result["signal"].iloc[2] == "HOLD"  # RSI 50
        assert result["signal"].iloc[3] == "HOLD"  # RSI 69.9
        assert result["signal"].iloc[4] == "HOLD"  # RSI exactly 70

    def test_golden_cross_detected(self, analyst: AnalystAgent) -> None:
        """Golden Cross: SMA_50 crosses from below to above SMA_200."""
        df = pd.DataFrame({
            "Close": [100.0] * 4,
            "RSI_14": [50.0] * 4,
            "SMA_50": [95.0, 98.0, 101.0, 103.0],   # crosses above at index 2
            "SMA_200": [100.0, 100.0, 100.0, 100.0],
        })
        result = analyst.generate_signals(df)

        assert result["golden_cross"].iloc[2] is True or result["golden_cross"].iloc[2] == True
        assert result["death_cross"].iloc[2] is False or result["death_cross"].iloc[2] == False

    def test_first_valid_sma_bar_does_not_create_false_cross(self, analyst: AnalystAgent) -> None:
        """The first valid SMA-200 row should not be treated as a fresh crossover."""
        df = pd.DataFrame({
            "Close": [100.0, 100.0, 100.0],
            "RSI_14": [50.0, 50.0, 50.0],
            "SMA_50": [float("nan"), 101.0, 102.0],
            "SMA_200": [float("nan"), 100.0, 100.0],
        })
        result = analyst.generate_signals(df)

        assert not bool(result["golden_cross"].fillna(False).any())
        assert not bool(result["death_cross"].fillna(False).any())

    def test_death_cross_detected(self, analyst: AnalystAgent) -> None:
        """Death Cross: SMA_50 crosses from above to below SMA_200."""
        df = pd.DataFrame({
            "Close": [100.0] * 4,
            "RSI_14": [50.0] * 4,
            "SMA_50": [105.0, 102.0, 99.0, 97.0],  # crosses below at index 2
            "SMA_200": [100.0, 100.0, 100.0, 100.0],
        })
        result = analyst.generate_signals(df)

        assert result["death_cross"].iloc[2] is True or result["death_cross"].iloc[2] == True
        assert result["golden_cross"].iloc[2] is False or result["golden_cross"].iloc[2] == False

    def test_nan_rsi_produces_hold(self, analyst: AnalystAgent) -> None:
        """NaN RSI values (e.g., insufficient data) should produce HOLD."""
        df = pd.DataFrame({
            "Close": [100.0] * 3,
            "RSI_14": [float("nan"), float("nan"), 50.0],
            "SMA_50": [100.0] * 3,
            "SMA_200": [100.0] * 3,
        })
        result = analyst.generate_signals(df)

        assert result["signal"].iloc[0] == "HOLD"
        assert result["signal"].iloc[1] == "HOLD"
