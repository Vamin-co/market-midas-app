"""
Market-Midas FastAPI Server.

Provides:
  - GET  /settings — Read user preferences from config/settings.json
  - POST /settings — Save user preferences to config/settings.json
  - GET  /prices   — Batched live-price polling via yfinance (cached 15 min)
  - GET  /alerts/status — Scheduler health + alert counts
  - POST /alerts/test  — Dev-only: manually trigger one alert cycle
"""

import asyncio
import json
import logging
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from queue import Empty, Queue
from threading import Lock, Thread
from time import monotonic
from typing import Any, Optional

import yfinance as yf
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from src.portfolio.store import close_trade, get_tracker_snapshot, load_trades
from src.services.analyze import AnalysisCancelled, analyze_ticker
from src.services.trade import execute_trade
from src.utils.market import get_market_status
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
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
    ],
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
TRADE_TICKER_PATTERN = re.compile(r"^[A-Z][A-Z0-9.-]{0,9}$")
VALID_TRADE_MODES = {"paper", "live"}
SSE_STREAM_TIMEOUT_SECONDS = 120.0
SSE_MAX_CONNECTIONS_PER_IP = 3
_active_sse_connections: dict[str, int] = {}
_active_sse_connections_lock = Lock()


# ════════════════════════════════════════════════════════════════
# Models
# ════════════════════════════════════════════════════════════════

class AnalyzeRequest(BaseModel):
    ticker: str
    mode: str = "PAPER"
    wallet_balance: Optional[float] = None


class TradeRequest(BaseModel):
    ticker: str
    action: str
    mode: str = "PAPER"
    quantity: Optional[int] = None
    dollar_amount: Optional[float] = None
    price: Optional[float] = None


class CloseTradeRequest(BaseModel):
    tradeId: str
    manualPrice: Optional[float] = Field(default=None, gt=0)


class MarkSoldRequest(BaseModel):
    tradeId: str
    sellPrice: float = Field(..., gt=0)


class UserSettings(BaseModel):
    walletBalance: Optional[float] = None
    defaultTradeSize: Optional[float] = None
    maxPositionPercent: Optional[float] = None
    alertThreshold: Optional[float] = None
    maxDailyDrawdown: Optional[float] = None
    stopLossThreshold: Optional[float] = None
    apiKey: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    mode: Optional[str] = None
    timezone: str = "America/New_York"


# ════════════════════════════════════════════════════════════════
# Settings
# ════════════════════════════════════════════════════════════════

DEFAULT_SETTINGS: dict[str, Any] = {
    "walletBalance": 100_000.0,
    "defaultTradeSize": 1_000.0,
    "maxPositionPercent": 0.25,
    "alertThreshold": 5.0,
    "maxDailyDrawdown": 5.0,
    "stopLossThreshold": 5.0,
    "apiKey": "",
    "provider": "openai",
    "model": "gpt-5-mini",
    "timezone": "America/New_York",
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

    # Only include fields that were explicitly sent (not None)
    update = {k: v for k, v in new_settings.model_dump().items() if v is not None}

    # Only update apiKey if the user actually provided a new one
    # (not the masked display value)
    if "apiKey" in update:
        if update["apiKey"].startswith("••••") or update["apiKey"] == "":
            update["apiKey"] = current.get("apiKey", "")

    merged = {**current, **update}

    # Validation (use merged values so we always validate the final state)
    if merged.get("walletBalance", 0) < 0:
        raise HTTPException(status_code=400, detail="Wallet balance cannot be negative.")
    if merged.get("defaultTradeSize", 0) < 0:
        raise HTTPException(status_code=400, detail="Default trade size cannot be negative.")
    if merged.get("defaultTradeSize", 0) > merged.get("walletBalance", 0):
        raise HTTPException(
            status_code=400,
            detail="Default trade size cannot exceed wallet balance.",
        )
    if merged.get("maxPositionPercent", 0) < 0:
        raise HTTPException(status_code=400, detail="Max position percent cannot be negative.")
    if merged.get("maxPositionPercent", 0) > 1:
        raise HTTPException(
            status_code=400,
            detail="Max position percent cannot exceed 1.0.",
        )

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
# Market Status
# ════════════════════════════════════════════════════════════════


@app.get("/market-status")
def market_status_endpoint():
    """Return current NYSE market status."""
    return get_market_status()


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


def _remember_prices(prices: dict[str, float]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    for ticker, price in prices.items():
        _price_cache[ticker] = {
            "price": round(float(price), 2),
            "timestamp": now,
            "stale": False,
        }


def _resolve_exit_price(
    ticker: str,
    *,
    manual_price: float | None = None,
) -> tuple[float | None, str | None, str | None]:
    if manual_price is not None:
        return round(float(manual_price), 2), "manual", None

    fresh = _fetch_batch_prices([ticker])
    if ticker in fresh:
        _remember_prices(fresh)
        return round(float(fresh[ticker]), 2), "live", None

    cached = _price_cache.get(ticker)
    if cached and cached.get("price") is not None:
        return round(float(cached["price"]), 2), "stale", cached.get("timestamp")

    return None, None, None


def _format_sse_event(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def _reserve_sse_slot(client_ip: str) -> None:
    with _active_sse_connections_lock:
        active = _active_sse_connections.get(client_ip, 0)
        if active >= SSE_MAX_CONNECTIONS_PER_IP:
            raise HTTPException(
                status_code=429,
                detail="Too many concurrent analysis streams for this client.",
            )
        _active_sse_connections[client_ip] = active + 1


def _release_sse_slot(client_ip: str) -> None:
    with _active_sse_connections_lock:
        active = _active_sse_connections.get(client_ip, 0)
        if active <= 1:
            _active_sse_connections.pop(client_ip, None)
        else:
            _active_sse_connections[client_ip] = active - 1


def _validate_trade_request_shape(request: TradeRequest) -> None:
    ticker_upper = request.ticker.strip().upper()
    mode_lower = (request.mode or "").strip().lower()

    if not TRADE_TICKER_PATTERN.fullmatch(ticker_upper):
        raise HTTPException(status_code=400, detail="Invalid ticker format")
    if mode_lower not in VALID_TRADE_MODES:
        raise HTTPException(status_code=400, detail="Unsupported mode")
    if request.price is None or request.price <= 0:
        raise HTTPException(status_code=400, detail="A positive price is required")


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


@app.post("/analyze")
def analyze_endpoint(request: AnalyzeRequest):
    """Return a pure analysis result for the requested ticker."""
    settings = _read_settings()
    try:
        outcome = analyze_ticker(
            request.ticker,
            mode=request.mode,
            settings=settings,
            wallet_balance=request.wallet_balance,
        )
        return outcome.payload
    except Exception as exc:
        logging.error("Analyze failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/analyze/stream")
def analyze_stream_endpoint(
    request: Request,
    ticker: str = Query(..., min_length=1),
    mode: str = Query("PAPER"),
    wallet_balance: float | None = Query(None),
):
    """Stream analysis and debate events via SSE."""
    settings = _read_settings()
    client_ip = request.client.host if request.client else "unknown"
    _reserve_sse_slot(client_ip)

    cancel_event = asyncio.Event()
    queue: Queue[tuple[str, dict[str, Any]] | None] = Queue()

    def emit(event: str, payload: dict[str, Any]) -> None:
        if cancel_event.is_set():
            raise AnalysisCancelled("Analysis stream cancelled")
        queue.put((event, payload))

    def runner() -> None:
        try:
            analyze_ticker(
                ticker,
                mode=mode,
                settings=settings,
                wallet_balance=wallet_balance,
                event_sink=emit,
                cancel_check=cancel_event.is_set,
            )
        except AnalysisCancelled:
            logging.info("Analyze stream cancelled for %s.", ticker.upper())
        except Exception as exc:
            if not cancel_event.is_set():
                logging.error("Analyze stream failed: %s", exc)
                queue.put(("error", {"message": str(exc)}))
        finally:
            queue.put(None)

    try:
        Thread(target=runner, daemon=True).start()
    except Exception:
        cancel_event.set()
        _release_sse_slot(client_ip)
        raise

    def event_generator():
        started_at = monotonic()
        try:
            while True:
                remaining = SSE_STREAM_TIMEOUT_SECONDS - (monotonic() - started_at)
                if remaining <= 0:
                    cancel_event.set()
                    yield _format_sse_event(
                        "error",
                        {"type": "error", "message": "Stream timeout"},
                    )
                    break

                try:
                    item = queue.get(timeout=min(15.0, remaining))
                except Empty:
                    if cancel_event.is_set():
                        break
                    yield ": keep-alive\n\n"
                    continue

                if item is None:
                    break

                event, payload = item
                yield _format_sse_event(event, payload)
        except GeneratorExit:
            cancel_event.set()
            raise
        finally:
            cancel_event.set()
            _release_sse_slot(client_ip)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/trade")
def trade_endpoint(request: TradeRequest):
    """Execute a trade explicitly requested by the user."""
    _validate_trade_request_shape(request)
    try:
        settings = _read_settings()
        result = execute_trade(
            ticker=request.ticker,
            action=request.action,
            mode=request.mode,
            quantity=request.quantity,
            dollar_amount=request.dollar_amount,
            price=request.price,
            settings=settings,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logging.error("Trade execution failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/portfolio")
def portfolio_endpoint(
    mode: str = Query("paper"),
    closed_page: int = Query(1, ge=1),
    closed_per_page: int = Query(10, ge=1, le=100),
):
    """Return the tracker snapshot from the single backend portfolio store."""
    settings = _read_settings()
    starting_balance = float(settings.get("walletBalance", 100_000.0))
    return get_tracker_snapshot(
        starting_balance=starting_balance,
        mode=mode,
        closed_page=closed_page,
        closed_per_page=closed_per_page,
    )


@app.post("/portfolio/close")
def close_trade_endpoint(request: CloseTradeRequest):
    """Close one open trade using live, stale, or manual pricing."""
    try:
        trades = load_trades()
        trade = next((item for item in trades if item.get("id") == request.tradeId), None)
        if trade is None:
            raise HTTPException(status_code=404, detail="Trade not found")

        price, price_source, stale_timestamp = _resolve_exit_price(
            str(trade.get("ticker") or "").upper(),
            manual_price=request.manualPrice,
        )

        if price is None:
            return JSONResponse(
                {
                    "error": "PRICE_UNAVAILABLE",
                    "message": "All automated price sources unavailable. Please provide a manual price.",
                    "tradeId": request.tradeId,
                    "ticker": trade.get("ticker"),
                },
                status_code=503,
            )

        closed = close_trade(request.tradeId, exit_price=price, manual_override=False)
        return {
            "success": True,
            "pnl": closed["pnl"],
            "exitPrice": closed["exitPrice"],
            "exitDollarAmount": closed["exitDollarAmount"],
            "priceSource": price_source,
            "staleTimestamp": stale_timestamp,
            "tradeId": request.tradeId,
        }
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if detail == "Trade not found" else 409
        raise HTTPException(status_code=status_code, detail=detail)


@app.post("/portfolio/mark-sold")
def mark_sold_endpoint(request: MarkSoldRequest):
    """Close one open trade with a manual override price."""
    try:
        closed = close_trade(
            request.tradeId,
            exit_price=request.sellPrice,
            manual_override=True,
        )
        return {
            "success": True,
            "pnl": closed["pnl"],
            "exitPrice": closed["exitPrice"],
            "exitDollarAmount": closed["exitDollarAmount"],
            "priceSource": "manual",
            "tradeId": request.tradeId,
        }
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if detail == "Trade not found" else 409
        raise HTTPException(status_code=status_code, detail=detail)


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
    uvicorn.run(app, host="127.0.0.1", port=8000)
