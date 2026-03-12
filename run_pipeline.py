"""
Live Data Ingestion Pipeline Verification.

Fetches 6 months of OHLCV data for SPY and NVDA via yfinance,
saves to data/raw/ with ALCOA+ timestamped filenames, and prints
the head of each DataFrame for column inspection.
"""

import logging
import sys
from pathlib import Path

# Ensure project root is on the path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.data.ingestion import DataIngestion

# Set up visible logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)

TICKERS = ["SPY", "NVDA"]


def main() -> None:
    ingestion = DataIngestion()

    for ticker in TICKERS:
        print(f"\n{'='*60}")
        print(f"  Fetching: {ticker}")
        print(f"{'='*60}")

        result = ingestion.fetch_and_store(ticker, period="6mo")

        # Verification summary
        print(f"\n  📁 CSV Path : {result['path']}")
        print(f"  📊 Rows     : {result['rows']}")
        print(f"  📅 Range    : {result['date_range'][0]} → {result['date_range'][1]}")
        print(f"  🕐 Fetched  : {result['fetch_timestamp']}")
        print(f"  ✅ Valid    : {result['valid']}")
        if result["issues"]:
            print(f"  ⚠️  Issues  : {result['issues']}")

        # Print head of the DataFrame
        df = result["dataframe"]
        print(f"\n  Columns: {list(df.columns)}")
        print(f"\n  Head (first 5 rows):")
        print(df.head().to_string(max_cols=10))

    # List all files in data/raw/
    raw_dir = Path("data/raw")
    csv_files = sorted(raw_dir.glob("*.csv"))
    print(f"\n{'='*60}")
    print(f"  Files in data/raw/ ({len(csv_files)} CSVs)")
    print(f"{'='*60}")
    for f in csv_files:
        size_kb = f.stat().st_size / 1024
        print(f"  {f.name}  ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
