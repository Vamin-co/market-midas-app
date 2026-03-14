"use client";

import React, { useState, useEffect } from 'react';
import { useExecutionInterlock } from '@/hooks/useExecutionInterlock';
import { useAppContext } from '@/context/AppContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ExecutionInterlockProps {
    ticker: string;
    action?: string;
    owned?: boolean;
}

export const ExecutionInterlock: React.FC<ExecutionInterlockProps> = ({ ticker, action = 'BUY', owned = false }) => {
    const {
        status,
        message,
        currentPrice,
        positionDollars,
        setPositionDollars,
        computedShares,
        positionPct,
        isOverCap,
        handleAbort,
        handleConfirm,
    } = useExecutionInterlock(ticker, action);

    const { executionMode, userPreferences, updatePreferences } = useAppContext();
    const router = useRouter();

    const [isOverridden, setIsOverridden] = useState(false);

    // Mock freshness (in a real app, this would come from the backend's userPreferences.walletUpdatedAt)
    const [daysAgo, setDaysAgo] = useState(3);

    // UI states
    const [isUpdatePopoverOpen, setIsUpdatePopoverOpen] = useState(false);
    const [tempBalance, setTempBalance] = useState(userPreferences.walletBalance.toString());
    const [isStaleModalOpen, setIsStaleModalOpen] = useState(false);

    // HITL Simulation sequence steps
    const [hitlStep, setHitlStep] = useState(0);

    useEffect(() => {
        if (status === 'EXECUTING') {
            setHitlStep(0);
            const t1 = setTimeout(() => setHitlStep(1), 2000);
            const t2 = setTimeout(() => setHitlStep(2), 5000);
            const t3 = setTimeout(() => setHitlStep(3), 9000);
            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
            };
        }
    }, [status]);

    useEffect(() => {
        setTempBalance(userPreferences.walletBalance.toString());
    }, [userPreferences.walletBalance]);

    const saveBalance = async () => {
        const val = parseFloat(tempBalance);
        if (!isNaN(val)) {
            await updatePreferences({ walletBalance: val });
            setIsUpdatePopoverOpen(false);
            setDaysAgo(0); // Reset freshness after update
        }
    };

    const attemptExecute = () => {
        if (daysAgo > 7) {
            setIsStaleModalOpen(true);
        } else {
            handleConfirm();
        }
    };

    const confirmExecuteAnyway = () => {
        setIsStaleModalOpen(false);
        handleConfirm();
    };

    // ─────────────────────────────────────────────────────────────────
    // BUY / SELL / HOLD LOGIC ROUTING
    // ─────────────────────────────────────────────────────────────────
    let primaryActionType: 'EXECUTE' | 'ADD' | 'NONE' = 'NONE';

    if (isOverridden) {
        if (action === 'BUY' && owned) primaryActionType = 'ADD';
        else primaryActionType = 'EXECUTE';
    } else {
        if (action === 'BUY') {
            if (!owned) primaryActionType = 'EXECUTE';
            else primaryActionType = 'ADD';
        } else if (action === 'SELL') {
            if (owned) primaryActionType = 'EXECUTE';
            else primaryActionType = 'NONE';
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // STATE 1 — ORDER REVIEW
    // ─────────────────────────────────────────────────────────────────
    if (status === 'IDLE' || status === 'ERROR') {
        const totalAmount = (computedShares * currentPrice).toFixed(2);

        return (
            <div className="bg-[#FAFAF9] h-full w-full flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-12 px-8 flex items-center border-b border-[#1C1917]/8 shrink-0">
                    <div className="font-serif text-xl text-[#1C1917]">
                        Order Review
                    </div>
                </header>

                <div className="flex-1 flex flex-col justify-center items-center px-8 gap-6 animate-in slide-in-from-bottom-2 fade-in duration-300 ease-out py-6 overflow-y-auto max-h-[calc(100vh-8rem)]">

                    {/* Mode Badge */}
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#44403C]/60 flex items-center gap-2 shrink-0">
                        Mode: {executionMode} TRADING
                        {executionMode === 'LIVE' ? <span className="text-[#27c93f]">●</span> : <span className="text-[#CA8A04]">●</span>}
                    </div>

                    {/* Order Card */}
                    <div className="bg-white p-8 rounded-2xl border border-[#1C1917]/5 shadow-sm w-full max-w-lg relative transition-shadow duration-500 hover:shadow-xl shrink-0">

                        {/* Action + Ticker */}
                        <div className="mb-6">
                            <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${action === 'BUY' ? 'text-[#27c93f]' : 'text-[#ff5f56]'}`}>
                                {action}
                            </div>
                            <div className="font-serif text-4xl text-[#1C1917]">
                                {ticker}
                            </div>
                        </div>

                        {/* Order Details */}
                        <div>
                            {(primaryActionType === 'EXECUTE' || primaryActionType === 'ADD') || isOverridden ? (
                                <>
                                    <div className="font-sans font-light text-lg text-[#44403C]">
                                        {computedShares.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares @ ${currentPrice.toFixed(2)}
                                    </div>

                                    <div className="w-full h-px bg-[#1C1917]/8 my-4"></div>

                                    <div className="font-serif text-2xl text-[#1C1917] mb-1">
                                        Total: ${totalAmount}
                                    </div>

                                    <div className="font-sans text-xs text-[#44403C]">
                                        {positionPct.toFixed(1)}% of your buying power (${userPreferences.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                    </div>

                                    {/* Freshness Tiers */}
                                    {daysAgo > 0 && (
                                        <div className="mt-2 relative">
                                            <span className={`text-xs ${daysAgo > 7 ? 'text-[#CA8A04]' : 'text-[#44403C]'}`}>
                                                Based on balance from {daysAgo} days ago &middot;{' '}
                                                <button
                                                    onClick={() => setIsUpdatePopoverOpen(!isUpdatePopoverOpen)}
                                                    className="underline decoration-black/20 hover:decoration-black/60 transition-colors"
                                                >
                                                    Update
                                                </button>
                                            </span>

                                            {/* Inline Update Popover */}
                                            {isUpdatePopoverOpen && (
                                                <div className="absolute top-full left-0 mt-2 bg-white border border-[#1C1917]/10 p-4 rounded-lg shadow-xl z-10 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                                                    <span className="text-sm font-bold text-[#1C1917]">$</span>
                                                    <input
                                                        type="number"
                                                        value={tempBalance}
                                                        onChange={(e) => setTempBalance(e.target.value)}
                                                        className="border-b border-[#1C1917]/20 outline-none font-sans text-sm w-24 text-[#1C1917] focus:border-[#CA8A04] transition-colors"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={saveBalance}
                                                        className="bg-[#1C1917] text-white text-[10px] uppercase tracking-widest px-3 py-1.5 rounded"
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Position Dollars Input */}
                                    <div className="mt-6">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#44403C]/60 block mb-1">Adjust Output Size ($)</span>
                                        <input
                                            type="number"
                                            value={positionDollars}
                                            onChange={(e) => setPositionDollars(e.target.value)}
                                            className={`bg-transparent border-b ${isOverCap ? 'border-[#ff5f56]' : 'border-[#1C1917]/20'} text-[#1C1917] font-sans text-base tabular-nums outline-none w-full pb-1 focus:border-[#CA8A04] transition-colors`}
                                            placeholder="0.00"
                                        />
                                        {isOverCap && (
                                            <div className="text-[#ff5f56] text-[10px] mt-1 font-bold uppercase tracking-widest animate-in fade-in">
                                                Exceeds 25% max position cap
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="font-sans font-light text-sm text-[#44403C]">
                                    AI Recommendation: <strong className="font-bold text-[#1C1917]">{action}</strong>.
                                    {action === 'SELL' && !owned && " You cannot sell a stock you do not own."}
                                </div>
                            )}

                            {/* Error Banner */}
                            {status === 'ERROR' && (
                                <div className="mt-6 p-4 bg-[#ff5f56]/10 border border-[#ff5f56]/20 rounded-md text-[#ff5f56] text-xs font-sans animate-in fade-in">
                                    {message || 'Execution failed.'}
                                </div>
                            )}
                        </div>
                    </div>

                    {!isOverridden && primaryActionType === 'NONE' && (
                        <button
                            onClick={() => setIsOverridden(true)}
                            className="text-[#44403C]/60 text-xs font-sans mt-2 hover:text-[#1C1917] transition-colors shrink-0"
                        >
                            Trade anyway &rarr;
                        </button>
                    )}

                    {/* Stale Modal Overlay */}
                    {isStaleModalOpen && (
                        <div className="fixed inset-0 bg-[#1C1917]/80 backdrop-blur-md z-50 flex items-center justify-center animate-in fade-in duration-200">
                            <div className="bg-[#141210] border border-white/10 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4">
                                <h3 className="font-serif text-xl text-white mb-2">Stale Buying Power</h3>
                                <p className="font-sans text-sm text-[#FAFAF9]/70 mb-8 leading-relaxed">
                                    Your stored buying power is {daysAgo} days old. Proceeding may result in an order you cannot fund.
                                </p>
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={() => {
                                            setIsStaleModalOpen(false);
                                            setIsUpdatePopoverOpen(true);
                                        }}
                                        className="w-full bg-[#CA8A04] text-[#1C1917] py-3 rounded-md font-bold uppercase tracking-widest text-xs hover:bg-[#A16207] transition-colors"
                                    >
                                        Update Now
                                    </button>
                                    <button
                                        onClick={confirmExecuteAnyway}
                                        className="w-full border border-white/20 text-white py-3 rounded-md font-bold uppercase tracking-widest text-xs hover:bg-white/10 transition-colors"
                                    >
                                        Proceed Anyway
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom action bar */}
                <footer className="h-20 px-8 flex items-center justify-between border-t border-[#1C1917]/8 bg-[#FAFAF9] shrink-0">
                    <button
                        onClick={handleAbort}
                        className="text-[#ff5f56] border border-[#ff5f56]/30 px-6 py-3 rounded-md text-xs font-sans uppercase tracking-widest hover:bg-[#ff5f56]/10 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                    >
                        ABORT
                    </button>

                    {(primaryActionType === 'EXECUTE' || primaryActionType === 'ADD') ? (
                        daysAgo > 7 ? (
                            <button
                                onClick={() => setIsUpdatePopoverOpen(true)}
                                className="bg-[#CA8A04] text-[#1C1917] px-8 py-3 rounded-md font-bold uppercase tracking-widest text-xs hover:bg-[#A16207] hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] shadow-sm"
                            >
                                UPDATE BALANCE FIRST
                            </button>
                        ) : (
                            <button
                                onClick={attemptExecute}
                                disabled={isOverCap || computedShares === 0}
                                className="bg-[#CA8A04] text-[#1C1917] px-8 py-3 rounded-md font-bold uppercase tracking-widest text-xs hover:bg-[#A16207] hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] disabled:opacity-50 disabled:pointer-events-none shadow-sm flex items-center gap-2 group"
                            >
                                {primaryActionType === 'ADD' ? 'ADD TO POSITION' : 'EXECUTE TRADE'} <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                            </button>
                        )
                    ) : (
                        <div></div>
                    )}
                </footer>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────
    // STATE 2 — HITL PLAYWRIGHT RUNNING
    // ─────────────────────────────────────────────────────────────────
    if (status === 'EXECUTING') {
        if (executionMode === 'PAPER') {
            return (
                <div className="bg-[#FAFAF9] h-full w-full flex flex-col overflow-hidden">
                    <header className="h-12 px-8 flex items-center border-b border-[#1C1917]/8 shrink-0">
                        <div className="font-serif text-xl text-[#1C1917]">
                            Simulating trade...
                        </div>
                    </header>

                    <div className="flex-1 flex flex-col justify-center items-center px-8 gap-8 animate-in fade-in duration-300 overflow-y-auto">
                        <div className="bg-white p-8 rounded-2xl border border-[#1C1917]/5 shadow-sm w-full max-w-md">
                            <div className="flex items-center gap-4">
                                <div className="w-5 flex justify-center shrink-0">
                                    <span className="text-[#CA8A04] text-xs leading-none animate-pulse">●</span>
                                </div>
                                <span className="text-sm font-sans flex-1 text-[#CA8A04] font-medium">
                                    Recording paper trade
                                </span>
                            </div>
                        </div>
                    </div>

                    <footer className="h-20 px-8 flex items-center justify-end border-t border-[#1C1917]/8 bg-[#FAFAF9] shrink-0">
                        <button
                            onClick={handleAbort}
                            className="text-[#ff5f56] border border-[#ff5f56]/30 px-6 py-3 rounded-md text-xs font-sans uppercase tracking-widest hover:bg-[#ff5f56]/10 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                        >
                            ABORT MISSION
                        </button>
                    </footer>
                </div>
            );
        }

        const steps = [
            "Waiting for Robinhood to load",
            "Navigating to order entry",
            "Filling order details",
            "Awaiting your confirmation"
        ];

        return (
            <div className="bg-[#FAFAF9] h-full w-full flex flex-col overflow-hidden">
                <header className="h-12 px-8 flex items-center border-b border-[#1C1917]/8 shrink-0">
                    <div className="font-serif text-xl text-[#1C1917]">
                        Opening Robinhood...
                    </div>
                </header>

                <div className="flex-1 flex flex-col justify-center items-center px-8 gap-8 animate-in fade-in duration-300 overflow-y-auto">
                    <div className="text-center">
                        <h2 className="font-serif text-xl text-[#1C1917]">Please log in and complete 2FA if prompted.</h2>
                        <p className="font-sans font-light text-sm text-[#44403C] mt-2">We'll take it from here once you're inside.</p>
                    </div>

                    <div className="bg-white p-8 rounded-2xl border border-[#1C1917]/5 shadow-sm w-full max-w-md">
                        <div className="flex flex-col gap-4">
                            {steps.map((stepText, idx) => {
                                const isComplete = hitlStep > idx;
                                const isActive = hitlStep === idx;
                                const isPending = hitlStep < idx;

                                return (
                                    <div key={idx} className="flex items-center gap-4">
                                        <div className="w-5 flex justify-center shrink-0">
                                            {isComplete && <span className="text-[#27c93f] font-bold text-sm leading-none animate-in fade-in duration-200">✓</span>}
                                            {isActive && <span className="text-[#CA8A04] text-xs leading-none animate-pulse">●</span>}
                                            {isPending && <span className="text-[#1C1917]/20 text-xs leading-none">○</span>}
                                        </div>
                                        <span className={`text-sm font-sans flex-1 ${isComplete ? 'text-[#1C1917]' : isActive ? 'text-[#CA8A04] font-medium' : 'text-[#44403C]/50'}`}>
                                            {stepText}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <footer className="h-20 px-8 flex items-center justify-end border-t border-[#1C1917]/8 bg-[#FAFAF9] shrink-0">
                    <button
                        onClick={handleAbort}
                        className="text-[#ff5f56] border border-[#ff5f56]/30 px-6 py-3 rounded-md text-xs font-sans uppercase tracking-widest hover:bg-[#ff5f56]/10 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                    >
                        ABORT MISSION
                    </button>
                </footer>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────
    // STATE 3 — TRADE CONFIRMED
    // ─────────────────────────────────────────────────────────────────
    if (status === 'SUCCESS') {
        const totalAmount = (computedShares * currentPrice).toFixed(2);

        return (
            <div className="bg-[#FAFAF9] h-full w-full flex flex-col overflow-hidden justify-center items-center gap-8 animate-in fade-in duration-300">

                {/* Checkmark Animation Layer */}
                <div className="w-16 h-16 relative">
                    <svg className="w-full h-full drop-shadow-sm" viewBox="0 0 52 52">
                        <circle className="stroke-[#27c93f]" cx="26" cy="26" r="25" fill="none" strokeWidth="2" strokeDasharray="157" strokeDashoffset="0" style={{ animation: "circle 500ms ease-in-out" }} />
                        <path className="stroke-[#27c93f]" fill="none" strokeWidth="2" strokeDasharray="48" strokeDashoffset="0" d="M14 27l7 7 16-16" style={{ animation: "check 500ms ease-in-out 100ms both" }} />
                    </svg>
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @keyframes circle { from { stroke-dashoffset: 157; } to { stroke-dashoffset: 0; } }
                        @keyframes check { from { stroke-dashoffset: 48; } to { stroke-dashoffset: 0; } }
                    `}} />
                </div>

                <div className="text-center">
                    <h2 className="font-serif text-2xl text-[#1C1917] mb-2 animate-in slide-in-from-bottom-2 fade-in duration-300 delay-200 fill-mode-both">Trade Executed</h2>
                    <p className="font-sans text-sm text-[#44403C] animate-in slide-in-from-bottom-2 fade-in duration-300 delay-300 fill-mode-both">
                        <span className="font-bold">{ticker}</span> &middot; {computedShares.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares &middot; ${currentPrice.toFixed(2)}
                    </p>
                    <p className="font-sans font-light text-xs text-[#44403C]/70 mt-1 animate-in slide-in-from-bottom-2 fade-in duration-300 delay-400 fill-mode-both">
                        Logged to your positions.
                    </p>
                </div>

                <div className="flex items-center gap-6 mt-4 animate-in fade-in duration-500 delay-500 fill-mode-both">
                    <Link
                        href="/positions"
                        className="text-[#1C1917] border border-[#1C1917]/20 px-6 py-2 rounded-full text-xs font-sans uppercase tracking-widest hover:bg-[#1C1917]/5 transition-colors"
                    >
                        View Positions
                    </Link>
                    <Link
                        href="/"
                        className="text-xs font-sans uppercase tracking-widest text-[#CA8A04] hover:-translate-y-[1px] transition-transform duration-300"
                    >
                        Analyze Another
                    </Link>
                </div>
            </div>
        );
    }

    return null;
};
