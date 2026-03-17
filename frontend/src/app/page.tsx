"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAnalyze } from '@/hooks/useAnalyze';
import { ConfidenceMeter } from '@/components/xai/ConfidenceMeter';

const RECENT_TICKERS = ['NVDA', 'AAPL', 'TSLA'];

export default function AnalyzePage() {
    const {
        runData,
        tickerInput,
        setTickerInput,
        suggestions,
        isDropdownOpen,
        isGenerating,
        handleSelectSuggestion,
        handleGenerate,
        openDropdownOnFocus,
        wrapperRef,
        clearRunData
    } = useAnalyze();

    const [showCachedInterstitial, setShowCachedInterstitial] = useState(true);

    useEffect(() => {
        setShowCachedInterstitial(true);
    }, [runData]);

    return (
        <div className="h-full w-full flex flex-col items-center justify-center animate-in fade-in duration-700">
            {isGenerating ? (
                <LoadingState ticker={tickerInput} />
            ) : runData?.state === "market_closed" ? (
                <MarketClosedState runData={runData} clearRunData={clearRunData} />
            ) : runData && runData.using_cached_data === true && showCachedInterstitial ? (
                <CachedDataInterstitial 
                    runData={runData} 
                    onViewAnalysis={() => setShowCachedInterstitial(false)} 
                    clearRunData={clearRunData} 
                />
            ) : runData ? (
                <ResultsState runData={runData} clearRunData={clearRunData} />
            ) : (
                <EmptyState
                    tickerInput={tickerInput}
                    setTickerInput={setTickerInput}
                    suggestions={suggestions}
                    isDropdownOpen={isDropdownOpen}
                    handleSelectSuggestion={handleSelectSuggestion}
                    handleGenerate={handleGenerate}
                    openDropdownOnFocus={openDropdownOnFocus}
                    wrapperRef={wrapperRef}
                />
            )}
        </div>
    );
}

// ── CACHED DATA INTERSTITIAL ──

function CachedDataInterstitial({ runData, onViewAnalysis, clearRunData }: { runData: any, onViewAnalysis: () => void, clearRunData: () => void }) {
    const cacheAge = runData.cache_age_days || 0;

    const handleSetAlert = () => {
        window.dispatchEvent(new CustomEvent('open-alert-modal', {
            detail: { ticker: runData.ticker }
        }));
        clearRunData();
    };

    return (
        <div className="flex flex-col items-center w-full px-6 py-12 justify-center h-full">
            <div className="bg-white rounded-2xl border border-[#1C1917]/8 shadow-sm p-8 w-full max-w-[600px] mx-auto animate-in fade-in duration-300">
                <div className="flex justify-between items-start mb-4">
                    <span className="bg-[#1C1917]/8 text-[#44403C]/60 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        ● CLOSED
                    </span>
                    <span className="font-serif text-[40px] text-[#1C1917] leading-none">
                        {runData.ticker}
                    </span>
                </div>
                
                {runData.market_status?.next_event && (
                    <div className="text-sm text-[#44403C]/60 font-sans mt-1">
                        {runData.market_status.next_event}
                    </div>
                )}

                <hr className="border-t border-[#1C1917]/8 my-6" />

                <div className="text-sm font-sans font-medium text-[#1C1917] mb-2">
                    Markets are closed.
                </div>
                
                <div className="text-sm font-sans text-[#44403C]">
                    This analysis uses data from {cacheAge} day{cacheAge !== 1 ? 's' : ''} ago.
                </div>

                <div className="text-xs text-[#44403C]/50 mt-2">
                    The indicators and price shown reflect the last available trading session.
                </div>

                <div className="flex items-center justify-between mt-6">
                    <button 
                        onClick={handleSetAlert}
                        className="text-xs font-bold uppercase tracking-widest text-[#44403C]/50 hover:text-[#CA8A04] transition-colors duration-200 cursor-default"
                    >
                        SET ALERT →
                    </button>
                    <button 
                        onClick={clearRunData}
                        className="border border-[#1C1917]/20 text-[#44403C] px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#1C1917]/5 transition-colors"
                    >
                        SEARCH ANOTHER
                    </button>
                    <button 
                        onClick={onViewAnalysis}
                        className="bg-[#CA8A04] text-[#1C1917] px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest hover:scale-[1.02] transition-transform duration-200"
                    >
                        VIEW ANALYSIS →
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── MARKET CLOSED STATE ──

function MarketClosedState({ runData, clearRunData }: { runData: any, clearRunData: () => void }) {
    const reason = runData.reason;
    const cacheAge = runData.cache_age_days;

    const handleSetAlert = () => {
        // Dispatch custom event to tell the global layout to open the alert modal
        window.dispatchEvent(new CustomEvent('open-alert-modal', {
            detail: { ticker: runData.ticker }
        }));
    };

    return (
        <div className="flex flex-col items-center w-full px-6 py-12 justify-center h-full">
            <div className="bg-white rounded-2xl border border-[#1C1917]/8 shadow-sm p-8 w-full max-w-[600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-start mb-4">
                    <span className="bg-[#1C1917]/8 text-[#44403C]/60 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        ● CLOSED
                    </span>
                    <span className="font-serif text-[40px] text-[#1C1917] leading-none">
                        {runData.ticker}
                    </span>
                </div>
                
                <div className="text-sm text-[#44403C]/60 font-sans mt-2">
                    {runData.market_status?.next_event || "Check back during market hours"}
                </div>

                <hr className="border-t border-[#1C1917]/8 my-6" />

                <div className="text-sm text-[#44403C] font-sans">
                    Markets are closed. Try again when markets open.
                </div>
                
                {reason === "cache_too_stale" && cacheAge != null ? (
                    <div className="text-xs text-[#44403C]/40 mt-2">
                        Last cached data is {cacheAge} days old — too stale for reliable analysis.
                    </div>
                ) : reason === "no_cached_data" ? (
                    <div className="text-xs text-[#44403C]/40 mt-2">
                        No previous data exists for this ticker. Analyze it first on a trading day.
                    </div>
                ) : (
                    <div className="text-xs text-[#44403C]/40 mt-2">
                        {runData.message}
                    </div>
                )}

                <div className="flex items-center justify-between mt-8 pt-2">
                    <button 
                        onClick={handleSetAlert}
                        className="text-xs text-[#44403C]/50 hover:text-[#CA8A04] transition-colors font-sans uppercase font-bold tracking-widest"
                    >
                        SET ALERT →
                    </button>
                    <button 
                        onClick={clearRunData}
                        className="border border-[#1C1917]/20 text-[#44403C] px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#1C1917]/5 transition-colors"
                    >
                        SEARCH ANOTHER
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── ANALYSIS RESULTS STATE ──

function ResultsState({ runData, clearRunData }: { runData: any, clearRunData: () => void }) {
    const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const formatNumber = (val: number) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(val);
    const formatMarketCap = (val: number) => {
        if (val >= 1_000_000_000_000) return `$${(val / 1_000_000_000_000).toFixed(1)}T`;
        if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
        if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
        return `$${val}`;
    };
    const rsiVal: number | null = runData.technicals?.rsi ?? null;
    const rsiChip = rsiVal !== null
        ? rsiVal < 30
            ? { label: 'OVERSOLD', bg: 'bg-[#27c93f]/10', text: 'text-[#27c93f]' }
            : rsiVal > 70
                ? { label: 'OVERBOUGHT', bg: 'bg-[#ff5f56]/10', text: 'text-[#ff5f56]' }
                : { label: 'NEUTRAL', bg: 'bg-[#1C1917]/8', text: 'text-[#44403C]/60' }
        : null;

    const action = runData.status?.action || 'HOLD';
    const isBuy = action === 'BUY';
    const isSell = action === 'SELL';

    // Fallback confidence if not directly available
    const confidence = runData.confidence || Math.max(runData.debate?.bull_score || 0, runData.debate?.bear_score || 0) || 50;

    // Pick rationale based on action
    const rationale = isBuy ? runData.debate?.bull_argument : (isSell ? runData.debate?.bear_argument : "Market conditions do not present a clear asymmetric opportunity. The opposing agents reached a stalemate or confidence levels were below the required threshold for capital deployment.");

    return (
        <div className="flex flex-col items-center w-full max-w-[800px] px-6 pt-8 gap-3 pb-12">

            <div className="w-full relative flex items-center justify-center mb-2 animate-in fade-in duration-500">
                <h2 className="font-sans text-[#1C1917]/50 text-[10px] font-bold uppercase tracking-widest">
                    Analysis Complete &middot; {runData.ticker}
                </h2>
                {runData.market_status && (
                    <div className="absolute right-0 group cursor-default">
                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            runData.market_status.status === 'open' ? 'bg-[#27c93f]/10 text-[#27c93f]' :
                            runData.market_status.status === 'pre_market' ? 'bg-[#CA8A04]/10 text-[#CA8A04]' :
                            runData.market_status.status === 'post_market' ? 'bg-[#CA8A04]/10 text-[#CA8A04]' :
                            'bg-[#1C1917]/8 text-[#44403C]/50'
                        }`}>
                            ● {runData.market_status.status === 'open' ? 'OPEN' : 
                               runData.market_status.status === 'pre_market' ? 'PRE-MARKET' :
                               runData.market_status.status === 'post_market' ? 'POST-MARKET' :
                               'CLOSED'}
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[#1C1917] text-[#FAFAF9] text-[10px] px-3 py-1.5 rounded-lg absolute z-10 top-full right-0 mt-2 whitespace-nowrap pointer-events-none">
                            {runData.market_status.next_event}
                        </div>
                    </div>
                )}
            </div>

            {/* Card 1 — Price & Quant Summary (Rebuilt) */}
            <div className="w-full bg-white p-5 rounded-2xl border border-[#1C1917]/8 shadow-sm">
                
                {/* SECTION 1 — HEADER ROW */}
                <div className="flex justify-between items-start">
                    <div>
                        <div className="font-sans font-medium text-[15px] text-[#1C1917] leading-snug">
                            {runData.company_name || runData.ticker}
                        </div>
                        <div className="font-sans text-[12px] text-[#44403C]/50 mt-0.5 tracking-wide">
                            {runData.ticker}
                        </div>
                    </div>
                    {runData.market_status && (
                        <div className="flex items-center gap-1.5" title={runData.market_status.next_event}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                                runData.market_status.status === 'open' ? 'bg-[#27c93f]' :
                                runData.market_status.status === 'pre_market' ? 'bg-[#CA8A04]' :
                                runData.market_status.status === 'post_market' ? 'bg-[#CA8A04]' :
                                'bg-[#44403C]/30'
                            }`} />
                            <div className={`font-sans text-[11px] ${
                                runData.market_status.status === 'open' ? 'text-[#27c93f]' :
                                runData.market_status.status === 'pre_market' ? 'text-[#CA8A04]' :
                                runData.market_status.status === 'post_market' ? 'text-[#CA8A04]' :
                                'text-[#44403C]/50'
                            }`}>
                                {runData.market_status.label}
                            </div>
                        </div>
                    )}
                </div>

                {/* ROW 1 — Price + Label */}
                <div className="flex items-baseline mt-4 mb-1.5">
                    <div className="flex-1 flex items-baseline gap-2.5">
                        <div className="font-serif text-[40px] leading-none text-[#1C1917] tabular-nums tracking-tight">
                            {formatCurrency(runData.technicals?.price || 0)}
                        </div>
                        {runData.quant?.daily_change_percent != null && runData.quant.daily_change_percent !== 0 && (
                            <div className={`font-sans text-[13px] pb-1 flex items-center gap-1 ${
                                runData.quant.daily_change_percent >= 0 ? "text-[#27c93f]" : "text-[#ff5f56]"
                            }`}>
                                {runData.quant.daily_change_percent >= 0 ? "▲" : "▼"}
                                {Math.abs(runData.quant.daily_change_percent).toFixed(2)}% today
                            </div>
                        )}
                    </div>
                    <div className="w-px mx-5" />
                    <div className="flex-1 font-sans text-[9px] uppercase tracking-widest text-[#44403C]/40 self-end pb-1">
                        TECHNICAL INDICATORS
                    </div>
                </div>

                {runData.using_cached_data === true && (
                    <div className="font-sans text-[9px] uppercase tracking-widest text-[#44403C]/40 mt-1">
                        LAST AVAILABLE DATA &middot; {runData.cache_age_days || 0}D OLD &middot; MARKET CLOSED
                    </div>
                )}

                {/* ROW 2 — Stats + Technicals with Divider */}
                <div className="flex">
                    {/* LEFT COLUMN */}
                    <div className="flex-1 pr-6">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            {runData.quant?.fifty_two_week_high != null && runData.quant.fifty_two_week_high !== 0 && (
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-[#44403C]/40 font-sans">52W HIGH</div>
                                    <div className="text-[13px] font-medium text-[#1C1917] font-sans tabular-nums mt-0.5">
                                        {formatCurrency(runData.quant.fifty_two_week_high)}
                                    </div>
                                </div>
                            )}
                            {runData.quant?.fifty_two_week_low != null && runData.quant.fifty_two_week_low !== 0 && (
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-[#44403C]/40 font-sans">52W LOW</div>
                                    <div className="text-[13px] font-medium text-[#1C1917] font-sans tabular-nums mt-0.5">
                                        {formatCurrency(runData.quant.fifty_two_week_low)}
                                    </div>
                                </div>
                            )}
                            {runData.quant?.market_cap != null && runData.quant.market_cap !== 0 && (
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-[#44403C]/40 font-sans">MARKET CAP</div>
                                    <div className="text-[13px] font-medium text-[#1C1917] font-sans tabular-nums mt-0.5">
                                        {formatMarketCap(runData.quant.market_cap)}
                                    </div>
                                </div>
                            )}
                            {runData.quant?.next_earnings_date != null && (
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-[#44403C]/40 font-sans">EARNINGS</div>
                                    <div className="text-[13px] font-medium text-[#1C1917] font-sans tabular-nums mt-0.5">
                                        {new Date(runData.quant.next_earnings_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="flex-1 pl-6">
                        {runData.technicals?.rsi != null && (
                            <div className="flex items-center py-2 border-b border-[#1C1917]/5">
                                <div className="font-sans text-[13px] text-[#44403C]/70 flex-1">RSI</div>
                                <div className="font-sans text-[13px] font-medium text-[#1C1917] tabular-nums mr-3">
                                    {runData.technicals.rsi.toFixed(1)}
                                </div>
                                <div className={`font-sans text-[11px] font-medium px-2.5 py-0.5 rounded min-w-[62px] text-center ${
                                    runData.technicals.rsi < 30 ? 'bg-[#27c93f]/10 text-[#27c93f]' :
                                    runData.technicals.rsi > 70 ? 'bg-[#ff5f56]/10 text-[#ff5f56]' :
                                    'bg-[#1C1917]/8 text-[#44403C]/60'
                                }`}>
                                    {runData.technicals.rsi < 30 ? 'Oversold' : runData.technicals.rsi > 70 ? 'Overbought' : 'Neutral'}
                                </div>
                            </div>
                        )}

                        {runData.technicals?.sma_50 != null && (
                            <div className="flex items-center py-2 border-b border-[#1C1917]/5">
                                <div className="font-sans text-[13px] text-[#44403C]/70 flex-1">SMA 50</div>
                                <div className="font-sans text-[13px] font-medium text-[#1C1917] tabular-nums mr-3">
                                    {formatCurrency(runData.technicals.sma_50)}
                                </div>
                                <div className={`font-sans text-[11px] font-medium px-2.5 py-0.5 rounded min-w-[62px] text-center ${
                                    (runData.technicals?.price || 0) > runData.technicals.sma_50 ? 'bg-[#27c93f]/10 text-[#27c93f]' : 'bg-[#ff5f56]/10 text-[#ff5f56]'
                                }`}>
                                    {(runData.technicals?.price || 0) > runData.technicals.sma_50 ? 'Above' : 'Below'}
                                </div>
                            </div>
                        )}

                        {runData.technicals?.sma_200 != null && (
                            <div className="flex items-center py-2 border-b border-[#1C1917]/5">
                                <div className="font-sans text-[13px] text-[#44403C]/70 flex-1">SMA 200</div>
                                <div className="font-sans text-[13px] font-medium text-[#1C1917] tabular-nums mr-3">
                                    {formatCurrency(runData.technicals.sma_200)}
                                </div>
                                <div className={`font-sans text-[11px] font-medium px-2.5 py-0.5 rounded min-w-[62px] text-center ${
                                    (runData.technicals?.price || 0) > runData.technicals.sma_200 ? 'bg-[#27c93f]/10 text-[#27c93f]' : 'bg-[#ff5f56]/10 text-[#ff5f56]'
                                }`}>
                                    {(runData.technicals?.price || 0) > runData.technicals.sma_200 ? 'Above' : 'Below'}
                                </div>
                            </div>
                        )}

                        {runData.quant?.volume_24h != null && runData.quant.volume_24h !== 0 && (
                            <div className="flex items-center py-2">
                                <div className="font-sans text-[13px] text-[#44403C]/70 flex-1">Volume</div>
                                <div className="font-sans text-[13px] font-medium text-[#1C1917] tabular-nums mr-3">
                                    {formatNumber(runData.quant.volume_24h)}
                                </div>
                                <div className={`font-sans text-[11px] font-medium px-2.5 py-0.5 rounded min-w-[62px] text-center ${
                                    runData.quant.avg_volume_10d && runData.quant.volume_24h > (runData.quant.avg_volume_10d * 1.5) ? 'bg-[#CA8A04]/10 text-[#CA8A04]' :
                                    runData.quant.avg_volume_10d && runData.quant.volume_24h < (runData.quant.avg_volume_10d * 0.8) ? 'bg-[#1C1917]/8 text-[#44403C]/40' :
                                    'bg-[#1C1917]/8 text-[#44403C]/60'
                                }`}>
                                    {runData.quant.avg_volume_10d && runData.quant.volume_24h > (runData.quant.avg_volume_10d * 1.5) ? 'High' :
                                     runData.quant.avg_volume_10d && runData.quant.volume_24h < (runData.quant.avg_volume_10d * 0.8) ? 'Low' :
                                     'Normal'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* SECTION 5 — CONDITIONAL SIGNAL BANNER */}
                {runData.technicals?.golden_cross === true ? (
                    <div className="mt-3.5 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#CA8A04]/10 border border-[#CA8A04]/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#CA8A04]" />
                        <div className="font-sans text-[12px] font-medium text-[#CA8A04]">
                            Golden cross active — 50-day crossed above 200-day
                        </div>
                    </div>
                ) : runData.technicals?.death_cross === true ? (
                    <div className="mt-3.5 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#ff5f56]/10 border border-[#ff5f56]/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#ff5f56]" />
                        <div className="font-sans text-[12px] font-medium text-[#ff5f56]">
                            Death cross active — 50-day crossed below 200-day
                        </div>
                    </div>
                ) : null}
                
            </div>

            {/* Card 2 — Recommendation */}
            <div className="w-full bg-[#1C1917] p-10 rounded-2xl shadow-sm border border-white/5 text-[#FAFAF9] animate-in slide-in-from-bottom-2 fade-in duration-300 delay-100 fill-mode-both">
                <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                    <div className="flex flex-col items-center md:items-start md:w-1/3 shrink-0 w-full">
                        <div className="text-[10px] font-sans font-bold uppercase tracking-widest text-white/40 mb-2">Recommendation</div>
                        <div className={`font-serif text-[48px] leading-tight mb-6 ${isBuy ? 'text-[#27c93f]' : isSell ? 'text-[#ff5f56]' : 'text-[#CA8A04]'}`}>
                            {action}
                        </div>
                        <div className="w-full">
                            <div className="flex justify-between text-[10px] font-sans font-bold uppercase tracking-widest text-white/40 mb-2">
                                <span>Conviction</span>
                                <span>{confidence.toFixed(1)}%</span>
                            </div>
                            <ConfidenceMeter score={confidence} />
                        </div>
                    </div>

                    <div className="md:w-2/3 flex flex-col justify-center h-full pt-2 md:pl-8 md:border-l border-white/10 w-full">
                        <p className="font-sans font-light text-white/80 leading-relaxed text-sm">
                            {rationale}
                        </p>
                    </div>
                </div>
            </div>

            {/* Card 3 — Actions */}
            <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-6 mt-4 animate-in slide-in-from-bottom-2 fade-in duration-300 delay-200 fill-mode-both">
                <Link
                    href="/debate"
                    className="bg-[#CA8A04] text-[#1C1917] px-8 py-3 rounded-md font-sans font-bold uppercase tracking-widest text-xs hover:bg-[#A16207] transition-colors text-center w-full sm:w-auto"
                >
                    Start Debate Session
                </Link>

                {(isBuy || isSell) && (
                    <Link
                        href={`/trade?ticker=${runData.ticker}&action=${isBuy ? 'BUY' : 'SELL'}&owned=false`}
                        className="bg-transparent text-[#1C1917] border border-[#1C1917]/20 px-8 py-3 rounded-md font-sans font-bold uppercase tracking-widest text-xs hover:border-[#1C1917] transition-colors text-center w-full sm:w-auto"
                    >
                        Proceed to Trade
                    </Link>
                )}

                <button
                    onClick={clearRunData}
                    className="text-[#1C1917]/50 hover:text-[#1C1917] px-4 py-3 font-sans font-bold uppercase tracking-widest text-[10px] hover:-translate-y-[1px] transition-all text-center"
                >
                    Search Another Ticker
                </button>
            </div>
            
            <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-alert-modal', { detail: { ticker: runData.ticker } }))}
                className="text-xs text-[#44403C]/50 uppercase tracking-widest hover:text-[#44403C] transition-colors duration-200 hover:-translate-y-[1px] transition-transform duration-300 mt-2"
            >
                Set Alert →
            </button>

        </div>
    );
}

// ── LOADING STATE ──

function LoadingState({ ticker }: { ticker: string }) {
    const [step, setStep] = useState(0);

    // Sequence the loading steps for dramatic effect (2-5 seconds total as per spec)
    useEffect(() => {
        const t1 = setTimeout(() => setStep(1), 800);
        const t2 = setTimeout(() => setStep(2), 2000);
        const t3 = setTimeout(() => setStep(3), 3500);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, []);

    const steps = [
        "Fetching market data...",
        "Running quantitative analysis...",
        "Preparing recommendation..."
    ];

    return (
        <div className="flex flex-col max-w-2xl w-full px-6 text-left animate-in slide-in-from-bottom-4 fade-in duration-700">
            <h2 className="font-serif text-[32px] md:text-[40px] leading-tight text-[#1C1917] mb-2 uppercase tracking-widest">
                {ticker} <span className="text-[#1C1917]/30 mx-2">&middot;</span> <span className="text-[#1C1917]/60 text-2xl font-sans normal-case tracking-normal">Analysis Engine</span>
            </h2>

            <div className="w-full h-px bg-[#1C1917]/10 mb-8" />

            <div className="flex flex-col gap-4 font-sans text-lg text-[#1C1917]/80">
                {steps.map((label, index) => {
                    const isComplete = step > index;
                    const isActive = step === index;
                    const isFuture = step < index;

                    if (isFuture) return null; // "Steps complete one at a time — never all at once"

                    return (
                        <div key={index} className="flex items-center gap-4 animate-in fade-in duration-200 ease-out">
                            {isComplete ? (
                                <span className="material-symbols-outlined text-[#27c93f] text-[20px]">check_circle</span>
                            ) : isActive ? (
                                <span className="material-symbols-outlined text-[#CA8A04] text-[12px] animate-pulse">circle</span>
                            ) : null}
                            <span className={isComplete ? "text-[#1C1917]" : "text-[#1C1917]/70"}>
                                {label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── EMPTY STATE ──

function EmptyState({
    tickerInput,
    setTickerInput,
    suggestions,
    isDropdownOpen,
    handleSelectSuggestion,
    handleGenerate,
    openDropdownOnFocus,
    wrapperRef
}: any) {
    return (
        <div className="flex flex-col items-center text-center max-w-2xl w-full px-6">
            <h1 className="font-serif text-[40px] leading-tight text-[#1C1917] mb-12">
                What would you like to analyze?
            </h1>

            <div className="w-full relative" ref={wrapperRef}>
                <div className="relative flex items-center w-full group">
                    <span className="absolute left-6 text-[#1C1917] font-sans text-lg">$</span>
                    <input
                        type="text"
                        value={tickerInput}
                        onChange={(e) => setTickerInput(e.target.value)}
                        onFocus={openDropdownOnFocus}
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                        placeholder="TICKER SYMBOL"
                        autoFocus
                        className="w-full bg-white border border-[#1C1917]/10 focus:border-[#CA8A04] transition duration-300 rounded-md py-4 pl-12 pr-16 font-sans text-lg uppercase tracking-widest text-[#1C1917] outline-none shadow-sm placeholder:text-[#1C1917]/30"
                        autoComplete="off"
                    />
                    <button
                        type="button"
                        onClick={handleGenerate}
                        className="absolute right-4 w-8 h-8 flex items-center justify-center text-[#1C1917]/40 hover:text-[#CA8A04] transition-colors"
                        aria-label="Analyze"
                    >
                        <span className="material-symbols-outlined text-[24px]">arrow_forward</span>
                    </button>
                </div>

                {isDropdownOpen && suggestions.length > 0 && (
                    <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white rounded-md shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#1C1917]/5 z-50 overflow-hidden text-left">
                        <ul className="m-0 p-0 list-none">
                            {suggestions.map((item: any) => (
                                <li
                                    key={item.symbol}
                                    onClick={() => handleSelectSuggestion(item.symbol)}
                                    className="px-6 py-4 cursor-pointer flex items-center justify-between group hover:bg-[#FAFAF9] transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="font-sans font-bold text-lg tracking-widest text-[#1C1917]">{item.symbol}</span>
                                        <span className="font-sans text-[#44403C] text-[10px] uppercase tracking-widest">{item.name}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="mt-8 flex items-center justify-center gap-4">
                <span className="font-sans text-[10px] tracking-widest uppercase text-[#44403C] font-bold">Recent:</span>
                <div className="flex gap-2">
                    {RECENT_TICKERS.map(ticker => (
                        <button
                            key={ticker}
                            onClick={() => { setTickerInput(ticker); openDropdownOnFocus(); }}
                            className="text-[10px] tracking-widest uppercase font-bold text-[#1C1917] border border-[#1C1917]/10 hover:border-[#1C1917]/30 bg-transparent rounded-full px-3 py-1 transition-colors"
                        >
                            {ticker}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
