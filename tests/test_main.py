from types import SimpleNamespace

from src import main as main_module


def test_run_daily_cycle_returns_circuit_breaker_payload(monkeypatch):
    payload = {
        "ticker": "NVDA",
        "confidence": 72.0,
        "zone": "STRONG_BUY",
        "technicals": {
            "price": 100.0,
        },
        "sentiment": {
            "score": 0.5,
            "sources": [
                {
                    "title": "Bullish headline",
                    "url": "https://example.com/bull",
                    "source": "Reuters",
                }
            ],
        },
        "debate": {
            "bull_argument": "",
            "bear_argument": "",
            "bull_score": 0.0,
            "bear_score": 0.0,
            "winner": "NONE",
        },
        "risk": {
            "recommended_shares": 10,
        },
        "circuit_breaker": {
            "tripped": True,
        },
        "status": {
            "action": "CIRCUIT_BREAKER_HALT",
        },
    }

    monkeypatch.setattr(
        main_module,
        "_read_settings_local",
        lambda: {"walletBalance": 1_000.0, "maxDailyDrawdown": 5.0, "mode": "paper"},
    )
    monkeypatch.setattr(
        main_module,
        "analyze_ticker",
        lambda *args, **kwargs: SimpleNamespace(
            payload=payload,
            current_position=None,
        ),
    )

    executed = {"called": False}

    def _fake_execute_trade(**kwargs):
        executed["called"] = True
        return {"status": "paper_traded"}

    monkeypatch.setattr(main_module, "execute_trade", _fake_execute_trade)

    result = main_module.run_daily_cycle(
        "NVDA",
        wallet_balance=900.0,
        starting_balance=1_000.0,
        max_daily_drawdown_pct=0.05,
    )

    assert result["status"]["action"] == "CIRCUIT_BREAKER_HALT"
    assert result["circuit_breaker"]["tripped"] is True
    assert result["sentiment"]["score"] == 0.5
    assert result["sentiment"]["sources"] == [
        {
            "title": "Bullish headline",
            "url": "https://example.com/bull",
            "source": "Reuters",
        }
    ]
    assert executed["called"] is False
