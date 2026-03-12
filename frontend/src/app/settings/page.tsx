"use client";

import React from 'react';
import { useSettings } from '@/hooks/useSettings';

export default function SettingsPage() {
    const {
        walletBalance,
        setWalletBalance,
        defaultTradeSize,
        setDefaultTradeSize,
        alertThreshold,
        setAlertThreshold,
        maxDailyDrawdown,
        setMaxDailyDrawdown,
        stopLossThreshold,
        setStopLossThreshold,
        apiKey,
        setApiKey,
        showApiKey,
        isSaving,
        saveStatus,
        errorMsg,
        apiKeySet,
        handleSave,
        toggleApiKeyVisibility,
    } = useSettings();

    return (
        <main className="max-w-[900px] mx-auto p-8 bg-[#FAFAF9] min-h-screen font-sans pb-40">
            <header className="border-b-2 border-[#1C1917] pb-8 mb-10 mt-6">
                <h1 className="text-5xl font-serif font-bold tracking-tight text-[#1C1917] leading-none">Settings</h1>
                <p className="text-stone-400 text-xs uppercase tracking-[0.2em] font-bold flex items-center gap-2 mt-3">
                    <span className="w-2 h-2 bg-[#CA8A04] inline-block"></span>
                    Configure your Market-Midas environment
                </p>
            </header>

            <div className="space-y-8">

                {/* § API Configuration */}
                <section className="bg-white p-10 rounded-2xl border border-[#1C1917]/5 shadow-sm">
                    <h2 className="font-serif text-xl font-bold uppercase tracking-widest text-[#1C1917] mb-6 flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#CA8A04] text-lg">key</span>
                        API Configuration
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-stone-400 text-[9px] font-bold uppercase tracking-[0.2em] mb-2">
                                API Key
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="Enter your API key..."
                                    className="flex-1 bg-[#FAFAF9] border border-stone-200 rounded-md px-4 py-3 font-sans text-sm focus:border-[#CA8A04] focus:ring-1 focus:ring-[#CA8A04] transition-colors outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={toggleApiKeyVisibility}
                                    className="text-stone-400 hover:text-[#1C1917] transition-colors p-2"
                                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                                >
                                    <span className="material-symbols-outlined text-lg">
                                        {showApiKey ? 'visibility_off' : 'visibility'}
                                    </span>
                                </button>
                            </div>
                            {apiKeySet && (
                                <p className="text-[#27c93f] text-[10px] font-bold uppercase tracking-widest mt-2 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#27c93f]"></span>
                                    API Key configured
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                {/* § Risk Controls */}
                <section className="bg-white p-10 rounded-2xl border border-[#1C1917]/5 shadow-sm">
                    <h2 className="font-serif text-xl font-bold uppercase tracking-widest text-[#1C1917] mb-6 flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#CA8A04] text-lg">shield</span>
                        Risk Controls
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-stone-400 text-[9px] font-bold uppercase tracking-[0.2em] mb-2">
                                Default Trade Size ($)
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
                                <input
                                    type="number"
                                    value={defaultTradeSize}
                                    onChange={(e) => setDefaultTradeSize(e.target.value)}
                                    className="w-full bg-[#FAFAF9] border border-stone-200 rounded-md pl-8 pr-4 py-3 font-sans text-sm tabular-nums focus:border-[#CA8A04] focus:ring-1 focus:ring-[#CA8A04] transition-colors outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-stone-400 text-[9px] font-bold uppercase tracking-[0.2em] mb-2">
                                Starting Balance ($)
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
                                <input
                                    type="number"
                                    value={walletBalance}
                                    onChange={(e) => setWalletBalance(e.target.value)}
                                    className="w-full bg-[#FAFAF9] border border-stone-200 rounded-md pl-8 pr-4 py-3 font-sans text-sm tabular-nums focus:border-[#CA8A04] focus:ring-1 focus:ring-[#CA8A04] transition-colors outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* § Alert Thresholds */}
                <section className="bg-white p-10 rounded-2xl border border-[#1C1917]/5 shadow-sm">
                    <h2 className="font-serif text-xl font-bold uppercase tracking-widest text-[#1C1917] mb-6 flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#CA8A04] text-lg">notifications_active</span>
                        Alert Thresholds
                    </h2>

                    <div className="max-w-xs">
                        <label className="block text-stone-400 text-[9px] font-bold uppercase tracking-[0.2em] mb-2">
                            P/L Alert Threshold (%)
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={alertThreshold}
                                onChange={(e) => setAlertThreshold(e.target.value)}
                                className="w-full bg-[#FAFAF9] border border-stone-200 rounded-md px-4 py-3 font-sans text-sm tabular-nums focus:border-[#CA8A04] focus:ring-1 focus:ring-[#CA8A04] transition-colors outline-none pr-8"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm">%</span>
                        </div>
                    </div>

                    <div className="max-w-xs mt-6">
                        <label className="block text-stone-400 text-[9px] font-bold uppercase tracking-[0.2em] mb-2">
                            Stop-Loss Alert (%)
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={stopLossThreshold}
                                onChange={(e) => setStopLossThreshold(e.target.value)}
                                min="0.1"
                                step="0.5"
                                className="w-full bg-[#FAFAF9] border border-stone-200 rounded-md px-4 py-3 font-sans text-sm tabular-nums focus:border-[#CA8A04] focus:ring-1 focus:ring-[#CA8A04] transition-colors outline-none pr-8"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm">%</span>
                        </div>
                        <p className="text-stone-400 text-[10px] mt-2 leading-relaxed">
                            Enter a positive number (e.g., 8 for -8%). You&apos;ll receive a macOS notification when any open position drops by this amount.
                        </p>
                    </div>
                </section>

                {/* § Daily Circuit Breaker */}
                <section className="bg-white p-10 rounded-2xl border border-[#B91C1C]/10 shadow-sm">
                    <h2 className="font-serif text-xl font-bold uppercase tracking-widest text-[#1C1917] mb-2 flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#B91C1C] text-lg">emergency</span>
                        Daily Circuit Breaker
                    </h2>
                    <p className="text-stone-400 text-xs mb-6 leading-relaxed">
                        If the portfolio drops by this percentage within a single trading day, the AI agent will trigger a hard kill switch — halting all new trade recommendations.
                    </p>

                    <div className="max-w-xs">
                        <label className="block text-stone-400 text-[9px] font-bold uppercase tracking-[0.2em] mb-2">
                            Max Daily Drawdown (%)
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                value={maxDailyDrawdown}
                                onChange={(e) => setMaxDailyDrawdown(e.target.value)}
                                className="w-full bg-[#FAFAF9] border border-stone-200 rounded-md px-4 py-3 font-sans text-sm tabular-nums focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C] transition-colors outline-none pr-8"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm">%</span>
                        </div>
                    </div>
                </section>

                {/* Save Button + Status */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-[#CA8A04] text-[#1C1917] px-8 py-3 rounded-md font-bold uppercase tracking-widest text-xs hover:bg-[#A16207] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                                Saving...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-sm">save</span>
                                Save Preferences
                            </>
                        )}
                    </button>

                    {saveStatus === 'success' && (
                        <span className="text-[#27c93f] text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 animate-in fade-in">
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                            Settings saved successfully
                        </span>
                    )}
                    {saveStatus === 'error' && (
                        <span className="text-[#ff5f56] text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 animate-in fade-in">
                            <span className="material-symbols-outlined text-sm">error</span>
                            {errorMsg}
                        </span>
                    )}
                </div>
            </div>
        </main>
    );
}
