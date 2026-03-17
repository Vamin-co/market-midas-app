"""Portfolio ledger store for paper/live trade state.

This module is the single source of truth over the local trade ledger.
It owns trade loading, compatibility migration, atomic writes, open-position
derivation, and tracker snapshots.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypedDict

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TRADES_FILE = PROJECT_ROOT / "logs" / "paper_trades.json"
TRADES_WRITE_LOCK = threading.Lock()

TradeMode = Literal["paper", "live"]
TradeStatus = Literal["open", "closed", "closed_manual_override"]


class TradeRecord(TypedDict, total=False):
    id: str
    timestamp: str
    action: str
    ticker: str
    quantity: int
    price: float
    dollar_amount: float
    mode: str
    status: str
    pnl: float
    closedAt: str
    exitPrice: float


class PortfolioSnapshot(TypedDict):
    walletBalance: float
    startingBalance: float
    totalInvested: float
    realizedPnl: float
    openPositions: list[TradeRecord]
    closedPositions: list[TradeRecord]
    totalClosedCount: int


def _generate_id(ticker: str, timestamp: str) -> str:
    digest = hashlib.sha256(f"{ticker}-{timestamp}".encode("utf-8")).hexdigest()
    return (
        f"{digest[:8]}-{digest[8:12]}-{digest[12:16]}-"
        f"{digest[16:20]}-{digest[20:32]}"
    )


def normalize_mode(mode: str | None) -> TradeMode:
    return "live" if (mode or "").strip().lower() == "live" else "paper"


def _atomic_write(path: Path, payload: list[TradeRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    tmp_path.write_text(json.dumps(payload, indent=2))
    os.replace(tmp_path, path)


def _migrate_trade(raw_trade: dict[str, Any]) -> tuple[TradeRecord, bool]:
    trade: TradeRecord = dict(raw_trade)
    changed = False

    timestamp = str(trade.get("timestamp") or datetime.now(timezone.utc).isoformat())
    ticker = str(trade.get("ticker") or "").upper()
    action = str(trade.get("action") or "").upper()
    mode = normalize_mode(str(trade.get("mode") or "paper"))

    if trade.get("timestamp") != timestamp:
        trade["timestamp"] = timestamp
        changed = True
    if trade.get("ticker") != ticker:
        trade["ticker"] = ticker
        changed = True
    if trade.get("action") != action:
        trade["action"] = action
        changed = True
    if trade.get("mode") != mode:
        trade["mode"] = mode
        changed = True

    quantity = int(trade.get("quantity") or 0)
    price = float(trade.get("price") or 0.0)
    dollar_amount = float(trade.get("dollar_amount") or round(quantity * price, 2))
    if trade.get("quantity") != quantity:
        trade["quantity"] = quantity
        changed = True
    if trade.get("price") != price:
        trade["price"] = price
        changed = True
    if trade.get("dollar_amount") != dollar_amount:
        trade["dollar_amount"] = round(dollar_amount, 2)
        changed = True

    expected_status: TradeStatus = "open" if action == "BUY" else "closed"
    status = str(trade.get("status") or expected_status)
    if status not in {"open", "closed", "closed_manual_override"}:
        status = expected_status
    if trade.get("status") != status:
        trade["status"] = status
        changed = True

    if not trade.get("id"):
        trade["id"] = _generate_id(ticker, timestamp)
        changed = True

    return trade, changed


def load_trades(mode: str | None = None) -> list[TradeRecord]:
    if not TRADES_FILE.exists():
        return []

    try:
        payload = json.loads(TRADES_FILE.read_text())
    except (json.JSONDecodeError, OSError, ValueError) as exc:
        logger.warning("Trade ledger unreadable (%s), returning [].", exc)
        return []

    if not isinstance(payload, list):
        logger.warning("Trade ledger root is not a list, returning [].")
        return []

    migrated: list[TradeRecord] = []
    changed = False
    for item in payload:
        if not isinstance(item, dict):
            changed = True
            continue
        trade, migrated_changed = _migrate_trade(item)
        migrated.append(trade)
        changed = changed or migrated_changed

    if changed:
        _atomic_write(TRADES_FILE, migrated)

    normalized_mode = normalize_mode(mode)
    if mode is None:
        return migrated

    return [trade for trade in migrated if normalize_mode(trade.get("mode")) == normalized_mode]


def save_trades(trades: list[TradeRecord]) -> None:
    _atomic_write(TRADES_FILE, trades)


def get_open_trades(mode: str = "paper") -> list[TradeRecord]:
    normalized_mode = normalize_mode(mode)
    return [
        trade
        for trade in load_trades(normalized_mode)
        if trade.get("status") == "open" and trade.get("action") == "BUY"
    ]


def get_position(ticker: str, mode: str = "paper") -> dict[str, Any] | None:
    normalized_mode = normalize_mode(mode)
    open_trades = [
        trade
        for trade in get_open_trades(normalized_mode)
        if trade.get("ticker") == ticker.upper()
    ]
    if not open_trades:
        return None

    total_shares = sum(int(trade.get("quantity") or 0) for trade in open_trades)
    total_cost = sum(float(trade.get("dollar_amount") or 0.0) for trade in open_trades)
    avg_entry = (total_cost / total_shares) if total_shares > 0 else 0.0

    return {
        "ticker": ticker.upper(),
        "shares": total_shares,
        "entry_price": round(avg_entry, 2),
        "trade_ids": [str(trade.get("id")) for trade in open_trades],
    }


def append_trade(
    *,
    action: str,
    ticker: str,
    quantity: int,
    price: float,
    mode: str = "paper",
    status: TradeStatus | None = None,
    pnl: float | None = None,
    closed_at: str | None = None,
    exit_price: float | None = None,
    timestamp: str | None = None,
) -> TradeRecord:
    action_upper = action.upper()
    normalized_mode = normalize_mode(mode)
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    resolved_status: TradeStatus = status or ("open" if action_upper == "BUY" else "closed")

    record: TradeRecord = {
        "id": _generate_id(ticker.upper(), ts),
        "timestamp": ts,
        "action": action_upper,
        "ticker": ticker.upper(),
        "quantity": int(quantity),
        "price": round(float(price), 2),
        "dollar_amount": round(float(quantity) * float(price), 2),
        "mode": normalized_mode,
        "status": resolved_status,
    }

    if pnl is not None:
        record["pnl"] = round(float(pnl), 2)
    if closed_at is not None:
        record["closedAt"] = closed_at
    if exit_price is not None:
        record["exitPrice"] = round(float(exit_price), 2)

    with TRADES_WRITE_LOCK:
        trades = load_trades()
        trades.append(record)
        save_trades(trades)
    return record


def close_trade(
    trade_id: str,
    *,
    exit_price: float,
    manual_override: bool = False,
) -> dict[str, Any]:
    with TRADES_WRITE_LOCK:
        trades = load_trades()
        trade_index = next((idx for idx, trade in enumerate(trades) if trade.get("id") == trade_id), -1)
        if trade_index == -1:
            raise ValueError("Trade not found")

        trade = trades[trade_index]
        if trade.get("status") != "open":
            raise ValueError("Trade is already closed")

        quantity = int(trade.get("quantity") or 0)
        entry_price = float(trade.get("price") or 0.0)
        resolved_exit = round(float(exit_price), 2)
        pnl = round((resolved_exit - entry_price) * quantity, 2)
        exit_dollar_amount = round(resolved_exit * quantity, 2)
        closed_at = datetime.now(timezone.utc).isoformat()
        closed_status: TradeStatus = "closed_manual_override" if manual_override else "closed"

        trades[trade_index] = {
            **trade,
            "status": closed_status,
            "pnl": pnl,
            "closedAt": closed_at,
            "exitPrice": resolved_exit,
        }

        trades.append(
            {
                "id": f"{trade_id}-sell",
                "timestamp": closed_at,
                "action": "SELL",
                "ticker": str(trade.get("ticker") or ""),
                "quantity": quantity,
                "price": resolved_exit,
                "dollar_amount": exit_dollar_amount,
                "mode": normalize_mode(str(trade.get("mode") or "paper")),
                "status": closed_status,
                "pnl": pnl,
                "closedAt": closed_at,
                "exitPrice": resolved_exit,
            }
        )

        save_trades(trades)
        return {
            "trade": trades[trade_index],
            "pnl": pnl,
            "exitPrice": resolved_exit,
            "exitDollarAmount": exit_dollar_amount,
            "closedAt": closed_at,
        }


def close_ticker_position(
    ticker: str,
    *,
    exit_price: float,
    mode: str = "paper",
) -> dict[str, Any]:
    resolved_exit = round(float(exit_price), 2)
    if resolved_exit <= 0:
        raise ValueError("Exit price must be positive")

    normalized_mode = normalize_mode(mode)
    ticker_upper = ticker.upper()

    with TRADES_WRITE_LOCK:
        trades = load_trades()
        matching_indices = [
            idx
            for idx, trade in enumerate(trades)
            if trade.get("status") == "open"
            and trade.get("action") == "BUY"
            and str(trade.get("ticker") or "").upper() == ticker_upper
            and normalize_mode(str(trade.get("mode") or "paper")) == normalized_mode
        ]

        if not matching_indices:
            raise ValueError(f"No open position for {ticker_upper}")

        closed_at = datetime.now(timezone.utc).isoformat()
        closed_records: list[TradeRecord] = []
        total_shares = 0
        total_pnl = 0.0
        total_exit_dollars = 0.0

        for trade_index in matching_indices:
            trade = trades[trade_index]
            quantity = int(trade.get("quantity") or 0)
            entry_price = float(trade.get("price") or 0.0)
            pnl = round((resolved_exit - entry_price) * quantity, 2)
            exit_dollar_amount = round(resolved_exit * quantity, 2)
            trade_id = str(trade.get("id") or _generate_id(ticker_upper, closed_at))

            updated_trade: TradeRecord = {
                **trade,
                "status": "closed",
                "pnl": pnl,
                "closedAt": closed_at,
                "exitPrice": resolved_exit,
            }
            trades[trade_index] = updated_trade
            trades.append(
                {
                    "id": f"{trade_id}-sell",
                    "timestamp": closed_at,
                    "action": "SELL",
                    "ticker": ticker_upper,
                    "quantity": quantity,
                    "price": resolved_exit,
                    "dollar_amount": exit_dollar_amount,
                    "mode": normalized_mode,
                    "status": "closed",
                    "pnl": pnl,
                    "closedAt": closed_at,
                    "exitPrice": resolved_exit,
                }
            )

            closed_records.append(updated_trade)
            total_shares += quantity
            total_pnl += pnl
            total_exit_dollars += exit_dollar_amount

        save_trades(trades)

    return {
        "ticker": ticker_upper,
        "closedTrades": closed_records,
        "closedShares": total_shares,
        "exitPrice": resolved_exit,
        "pnl": round(total_pnl, 2),
        "exitDollarAmount": round(total_exit_dollars, 2),
    }


def get_tracker_snapshot(
    *,
    starting_balance: float,
    mode: str = "paper",
    closed_page: int = 1,
    closed_per_page: int = 10,
) -> PortfolioSnapshot:
    normalized_mode = normalize_mode(mode)
    trades = load_trades(normalized_mode)

    open_positions = sorted(
        [
            trade
            for trade in trades
            if trade.get("status") == "open" and trade.get("action") == "BUY"
        ],
        key=lambda trade: datetime.fromisoformat(str(trade.get("timestamp"))).timestamp(),
        reverse=True,
    )

    all_closed_positions = sorted(
        [
            trade
            for trade in trades
            if trade.get("action") == "BUY"
            and trade.get("status") in {"closed", "closed_manual_override"}
        ],
        key=lambda trade: datetime.fromisoformat(
            str(trade.get("closedAt") or trade.get("timestamp"))
        ).timestamp(),
        reverse=True,
    )

    total_closed_count = len(all_closed_positions)
    start_idx = max(closed_page - 1, 0) * max(closed_per_page, 1)
    end_idx = start_idx + max(closed_per_page, 1)
    closed_positions = all_closed_positions[start_idx:end_idx]

    total_invested = round(
        sum(float(trade.get("dollar_amount") or 0.0) for trade in open_positions),
        2,
    )
    realized_pnl = round(
        sum(float(trade.get("pnl") or 0.0) for trade in all_closed_positions),
        2,
    )
    wallet_balance = round(float(starting_balance) - total_invested + realized_pnl, 2)

    return {
        "walletBalance": wallet_balance,
        "startingBalance": round(float(starting_balance), 2),
        "totalInvested": total_invested,
        "realizedPnl": realized_pnl,
        "openPositions": open_positions,
        "closedPositions": closed_positions,
        "totalClosedCount": total_closed_count,
    }
