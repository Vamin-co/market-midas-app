"""Pure analysis orchestration for Market-Midas."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable

import pandas as pd
import yfinance as yf

from src.agents.analyst import AnalystAgent
from src.agents.researcher import ResearcherAgent
from src.portfolio.store import get_position, get_tracker_snapshot, normalize_mode
from src.risk.manager import RiskManager
from src.strategy.debate import DebateResult, run_debate
from src.strategy.engine import StrategyEngine
from src.utils.market import get_market_status

logger = logging.getLogger(__name__)

EventSink = Callable[[str, dict[str, Any]], None]


@dataclass
class AnalyzeOutcome:
    """Structured output from the pure analysis pipeline."""

    payload: dict[str, Any]
    dataframe: pd.DataFrame | None = None
    latest: pd.Series | None = None
    engine_signal: dict[str, Any] | None = None
    debate_result: DebateResult | None = None
    sentiment_context: dict[str, Any] | None = None
    current_position: dict[str, Any] | None = None
    available_cash: float = 0.0
    data_meta: dict[str, Any] | None = None


class AnalysisCancelled(Exception):
    """Raised when an in-flight streamed analysis is cancelled."""


def _emit(event_sink: EventSink | None, event: str, payload: dict[str, Any]) -> None:
    if event_sink is not None:
        event_sink(event, payload)


def _raise_if_cancelled(cancel_check: Callable[[], bool] | None) -> None:
    if cancel_check is not None and cancel_check():
        raise AnalysisCancelled("Analysis stream cancelled")


def _fetch_quant_data(ticker: str, current_price: float) -> dict[str, Any]:
    quant: dict[str, Any] = {
        "daily_change_percent": None,
        "fifty_two_week_high": None,
        "fifty_two_week_low": None,
        "volume_24h": None,
        "avg_volume_10d": None,
        "market_cap": None,
        "next_earnings_date": None,
    }

    try:
        info = yf.Ticker(ticker).info
        if not info:
            return quant

        prev_close = info.get("previousClose")
        if prev_close and prev_close > 0 and current_price:
            quant["daily_change_percent"] = round(
                ((current_price - prev_close) / prev_close) * 100,
                4,
            )

        quant["fifty_two_week_high"] = info.get("fiftyTwoWeekHigh")
        quant["fifty_two_week_low"] = info.get("fiftyTwoWeekLow")
        quant["volume_24h"] = info.get("volume")
        quant["avg_volume_10d"] = info.get("averageVolume10days")
        quant["market_cap"] = info.get("marketCap")
        quant["company_name"] = info.get("longName", ticker)

        raw_earnings = info.get("earningsDate")
        if raw_earnings is not None:
            from datetime import datetime as _dt

            if isinstance(raw_earnings, list) and raw_earnings:
                raw_earnings = raw_earnings[0]
            if isinstance(raw_earnings, (int, float)):
                quant["next_earnings_date"] = _dt.fromtimestamp(raw_earnings).strftime("%Y-%m-%d")
            elif hasattr(raw_earnings, "strftime"):
                quant["next_earnings_date"] = raw_earnings.strftime("%Y-%m-%d")
            elif isinstance(raw_earnings, str):
                quant["next_earnings_date"] = raw_earnings[:10]
    except Exception as exc:
        logger.warning("yfinance quant fetch failed for %s: %s", ticker, exc)

    return quant


def _build_sentiment_context(researcher: ResearcherAgent, ticker: str) -> dict[str, Any] | None:
    try:
        sentiment_summary = researcher.summarize_sentiment(ticker)
    except Exception as exc:
        logger.warning("News fetch failed for %s (%s), proceeding without sentiment.", ticker, exc)
        return None

    return {
        "bullish_headlines": sentiment_summary.bullish_headlines,
        "bearish_headlines": sentiment_summary.bearish_headlines,
        "neutral_headlines": sentiment_summary.neutral_headlines,
        "composite_score": sentiment_summary.composite_score,
        "total_headlines": sentiment_summary.total_headlines,
    }


def _build_sentiment_sources(sentiment_context: dict[str, Any] | None) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    if not sentiment_context:
        return sources

    for headline in (
        sentiment_context.get("bullish_headlines", [])
        + sentiment_context.get("bearish_headlines", [])
    ):
        sources.append(
            {
                "title": getattr(headline, "title", str(headline)),
                "url": getattr(headline, "url", ""),
                "source": getattr(headline, "source", "News"),
            }
        )
    return sources


def _format_argument_text(argument: Any | None) -> str:
    if argument is None:
        return ""
    return f"{argument.claim} Evidence: {argument.evidence}"


def _resolve_cash_and_starting_balance(
    *,
    mode: str,
    settings: dict[str, Any],
    wallet_balance: float | None,
) -> tuple[float, float]:
    normalized_mode = normalize_mode(mode)
    starting_balance = float(settings.get("walletBalance", 100_000.0))

    if normalized_mode == "paper":
        snapshot = get_tracker_snapshot(starting_balance=starting_balance, mode=normalized_mode)
        return float(snapshot["walletBalance"]), starting_balance

    resolved_cash = float(wallet_balance) if wallet_balance is not None else starting_balance
    return resolved_cash, starting_balance


def analyze_ticker(
    ticker: str,
    *,
    mode: str,
    settings: dict[str, Any],
    wallet_balance: float | None = None,
    event_sink: EventSink | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> AnalyzeOutcome:
    """Run the analysis pipeline without any execution side effects."""

    normalized_mode = normalize_mode(mode)
    ticker_upper = ticker.upper()

    analyst = AnalystAgent()
    engine = StrategyEngine()
    researcher = ResearcherAgent()
    risk_mgr = RiskManager()

    _emit(
        event_sink,
        "status",
        {
            "phase": "analysis_started",
            "ticker": ticker_upper,
            "mode": normalized_mode.upper(),
        },
    )

    _raise_if_cancelled(cancel_check)
    analysis = analyst.analyze(ticker_upper)
    if "error" in analysis:
        payload = {
            "ticker": ticker_upper,
            "signal": "ERROR",
            "action": "none",
            "result": None,
        }
        return AnalyzeOutcome(payload=payload, data_meta=analysis.get("data_meta", {}))

    df = analysis["dataframe"]
    data_meta = analysis.get("data_meta", {})

    if df.empty:
        reason = "no_cached_data"
        cache_age = None
        if data_meta.get("cache_too_stale"):
            reason = "cache_too_stale"
            cache_age = data_meta.get("cache_age_days")
        elif data_meta.get("no_cached_data"):
            reason = "no_cached_data"

        payload = {
            "state": "market_closed",
            "ticker": ticker_upper,
            "market_status": get_market_status(),
            "reason": reason,
            "cache_age_days": cache_age,
            "message": f"Markets are closed and no recent data is available for {ticker_upper}.",
        }
        _emit(event_sink, "result", payload)
        return AnalyzeOutcome(payload=payload, dataframe=df, data_meta=data_meta)

    latest = df.iloc[-1]
    current_price = float(latest["Close"])
    rsi = latest.get("RSI_14", float("nan"))
    sma_50 = latest.get("SMA_50", float("nan"))
    sma_200 = latest.get("SMA_200", float("nan"))

    engine_signal = engine.generate_signal(ticker_upper, df)
    signal = engine_signal["action"]
    confidence = engine_signal["confidence_pct"]
    zone = engine_signal["zone"]

    _emit(
        event_sink,
        "technicals",
        {
            "ticker": ticker_upper,
            "price": current_price,
            "rsi": rsi if pd.notna(rsi) else None,
            "sma_50": sma_50 if pd.notna(sma_50) else None,
            "sma_200": sma_200 if pd.notna(sma_200) else None,
            "confidence": confidence,
            "zone": zone,
            "signal": signal,
        },
    )

    _raise_if_cancelled(cancel_check)
    sentiment_context = _build_sentiment_context(researcher, ticker_upper)
    if sentiment_context is not None:
        _emit(
            event_sink,
            "sentiment",
            {
                "score": sentiment_context.get("composite_score", 0.0),
                "total_headlines": sentiment_context.get("total_headlines", 0),
                "bullish_count": len(sentiment_context.get("bullish_headlines", [])),
                "bearish_count": len(sentiment_context.get("bearish_headlines", [])),
            },
        )

    _raise_if_cancelled(cancel_check)
    debate_result: DebateResult | None = None
    if zone == "MARGINAL":
        debate_result = run_debate(
            ticker_upper,
            df,
            engine_signal,
            sentiment_context,
            event_sink=event_sink,
        )
    else:
        logger.info("Debate skipped — zone is %s, not MARGINAL", zone)

    _raise_if_cancelled(cancel_check)
    current_position = get_position(ticker_upper, normalized_mode)
    available_cash, starting_balance = _resolve_cash_and_starting_balance(
        mode=normalized_mode,
        settings=settings,
        wallet_balance=wallet_balance,
    )

    max_daily_drawdown_pct = float(settings.get("maxDailyDrawdown", 5.0)) / 100.0
    circuit_breaker = risk_mgr.check_circuit_breaker(
        current_balance=available_cash,
        starting_balance=starting_balance,
        max_drawdown_pct=max_daily_drawdown_pct,
    )

    if zone == "MARGINAL" and debate_result is not None:
        if debate_result.recommendation == "SKIP":
            signal = "HOLD"
        elif debate_result.recommendation == "REDUCE_SIZE":
            signal = signal

    recommended_action = "HOLD"
    if circuit_breaker["tripped"]:
        recommended_action = "CIRCUIT_BREAKER_HALT"
    elif signal == "BUY" and current_position is None:
        recommended_action = "BUY"
    elif signal == "SELL" and current_position is not None:
        recommended_action = "SELL"

    risk_position = risk_mgr.calculate_position_size(available_cash, current_price)
    risk_stop_loss = risk_mgr.calculate_stop_loss(current_price)
    quant_data = _fetch_quant_data(ticker_upper, current_price)
    company_name = quant_data.pop("company_name", ticker_upper)

    sentiment_sources = _build_sentiment_sources(sentiment_context)
    debate_payload = {
        "bull_argument": _format_argument_text(
            debate_result.bull_best_arg if debate_result is not None else None
        ),
        "bear_argument": _format_argument_text(
            debate_result.bear_best_arg if debate_result is not None else None
        ),
        "bull_score": debate_result.bull_score if debate_result is not None else 0.0,
        "bear_score": debate_result.bear_score if debate_result is not None else 0.0,
        "winner": debate_result.winner if debate_result is not None else "NONE",
    }
    payload: dict[str, Any] = {
        "ticker": ticker_upper,
        "company_name": company_name,
        "confidence": confidence,
        "zone": zone,
        "technicals": {
            "rsi": rsi if pd.notna(rsi) else None,
            "sma_50": sma_50 if pd.notna(sma_50) else None,
            "sma_200": sma_200 if pd.notna(sma_200) else None,
            "price": current_price,
            "golden_cross": bool(latest.get("golden_cross", False)),
            "death_cross": bool(latest.get("death_cross", False)),
            "sentiment_score": sentiment_context.get("composite_score", 0.0) if sentiment_context else 0.0,
        },
        "quant": quant_data,
        "sentiment": {
            "score": sentiment_context.get("composite_score", 0.0) if sentiment_context else 0.0,
            "sources": sentiment_sources,
        },
        "debate": debate_payload,
        "risk": {
            "recommended_dollars": risk_position["max_dollars"],
            "recommended_shares": risk_position["max_shares"],
            "position_pct": risk_position["position_pct"],
            "max_position_pct": risk_mgr.MAX_POSITION_PCT,
            "wallet_balance": available_cash,
            "stop_loss": risk_stop_loss,
        },
        "status": {
            "awaiting_human_approval": True if zone == "MARGINAL" else False,
            "action": recommended_action,
        },
        "market_status": get_market_status(),
    }

    if data_meta.get("using_cached_data"):
        payload["using_cached_data"] = True
        payload["cache_age_days"] = data_meta.get("cache_age_days", 0)

    if circuit_breaker["tripped"]:
        payload["circuit_breaker"] = {
            "tripped": True,
            "drawdown_pct": circuit_breaker["drawdown_pct"],
            "drawdown_dollars": circuit_breaker["drawdown_dollars"],
            "max_drawdown_pct": circuit_breaker["max_drawdown_pct"],
            "reason": circuit_breaker["reason"],
        }

    _raise_if_cancelled(cancel_check)
    _emit(event_sink, "result", payload)
    return AnalyzeOutcome(
        payload=payload,
        dataframe=df,
        latest=latest,
        engine_signal=engine_signal,
        debate_result=debate_result,
        sentiment_context=sentiment_context,
        current_position=current_position,
        available_cash=available_cash,
        data_meta=data_meta,
    )
