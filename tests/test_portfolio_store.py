import json

from src.portfolio import store


def test_get_position_aggregates_open_buys(tmp_path, monkeypatch):
    trades_file = tmp_path / "logs" / "paper_trades.json"
    trades_file.parent.mkdir(parents=True, exist_ok=True)
    trades_file.write_text(json.dumps([
        {
            "id": "a",
            "timestamp": "2026-03-16T10:00:00+00:00",
            "action": "BUY",
            "ticker": "NVDA",
            "quantity": 2,
            "price": 100.0,
            "dollar_amount": 200.0,
            "mode": "paper",
            "status": "open",
        },
        {
            "id": "b",
            "timestamp": "2026-03-16T11:00:00+00:00",
            "action": "BUY",
            "ticker": "NVDA",
            "quantity": 3,
            "price": 110.0,
            "dollar_amount": 330.0,
            "mode": "paper",
            "status": "open",
        },
    ], indent=2))

    monkeypatch.setattr(store, "TRADES_FILE", trades_file)

    position = store.get_position("NVDA", "paper")

    assert position is not None
    assert position["shares"] == 5
    assert position["entry_price"] == 106.0
    assert position["trade_ids"] == ["a", "b"]


def test_tracker_snapshot_counts_closed_buy_records_once(tmp_path, monkeypatch):
    trades_file = tmp_path / "logs" / "paper_trades.json"
    trades_file.parent.mkdir(parents=True, exist_ok=True)
    trades_file.write_text(json.dumps([
        {
            "id": "buy-open",
            "timestamp": "2026-03-16T10:00:00+00:00",
            "action": "BUY",
            "ticker": "AAPL",
            "quantity": 1,
            "price": 100.0,
            "dollar_amount": 100.0,
            "mode": "paper",
            "status": "open",
        },
        {
            "id": "buy-closed",
            "timestamp": "2026-03-16T09:00:00+00:00",
            "action": "BUY",
            "ticker": "NVDA",
            "quantity": 2,
            "price": 100.0,
            "dollar_amount": 200.0,
            "mode": "paper",
            "status": "closed",
            "pnl": 40.0,
            "closedAt": "2026-03-16T12:00:00+00:00",
            "exitPrice": 120.0,
        },
        {
            "id": "buy-closed-sell",
            "timestamp": "2026-03-16T12:00:00+00:00",
            "action": "SELL",
            "ticker": "NVDA",
            "quantity": 2,
            "price": 120.0,
            "dollar_amount": 240.0,
            "mode": "paper",
            "status": "closed",
            "pnl": 40.0,
            "closedAt": "2026-03-16T12:00:00+00:00",
            "exitPrice": 120.0,
        },
    ], indent=2))

    monkeypatch.setattr(store, "TRADES_FILE", trades_file)

    snapshot = store.get_tracker_snapshot(starting_balance=1000.0, mode="paper")

    assert snapshot["totalClosedCount"] == 1
    assert snapshot["realizedPnl"] == 40.0
    assert snapshot["walletBalance"] == 940.0
    assert len(snapshot["closedPositions"]) == 1
    assert snapshot["closedPositions"][0]["id"] == "buy-closed"
