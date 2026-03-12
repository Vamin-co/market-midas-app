"""
Run Backtests for SPY and NVDA.

Executes the Market-Midas RSI/SMA strategy against 1 year of historical data
and generates Markdown performance reports.

Usage:
    python run_backtest.py
    python run_backtest.py TSLA AAPL   # custom tickers
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.backtest import Backtester

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
# Suppress noisy loggers during batch run
logging.getLogger("src.risk.manager").setLevel(logging.WARNING)
logging.getLogger("src.data.ingestion").setLevel(logging.WARNING)

TICKERS = sys.argv[1:] if len(sys.argv) > 1 else ["SPY", "NVDA"]
STARTING_CAPITAL = 10_000.0


def main() -> None:
    backtester = Backtester(starting_capital=STARTING_CAPITAL)

    for ticker in TICKERS:
        print(f"\n{'='*60}")
        print(f"  ⏳ Running backtest: {ticker} (1 year, ${STARTING_CAPITAL:,.0f})")
        print(f"{'='*60}")

        result = backtester.run(ticker, period="1y")
        report_path = backtester.generate_report(result)

        # Print summary to console
        print(f"\n  📊 {ticker} BACKTEST RESULTS")
        print(f"  {'─'*50}")
        print(f"  Period        : {result.start_date} → {result.end_date}")
        print(f"  Starting      : ${result.starting_capital:,.2f}")
        print(f"  Ending        : ${result.ending_capital:,.2f}")
        print(f"  Total Return  : {result.total_return_pct:+.2f}%")
        print(f"  Buy & Hold    : {result.buy_and_hold_return_pct:+.2f}%")
        print(f"  Trades        : {result.num_trades} (W:{result.winning_trades} / L:{result.losing_trades})")
        print(f"  Win Rate      : {result.win_rate_pct:.1f}%")
        print(f"  Max Drawdown  : {result.max_drawdown_pct:.2f}%")
        print(f"  Report        : {report_path}")

    print(f"\n{'='*60}")
    print(f"  ✅ All backtests complete.")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
