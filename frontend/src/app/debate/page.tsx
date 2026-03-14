"use client";

import React from 'react';
import Link from 'next/link';
import { useDebate } from '@/hooks/useDebate';
import { ConfidenceMeter } from '@/components/xai/ConfidenceMeter';

export default function DebatePage() {
    const {
        isGenerating,
        ticker,
        debate,
        sources,
        isBullStreaming,
        bullStreamedText,
        isBearStreaming,
        bearStreamedText,
        debateComplete,
        handleAbort,
        handleConfirm,
    } = useDebate();

    const bullScore = debate?.bull_score || 0;
    const bearScore = debate?.bear_score || 0;
    const diff = bullScore - bearScore;

    let bullColor = 'bg-[#CA8A04]';
    let bearColor = 'bg-[#CA8A04]';
    if (diff >= 10) {
        bullColor = 'bg-[#27c93f]';
        bearColor = 'bg-[#ff5f56]';
    } else if (diff <= -10) {
        bullColor = 'bg-[#ff5f56]';
        bearColor = 'bg-[#27c93f]';
    }

    return (
        <div className="bg-[#FAFAF9] h-full flex flex-col overflow-hidden animate-in fade-in fill-mode-both duration-1000">
            {/* Header bar */}
            <header className="h-12 px-8 flex items-center justify-between border-b border-[#1C1917]/8 shrink-0">
                <div className="font-serif text-xl text-[#1C1917]">
                    {ticker} &middot; Debate Session
                </div>
            </header>

            {/* Agent panels */}
            <div className="flex flex-row flex-1 gap-0 overflow-hidden">
                {/* Bull panel */}
                <div className="flex-1 p-8 overflow-auto bg-[#FAFAF9]">
                    <div className="mb-6 shrink-0">
                        <div className="flex justify-between items-end mb-3">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#44403C]">🐂 Bull</span>
                            {(!isGenerating && !isBullStreaming && bullStreamedText.length > 0) && (
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] uppercase tracking-widest text-[#44403C]/60 mb-0.5">Conviction</span>
                                    <span className="text-xs font-bold uppercase tracking-widest text-[#44403C] leading-none">
                                        {bullScore}%
                                    </span>
                                </div>
                            )}
                        </div>
                        <ConfidenceMeter score={(!isBullStreaming && bullStreamedText.length > 0) ? bullScore : 0} color={bullColor} />
                    </div>

                    <div className="font-sans font-light text-sm text-[#1C1917] leading-relaxed whitespace-pre-wrap">
                        {bullStreamedText}
                        {isBullStreaming && <span className="inline-block w-2 h-2 rounded-full bg-[#1C1917]/20 animate-pulse ml-1 align-middle"></span>}
                    </div>

                    {(!isGenerating && !isBullStreaming && bullStreamedText.length > 0) && (
                        <div className="flex flex-wrap gap-2 mt-6 animate-in fade-in duration-500">
                            {sources.map((src: any, idx: number) => {
                                const pillClass = "text-[10px] bg-[#1C1917]/5 border border-[#1C1917]/10 rounded-full px-3 py-1 text-[#44403C] uppercase tracking-widest";
                                return src.url ? (
                                    <a key={`bull-src-${idx}`} href={src.url} target="_blank" rel="noopener noreferrer" className={`${pillClass} cursor-pointer hover:underline`}>
                                        {src.source}
                                    </a>
                                ) : (
                                    <span key={`bull-src-${idx}`} className={pillClass}>
                                        {src.source}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div className="w-px bg-[#1C1917]/8 shrink-0"></div>

                {/* Bear panel */}
                <div className="flex-1 p-8 overflow-auto bg-[#FAFAF9]">
                    <div className="mb-6 shrink-0">
                        <div className="flex justify-between items-end mb-3">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#44403C]">🐻 Bear</span>
                            {(!isGenerating && !isBullStreaming && !isBearStreaming && bearStreamedText.length > 0) && (
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] uppercase tracking-widest text-[#44403C]/60 mb-0.5">Conviction</span>
                                    <span className="text-xs font-bold uppercase tracking-widest text-[#44403C] leading-none">
                                        {bearScore}%
                                    </span>
                                </div>
                            )}
                        </div>
                        <ConfidenceMeter score={(!isGenerating && !isBullStreaming && !isBearStreaming && bearStreamedText.length > 0) ? bearScore : 0} color={bearColor} />
                    </div>

                    {(isGenerating || isBullStreaming) && !bearStreamedText ? (
                        <div className="w-2 h-2 rounded-full bg-[#1C1917]/20 animate-pulse mt-2"></div>
                    ) : (
                        <div className="font-sans font-light text-sm text-[#1C1917] leading-relaxed whitespace-pre-wrap">
                            {bearStreamedText}
                            {isBearStreaming && <span className="inline-block w-2 h-2 rounded-full bg-[#1C1917]/20 animate-pulse ml-1 align-middle"></span>}
                        </div>
                    )}

                    {(!isGenerating && !isBullStreaming && !isBearStreaming && bearStreamedText.length > 0) && (
                        <div className="flex flex-wrap gap-2 mt-6 animate-in fade-in duration-500">
                            {sources.map((src: any, idx: number) => {
                                const pillClass = "text-[10px] bg-[#1C1917]/5 border border-[#1C1917]/10 rounded-full px-3 py-1 text-[#44403C] uppercase tracking-widest";
                                return src.url ? (
                                    <a key={`bear-src-${idx}`} href={src.url} target="_blank" rel="noopener noreferrer" className={`${pillClass} cursor-pointer hover:underline`}>
                                        {src.source}
                                    </a>
                                ) : (
                                    <span key={`bear-src-${idx}`} className={pillClass}>
                                        {src.source}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Final Verdict card */}
            {debateComplete && (
                <div className="mx-8 mb-4 shrink-0 bg-[#1C1917] p-8 rounded-2xl border border-white/5 animate-in slide-in-from-bottom-2 fade-in duration-400 ease-out fill-mode-both">
                    <div className="flex items-start gap-8">
                        <div className="flex flex-col">
                            <span className="text-xs text-[#FAFAF9]/40 uppercase tracking-widest mb-2">Final Verdict</span>
                            <span className={`font-serif text-3xl ${debate.winner === 'BULL' ? 'text-[#27c93f]' : debate.winner === 'BEAR' ? 'text-[#ff5f56]' : 'text-[#CA8A04]'}`}>
                                {debate.winner === 'BULL' ? 'BUY' : debate.winner === 'BEAR' ? 'SELL' : 'HOLD'}
                            </span>
                        </div>
                        <div className="flex-1 border-l border-white/10 pl-8">
                            <p className="font-sans font-light text-sm text-[#FAFAF9]/70 leading-relaxed">
                                {debate.winner === 'BULL' ? debate?.bull_argument : debate.winner === 'BEAR' ? debate?.bear_argument : "Neither side provided overwhelming conviction. The recommendation remains neutral to avoid unnecessary capital exposure."}
                            </p>
                            <details className="mt-4 group cursor-pointer outline-none marker:content-['']">
                                <summary className="flex items-center gap-2 text-xs text-[#FAFAF9]/40 uppercase tracking-widest hover:text-[#FAFAF9]/70 transition-colors duration-200 outline-none list-none">
                                    Why did it change?
                                    <span className="material-symbols-outlined text-[14px] group-open:rotate-180 transition-transform">expand_more</span>
                                </summary>
                                <div className="mt-3 pt-3 border-t border-white/10 text-xs font-sans font-light text-[#FAFAF9]/50">
                                    The adversarial debate stress-tested the initial quantitative assumptions, introducing qualitative variables that shifted the final weighting. This ensures a non-brittle synthesis of market geometry vs catalyst sentiment.
                                </div>
                            </details>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom action bar */}
            <footer className="h-20 px-8 flex items-center justify-between border-t border-[#1C1917]/8 bg-[#FAFAF9] shrink-0">
                <button
                    onClick={handleAbort}
                    className="text-[#ff5f56] border border-[#ff5f56]/30 px-6 py-2 rounded-md text-xs font-sans uppercase tracking-widest hover:bg-[#ff5f56]/10 transition-colors"
                >
                    ABORT
                </button>
                {(debateComplete && (debate.winner === 'BULL' || debate.winner === 'BEAR')) ? (
                    <Link
                        href={`/trade?ticker=${ticker}&action=${debate.winner === 'BULL' ? 'BUY' : 'SELL'}&owned=false`}
                        className="bg-[#CA8A04] text-[#1C1917] px-8 py-3 rounded-md font-bold uppercase tracking-widest text-xs hover:scale-[1.03] active:scale-[0.98] transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] inline-block text-center"
                    >
                        PROCEED TO TRADE
                    </Link>
                ) : (
                    <div></div>
                )}
            </footer>
        </div>
    );
}
