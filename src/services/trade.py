"""Explicit trade execution service for Market-Midas."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from src.agents.trader import TraderAgent
from src.portfolio.store import (
    append_trade,
    close_ticker_position,
    get_position,
    get_tracker_snapshot,
    normalize_mode,
)
from src.risk.manager import RiskManager

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SETTINGS_FILE = PROJECT_ROOT / "config" / "settings.json"
DEFAULT_TRADE_SETTINGS = {
    "walletBalance": 100_000.0,
    "maxDailyDrawdown": 5.0,
}
VALID_MODES = {"paper", "live"}
TICKER_PATTERN = re.compile(r"^[A-Z][A-Z0-9.-]{0,9}$")


def _read_trade_settings() -> dict[str, Any]:
    if not SETTINGS_FILE.exists():
        return dict(DEFAULT_TRADE_SETTINGS)

    try:
        data = json.loads(SETTINGS_FILE.read_text())
        if isinstance(data, dict):
            return {**DEFAULT_TRADE_SETTINGS, **data}
    except (OSError, ValueError, json.JSONDecodeError):
        pass
    return dict(DEFAULT_TRADE_SETTINGS)


def _validate_trade_request(
    *,
    ticker: str,
    mode: str,
    price: float | None,
) -> tuple[str, str]:
    ticker_upper = ticker.strip().upper()
    mode_lower = (mode or "").strip().lower()

    if not TICKER_PATTERN.fullmatch(ticker_upper):
        raise ValueError("Invalid ticker format")
    if mode_lower not in VALID_MODES:
        raise ValueError("Unsupported mode")
    if price is None or price <= 0:
        raise ValueError("A positive price is required")

    return ticker_upper, mode_lower


def _ensure_circuit_breaker_allows_trade(*, mode: str, settings: dict[str, Any]) -> None:
    risk_mgr = RiskManager()
    starting_balance = float(settings.get("walletBalance", DEFAULT_TRADE_SETTINGS["walletBalance"]))
    snapshot = get_tracker_snapshot(starting_balance=starting_balance, mode=mode)
    circuit_breaker = risk_mgr.check_circuit_breaker(
        current_balance=float(snapshot["walletBalance"]),
        starting_balance=starting_balance,
        max_drawdown_pct=float(settings.get("maxDailyDrawdown", DEFAULT_TRADE_SETTINGS["maxDailyDrawdown"])) / 100.0,
    )
    if circuit_breaker["tripped"]:
        raise ValueError(circuit_breaker["reason"])


def execute_trade(
    *,
    ticker: str,
    action: str,
    mode: str,
    quantity: int | None = None,
    dollar_amount: float | None = None,
    price: float | None = None,
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute an explicit user-requested trade.

    Paper-mode trades mutate the local ledger. Live-mode trades stage the
    order in Robinhood and stop before submission.
    """

    resolved_settings = settings or _read_trade_settings()
    ticker_upper, mode_lower = _validate_trade_request(
        ticker=ticker,
        mode=mode,
        price=price,
    )
    action_upper = action.upper()
    normalized_mode = normalize_mode(mode_lower)

    if action_upper not in {"BUY", "SELL"}:
        raise ValueError("Unsupported action")

    _ensure_circuit_breaker_allows_trade(mode=normalized_mode, settings=resolved_settings)

    trader = TraderAgent(mode=normalized_mode)

    if normalized_mode == "paper":
        if action_upper == "BUY":
            if quantity is None or quantity <= 0:
                raise ValueError("A positive quantity is required for BUY")
            record = append_trade(
                action="BUY",
                ticker=ticker_upper,
                quantity=quantity,
                price=price,
                mode=normalized_mode,
                status="open",
            )
            return {
                "status": "paper_traded",
                "requires_approval": False,
                "order_details": record,
                "screenshot_path": None,
                "message": (
                    f"Paper trade logged: BUY {quantity} x {ticker_upper} @ ${price:.2f}"
                ),
            }

        position = get_position(ticker_upper, normalized_mode)
        if position is None:
            raise ValueError(f"No open position for {ticker_upper}")

        closed = close_ticker_position(
            ticker_upper,
            exit_price=price,
            mode=normalized_mode,
        )
        return {
            "status": "paper_traded",
            "requires_approval": False,
            "order_details": {
                "action": "SELL",
                "ticker": ticker_upper,
                "quantity": position["shares"],
                "price": round(float(price), 2),
                "dollar_amount": closed["exitDollarAmount"],
                "mode": normalized_mode,
                "pnl": closed["pnl"],
            },
            "screenshot_path": None,
            "message": (
                f"Paper trade logged: SELL {position['shares']} x "
                f"{ticker_upper} @ ${price:.2f}"
            ),
        }

    nav_result = trader.login_and_navigate(ticker_upper)
    if not nav_result.get("authenticated"):
        return {
            "status": "error",
            "requires_approval": True,
            "order_details": {"action": action_upper, "ticker": ticker_upper},
            "screenshot_path": nav_result.get("screenshot_path"),
            "message": "Authentication failed.",
        }

    return trader.stage_order(
        action=action_upper,
        ticker=ticker_upper,
        quantity=quantity,
        dollar_amount=dollar_amount,
        price=price,
    )
