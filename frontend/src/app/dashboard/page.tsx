"use client";

import React from 'react';
import Link from 'next/link';
import { useDashboard } from '@/hooks/useDashboard';
import { ConfidenceMeter } from '@/components/xai/ConfidenceMeter';
import { ExplainabilityChip } from '@/components/xai/ExplainabilityChip';
import { ExecutionInterlock } from '@/components/dashboard/ExecutionInterlock';
import TradeTracker from '@/components/dashboard/TradeTracker';

export default function Dashboard() {
    const { hasData, ticker, confidence, zone, technicals, sentiment, status, executionMode, isMarginal } = useDashboard();

    if (!hasData) {
        return (
            <main className="max-w-[1200px] mx-auto p-8 flex items-center justify-center min-h-screen bg-[#FAFAF9]">
                <div className="bg-white p-12 border border-stone-200 text-center flex flex-col items-center max-w-md shadow-sm">
                    <span className="material-symbols-outlined text-stone-300 text-5xl mb-6">search_off</span>
                    <h1 className="text-3xl font-serif font-bold text-[#1C1917] mb-3 leading-tight">No Briefing Data</h1>
                    <p className="text-stone-500 font-sans text-sm mb-8 leading-relaxed">Please return to the Workspace to specify an equity and generate a new Morning Briefing.</p>
                    <Link href="/" className="bg-[#1C1917] hover:bg-[#CA8A04] text-white px-8 py-4 font-bold font-sans text-xs uppercase tracking-widest transition-colors w-full flex items-center justify-center gap-2">
                        Return to Workspace
                        <span className="material-symbols-outlined text-sm">arrow_right_alt</span>
                    </Link>
                </div>
            </main>
        );
    }

    // All values provided by useDashboard hook above

    return (
        <main className="max-w-[1400px] mx-auto p-4 md:p-8 bg-[#FAFAF9] min-h-screen font-sans pb-40">
            {/* Header Section */}
            <header className="flex flex-col md:flex-row md:items-end justify-between border-b-2 border-[#1C1917] pb-8 mb-10 mt-6 animate-in fade-in fill-mode-both duration-1000">
                <div className="space-y-3">
                    <h1 className="text-5xl md:text-6xl font-serif font-bold tracking-tight text-[#1C1917] leading-none">Morning Briefing</h1>
                    <p className="text-stone-400 font-sans text-xs uppercase tracking-[0.2em] font-bold flex items-center gap-2">
                        <span className="w-2 h-2 bg-[#CA8A04] inline-block"></span>
                        {new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}
                    </p>
                </div>
                <div className="mt-8 md:mt-0 flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-1">Target Equity</span>
                        <span className="text-5xl font-sans font-black text-[#1C1917] tracking-tighter leading-none">{ticker}</span>
                    </div>
                    <div className="h-12 w-[1px] bg-stone-300 mx-2"></div>
                    <span className={`px-4 py-2 font-bold text-[10px] uppercase tracking-[0.2em] ${executionMode === "LIVE" ? "bg-[#B91C1C] text-white" : "bg-[#1C1917] text-white"} flex items-center gap-2`}>
                        {executionMode === "LIVE" ? <><span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> LIVE CORE</> : "PAPER ROUTER"}
                    </span>
                </div>
            </header>

            {/* Top Section: Open Editorial Layout (No Cards) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 mb-20">

                {/* Technical Confidence Column */}
                <article className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-1000 delay-75">

                    <div className="mb-10">
                        <ConfidenceMeter score={confidence || 0} />
                    </div>

                    <div className="border-t border-stone-200/50 pt-8 group">
                        <h2 className="text-stone-400 text-[9px] font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#CA8A04] text-[10px]">troubleshoot</span>
                            Technical Highlights
                        </h2>
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <span className="block text-stone-400 text-[10px] uppercase tracking-[0.2em] font-medium mb-2">RSI (14)</span>
                                <span className="block text-4xl font-serif text-[#1C1917] tracking-tight">{technicals?.rsi?.toFixed(1) || 'N/A'}</span>
                            </div>
                            <div>
                                <span className="block text-stone-400 text-[10px] uppercase tracking-[0.2em] font-medium mb-2">SMA (50)</span>
                                <span className="block text-4xl font-serif text-[#1C1917] tracking-tight">${technicals?.sma_50?.toFixed(2) || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </article>

                {/* Composite Sentiment Column */}
                <article className="lg:border-l border-stone-200/50 lg:pl-24 animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-1000 delay-100">
                    <div className="flex flex-col mb-10 pb-8 border-b border-stone-200/50">
                        <h2 className="text-stone-400 text-[9px] font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#CA8A04] text-[10px]">newspaper</span>
                            Composite Sentiment
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className={`flex items-center justify-center size-8 rounded-full ${(sentiment?.score ?? 0) >= 0 ? 'bg-[#15803D]/10 text-[#15803D]' : 'bg-[#B91C1C]/10 text-[#B91C1C]'}`}>
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                    {(sentiment?.score ?? 0) >= 0 ? 'trending_up' : 'trending_down'}
                                </span>
                            </span>
                            <span className="text-3xl font-serif text-[#1C1917] tracking-tight">
                                {(sentiment?.score ?? 0) >= 0 ? 'Bullish Bias' : 'Bearish Bias'}
                            </span>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-stone-400 text-[9px] font-bold uppercase tracking-[0.2em] mb-6">Leading Catalysts</h3>
                        <div className="space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar pr-6">
                            {sentiment?.sources?.slice(0, 3).map((src: any, i: number) => (
                                <a key={i} href={src.url} target="_blank" rel="noreferrer" className="group block">
                                    <p className="font-serif text-lg leading-snug text-[#1C1917] group-hover:text-[#CA8A04] transition-colors line-clamp-2 mb-2">{src.title}</p>
                                    <div className="flex items-center gap-2 text-[9px] text-stone-400 uppercase tracking-[0.2em] font-bold">
                                        <span className="w-4 h-[1px] bg-stone-300"></span>
                                        {src.source}
                                    </div>
                                </a>
                            ))}
                            {(!sentiment?.sources || sentiment.sources.length === 0) && (
                                <p className="text-sm text-stone-400 italic font-serif">No sovereign catalysts detected.</p>
                            )}
                        </div>
                    </div>
                </article>
            </div>

            {/* Always-on CTA for Debate */}
            <div className="mb-20 w-full border-y border-stone-200/50 py-12 group animate-in slide-in-from-bottom-8 fade-in flex flex-col md:flex-row items-center justify-between gap-12">
                <div className="flex-1 max-w-2xl">
                    <h3 className="text-[#1C1917] font-serif font-medium text-4xl flex items-center gap-4 mb-4">
                        <span className="material-symbols-outlined text-[#CA8A04] text-4xl font-light">gavel</span>
                        Adversarial Synthesis
                    </h3>
                    <p className="text-stone-500 text-sm md:text-base leading-relaxed font-light">
                        {isMarginal
                            ? `Institutional risk protocols flag conflicting indicators (Score: ${confidence}%). A multi-agent adversarial debate is highly recommended to formulate a deterministic execution path.`
                            : `Deploy Bull and Bear intelligence agents to construct robust counter-arguments and evaluate risk symmetrically before final execution authorization.`
                        }
                    </p>
                </div>
                <Link href="/debate" className="shrink-0 w-full md:w-auto text-center border border-[#1C1917] text-[#1C1917] hover:bg-[#1C1917] hover:text-white px-12 py-5 font-bold text-[10px] uppercase tracking-[0.2em] transition-all duration-500 overflow-hidden relative group/btn flex items-center justify-center gap-4">
                    <span className="relative z-10">Initiate Debate Sequence</span>
                    <span className="material-symbols-outlined text-sm relative z-10 group-hover/btn:translate-x-1 transition-transform">arrow_forward</span>
                </Link>
            </div>

            {/* Bottom Section: Execution Interlock */}
            <ExecutionInterlock ticker={ticker} action={status?.action} />

            {/* Phase 3: Active Trade Tracker */}
            <div className="mt-12">
                <TradeTracker />
            </div>

        </main>
    );
}
