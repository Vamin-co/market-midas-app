"""
Phase 4: Alert Engine — Background Stop-Loss Monitoring + Custom Alerts.

Provides a polling cycle that:
  1. Reads open trades from paper_trades.json (READ-ONLY, never mutated).
  2. Fetches live prices via the existing batched yfinance cache.
  3. Evaluates unrealized P/L against the user's stopLossThreshold.
  4. Fires native macOS notifications via osascript (async-safe).
  5. Logs alerts to logs/alert_log.json with daily dedup + 30-day pruning.
  6. Evaluates custom user alerts from logs/user_alerts.json (stop_loss / price_target).
"""

import asyncio
import json
import logging
import os
import subprocess
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, TypedDict

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TRADES_FILE = PROJECT_ROOT / "logs" / "paper_trades.json"
ALERT_LOG_FILE = PROJECT_ROOT / "logs" / "alert_log.json"
USER_ALERTS_FILE = PROJECT_ROOT / "logs" / "user_alerts.json"

LOG_RETENTION_DAYS = 30


# ════════════════════════════════════════════════════════════════
# Types
# ════════════════════════════════════════════════════════════════

class AlertCycleSummary(TypedDict):
    evaluated: int              # total open trades inspected
    alerted: int                # notifications fired this cycle
    skipped_throttled: int      # already alerted today
    skipped_no_price: int       # yfinance returned None
    errors: int                 # unexpected per-trade errors


# ════════════════════════════════════════════════════════════════
# Trade Loading (READ-ONLY)
# ════════════════════════════════════════════════════════════════

def _load_open_trades() -> list[dict]:
    """Read paper_trades.json and return only 'open' trades.

    This function is READ-ONLY — it never writes to the file.
    """
    if not TRADES_FILE.exists():
        return []
    try:
        data = json.loads(TRADES_FILE.read_text())
        if not isinstance(data, list):
            logger.warning("paper_trades.json root is not a list, returning [].")
            return []
        return [t for t in data if t.get("status") == "open"]
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("paper_trades.json unreadable (%s), returning [].", exc)
        return []


# ════════════════════════════════════════════════════════════════
# Alert Log (State + Dedup + Pruning)
# ════════════════════════════════════════════════════════════════

def _load_alert_log() -> list[dict]:
    """Load alert log from disk with 30-day pruning + corruption fallback.

    Returns [] on missing or corrupt file. Prunes entries older than
    LOG_RETENTION_DAYS and saves pruned list back to disk.
    """
    if not ALERT_LOG_FILE.exists():
        return []
    try:
        data = json.loads(ALERT_LOG_FILE.read_text())
        if not isinstance(data, list):
            raise ValueError("alert_log.json root is not a list")
    except (json.JSONDecodeError, ValueError, OSError) as exc:
        logger.warning(
            "⚠️  alert_log.json unreadable (%s), defaulting to []. "
            "File will be overwritten on next alert.", exc
        )
        return []

    # Prune entries older than 30 days
    cutoff = datetime.now() - timedelta(days=LOG_RETENTION_DAYS)
    before = len(data)
    data = [
        entry for entry in data
        if datetime.fromisoformat(entry["alerted_at"]) >= cutoff
    ]
    if len(data) < before:
        logger.info(
            "🗑  Pruned %d stale alert log entries (>%d days).",
            before - len(data), LOG_RETENTION_DAYS,
        )
        ALERT_LOG_FILE.write_text(json.dumps(data, indent=2))

    return data


def _was_alerted_today(trade_id: str, alert_log: list[dict]) -> bool:
    """Check if this trade already fired a notification today (local time)."""
    today = datetime.now().date()  # local time
    return any(
        entry["trade_id"] == trade_id
        and datetime.fromisoformat(entry["alerted_at"]).date() == today
        for entry in alert_log
    )


def _append_alert_log(
    current_logs: list[dict],
    trade: dict,
    pnl_pct: float,
    pnl_dollars: float,
    threshold_pct: float,
) -> None:
    """Append a new alert entry to the in-memory list and write to disk.

    Accepts the already-loaded (already-pruned) in-memory list to prevent
    re-reading pruned entries if a load and append happen in the same cycle.
    """
    entry = {
        "trade_id": trade["id"],
        "ticker": trade["ticker"],
        "alerted_at": datetime.now().isoformat(),  # local time, no tz suffix — intentional, matches _was_alerted_today() comparison
        "pnl_pct": round(pnl_pct, 4),
        "pnl_dollars": round(pnl_dollars, 2),
        "threshold_used": round(threshold_pct * 100, 1),
    }
    current_logs.append(entry)

    ALERT_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    ALERT_LOG_FILE.write_text(json.dumps(current_logs, indent=2))
    logger.info("📝 Alert logged for %s (trade %s).", trade["ticker"], trade["id"])


# ════════════════════════════════════════════════════════════════
# macOS Notification (Async-Safe)
# ════════════════════════════════════════════════════════════════

async def _send_macos_notification(
    trade: dict, pnl_pct: float, pnl_dollars: float, threshold: float
) -> None:
    """Fire a native macOS notification via osascript.

    Dispatched to a thread via run_in_executor to avoid blocking
    the FastAPI event loop.
    """
    title = "⚠️ Market-Midas Alert"
    body = (
        f"{trade['ticker']} breached your -{threshold*100:.0f}% stop-loss. "
        f"Current P/L: {'−' if pnl_dollars < 0 else '+'}"
        f"${abs(pnl_dollars):,.2f} ({pnl_pct*100:+.1f}%)"
    )
    script = f'display notification "{body}" with title "{title}" sound name "Purr"'

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,  # default ThreadPoolExecutor
        lambda: subprocess.run(["osascript", "-e", script], check=False, timeout=5),
    )
    logger.info("🔔 Notification sent: %s — %s", trade["ticker"], body)


# ════════════════════════════════════════════════════════════════
# Main Polling Cycle
# ════════════════════════════════════════════════════════════════

async def alert_polling_cycle(
    settings_reader: Any = None,
    price_fetcher: Any = None,
) -> AlertCycleSummary:
    """Background job: evaluate open trades against stop-loss threshold.

    Args:
        settings_reader: Callable returning settings dict.
                         Defaults to server._read_settings at runtime.
        price_fetcher:   Callable(tickers) returning {ticker: price}.
                         Defaults to server._fetch_batch_prices at runtime.

    Returns:
        AlertCycleSummary with counts of evaluated, alerted, skipped, errors.
    """
    # Late imports to avoid circular dependency (server ↔ alert_engine)
    if settings_reader is None:
        from src.server import _read_settings
        settings_reader = _read_settings
    if price_fetcher is None:
        from src.server import _fetch_batch_prices
        price_fetcher = _fetch_batch_prices

    summary: AlertCycleSummary = {
        "evaluated": 0,
        "alerted": 0,
        "skipped_throttled": 0,
        "skipped_no_price": 0,
        "errors": 0,
    }

    # 1. Load open trades (read-only)
    open_trades = _load_open_trades()
    if not open_trades:
        logger.info("📊 Alert cycle: no open trades to evaluate.")
        return summary

    # 2. Load alert log (with pruning + corruption fallback)
    alert_log = _load_alert_log()

    # 3. Fetch live prices for unique tickers
    unique_tickers = list({t["ticker"] for t in open_trades})
    live_prices = price_fetcher(unique_tickers)

    # 4. Read stop-loss threshold from settings
    settings = settings_reader()
    threshold_pct = settings.get("stopLossThreshold", 5.0) / 100.0  # e.g. 0.08

    # 5. Evaluate each open trade
    for trade in open_trades:
        summary["evaluated"] += 1
        try:
            live_price = live_prices.get(trade["ticker"])
            if live_price is None:
                summary["skipped_no_price"] += 1
                continue

            entry_price = trade["price"]
            pnl_pct = (live_price - entry_price) / entry_price
            pnl_dollars = (live_price - entry_price) * trade["quantity"]

            if pnl_pct <= -threshold_pct:
                if not _was_alerted_today(trade["id"], alert_log):
                    await _send_macos_notification(
                        trade, pnl_pct, pnl_dollars, threshold_pct
                    )
                    _append_alert_log(
                        alert_log, trade, pnl_pct, pnl_dollars, threshold_pct
                    )
                    summary["alerted"] += 1
                else:
                    summary["skipped_throttled"] += 1
        except Exception as exc:
            logger.error("Error evaluating trade %s: %s", trade.get("id"), exc)
            summary["errors"] += 1

    logger.info("📊 Alert cycle complete: %s", summary)
    return summary


# ════════════════════════════════════════════════════════════════
# Custom User Alerts (stop_loss / price_target)
# ════════════════════════════════════════════════════════════════

def _load_user_alerts() -> list[dict]:
    """Load user alerts from disk with corruption safety.

    Returns [] on missing or corrupt file — never crashes the scheduler.
    """
    if not USER_ALERTS_FILE.exists():
        return []
    try:
        raw = USER_ALERTS_FILE.read_text().strip()
        if not raw:
            return []
        data = json.loads(raw)
        if not isinstance(data, list):
            raise ValueError("user_alerts.json root is not a list")
        return data
    except (json.JSONDecodeError, ValueError, OSError) as exc:
        logger.warning(
            "⚠️  user_alerts.json unreadable (%s), defaulting to [].", exc
        )
        return []


def _save_user_alerts_atomic(alerts: list[dict]) -> None:
    """Write user alerts atomically: temp file → os.replace().

    Safe against partial writes and concurrent reads.
    """
    USER_ALERTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=USER_ALERTS_FILE.parent, suffix=".tmp", prefix="user_alerts_"
    )
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(alerts, f, indent=2)
        os.replace(tmp_path, USER_ALERTS_FILE)
    except Exception:
        # Clean up temp file on failure
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


async def _send_custom_alert_notification(
    ticker: str, alert_type: str, price: float
) -> None:
    """Fire a native macOS notification for a custom alert."""
    title = "Market Midas Alert"
    type_label = "stop loss" if alert_type == "stop_loss" else "price target"
    body = f"{ticker} hit your {type_label} at ${price:.2f}"
    script = f'display notification "{body}" with title "{title}" sound name "Purr"'

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        lambda: subprocess.run(["osascript", "-e", script], check=False, timeout=5),
    )
    logger.info("🔔 Custom alert notification: %s — %s", ticker, body)


async def evaluate_custom_alerts(
    price_fetcher: Any = None,
) -> int:
    """Evaluate active custom user alerts against live prices.

    Args:
        price_fetcher: Callable(tickers) returning {ticker: price}.
                       Defaults to server._fetch_batch_prices at runtime.

    Returns:
        Number of alerts triggered this cycle.
    """
    if price_fetcher is None:
        from src.server import _fetch_batch_prices
        price_fetcher = _fetch_batch_prices

    user_alerts = _load_user_alerts()
    if not user_alerts:
        return 0

    # Filter to actionable alerts
    active_alerts = [
        a for a in user_alerts
        if a.get("active") is True and a.get("triggered") is not True
    ]
    if not active_alerts:
        return 0

    # Fetch live prices for unique tickers
    unique_tickers = list({a["ticker"] for a in active_alerts})
    live_prices = price_fetcher(unique_tickers)

    triggered_count = 0
    alert_log = _load_alert_log()
    dirty = False  # track if user_alerts needs saving

    for alert in active_alerts:
        try:
            current_price = live_prices.get(alert["ticker"])
            if current_price is None:
                continue

            alert_type = alert.get("type", "")
            threshold_price = alert.get("thresholdPrice")
            if threshold_price is None:
                continue

            fired = False
            if alert_type == "stop_loss" and current_price <= threshold_price:
                fired = True
            elif alert_type == "price_target" and current_price >= threshold_price:
                fired = True

            if fired:
                # Mark in the master list (by reference through active_alerts)
                alert["triggered"] = True
                alert["active"] = False
                dirty = True

                # Fire notification
                await _send_custom_alert_notification(
                    alert["ticker"], alert_type, current_price
                )

                # Log to alert_log.json with alert_id
                log_entry = {
                    "alert_id": alert["id"],
                    "trade_id": alert["id"],  # for compat with existing log structure
                    "ticker": alert["ticker"],
                    "alerted_at": datetime.now().isoformat(),
                    "pnl_pct": 0,
                    "pnl_dollars": 0,
                    "threshold_used": alert.get("threshold", 0),
                }
                alert_log.append(log_entry)
                ALERT_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
                ALERT_LOG_FILE.write_text(json.dumps(alert_log, indent=2))
                logger.info(
                    "📝 Custom alert logged for %s (alert %s).",
                    alert["ticker"], alert["id"],
                )

                triggered_count += 1

        except Exception as exc:
            logger.error(
                "Error evaluating custom alert %s: %s", alert.get("id"), exc
            )

    if dirty:
        _save_user_alerts_atomic(user_alerts)

    if triggered_count:
        logger.info("📊 Custom alerts triggered: %d", triggered_count)
    return triggered_count
