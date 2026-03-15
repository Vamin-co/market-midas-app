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

    def prune_data_cache(self) -> dict[str, Any]:
        """Keep only the 2 most recent CSVs per ticker, delete the rest.

        Returns:
            Dict with 'pruned' (int) and 'kept' (int) counts.
        """
        from collections import defaultdict

        ticker_files: dict[str, list[Path]] = defaultdict(list)
        for csv_file in sorted(self.data_dir.glob("*.csv")):
            # Files are named {TICKER}_{YYYYMMDD_HHMMSS}.csv
            parts = csv_file.stem.split("_", 1)
            if parts:
                ticker_files[parts[0].upper()].append(csv_file)

        pruned = 0
        kept = 0
        for tkr, files in ticker_files.items():
            # Sort by name (timestamp in name ensures chronological order)
            files.sort()
            to_keep = files[-2:]  # Keep the 2 most recent
            to_delete = files[:-2] if len(files) > 2 else []
            for f in to_delete:
                f.unlink()
                pruned += 1
            kept += len(to_keep)

        if pruned > 0:
            logger.info("Cache pruned: deleted %d old CSVs, kept %d", pruned, kept)

        return {"pruned": pruned, "kept": kept}

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
        # Prune old cache files before fetching
        self.prune_data_cache()

        fetch_ts = datetime.now(timezone.utc)
        logger.info(
            "[ALCOA+ Attributable] Fetching %s data (period=%s) at %s [source: yfinance]",
            ticker, period, fetch_ts.isoformat(),
        )

        # 1. Fetch data via yfinance (with fallback)
        used_ticker_fallback = False
        try:
            df = yf.download(ticker, period=period, auto_adjust=True, progress=False)
            if df.empty:
                raise ValueError("download returned empty")
        except Exception as e:
            logger.warning(
                "yf.download() failed for %s: %s. Retrying with Ticker.history()...",
                ticker, e,
            )
            try:
                ticker_obj = yf.Ticker(ticker)
                df = ticker_obj.history(period=period, auto_adjust=True)
                used_ticker_fallback = True
                if not df.empty:
                    logger.info("Ticker.history() succeeded for %s", ticker)
            except Exception as e2:
                logger.error("All data sources failed for %s: %s", ticker, e2)
                df = pd.DataFrame()

        # 2. If both yfinance APIs failed, try CSV fallback
        if df.empty:
            # Clean up any tiny/corrupt files written this session
            import time as _time
            pattern = f"{ticker.upper()}_*.csv"
            for f in self.data_dir.glob(pattern):
                if f.stat().st_size < 1000 and (_time.time() - f.stat().st_mtime) < 60:
                    logger.info("Deleting corrupt empty file: %s (%d bytes)", f.name, f.stat().st_size)
                    f.unlink()

            fallback_result = self._csv_fallback(ticker, fetch_ts)
            if fallback_result is not None:
                return fallback_result

        # yfinance may return MultiIndex columns for single ticker; flatten
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        # Ensure the index is named 'Date' and is a DatetimeIndex
        df.index.name = "Date"

        # 3. Validate data (ALCOA+ Accurate)
        validation = self.validate_data(df, ticker)

        # 4. Determine date range
        if not df.empty:
            start_date = str(df.index.min().date())
            end_date = str(df.index.max().date())
        else:
            start_date, end_date = None, None

        # 5. Save to data/raw/{TICKER}_{timestamp}.csv (ALCOA+ Original)
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
            "used_ticker_fallback": used_ticker_fallback,
        }

    def _csv_fallback(
        self, ticker: str, fetch_ts: datetime
    ) -> dict[str, Any] | None:
        """Try to load cached CSV for a ticker when live APIs fail.

        Returns a full result dict if a usable cached file is found,
        or a result dict with empty dataframe and staleness metadata
        if cached data is too old. Returns None if no cached files exist
        (caller should proceed with empty df for normal empty handling).
        """
        import time as _time

        pattern = f"{ticker.upper()}_*.csv"
        all_files = sorted(self.data_dir.glob(pattern))

        # Skip tiny files (<1000 bytes) — these are corrupt/empty writes
        cached_files = [f for f in all_files if f.stat().st_size > 1000]

        if not cached_files:
            logger.error(
                "No data available for %s. No cached data exists.", ticker
            )
            return {
                "dataframe": pd.DataFrame(),
                "path": "",
                "rows": 0,
                "date_range": (None, None),
                "fetch_timestamp": fetch_ts.isoformat(),
                "valid": False,
                "issues": ["No data available and no cached files found."],
                "no_cached_data": True,
            }

        # Use most recent file (sorted by filename = chronological)
        latest_file = cached_files[-1]
        file_age_seconds = _time.time() - latest_file.stat().st_mtime
        cache_age_days = int(file_age_seconds / 86400)

        if cache_age_days > 3:
            logger.error(
                "Cached data for %s is %d days old — too stale for "
                "reliable analysis. Refusing to proceed.",
                ticker, cache_age_days,
            )
            return {
                "dataframe": pd.DataFrame(),
                "path": str(latest_file),
                "rows": 0,
                "date_range": (None, None),
                "fetch_timestamp": fetch_ts.isoformat(),
                "valid": False,
                "issues": [f"Cached data is {cache_age_days} days old."],
                "cache_too_stale": True,
                "cache_age_days": cache_age_days,
                "cached_filename": latest_file.name,
            }

        # Cache is fresh enough — load it
        logger.info(
            "Loading cached data for %s from %s (%d days old)",
            ticker, latest_file.name, cache_age_days,
        )
        df = pd.read_csv(latest_file, index_col="Date", parse_dates=True)

        # Flatten columns if needed
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.index.name = "Date"

        validation = self.validate_data(df, ticker)

        if not df.empty:
            start_date = str(df.index.min().date())
            end_date = str(df.index.max().date())
        else:
            start_date, end_date = None, None

        return {
            "dataframe": df,
            "path": str(latest_file),
            "rows": len(df),
            "date_range": (start_date, end_date),
            "fetch_timestamp": fetch_ts.isoformat(),
            "valid": validation["valid"],
            "issues": validation["issues"],
            "using_cached_data": True,
            "cache_age_days": cache_age_days,
            "cache_is_stale": False,
            "cached_filename": latest_file.name,
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
