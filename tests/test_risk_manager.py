import json

from src.risk import manager as manager_module


def test_risk_manager_reads_max_position_percent_and_stop_loss_from_settings(tmp_path, monkeypatch):
    settings_path = tmp_path / "settings.json"
    settings_path.write_text(json.dumps({
        "walletBalance": 50_000.0,
        "defaultTradeSize": 2_500.0,
        "maxPositionPercent": 0.10,
        "stopLossThreshold": 8.0,
    }))
    monkeypatch.setattr(manager_module, "SETTINGS_FILE", settings_path)

    risk_manager = manager_module.RiskManager()

    position = risk_manager.calculate_position_size(account_value=50_000.0, entry_price=50.0)

    assert position["max_dollars"] == 5_000.0
    assert position["max_shares"] == 100
    assert position["position_pct"] == 0.10
    assert risk_manager.calculate_stop_loss(100.0) == 92.0
