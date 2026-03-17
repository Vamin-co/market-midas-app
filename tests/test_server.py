from types import SimpleNamespace

from fastapi.testclient import TestClient

from src import server as server_module


def test_post_analyze_returns_pure_payload(monkeypatch):
    monkeypatch.setattr(server_module, "_read_settings", lambda: {"walletBalance": 1000.0, "maxDailyDrawdown": 5.0})
    monkeypatch.setattr(
        server_module,
        "analyze_ticker",
        lambda *args, **kwargs: SimpleNamespace(payload={"ticker": "NVDA", "status": {"action": "BUY"}}),
    )

    with TestClient(server_module.app) as client:
        invalid_response = client.post("/analyze", json={"ticker": "nvda", "mode": "PAPER"})
        response = client.post("/analyze", json={"ticker": "NVDA", "mode": "PAPER"})

    assert invalid_response.status_code == 422
    assert invalid_response.json() == {"detail": "Invalid ticker symbol"}
    assert response.status_code == 200
    assert response.json()["ticker"] == "NVDA"
    assert response.json()["status"]["action"] == "BUY"


def test_post_trade_uses_explicit_endpoint(monkeypatch):
    captured = {}

    def _fake_execute_trade(**kwargs):
        captured.update(kwargs)
        return {"status": "paper_traded"}

    monkeypatch.setattr(server_module, "execute_trade", _fake_execute_trade)

    with TestClient(server_module.app) as client:
        response = client.post(
            "/trade",
            json={"ticker": "NVDA", "action": "BUY", "mode": "PAPER", "quantity": 5, "price": 100.0},
        )

    assert response.status_code == 200
    assert captured["mode"] == "PAPER"
    assert captured["ticker"] == "NVDA"


def test_analyze_stream_emits_result_event(monkeypatch):
    def _fake_analyze_ticker(*args, **kwargs):
        event_sink = kwargs["event_sink"]
        event_sink("status", {"phase": "analysis_started", "ticker": "NVDA"})
        event_sink("result", {"ticker": "NVDA", "status": {"action": "BUY"}})
        return SimpleNamespace(payload={"ticker": "NVDA", "status": {"action": "BUY"}})

    monkeypatch.setattr(server_module, "_read_settings", lambda: {"walletBalance": 1000.0, "maxDailyDrawdown": 5.0})
    monkeypatch.setattr(server_module, "analyze_ticker", _fake_analyze_ticker)

    with TestClient(server_module.app) as client:
        with client.stream("GET", "/analyze/stream?ticker=NVDA&mode=PAPER") as response:
            body = b"".join(response.iter_bytes()).decode("utf-8")

    assert response.status_code == 200
    assert "event: status" in body
    assert "event: result" in body
    assert '"ticker": "NVDA"' in body
