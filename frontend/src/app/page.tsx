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

    return (
        <div className="h-full w-full flex flex-col items-center justify-center animate-in fade-in duration-700">
            {isGenerating ? (
                <LoadingState ticker={tickerInput} />
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
        <div className="flex flex-col items-center w-full max-w-[800px] px-6 py-12 gap-6 overflow-y-auto h-full scrollbar-none pb-32">

            <div className="w-full text-center mb-2 animate-in fade-in duration-500">
                <h2 className="font-sans text-[#1C1917]/50 text-[10px] font-bold uppercase tracking-widest">
                    Analysis Complete &middot; {runData.ticker}
                </h2>
            </div>

            {/* Card 1 — Price & Quant Summary */}
            <div className="w-full bg-white p-10 rounded-2xl border border-[#1C1917]/5 shadow-sm hover:shadow-xl transition-shadow duration-500 animate-in slide-in-from-bottom-2 fade-in duration-300 fill-mode-both">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                    <div>
                        <div className="text-[10px] font-sans font-bold uppercase tracking-widest text-[#1C1917]/50 mb-2">Current Price</div>
                        <div className="font-serif text-[40px] text-[#1C1917] leading-none mb-2">
                            {formatCurrency(runData.technicals?.price || 0)}
                        </div>
                        <div className="flex items-center gap-3 text-xs font-sans font-medium">
                            <span className={(runData.quant?.daily_change_percent || 0) >= 0 ? "text-[#27c93f]" : "text-[#ff5f56]"}>
                                {(runData.quant?.daily_change_percent || 0) >= 0 ? "+" : ""}{(runData.quant?.daily_change_percent || 0).toFixed(2)}%
                            </span>
                            <span className="text-[#1C1917]/30">|</span>
                            <span className="text-[#1C1917]/60">52W: {formatCurrency(runData.quant?.fifty_two_week_low || 0)} - {formatCurrency(runData.quant?.fifty_two_week_high || 0)}</span>
                            {runData.quant?.market_cap != null && (
                                <><span className="text-[#1C1917]/30">|</span><span className="text-[#1C1917]/60">Mkt Cap {formatMarketCap(runData.quant.market_cap)}</span></>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 w-full md:w-1/2">
                        <div>
                            <div className="flex justify-between text-[10px] font-sans font-bold uppercase tracking-widest text-[#1C1917]/50 mb-1">
                                <span>SMA 50</span>
                                <span className="flex items-center gap-0">
                                    {formatCurrency(runData.technicals?.sma_50 || 0)}
                                    {runData.technicals?.sma_50 != null && (
                                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ml-2 ${
                                            (runData.technicals?.price || 0) > runData.technicals.sma_50
                                                ? 'bg-[#27c93f]/10 text-[#27c93f]'
                                                : 'bg-[#ff5f56]/10 text-[#ff5f56]'
                                        }`}>
                                            {(runData.technicals?.price || 0) > runData.technicals.sma_50 ? '↑ ABOVE' : '↓ BELOW'}
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="w-full h-1 bg-[#1C1917]/10 rounded-full overflow-hidden relative">
                                {/* Indicator visually showing if price is above or below sma */}
                                <div className={`absolute top-0 bottom-0 ${((runData.technicals?.price || 0) > (runData.technicals?.sma_50 || 0)) ? 'bg-[#27c93f] right-1/2 left-0' : 'bg-[#ff5f56] left-1/2 right-0'}`} />
                                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-[#1C1917] -ml-[1px]" />
                            </div>
                        </div>
                        {/* RSI Row */}
                        {rsiVal !== null && rsiChip && (
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] font-sans font-bold uppercase tracking-widest text-[#44403C]/50 cursor-default" title="Relative Strength Index. Below 30 = oversold (potential buy signal). Above 70 = overbought (potential sell signal).">
                                    RSI
                                </span>
                                <span className="flex items-center">
                                    <span className="text-sm font-sans text-[#1C1917]">{rsiVal.toFixed(2)}</span>
                                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ml-2 ${rsiChip.bg} ${rsiChip.text}`}>
                                        {rsiChip.label}
                                    </span>
                                </span>
                            </div>
                        )}
                        {/* Golden / Death Cross Pill */}
                        {runData.technicals?.golden_cross === true && (
                            <div>
                                <span className="inline-block text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-[#27c93f]/10 text-[#27c93f] border border-[#27c93f]/20">
                                    ✦ GOLDEN CROSS
                                </span>
                            </div>
                        )}
                        {runData.technicals?.death_cross === true && (
                            <div>
                                <span className="inline-block text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-[#ff5f56]/10 text-[#ff5f56] border border-[#ff5f56]/20">
                                    ✦ DEATH CROSS
                                </span>
                            </div>
                        )}
                        <div>
                            <div className="flex gap-4 text-[10px] font-sans font-bold uppercase tracking-widest text-[#1C1917]/50">
                                <div>Vol 24H: <span className="text-[#1C1917]/80">{formatNumber(runData.quant?.volume_24h || 0)}</span></div>
                                <div className="ml-4">Avg 10D: <span className="text-[#1C1917]/80">{formatNumber(runData.quant?.avg_volume_10d || 0)}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
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
