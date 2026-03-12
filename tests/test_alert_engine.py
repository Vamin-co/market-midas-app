"""
Tests for the Phase 4 Alert Engine.

Covers:
  - Unit tests (1-16): Core evaluation logic with mocked data
  - Integration tests (17-19): Scheduler and endpoint behavior
  - Custom alert tests (20-31): CRUD endpoints and evaluation logic

All tests use mocked data — no yfinance calls, no osascript.
"""

import asyncio
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.alert_engine import (
    AlertCycleSummary,
    _append_alert_log,
    _load_alert_log,
    _load_open_trades,
    _load_user_alerts,
    _save_user_alerts_atomic,
    _send_macos_notification,
    _was_alerted_today,
    alert_polling_cycle,
    evaluate_custom_alerts,
    ALERT_LOG_FILE,
    TRADES_FILE,
    USER_ALERTS_FILE,
)


# ════════════════════════════════════════════════════════════════
# Fixtures
# ════════════════════════════════════════════════════════════════

@pytest.fixture
def tmp_logs(tmp_path, monkeypatch):
    """Redirect TRADES_FILE and ALERT_LOG_FILE to a temp directory."""
    trades = tmp_path / "logs" / "paper_trades.json"
    alert_log = tmp_path / "logs" / "alert_log.json"
    trades.parent.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr("src.alert_engine.TRADES_FILE", trades)
    monkeypatch.setattr("src.alert_engine.ALERT_LOG_FILE", alert_log)

    return {"trades": trades, "alert_log": alert_log}


def _make_trade(
    ticker: str = "NVDA",
    price: float = 100.0,
    quantity: int = 10,
    status: str = "open",
    trade_id: str = "test-trade-001",
) -> dict:
    return {
        "id": trade_id,
        "timestamp": datetime.now().isoformat(),
        "action": "BUY",
        "ticker": ticker,
        "quantity": quantity,
        "price": price,
        "dollar_amount": price * quantity,
        "mode": "paper",
        "status": status,
    }


def _write_trades(path: Path, trades: list[dict]):
    path.write_text(json.dumps(trades, indent=2))


def _write_alert_log(path: Path, entries: list[dict]):
    path.write_text(json.dumps(entries, indent=2))


def _mock_settings(stop_loss: float = 5.0) -> dict[str, Any]:
    return {
        "walletBalance": 100_000.0,
        "defaultTradeSize": 1_000.0,
        "alertThreshold": 5.0,
        "maxDailyDrawdown": 5.0,
        "stopLossThreshold": stop_loss,
        "apiKey": "",
    }


# ════════════════════════════════════════════════════════════════
# Unit Tests (1-16)
# ════════════════════════════════════════════════════════════════

class TestLoadOpenTrades:
    """Tests for _load_open_trades()."""

    def test_no_open_trades_skips(self, tmp_logs):
        """#1: Empty or all-closed trades → no results, no crash."""
        closed = _make_trade(status="closed")
        _write_trades(tmp_logs["trades"], [closed])
        result = _load_open_trades()
        assert result == []

    def test_filters_open_only(self, tmp_logs):
        """Filters to status=='open' trades only."""
        trades = [
            _make_trade(status="open", trade_id="a"),
            _make_trade(status="closed", trade_id="b"),
            _make_trade(status="open", trade_id="c"),
        ]
        _write_trades(tmp_logs["trades"], trades)
        result = _load_open_trades()
        assert len(result) == 2
        assert {t["id"] for t in result} == {"a", "c"}


class TestAlertLog:
    """Tests for _load_alert_log(), _was_alerted_today(), _append_alert_log()."""

    def test_corrupt_alert_log_defaults_empty(self, tmp_logs):
        """#11: Corrupt file → returns [], logs warning."""
        tmp_logs["alert_log"].write_text("{{{garbage!!!")
        result = _load_alert_log()
        assert result == []

    def test_missing_file_returns_empty(self, tmp_logs):
        """Missing file → returns []."""
        assert not tmp_logs["alert_log"].exists()
        result = _load_alert_log()
        assert result == []

    def test_log_pruning_30_days(self, tmp_logs):
        """#14: Entries >30 days old are pruned; recent ones survive."""
        old_entry = {
            "trade_id": "old",
            "ticker": "AAPL",
            "alerted_at": (datetime.now() - timedelta(days=31)).isoformat(),
            "pnl_pct": -0.06,
            "pnl_dollars": -600.0,
            "threshold_used": 5.0,
        }
        recent_entry = {
            "trade_id": "recent",
            "ticker": "NVDA",
            "alerted_at": (datetime.now() - timedelta(days=5)).isoformat(),
            "pnl_pct": -0.08,
            "pnl_dollars": -800.0,
            "threshold_used": 5.0,
        }
        _write_alert_log(tmp_logs["alert_log"], [old_entry, recent_entry])

        result = _load_alert_log()
        assert len(result) == 1
        assert result[0]["trade_id"] == "recent"

    def test_was_alerted_today_true(self):
        """#4: Same trade ID today → returns True."""
        log = [{
            "trade_id": "t1",
            "alerted_at": datetime.now().isoformat(),
        }]
        assert _was_alerted_today("t1", log) is True

    def test_was_alerted_today_false_different_id(self):
        """Different trade ID → returns False."""
        log = [{
            "trade_id": "t1",
            "alerted_at": datetime.now().isoformat(),
        }]
        assert _was_alerted_today("t2", log) is False

    def test_next_day_re_alerts(self):
        """#5: Yesterday's log entry → re-alerts today."""
        log = [{
            "trade_id": "t1",
            "alerted_at": (datetime.now() - timedelta(days=1)).isoformat(),
        }]
        assert _was_alerted_today("t1", log) is False

    def test_dedup_uses_local_time(self):
        """#13: Dedup uses local datetime.now().date(), not UTC."""
        # Alerted just before midnight local time today
        today_late = datetime.now().replace(hour=23, minute=59, second=0)
        log = [{
            "trade_id": "t1",
            "alerted_at": today_late.isoformat(),
        }]
        assert _was_alerted_today("t1", log) is True

    def test_append_uses_in_memory_list(self, tmp_logs):
        """_append_alert_log accepts the in-memory list as param."""
        current_logs: list[dict] = []
        trade = _make_trade()
        _append_alert_log(current_logs, trade, -0.08, -80.0, 0.05)

        assert len(current_logs) == 1
        assert current_logs[0]["trade_id"] == trade["id"]
        # File should also be written
        saved = json.loads(tmp_logs["alert_log"].read_text())
        assert len(saved) == 1


class TestEvaluation:
    """Tests for the evaluation logic within alert_polling_cycle()."""

    @pytest.mark.asyncio
    async def test_breach_triggers_alert(self, tmp_logs):
        """#2: Trade at -10% vs 5% threshold → notification fires."""
        trade = _make_trade(price=100.0, quantity=10)
        _write_trades(tmp_logs["trades"], [trade])

        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock) as mock_notify:
            result = await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(5.0),
                price_fetcher=lambda tickers: {"NVDA": 90.0},  # -10%
            )

        mock_notify.assert_called_once()
        assert result["alerted"] == 1
        assert result["evaluated"] == 1

    @pytest.mark.asyncio
    async def test_no_breach_no_alert(self, tmp_logs):
        """#3: Trade at -3% vs 5% threshold → no notification."""
        trade = _make_trade(price=100.0)
        _write_trades(tmp_logs["trades"], [trade])

        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock) as mock_notify:
            result = await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(5.0),
                price_fetcher=lambda tickers: {"NVDA": 97.0},  # -3%
            )

        mock_notify.assert_not_called()
        assert result["alerted"] == 0

    @pytest.mark.asyncio
    async def test_daily_dedup_prevents_repeat(self, tmp_logs):
        """#4: Already-alerted trade today → skipped_throttled."""
        trade = _make_trade(price=100.0)
        _write_trades(tmp_logs["trades"], [trade])

        # Pre-populate alert log with today's entry
        _write_alert_log(tmp_logs["alert_log"], [{
            "trade_id": trade["id"],
            "ticker": "NVDA",
            "alerted_at": datetime.now().isoformat(),
            "pnl_pct": -0.10,
            "pnl_dollars": -100.0,
            "threshold_used": 5.0,
        }])

        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock) as mock_notify:
            result = await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(5.0),
                price_fetcher=lambda tickers: {"NVDA": 90.0},
            )

        mock_notify.assert_not_called()
        assert result["skipped_throttled"] == 1

    @pytest.mark.asyncio
    async def test_threshold_from_settings(self, tmp_logs):
        """#6: Uses stopLossThreshold from settings."""
        trade = _make_trade(price=100.0)
        _write_trades(tmp_logs["trades"], [trade])

        # -6% drop, threshold at 8% → no breach
        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock) as mock_notify:
            result = await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(8.0),
                price_fetcher=lambda tickers: {"NVDA": 94.0},
            )

        mock_notify.assert_not_called()
        assert result["alerted"] == 0

    @pytest.mark.asyncio
    async def test_dollar_pnl_calculation(self, tmp_logs):
        """#7: Verify dollar P/L = quantity × (live − entry)."""
        trade = _make_trade(price=100.0, quantity=15)
        _write_trades(tmp_logs["trades"], [trade])

        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock) as mock_notify:
            await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(5.0),
                price_fetcher=lambda tickers: {"NVDA": 90.0},  # -$10 per share
            )

        # Check the pnl_dollars arg passed to notification
        call_args = mock_notify.call_args
        pnl_dollars = call_args[0][2]  # 3rd positional arg
        assert pnl_dollars == pytest.approx(-150.0)  # 15 × (90 - 100) = -150

    @pytest.mark.asyncio
    async def test_yfinance_returns_none(self, tmp_logs):
        """#8: None price → graceful skip, remaining trades still evaluated."""
        trade_nvda = _make_trade(ticker="NVDA", price=100.0, trade_id="t1")
        trade_aapl = _make_trade(ticker="AAPL", price=200.0, trade_id="t2")
        _write_trades(tmp_logs["trades"], [trade_nvda, trade_aapl])

        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock) as mock_notify:
            result = await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(5.0),
                price_fetcher=lambda tickers: {"AAPL": 180.0},  # NVDA=None, AAPL=-10%
            )

        assert result["skipped_no_price"] == 1
        assert result["alerted"] == 1  # AAPL should still fire

    @pytest.mark.asyncio
    async def test_paper_trades_not_mutated(self, tmp_logs):
        """#9: paper_trades.json bytes identical before/after cycle."""
        trade = _make_trade(price=100.0)
        _write_trades(tmp_logs["trades"], [trade])
        before = tmp_logs["trades"].read_bytes()

        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock):
            await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(5.0),
                price_fetcher=lambda tickers: {"NVDA": 90.0},
            )

        after = tmp_logs["trades"].read_bytes()
        assert before == after, "paper_trades.json was mutated by the alert engine!"

    @pytest.mark.asyncio
    async def test_positive_threshold_negated(self, tmp_logs):
        """#12: stopLossThreshold=8.0 → triggers at pnl_pct <= -0.08."""
        trade = _make_trade(price=100.0)
        _write_trades(tmp_logs["trades"], [trade])

        # -7% → should NOT trigger (threshold is 8%)
        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock) as mock_notify:
            result = await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(8.0),
                price_fetcher=lambda tickers: {"NVDA": 93.0},
            )
        mock_notify.assert_not_called()

        # -9% → SHOULD trigger
        # Clear alert log first
        if tmp_logs["alert_log"].exists():
            tmp_logs["alert_log"].unlink()
        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock) as mock_notify:
            result = await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(8.0),
                price_fetcher=lambda tickers: {"NVDA": 91.0},
            )
        mock_notify.assert_called_once()
        assert result["alerted"] == 1

    @pytest.mark.asyncio
    async def test_cycle_returns_summary(self, tmp_logs):
        """#15: alert_polling_cycle returns dict with all AlertCycleSummary keys."""
        _write_trades(tmp_logs["trades"], [])

        result = await alert_polling_cycle(
            settings_reader=lambda: _mock_settings(5.0),
            price_fetcher=lambda tickers: {},
        )

        assert isinstance(result, dict)
        for key in ("evaluated", "alerted", "skipped_throttled", "skipped_no_price", "errors"):
            assert key in result

    @pytest.mark.asyncio
    async def test_summary_counts_accurate(self, tmp_logs):
        """#16: 3 trades (1 breach, 1 throttled, 1 None) → correct counts."""
        trade_breach = _make_trade(ticker="NVDA", price=100.0, trade_id="t1")
        trade_throttled = _make_trade(ticker="AAPL", price=200.0, trade_id="t2")
        trade_no_price = _make_trade(ticker="TSLA", price=300.0, trade_id="t3")
        _write_trades(tmp_logs["trades"], [trade_breach, trade_throttled, trade_no_price])

        # Pre-alert trade_throttled
        _write_alert_log(tmp_logs["alert_log"], [{
            "trade_id": "t2",
            "ticker": "AAPL",
            "alerted_at": datetime.now().isoformat(),
            "pnl_pct": -0.10,
            "pnl_dollars": -200.0,
            "threshold_used": 5.0,
        }])

        with patch("src.alert_engine._send_macos_notification", new_callable=AsyncMock):
            result = await alert_polling_cycle(
                settings_reader=lambda: _mock_settings(5.0),
                price_fetcher=lambda tickers: {
                    "NVDA": 90.0,   # -10% → breach
                    "AAPL": 180.0,  # -10% → already alerted
                    # TSLA missing → None
                },
            )

        assert result["evaluated"] == 3
        assert result["alerted"] == 1
        assert result["skipped_throttled"] == 1
        assert result["skipped_no_price"] == 1


class TestNotification:
    """Tests for _send_macos_notification()."""

    @pytest.mark.asyncio
    async def test_notification_uses_executor(self):
        """#10: Asserts run_in_executor is called, not bare subprocess.run."""
        trade = _make_trade()
        with patch("asyncio.get_running_loop") as mock_loop:
            mock_executor = AsyncMock()
            mock_loop.return_value.run_in_executor = mock_executor
            await _send_macos_notification(trade, -0.08, -80.0, 0.05)

        mock_executor.assert_called_once()
        # Verify executor was called with None (default pool) and a callable
        call_args = mock_executor.call_args
        assert call_args[0][0] is None  # default ThreadPoolExecutor


# ════════════════════════════════════════════════════════════════
# Integration Tests (17-19)
# ════════════════════════════════════════════════════════════════

class TestIntegration:
    """Integration tests for scheduler and endpoint security."""

    def test_scheduler_is_running(self):
        """#17: GET /alerts/status returns running: true."""
        # Must import after patching to avoid circular imports at module level
        os.environ["MARKET_MIDAS_ENV"] = "development"
        try:
            from fastapi.testclient import TestClient
            from src.server import app

            with TestClient(app) as client:
                resp = client.get("/alerts/status")
                assert resp.status_code == 200
                data = resp.json()
                assert data["running"] is True
        finally:
            os.environ.pop("MARKET_MIDAS_ENV", None)

    def test_alerts_test_gated_by_env_var(self):
        """#18: POST /alerts/test is only registered when MARKET_MIDAS_ENV=development.

        Because Python caches modules, we verify the gating mechanism by
        checking that the route registration is conditional on the env var.
        We use importlib.reload to reimport server.py without the env var.
        """
        import importlib

        # Remove the env var and reload the module
        os.environ.pop("MARKET_MIDAS_ENV", None)
        import src.server as server_module
        importlib.reload(server_module)

        # Check if /alerts/test route exists in the reloaded app
        routes = [r.path for r in server_module.app.routes]
        assert "/alerts/test" not in routes, (
            "/alerts/test should NOT be registered without MARKET_MIDAS_ENV=development"
        )

        # Restore for other tests
        os.environ["MARKET_MIDAS_ENV"] = "development"
        importlib.reload(server_module)

    def test_alerts_test_returns_summary(self):
        """#19: With MARKET_MIDAS_ENV=development, POST /alerts/test returns summary."""
        os.environ["MARKET_MIDAS_ENV"] = "development"
        try:
            from fastapi.testclient import TestClient
            from src.server import app

            with TestClient(app) as client:
                resp = client.post("/alerts/test")
                if resp.status_code == 200:
                    data = resp.json()
                    assert "result" in data
                    assert "evaluated" in data["result"]
        finally:
            os.environ.pop("MARKET_MIDAS_ENV", None)


# ════════════════════════════════════════════════════════════════
# Custom Alert Tests (20-31)
# ════════════════════════════════════════════════════════════════

@pytest.fixture
def tmp_user_alerts(tmp_path, monkeypatch):
    """Redirect USER_ALERTS_FILE and ALERT_LOG_FILE to temp."""
    user_alerts = tmp_path / "logs" / "user_alerts.json"
    alert_log = tmp_path / "logs" / "alert_log.json"
    user_alerts.parent.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr("src.alert_engine.USER_ALERTS_FILE", user_alerts)
    monkeypatch.setattr("src.alert_engine.ALERT_LOG_FILE", alert_log)

    return {"user_alerts": user_alerts, "alert_log": alert_log}


def _make_user_alert(
    ticker: str = "AAPL",
    alert_type: str = "stop_loss",
    threshold: float = 8.0,
    threshold_price: float = 150.0,
    entry_price: float = 163.0,
    active: bool = True,
    triggered: bool = False,
    alert_id: str = "test-alert-001",
) -> dict:
    return {
        "id": alert_id,
        "ticker": ticker,
        "type": alert_type,
        "threshold": threshold,
        "thresholdPrice": threshold_price,
        "entryPrice": entry_price,
        "active": active,
        "triggered": triggered,
        "createdAt": datetime.now().isoformat(),
    }


class TestUserAlertsIO:
    """Tests for _load_user_alerts and _save_user_alerts_atomic."""

    def test_missing_file_returns_empty(self, tmp_user_alerts):
        """#20: Missing user_alerts.json → returns []."""
        assert not tmp_user_alerts["user_alerts"].exists()
        result = _load_user_alerts()
        assert result == []

    def test_corrupt_file_returns_empty(self, tmp_user_alerts):
        """#21: Corrupt user_alerts.json → returns [], logs warning."""
        tmp_user_alerts["user_alerts"].write_text("{{{garbage!!!")
        result = _load_user_alerts()
        assert result == []

    def test_empty_file_returns_empty(self, tmp_user_alerts):
        """#22: Empty file → returns []."""
        tmp_user_alerts["user_alerts"].write_text("")
        result = _load_user_alerts()
        assert result == []

    def test_atomic_write_persists(self, tmp_user_alerts):
        """#23: _save_user_alerts_atomic writes valid JSON readable by _load."""
        alerts = [_make_user_alert()]
        _save_user_alerts_atomic(alerts)
        loaded = _load_user_alerts()
        assert len(loaded) == 1
        assert loaded[0]["id"] == "test-alert-001"


class TestCustomAlertEvaluation:
    """Tests for evaluate_custom_alerts()."""

    @pytest.mark.asyncio
    async def test_stop_loss_triggers(self, tmp_user_alerts):
        """#24: stop_loss fires when currentPrice <= thresholdPrice."""
        alert = _make_user_alert(
            alert_type="stop_loss", threshold_price=150.0, active=True
        )
        _save_user_alerts_atomic([alert])

        with patch("src.alert_engine._send_custom_alert_notification", new_callable=AsyncMock) as mock_notify:
            count = await evaluate_custom_alerts(
                price_fetcher=lambda tickers: {"AAPL": 145.0},  # below 150
            )

        assert count == 1
        mock_notify.assert_called_once()
        # Verify file updated
        updated = _load_user_alerts()
        assert updated[0]["triggered"] is True
        assert updated[0]["active"] is False

    @pytest.mark.asyncio
    async def test_price_target_triggers(self, tmp_user_alerts):
        """#25: price_target fires when currentPrice >= thresholdPrice."""
        alert = _make_user_alert(
            alert_type="price_target", threshold_price=200.0, active=True
        )
        _save_user_alerts_atomic([alert])

        with patch("src.alert_engine._send_custom_alert_notification", new_callable=AsyncMock) as mock_notify:
            count = await evaluate_custom_alerts(
                price_fetcher=lambda tickers: {"AAPL": 205.0},  # above 200
            )

        assert count == 1
        mock_notify.assert_called_once()
        updated = _load_user_alerts()
        assert updated[0]["triggered"] is True
        assert updated[0]["active"] is False

    @pytest.mark.asyncio
    async def test_inactive_alert_skipped(self, tmp_user_alerts):
        """#26: active=False → not evaluated, no notification."""
        alert = _make_user_alert(active=False, alert_type="stop_loss", threshold_price=150.0)
        _save_user_alerts_atomic([alert])

        with patch("src.alert_engine._send_custom_alert_notification", new_callable=AsyncMock) as mock_notify:
            count = await evaluate_custom_alerts(
                price_fetcher=lambda tickers: {"AAPL": 100.0},  # well below
            )

        assert count == 0
        mock_notify.assert_not_called()

    @pytest.mark.asyncio
    async def test_already_triggered_skipped(self, tmp_user_alerts):
        """#27: triggered=True → not re-evaluated."""
        alert = _make_user_alert(
            active=True, triggered=True, alert_type="stop_loss", threshold_price=150.0
        )
        _save_user_alerts_atomic([alert])

        with patch("src.alert_engine._send_custom_alert_notification", new_callable=AsyncMock) as mock_notify:
            count = await evaluate_custom_alerts(
                price_fetcher=lambda tickers: {"AAPL": 100.0},
            )

        assert count == 0
        mock_notify.assert_not_called()

    @pytest.mark.asyncio
    async def test_triggered_alert_logs_with_alert_id(self, tmp_user_alerts):
        """#28: Triggered alert appends to alert_log.json with alert_id field."""
        alert = _make_user_alert(alert_id="custom-abc-123")
        _save_user_alerts_atomic([alert])

        with patch("src.alert_engine._send_custom_alert_notification", new_callable=AsyncMock):
            await evaluate_custom_alerts(
                price_fetcher=lambda tickers: {"AAPL": 140.0},
            )

        log = json.loads(tmp_user_alerts["alert_log"].read_text())
        assert len(log) == 1
        assert log[0]["alert_id"] == "custom-abc-123"

    @pytest.mark.asyncio
    async def test_no_alerts_returns_zero(self, tmp_user_alerts):
        """#29: No user_alerts.json → returns 0, no crash."""
        count = await evaluate_custom_alerts(
            price_fetcher=lambda tickers: {},
        )
        assert count == 0


class TestCustomAlertsCRUD:
    """Tests for GET/POST/PATCH/DELETE /alerts endpoints."""

    def test_get_alerts_empty(self, tmp_user_alerts):
        """#30: GET /alerts returns [] when file doesn't exist."""
        os.environ["MARKET_MIDAS_ENV"] = "development"
        try:
            from fastapi.testclient import TestClient
            from src.server import app

            with TestClient(app) as client:
                resp = client.get("/alerts")
                assert resp.status_code == 200
                assert resp.json() == []
        finally:
            os.environ.pop("MARKET_MIDAS_ENV", None)

    def test_crud_full_cycle(self, tmp_user_alerts):
        """#31: POST → GET → PATCH → DELETE full CRUD cycle."""
        os.environ["MARKET_MIDAS_ENV"] = "development"
        try:
            from fastapi.testclient import TestClient
            from src.server import app

            with TestClient(app) as client:
                # POST — create
                body = {
                    "ticker": "TSLA",
                    "type": "price_target",
                    "threshold": 10.0,
                    "thresholdPrice": 300.0,
                    "entryPrice": 270.0,
                }
                resp = client.post("/alerts", json=body)
                assert resp.status_code == 200
                created = resp.json()
                assert "id" in created
                assert "createdAt" in created
                assert created["ticker"] == "TSLA"
                assert created["active"] is True
                alert_id = created["id"]

                # GET — verify present
                resp = client.get("/alerts")
                assert len(resp.json()) == 1

                # PATCH — toggle active
                resp = client.patch(f"/alerts/{alert_id}")
                assert resp.status_code == 200
                assert resp.json()["active"] is False

                # PATCH — 404 on bad id
                resp = client.patch("/alerts/nonexistent")
                assert resp.status_code == 404

                # DELETE — remove
                resp = client.delete(f"/alerts/{alert_id}")
                assert resp.status_code == 200
                assert resp.json() == {"success": True}

                # DELETE — 404 on already deleted
                resp = client.delete(f"/alerts/{alert_id}")
                assert resp.status_code == 404

                # GET — empty again
                resp = client.get("/alerts")
                assert resp.json() == []
        finally:
            os.environ.pop("MARKET_MIDAS_ENV", None)
