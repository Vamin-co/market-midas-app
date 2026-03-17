import json

from src.agents.trader import TraderAgent
from src.portfolio import store


def test_paper_stage_order_uses_request_scoped_mode_and_store(tmp_path, monkeypatch):
    trades_file = tmp_path / "logs" / "paper_trades.json"
    trades_file.parent.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(store, "TRADES_FILE", trades_file)

    trader = TraderAgent(mode="paper")
    result = trader.stage_order(
        action="BUY",
        ticker="NVDA",
        quantity=4,
        price=100.0,
    )

    saved = json.loads(trades_file.read_text())
    assert result["status"] == "paper_traded"
    assert saved[0]["mode"] == "paper"
    assert saved[0]["status"] == "open"
    assert saved[0]["ticker"] == "NVDA"

