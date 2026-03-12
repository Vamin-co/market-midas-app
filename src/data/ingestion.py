"""
Data Ingestion (ALCOA+ Compliant).

Fetches historical OHLCV data using yfinance and stores it in
`data/raw/` following ALCOA+ principles:

  - Attributable: Logged with source ('yfinance') and timestamp.
  - Legible: Stored as clean CSVs.
  - Contemporaneous: Fetch timestamp recorded at time of download.
  - Original: Raw data in `data/raw/` is immutable — never overwritten.
  - Accurate: Validated post-fetch (no NaN gaps, correct date range).
"""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# Project root (two levels up from src/data/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"


class DataIngestion:
    """ALCOA+ compliant data fetcher and validator.

    Attributes:
        data_dir: Path to the raw data directory.
    """

    def __init__(self, data_dir: Path = RAW_DATA_DIR) -> None:
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        logger.info("DataIngestion initialized. Raw data dir: %s", self.data_dir)

    def fetch_and_store(
        self,
        ticker: str,
        period: str = "6mo",
    ) -> dict[str, Any]:
        """Fetch OHLCV data and store as an immutable CSV.

        The file is named `{TICKER}_{YYYYMMDD_HHMMSS}.csv` to ensure
        originality (no overwrites).

        Args:
            ticker: Stock ticker symbol (e.g., 'NVDA').
            period: yfinance period string (default '6mo').

        Returns:
            dict with:
                - dataframe: pd.DataFrame — the fetched data with Date index
                - path: str — absolute path to saved CSV
                - rows: int — number of data rows
                - date_range: tuple[str, str] — (start_date, end_date)
                - fetch_timestamp: str — ISO-8601 fetch time
                - valid: bool — passed ALCOA+ validation
        """
        fetch_ts = datetime.now(timezone.utc)
        logger.info(
            "[ALCOA+ Attributable] Fetching %s data (period=%s) at %s [source: yfinance]",
            ticker, period, fetch_ts.isoformat(),
        )

        # 1. Fetch data via yfinance
        df = yf.download(ticker, period=period, auto_adjust=True, progress=False)

        # yfinance may return MultiIndex columns for single ticker; flatten
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        # Ensure the index is named 'Date' and is a DatetimeIndex
        df.index.name = "Date"

        # 2. Validate data (ALCOA+ Accurate)
        validation = self.validate_data(df, ticker)

        # 3. Determine date range
        if not df.empty:
            start_date = str(df.index.min().date())
            end_date = str(df.index.max().date())
        else:
            start_date, end_date = None, None

        # 4. Save to data/raw/{TICKER}_{timestamp}.csv (ALCOA+ Original)
        timestamp_str = fetch_ts.strftime("%Y%m%d_%H%M%S")
        filename = f"{ticker.upper()}_{timestamp_str}.csv"
        filepath = self.data_dir / filename

        df.to_csv(filepath)
        logger.info(
            "[ALCOA+ Original] Saved raw data to %s (%d rows, %s to %s)",
            filepath, len(df), start_date, end_date,
        )

        return {
            "dataframe": df,
            "path": str(filepath),
            "rows": len(df),
            "date_range": (start_date, end_date),
            "fetch_timestamp": fetch_ts.isoformat(),
            "valid": validation["valid"],
            "issues": validation["issues"],
        }

    def fetch_ohlcv(self, ticker: str, period: str = "6mo") -> pd.DataFrame:
        """Convenience method: fetch OHLCV, store to disk, return DataFrame.

        Args:
            ticker: Stock ticker symbol.
            period: Data period (default '6mo').

        Returns:
            Clean pandas DataFrame with Date index and OHLCV columns.
        """
        result = self.fetch_and_store(ticker, period=period)
        return result["dataframe"]

    def validate_data(self, df: pd.DataFrame, ticker: str) -> dict[str, Any]:
        """Validate fetched data against ALCOA+ accuracy standards.

        Checks:
          - DataFrame is not empty
          - Expected OHLCV columns present
          - No NaN values in OHLCV columns
          - Date index is monotonically increasing

        Args:
            df: DataFrame to validate.
            ticker: Ticker for logging context.

        Returns:
            dict with valid (bool), issues (list[str]).
        """
        issues: list[str] = []
        expected_cols = {"Open", "High", "Low", "Close", "Volume"}

        if df.empty:
            issues.append("DataFrame is empty.")
            logger.warning("[ALCOA+ Accurate] Validation FAILED for %s: empty data", ticker)
            return {"valid": False, "issues": issues}

        missing = expected_cols - set(df.columns)
        if missing:
            issues.append(f"Missing columns: {missing}")

        present_ohlcv = list(expected_cols & set(df.columns))
        if present_ohlcv and df[present_ohlcv].isna().any().any():
            nan_counts = df[present_ohlcv].isna().sum()
            nan_cols = nan_counts[nan_counts > 0].to_dict()
            issues.append(f"NaN values found: {nan_cols}")

        if not df.index.is_monotonic_increasing:
            issues.append("Date index is not monotonically increasing.")

        valid = len(issues) == 0
        if valid:
            logger.info("[ALCOA+ Accurate] Validation PASSED for %s (%d rows)", ticker, len(df))
        else:
            logger.warning("[ALCOA+ Accurate] Validation FAILED for %s: %s", ticker, issues)

        return {"valid": valid, "issues": issues}
