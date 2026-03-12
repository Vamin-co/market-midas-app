"""
Backtester — Historical Strategy Simulation.

Simulates the Market-Midas RSI/SMA trading strategy against historical
data to calculate Total Return, Win Rate, and Max Drawdown.

Uses:
  - DataIngestion for fetching 1 year of OHLCV data
  - AnalystAgent for computing indicators and signals
  - RiskManager for enforcing 5% position sizing and stop-loss
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.agents.analyst import AnalystAgent
from src.data.ingestion import DataIngestion
from src.risk.manager import RiskManager

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = PROJECT_ROOT / "logs"


@dataclass
class Trade:
    """Record of a single completed trade (entry + exit)."""

    ticker: str
    entry_date: str
    entry_price: float
    shares: int
    exit_date: str = ""
    exit_price: float = 0.0
    pnl: float = 0.0
    pnl_pct: float = 0.0
    exit_reason: str = ""  # "signal" or "stop_loss"


@dataclass
class BacktestResult:
    """Full results of a backtest run."""

    ticker: str
    start_date: str
    end_date: str
    starting_capital: float
    ending_capital: float
    total_return_pct: float
    buy_and_hold_return_pct: float
    num_trades: int
    winning_trades: int
    losing_trades: int
    win_rate_pct: float
    max_drawdown_pct: float
    max_drawdown_peak_date: str
    max_drawdown_trough_date: str
    trades: list[Trade] = field(default_factory=list)
    daily_portfolio: pd.Series = field(default_factory=pd.Series)


class Backtester:
    """Simulates the trading strategy against historical data.

    Attributes:
        starting_capital: Initial cash available.
        analyst: AnalystAgent for technical analysis.
        risk_mgr: RiskManager for position sizing.
        data_ingestion: DataIngestion for fetching data.
    """

    def __init__(self, starting_capital: float = 10_000.0) -> None:
        self.starting_capital = starting_capital
        self.analyst = AnalystAgent()
        self.risk_mgr = RiskManager()
        self.data_ingestion = DataIngestion()
        logger.info("Backtester initialized with $%.2f capital.", starting_capital)

    def run(self, ticker: str, period: str = "1y") -> BacktestResult:
        """Run the full backtest simulation.

        Args:
            ticker: Stock ticker symbol (e.g., 'SPY', 'NVDA').
            period: Data period string for yfinance (default '1y').

        Returns:
            BacktestResult with all metrics and trade history.
        """
        logger.info("Starting backtest for %s (period=%s, capital=$%.2f)",
                     ticker, period, self.starting_capital)

        # 1. Fetch data and compute indicators/signals
        fetch_result = self.data_ingestion.fetch_and_store(ticker, period=period)
        df = fetch_result["dataframe"]

        if df.empty:
            logger.error("No data for %s — cannot backtest.", ticker)
            return self._empty_result(ticker)

        df = self.analyst.compute_indicators(df)
        df = self.analyst.generate_signals(df)

        # 2. Simulate day-by-day
        cash = self.starting_capital
        shares_held = 0
        entry_price = 0.0
        entry_date = ""
        completed_trades: list[Trade] = []
        daily_values: list[float] = []
        daily_dates: list = []
        stop_loss_price = 0.0

        for i in range(len(df)):
            row = df.iloc[i]
            date_str = str(df.index[i].date())
            close = row["Close"]
            signal = row.get("signal", "HOLD")
            rsi = row.get("RSI_14", float("nan"))

            # Portfolio value today
            portfolio_value = cash + (shares_held * close)
            daily_values.append(portfolio_value)
            daily_dates.append(df.index[i])

            # Skip if RSI not yet computed (early rows with NaN)
            if pd.isna(rsi):
                continue

            # ── STOP-LOSS CHECK ──
            if shares_held > 0 and close <= stop_loss_price:
                pnl = (close - entry_price) * shares_held
                pnl_pct = ((close - entry_price) / entry_price) * 100
                completed_trades.append(Trade(
                    ticker=ticker, entry_date=entry_date,
                    entry_price=entry_price, shares=shares_held,
                    exit_date=date_str, exit_price=close,
                    pnl=round(pnl, 2), pnl_pct=round(pnl_pct, 2),
                    exit_reason="stop_loss",
                ))
                cash += shares_held * close
                logger.info("STOP-LOSS on %s: sold %d @ $%.2f (P&L: $%.2f)",
                            date_str, shares_held, close, pnl)
                shares_held = 0
                entry_price = 0.0
                stop_loss_price = 0.0
                continue

            # ── BUY SIGNAL ──
            if signal == "BUY" and shares_held == 0 and cash > 0:
                position = self.risk_mgr.calculate_position_size(portfolio_value, close)
                buy_shares = position["max_shares"]
                if buy_shares > 0 and (buy_shares * close) <= cash:
                    cost = buy_shares * close
                    cash -= cost
                    shares_held = buy_shares
                    entry_price = close
                    entry_date = date_str
                    stop_loss_price = self.risk_mgr.calculate_stop_loss(close)
                    logger.info("BUY on %s: %d shares @ $%.2f (cost: $%.2f, stop: $%.2f)",
                                date_str, buy_shares, close, cost, stop_loss_price)

            # ── SELL SIGNAL ──
            elif signal == "SELL" and shares_held > 0:
                revenue = shares_held * close
                pnl = (close - entry_price) * shares_held
                pnl_pct = ((close - entry_price) / entry_price) * 100
                completed_trades.append(Trade(
                    ticker=ticker, entry_date=entry_date,
                    entry_price=entry_price, shares=shares_held,
                    exit_date=date_str, exit_price=close,
                    pnl=round(pnl, 2), pnl_pct=round(pnl_pct, 2),
                    exit_reason="signal",
                ))
                cash += revenue
                logger.info("SELL on %s: %d shares @ $%.2f (P&L: $%.2f, %.1f%%)",
                            date_str, shares_held, close, pnl, pnl_pct)
                shares_held = 0
                entry_price = 0.0
                stop_loss_price = 0.0

        # 3. Close any open position at the last price
        last_close = df.iloc[-1]["Close"]
        last_date = str(df.index[-1].date())
        if shares_held > 0:
            pnl = (last_close - entry_price) * shares_held
            pnl_pct = ((last_close - entry_price) / entry_price) * 100
            completed_trades.append(Trade(
                ticker=ticker, entry_date=entry_date,
                entry_price=entry_price, shares=shares_held,
                exit_date=last_date, exit_price=last_close,
                pnl=round(pnl, 2), pnl_pct=round(pnl_pct, 2),
                exit_reason="end_of_period",
            ))
            cash += shares_held * last_close
            shares_held = 0

        # 4. Calculate metrics
        ending_capital = cash
        total_return_pct = ((ending_capital - self.starting_capital)
                            / self.starting_capital) * 100

        # Buy-and-hold benchmark
        first_close = df.iloc[0]["Close"]
        bh_return_pct = ((last_close - first_close) / first_close) * 100

        # Win Rate
        winning = [t for t in completed_trades if t.pnl > 0]
        losing = [t for t in completed_trades if t.pnl <= 0]
        win_rate = (len(winning) / len(completed_trades) * 100) if completed_trades else 0.0

        # Max Drawdown
        daily_series = pd.Series(daily_values, index=daily_dates)
        cummax = daily_series.cummax()
        drawdown = (daily_series - cummax) / cummax
        max_dd = drawdown.min() * 100
        dd_trough_idx = drawdown.idxmin()
        dd_peak_idx = daily_series.loc[:dd_trough_idx].idxmax()

        result = BacktestResult(
            ticker=ticker,
            start_date=str(df.index[0].date()),
            end_date=last_date,
            starting_capital=self.starting_capital,
            ending_capital=round(ending_capital, 2),
            total_return_pct=round(total_return_pct, 2),
            buy_and_hold_return_pct=round(bh_return_pct, 2),
            num_trades=len(completed_trades),
            winning_trades=len(winning),
            losing_trades=len(losing),
            win_rate_pct=round(win_rate, 1),
            max_drawdown_pct=round(max_dd, 2),
            max_drawdown_peak_date=str(dd_peak_idx.date()) if hasattr(dd_peak_idx, 'date') else str(dd_peak_idx),
            max_drawdown_trough_date=str(dd_trough_idx.date()) if hasattr(dd_trough_idx, 'date') else str(dd_trough_idx),
            trades=completed_trades,
            daily_portfolio=daily_series,
        )

        logger.info(
            "Backtest complete for %s: Return=%.2f%%, Win Rate=%.1f%%, Max DD=%.2f%%",
            ticker, total_return_pct, win_rate, max_dd,
        )
        return result

    def generate_report(self, result: BacktestResult) -> str:
        """Generate a Markdown report from backtest results.

        Args:
            result: BacktestResult from a completed backtest.

        Returns:
            Absolute path to the saved report file.
        """
        ticker = result.ticker
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        filepath = REPORTS_DIR / f"backtest_results_{ticker}.md"

        # Determine strategy verdict
        if result.total_return_pct > result.buy_and_hold_return_pct:
            verdict = "✅ Strategy OUTPERFORMS buy-and-hold"
        elif result.total_return_pct > 0:
            verdict = "⚠️ Strategy profitable but UNDERPERFORMS buy-and-hold"
        else:
            verdict = "🔴 Strategy UNPROFITABLE in this period"

        # Build trade table
        trade_rows = []
        for t in result.trades:
            emoji = "🟢" if t.pnl > 0 else "🔴"
            trade_rows.append(
                f"| {emoji} | {t.entry_date} | {t.exit_date} | "
                f"${t.entry_price:.2f} | ${t.exit_price:.2f} | "
                f"{t.shares} | ${t.pnl:+.2f} | {t.pnl_pct:+.1f}% | {t.exit_reason} |"
            )
        trade_table = "\n".join(trade_rows) if trade_rows else "| — | No trades executed | — | — | — | — | — | — | — |"

        report = f"""# Backtest Report: {ticker}

> **Period:** {result.start_date} → {result.end_date} | **Strategy:** RSI-14 + SMA-50/200

## Performance Summary

| Metric | Value |
|--------|-------|
| Starting Capital | ${result.starting_capital:,.2f} |
| Ending Capital | ${result.ending_capital:,.2f} |
| **Total Return** | **{result.total_return_pct:+.2f}%** |
| Buy & Hold Return | {result.buy_and_hold_return_pct:+.2f}% |
| Total Trades | {result.num_trades} |
| Winning Trades | {result.winning_trades} |
| Losing Trades | {result.losing_trades} |
| **Win Rate** | **{result.win_rate_pct:.1f}%** |
| **Max Drawdown** | **{result.max_drawdown_pct:.2f}%** |
| Drawdown Peak | {result.max_drawdown_peak_date} |
| Drawdown Trough | {result.max_drawdown_trough_date} |

> {verdict}

## Risk Parameters

| Parameter | Value |
|-----------|-------|
| Position Size Limit | 5% of portfolio per trade |
| Stop-Loss | 5% below entry price |
| Buy Signal | RSI(14) < 30 (oversold) |
| Sell Signal | RSI(14) > 70 (overbought) |

## Trade Log

| | Entry Date | Exit Date | Entry $ | Exit $ | Shares | P&L | P&L % | Reason |
|-|-----------|-----------|---------|--------|--------|-----|-------|--------|
{trade_table}

---
*Generated by Market-Midas Backtester on {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}*
"""
        filepath.write_text(report)
        logger.info("Report saved to %s", filepath)
        return str(filepath)

    def _empty_result(self, ticker: str) -> BacktestResult:
        """Return an empty result when no data is available."""
        return BacktestResult(
            ticker=ticker, start_date="N/A", end_date="N/A",
            starting_capital=self.starting_capital,
            ending_capital=self.starting_capital,
            total_return_pct=0.0, buy_and_hold_return_pct=0.0,
            num_trades=0, winning_trades=0, losing_trades=0,
            win_rate_pct=0.0, max_drawdown_pct=0.0,
            max_drawdown_peak_date="N/A", max_drawdown_trough_date="N/A",
        )
