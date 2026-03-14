"""
Market-Midas FastAPI Server.

Provides:
  - POST /execute  — Trigger the full analysis pipeline
  - GET  /settings — Read user preferences from config/settings.json
  - POST /settings — Save user preferences to config/settings.json
  - GET  /prices   — Batched live-price polling via yfinance (cached 15 min)
  - GET  /alerts/status — Scheduler health + alert counts
  - POST /alerts/test  — Dev-only: manually trigger one alert cycle
"""

import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import yfinance as yf
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import the core engine
from src.main import run_daily_cycle
from src.alert_engine import (
    alert_polling_cycle,
    evaluate_custom_alerts,
    _load_alert_log,
    _load_user_alerts,
    _save_user_alerts_atomic,
)

# ── Phase 4: Background Scheduler ──
scheduler = AsyncIOScheduler()
_last_alert_run: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start/stop the alert polling scheduler with the FastAPI app."""
    scheduler.add_job(
        _run_alert_job,
        trigger="interval",
        minutes=15,
        id="stop_loss_poll",
        replace_existing=True,
        next_run_time=datetime.now(),
    )
    scheduler.start()
    logging.info("⏱  Alert scheduler started (every 15 min).")
    yield
    scheduler.shutdown(wait=False)
    logging.info("⏱  Alert scheduler stopped.")


async def _run_alert_job():
    """Wrapper to track last run timestamp."""
    global _last_alert_run
    await alert_polling_cycle()
    await evaluate_custom_alerts()
    _last_alert_run = datetime.now().isoformat()


app = FastAPI(title="Market-Midas Engine", version="2.0.0", lifespan=lifespan)

# Allow Next.js frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Paths ──
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
SETTINGS_FILE = CONFIG_DIR / "settings.json"

# ── In-Memory Price Cache ──
# { "NVDA": { "price": 192.85, "timestamp": "2026-02-27T...", "stale": false } }
_price_cache: dict[str, dict[str, Any]] = {}
PRICE_CACHE_TTL_SECONDS = 15 * 60  # 15 minutes


# ════════════════════════════════════════════════════════════════
# Models
# ════════════════════════════════════════════════════════════════

class ExecutionRequest(BaseModel):
    ticker: str
    mode: str = "PAPER"
    wallet_balance: Optional[float] = None


class UserSettings(BaseModel):
    walletBalance: float = 100_000.0
    defaultTradeSize: float = 1_000.0
    alertThreshold: float = 5.0
    maxDailyDrawdown: float = 5.0  # Percentage (e.g. 5 = 5%)
    stopLossThreshold: float = 5.0  # Phase 4: positive % (e.g. 8 = -8%)
    apiKey: str = ""
    provider: str = "openai"
    model: str = "gpt-5-mini"
    mode: str = "paper"


# ════════════════════════════════════════════════════════════════
# Settings
# ════════════════════════════════════════════════════════════════

DEFAULT_SETTINGS: dict[str, Any] = {
    "walletBalance": 100_000.0,
    "defaultTradeSize": 1_000.0,
    "alertThreshold": 5.0,
    "maxDailyDrawdown": 5.0,
    "stopLossThreshold": 5.0,
    "apiKey": "",
    "provider": "openai",
    "model": "gpt-5-mini",
}


# ── Provider / Model Reference Map ──
PROVIDER_MODEL_MAP: dict[str, Any] = {
    "openai": {
        "label": "OpenAI",
        "models": [
            {"id": "gpt-5.4", "label": "GPT-5.4", "tier": "high"},
            {"id": "gpt-5-mini", "label": "GPT-5 Mini", "tier": "mid"},
            {"id": "gpt-5-nano", "label": "GPT-5 Nano", "tier": "low"},
        ],
    },
    "anthropic": {
        "label": "Anthropic",
        "models": [
            {"id": "claude-opus-4-6", "label": "Claude Opus 4.6", "tier": "high"},
            {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6", "tier": "mid"},
            {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5", "tier": "low"},
        ],
    },
    "google": {
        "label": "Google",
        "models": [
            {"id": "gemini-2.5-pro", "label": "Gemini 2.5 Pro", "tier": "high"},
            {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash", "tier": "mid"},
            {"id": "gemini-2.5-flash-lite", "label": "Gemini 2.5 Flash Lite", "tier": "low"},
        ],
    },
    "deepseek": {
        "label": "DeepSeek",
        "models": [
            {"id": "deepseek-chat", "label": "DeepSeek V3.2", "tier": "low"},
            {"id": "deepseek-reasoner", "label": "DeepSeek V3.2 Thinking", "tier": "low"},
        ],
    },
    "xai": {
        "label": "xAI / Grok",
        "models": [
            {"id": "grok-4-0709", "label": "Grok 4", "tier": "high"},
            {"id": "grok-4-fast-reasoning", "label": "Grok 4 Fast", "tier": "low"},
            {"id": "grok-3-mini", "label": "Grok 3 Mini", "tier": "low"},
        ],
    },
}


def _read_settings() -> dict[str, Any]:
    """Read settings from disk, returning defaults if missing."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if SETTINGS_FILE.exists():
        try:
            data = json.loads(SETTINGS_FILE.read_text())
            # Merge with defaults so new keys are always present
            merged = {**DEFAULT_SETTINGS, **data}
            return merged
        except (json.JSONDecodeError, ValueError):
            pass
    return dict(DEFAULT_SETTINGS)


def _write_settings(settings: dict[str, Any]) -> None:
    """Write settings to disk."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2))


def _mask_api_key(key: str) -> str:
    """Mask an API key for display: show last 4 chars only."""
    if len(key) <= 4:
        return "••••" if key else ""
    return "••••" + key[-4:]


@app.get("/settings")
def get_settings():
    """Return user settings with the API key masked for display."""
    settings = _read_settings()
    return {
        **settings,
        "apiKey": _mask_api_key(settings.get("apiKey", "")),
        "apiKeySet": bool(settings.get("apiKey", "")),
    }


@app.post("/settings")
def save_settings(new_settings: UserSettings):
    """Save user settings to config/settings.json."""
    current = _read_settings()

    # Only update apiKey if the user actually provided a new one
    # (not the masked display value)
    update = new_settings.model_dump()
    if update["apiKey"].startswith("••••") or update["apiKey"] == "":
        update["apiKey"] = current.get("apiKey", "")

    # Validation
    if update["walletBalance"] < 0:
        raise HTTPException(status_code=400, detail="Wallet balance cannot be negative.")
    if update["defaultTradeSize"] < 0:
        raise HTTPException(status_code=400, detail="Default trade size cannot be negative.")
    if update["defaultTradeSize"] > update["walletBalance"]:
        raise HTTPException(
            status_code=400,
            detail="Default trade size cannot exceed wallet balance.",
        )

    merged = {**current, **update}
    _write_settings(merged)

    return {
        "success": True,
        "settings": {
            **merged,
            "apiKey": _mask_api_key(merged.get("apiKey", "")),
            "apiKeySet": bool(merged.get("apiKey", "")),
        },
    }


@app.get("/settings/providers")
def get_providers() -> dict[str, Any]:
    """Return the full provider/model reference map for the frontend."""
    return {"providers": PROVIDER_MODEL_MAP}


# ════════════════════════════════════════════════════════════════
# Prices (Batched yfinance with In-Memory Cache)
# ════════════════════════════════════════════════════════════════

def _is_cache_fresh(ticker: str) -> bool:
    """Check if the cached price for a ticker is still within TTL."""
    entry = _price_cache.get(ticker)
    if not entry:
        return False
    cached_time = datetime.fromisoformat(entry["timestamp"])
    age = (datetime.now(timezone.utc) - cached_time).total_seconds()
    return age < PRICE_CACHE_TTL_SECONDS


def _fetch_batch_prices(tickers: list[str]) -> dict[str, float]:
    """Fetch prices for multiple tickers in a single yfinance call."""
    results: dict[str, float] = {}
    try:
        ticker_string = " ".join(tickers)
        df = yf.download(ticker_string, period="1d", auto_adjust=True, progress=False)

        if df.empty:
            return results

        # yfinance returns MultiIndex for multiple tickers, flat for single
        if len(tickers) == 1:
            if "Close" in df.columns:
                price = float(df["Close"].iloc[-1])
                results[tickers[0]] = round(price, 2)
        else:
            if isinstance(df.columns, __import__("pandas").MultiIndex):
                for t in tickers:
                    try:
                        price = float(df["Close"][t].iloc[-1])
                        results[t] = round(price, 2)
                    except (KeyError, IndexError):
                        pass
            else:
                # Fallback: single ticker format
                if "Close" in df.columns:
                    price = float(df["Close"].iloc[-1])
                    results[tickers[0]] = round(price, 2)

    except Exception as e:
        logging.error("yfinance batch fetch failed: %s", e)

    return results


@app.get("/prices")
def get_prices(tickers: str):
    """
    Return cached prices for comma-separated tickers.

    Example: GET /prices?tickers=NVDA,AAPL

    Returns stale data with a flag if cache is expired but yfinance fails.
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="No tickers provided.")

    # Identify which tickers need a fresh fetch
    stale_tickers = [t for t in ticker_list if not _is_cache_fresh(t)]

    if stale_tickers:
        fresh_prices = _fetch_batch_prices(stale_tickers)
        now = datetime.now(timezone.utc).isoformat()
        for t, price in fresh_prices.items():
            _price_cache[t] = {
                "price": price,
                "timestamp": now,
                "stale": False,
            }

    # Build response
    response: dict[str, Any] = {}
    for t in ticker_list:
        entry = _price_cache.get(t)
        if entry:
            # Mark as stale if it was NOT refreshed in this request
            is_stale = not _is_cache_fresh(t)
            response[t] = {**entry, "stale": is_stale}
        else:
            response[t] = {"price": None, "timestamp": None, "stale": True}

    return response


# ════════════════════════════════════════════════════════════════
# Custom User Alerts CRUD
# ════════════════════════════════════════════════════════════════


@app.get("/alerts")
def get_alerts():
    """Return all custom user alerts, sorted by createdAt descending."""
    alerts = _load_user_alerts()
    alerts.sort(key=lambda a: a.get("createdAt", ""), reverse=True)
    return alerts


class CreateAlertRequest(BaseModel):
    ticker: str
    type: str  # "stop_loss" | "price_target"
    threshold: float
    thresholdPrice: float
    entryPrice: float
    active: bool = True
    triggered: bool = False


@app.post("/alerts")
def create_alert(body: CreateAlertRequest):
    """Create a new custom alert. Generates id and createdAt."""
    alerts = _load_user_alerts()
    new_alert = {
        **body.model_dump(),
        "id": str(uuid.uuid4()),
        "createdAt": datetime.now().isoformat(),
    }
    alerts.append(new_alert)
    _save_user_alerts_atomic(alerts)
    return new_alert


@app.patch("/alerts/{alert_id}")
def toggle_alert(alert_id: str):
    """Toggle the active field for a specific alert."""
    alerts = _load_user_alerts()
    target = None
    for alert in alerts:
        if alert.get("id") == alert_id:
            target = alert
            break
    if target is None:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
    target["active"] = not target.get("active", True)
    _save_user_alerts_atomic(alerts)
    return target


@app.delete("/alerts/{alert_id}")
def delete_alert(alert_id: str):
    """Remove an alert by id."""
    alerts = _load_user_alerts()
    before = len(alerts)
    alerts = [a for a in alerts if a.get("id") != alert_id]
    if len(alerts) == before:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
    _save_user_alerts_atomic(alerts)
    return {"success": True}


# ════════════════════════════════════════════════════════════════
# Pipeline Execution
# ════════════════════════════════════════════════════════════════

@app.post("/execute")
def execute_cycle(request: ExecutionRequest):
    """
    Triggers the Market-Midas pipeline for the given ticker.
    Runs Analyst -> StrategyEngine -> Debate -> RiskManager -> Trader.
    Returns the Contract-First JSON schema for the Next.js frontend.
    """
    ticker = request.ticker.upper()

    # Resolve wallet balance: request param → settings file → default
    settings = _read_settings()
    wallet_balance = request.wallet_balance
    if wallet_balance is None:
        wallet_balance = settings.get("walletBalance", 100_000.0)

    # Circuit breaker params from settings
    max_daily_drawdown_pct = settings.get("maxDailyDrawdown", 5.0) / 100.0  # Convert % → decimal
    starting_balance = settings.get("walletBalance", 100_000.0)  # Day-start reference

    try:
        logging.info(
            "FastAPI: Triggering run_daily_cycle for %s (balance=$%.2f, drawdown_limit=%.1f%%)",
            ticker, wallet_balance, max_daily_drawdown_pct * 100,
        )
        frontend_data = run_daily_cycle(
            ticker,
            wallet_balance=wallet_balance,
            max_daily_drawdown_pct=max_daily_drawdown_pct,
            starting_balance=starting_balance,
        )
        return frontend_data
    except Exception as e:
        logging.error("Execution failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════
# Phase 4: Alert Status & Debug Endpoints
# ════════════════════════════════════════════════════════════════

@app.get("/alerts/status")
def get_alert_status():
    """Return scheduler health and alert summary."""
    job = scheduler.get_job("stop_loss_poll")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else None

    alert_log = _load_alert_log()
    today = datetime.now().date()
    alerts_today = sum(
        1 for e in alert_log
        if datetime.fromisoformat(e["alerted_at"]).date() == today
    )

    return {
        "running": scheduler.running,
        "last_run": _last_alert_run,
        "next_run": next_run,
        "alerts_today": alerts_today,
    }


# Dev-only: manually trigger one alert cycle
if os.getenv("MARKET_MIDAS_ENV") == "development":
    @app.post("/alerts/test")
    async def test_alert_cycle():
        """Manually trigger one alert evaluation cycle (dev only)."""
        result = await alert_polling_cycle()
        return {"triggered_from": "manual", "result": result}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
