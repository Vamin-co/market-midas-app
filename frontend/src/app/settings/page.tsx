'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/hooks/useSettings';

const PROVIDER_INITIALS: Record<string, string> = {
    openai: 'OAI',
    anthropic: 'ANT',
    google: 'GGL',
    deepseek: 'DS',
    xai: 'XAI',
};

const API_KEY_PLACEHOLDERS: Record<string, string> = {
    openai: 'sk-...',
    anthropic: 'sk-ant-...',
    google: 'AIza...',
    deepseek: 'sk-...',
    xai: 'xai-...',
};

const TIER_STYLES: Record<string, string> = {
    high: 'bg-[#ff5f56]/10 text-[#ff5f56]',
    mid: 'bg-[#CA8A04]/10 text-[#CA8A04]',
    low: 'bg-[#27c93f]/10 text-[#27c93f]',
};

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

export default function SettingsPage() {
    const router = useRouter();
    const s = useSettings();

    // Local UI state for risk field inline edit visibility
    const [editStopLoss, setEditStopLoss] = useState(false);
    const [editDrawdown, setEditDrawdown] = useState(false);
    const [editTradeSize, setEditTradeSize] = useState(false);
    const [editMaxPositionPct, setEditMaxPositionPct] = useState(false);

    const currentModels = s.providers?.[s.selectedProvider]?.models || [];

    return (
        <div className="h-full w-full overflow-y-auto scrollbar-none">
            <div className="max-w-2xl mx-auto px-6 pt-8 pb-32 flex flex-col gap-6">

                {/* ═══════════════════════════════════════════════ */}
                {/* SECTION 1 — AI PROVIDER                        */}
                {/* ═══════════════════════════════════════════════ */}
                <section className="bg-white rounded-2xl border border-[#1C1917]/8 shadow-sm p-6">
                    <h2 className="text-[11px] font-sans font-bold uppercase tracking-widest text-[#44403C]/50 mb-4">AI Provider</h2>

                    {/* Provider cards */}
                    {s.providersLoading ? (
                        <div className="flex flex-wrap gap-3">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="w-32 h-20 bg-[#1C1917]/5 animate-pulse rounded-xl" />
                            ))}
                        </div>
                    ) : s.providers ? (
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(s.providers).map(([id, config]) => (
                                <button
                                    key={id}
                                    onClick={() => s.setSelectedProvider(id)}
                                    className={`w-32 cursor-default rounded-xl p-4 flex flex-col gap-2 transition-colors duration-200 ${
                                        s.selectedProvider === id
                                            ? 'border border-[#CA8A04] bg-[#CA8A04]/5'
                                            : 'bg-white border border-[#1C1917]/8 hover:border-[#CA8A04]/40'
                                    }`}
                                >
                                    <span className="bg-[#1C1917] text-[#FAFAF9] text-[9px] font-bold px-2 py-0.5 rounded self-start">
                                        {PROVIDER_INITIALS[id] || id.toUpperCase().slice(0, 3)}
                                    </span>
                                    <span className="text-sm font-sans font-medium text-[#1C1917] mt-1">{config.label}</span>
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {/* Model selector */}
                    {currentModels.length > 0 && (
                        <div className="mt-4">
                            <div className="text-[11px] font-sans font-bold uppercase tracking-widest text-[#44403C]/50 mb-3">Model</div>
                            <div className="flex flex-wrap gap-2">
                                {currentModels.map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => s.setSelectedModel(m.id)}
                                        className={`flex items-center gap-2 border rounded-full px-3 py-1.5 cursor-default text-[9px] font-bold uppercase tracking-widest transition-colors duration-150 ${
                                            s.selectedModel === m.id
                                                ? 'border-[#CA8A04] bg-[#CA8A04]/5 text-[#1C1917]'
                                                : 'border-[#1C1917]/10 bg-white text-[#44403C]/60 hover:border-[#CA8A04]/40'
                                        }`}
                                    >
                                        {m.label}
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${TIER_STYLES[m.tier]}`}>
                                            {m.tier}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* API Key */}
                    <div className="mt-4">
                        <div className="text-[11px] font-sans font-bold uppercase tracking-widest text-[#44403C]/50 mb-3">API Key</div>
                        <div className="flex items-center gap-2">
                            <input
                                type={s.apiKeyVisible ? 'text' : 'password'}
                                value={s.apiKey}
                                onChange={(e) => s.setApiKey(e.target.value)}
                                placeholder={
                                    s.apiKeyHasSavedValue && s.apiKey === ''
                                        ? 'A key is saved. Paste to replace.'
                                        : API_KEY_PLACEHOLDERS[s.selectedProvider] || 'sk-...'
                                }
                                className="flex-1 font-sans text-sm bg-[#FAFAF9] border border-[#1C1917]/10 rounded-lg px-4 py-2.5 focus:border-[#CA8A04] transition-colors duration-200 outline-none"
                            />
                            <button
                                onClick={s.toggleApiKeyVisible}
                                className="w-8 h-8 flex items-center justify-center text-[#44403C]/40 hover:text-[#44403C] transition-colors"
                            >
                                {s.apiKeyVisible ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <p className="text-[10px] text-[#44403C]/40 mt-1">
                            Stored locally on your Mac. Never transmitted to our servers.
                        </p>
                        {s.aiError && <p className="text-[10px] text-[#ff5f56] mt-1">{s.aiError}</p>}
                    </div>

                    {/* Save AI Config */}
                    <div className="mt-4">
                        {s.aiSaveState === 'saved' ? (
                            <span className="text-[#27c93f] text-xs font-bold uppercase tracking-widest">Saved ✓</span>
                        ) : (
                            <button
                                onClick={s.saveAiConfig}
                                disabled={s.aiSaveState === 'saving'}
                                className={`bg-[#CA8A04] text-[#1C1917] px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                                    s.aiSaveState === 'saving' ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#A16207]'
                                }`}
                            >
                                {s.aiSaveState === 'saving' ? 'Saving...' : 'Save Changes →'}
                            </button>
                        )}
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════ */}
                {/* SECTION 2 — TRADING MODE                       */}
                {/* ═══════════════════════════════════════════════ */}
                <section className="bg-white rounded-2xl border border-[#1C1917]/8 shadow-sm p-6">
                    <h2 className="text-[11px] font-sans font-bold uppercase tracking-widest text-[#44403C]/50 mb-4">Trading Mode</h2>

                    <div className="inline-flex bg-[#1C1917]/5 rounded-full p-1">
                        <button
                            onClick={() => s.requestModeChange('paper')}
                            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-full transition-all duration-200 cursor-default ${
                                s.mode === 'paper'
                                    ? 'bg-white shadow-sm text-[#CA8A04]'
                                    : 'text-[#44403C]/40'
                            }`}
                        >
                            Paper
                        </button>
                        <button
                            onClick={() => s.requestModeChange('live')}
                            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-full transition-all duration-200 cursor-default ${
                                s.mode === 'live'
                                    ? 'bg-white shadow-sm text-[#27c93f]'
                                    : 'text-[#44403C]/40'
                            }`}
                        >
                            Live
                        </button>
                    </div>

                    {/* Live mode confirmation dialog */}
                    {s.pendingMode === 'live' && (
                        <div className="mt-3 p-3 bg-[#1C1917]/5 rounded-xl animate-in fade-in duration-200">
                            <p className="text-xs text-[#1C1917] font-medium">Switch to Live mode?</p>
                            <p className="text-[10px] text-[#44403C]/50 mt-0.5">
                                Real money, real trades. Make sure your buying power is updated.
                            </p>
                            <div className="mt-2 flex gap-2">
                                <button
                                    onClick={s.confirmLiveMode}
                                    disabled={s.tradingSaveState === 'saving'}
                                    className="bg-[#CA8A04] text-[#1C1917] px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-[#A16207] transition-colors disabled:opacity-60"
                                >
                                    Confirm
                                </button>
                                <button
                                    onClick={s.cancelModeChange}
                                    className="border border-[#1C1917]/20 text-[#44403C] px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-[#1C1917]/5 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {s.tradingError && <p className="text-[10px] text-[#ff5f56] mt-2">{s.tradingError}</p>}
                </section>

                {/* ═══════════════════════════════════════════════ */}
                {/* SECTION 3 — RISK CONTROLS                      */}
                {/* ═══════════════════════════════════════════════ */}
                <section className="bg-white rounded-2xl border border-[#1C1917]/8 shadow-sm p-6">
                    <h2 className="text-[11px] font-sans font-bold uppercase tracking-widest text-[#44403C]/50 mb-4">Risk Controls</h2>

                    <div className="flex flex-col gap-4">
                        {/* Stop Loss */}
                        <RiskField
                            label="Stop Loss"
                            value={s.stopLossThreshold}
                            unit="%"
                            editing={editStopLoss}
                            onClickDisplay={() => setEditStopLoss(true)}
                            onChange={(v) => s.setStopLoss(v)}
                            onSave={() => { s.saveRiskControls(); setEditStopLoss(false); }}
                        />

                        {/* Max Daily Drawdown */}
                        <RiskField
                            label="Max Daily Drawdown"
                            value={s.maxDailyDrawdown}
                            unit="%"
                            editing={editDrawdown}
                            onClickDisplay={() => setEditDrawdown(true)}
                            onChange={(v) => s.setMaxDrawdown(v)}
                            onSave={() => { s.saveRiskControls(); setEditDrawdown(false); }}
                        />

                        {/* Default Trade Size */}
                        <RiskField
                            label="Default Trade Size"
                            value={s.defaultTradeSize}
                            unit="$"
                            prefix
                            editing={editTradeSize}
                            onClickDisplay={() => setEditTradeSize(true)}
                            onChange={(v) => s.setDefaultTradeSize(v)}
                            onSave={() => { s.saveRiskControls(); setEditTradeSize(false); }}
                        />

                        <RiskField
                            label="Max Position Percent"
                            value={s.maxPositionPercent}
                            unit="%"
                            editing={editMaxPositionPct}
                            onClickDisplay={() => setEditMaxPositionPct(true)}
                            onChange={(v) => s.setMaxPositionPercent(v)}
                            onSave={() => { s.saveRiskControls(); setEditMaxPositionPct(false); }}
                        />
                    </div>

                    {/* Risk save status */}
                    <div className="mt-3 h-4">
                        {s.riskSaveState === 'saving' && (
                            <span className="text-[10px] text-[#44403C]/50">Saving...</span>
                        )}
                        {s.riskSaveState === 'saved' && (
                            <span className="text-[10px] text-[#27c93f] font-bold uppercase tracking-widest">Saved ✓</span>
                        )}
                        {s.riskSaveState === 'error' && s.riskError && (
                            <span className="text-[10px] text-[#ff5f56]">{s.riskError}</span>
                        )}
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════ */}
                {/* SECTION 4 — BUYING POWER                       */}
                {/* ═══════════════════════════════════════════════ */}
                <section className="bg-white rounded-2xl border border-[#1C1917]/8 shadow-sm p-6">
                    <h2 className="text-[11px] font-sans font-bold uppercase tracking-widest text-[#44403C]/50 mb-4">Buying Power</h2>

                    <div className="flex items-center justify-between">
                        <div>
                            <div className="font-serif text-2xl text-[#1C1917]">{formatCurrency(s.walletBalance)}</div>
                            <p className="text-[10px] text-[#44403C]/40 mt-1 max-w-xs">
                                {s.mode === 'paper'
                                    ? 'Simulated trading budget. Updates automatically as you make paper trades.'
                                    : 'Update before each trading session with your actual Robinhood balance.'
                                }
                            </p>
                        </div>
                        {!s.buyingPowerEditOpen && (
                            <button
                                onClick={() => s.setBuyingPowerEditOpen(true)}
                                className="border border-[#1C1917]/20 text-[#44403C] px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-[#1C1917]/5 transition-colors shrink-0"
                            >
                                Update
                            </button>
                        )}
                    </div>

                    {/* Inline edit */}
                    {s.buyingPowerEditOpen && (
                        <div className="mt-3 flex items-center gap-3 animate-in fade-in duration-200">
                            <span className="text-sm text-[#44403C]">$</span>
                            <input
                                type="number"
                                value={s.walletBalance}
                                onChange={(e) => s.setWalletBalance(parseFloat(e.target.value) || 0)}
                                className="w-36 text-sm bg-[#FAFAF9] border border-[#CA8A04] rounded-lg px-3 py-1.5 focus:outline-none"
                                autoFocus
                            />
                            <button
                                onClick={s.saveBuyingPower}
                                disabled={s.buyingPowerSaveState === 'saving'}
                                className="text-[9px] font-bold uppercase tracking-widest text-[#CA8A04] hover:text-[#A16207] cursor-default disabled:opacity-60"
                            >
                                Save
                            </button>
                            <button
                                onClick={() => s.setBuyingPowerEditOpen(false)}
                                className="text-[9px] text-[#44403C]/40 uppercase tracking-widest hover:text-[#44403C] transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {s.buyingPowerError && <p className="text-[10px] text-[#ff5f56] mt-2">{s.buyingPowerError}</p>}
                </section>

                {/* ═══════════════════════════════════════════════ */}
                {/* SECTION 5 — DANGER ZONE                        */}
                {/* ═══════════════════════════════════════════════ */}
                <section className="bg-white rounded-2xl border border-[#1C1917]/8 shadow-sm p-6 border-l-4 border-l-[#ff5f56]">
                    <h2 className="text-[11px] font-sans font-bold uppercase tracking-widest text-[#ff5f56] mb-4">Danger Zone</h2>

                    <p className="text-sm font-sans font-medium text-[#ff5f56]">Reset All Settings</p>
                    <p className="text-xs text-[#44403C]/50 mt-1">
                        This will reset all settings to defaults and restart the setup flow.
                    </p>

                    <div className="mt-4">
                        <label className="text-[9px] uppercase tracking-widest text-[#44403C]/50 block">
                            Type RESET to confirm
                        </label>
                        <input
                            type="text"
                            value={s.resetConfirmInput}
                            onChange={(e) => s.setResetConfirmInput(e.target.value)}
                            placeholder="RESET"
                            className="font-sans text-sm bg-[#FAFAF9] border border-[#1C1917]/10 rounded-lg px-4 py-2 mt-1 w-full focus:border-[#CA8A04] transition-colors duration-200 outline-none"
                        />
                    </div>

                    <div className="mt-3">
                        <button
                            onClick={async () => {
                                const ok = await s.resetAllSettings();
                                if (ok) router.push('/onboarding');
                            }}
                            disabled={s.resetConfirmInput !== 'RESET' || s.resetSaveState === 'saving'}
                            className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                                s.resetConfirmInput === 'RESET' && s.resetSaveState !== 'saving'
                                    ? 'bg-[#ff5f56] text-white hover:bg-[#e04e47]'
                                    : 'bg-[#ff5f56]/20 text-[#ff5f56]/40 cursor-not-allowed'
                            }`}
                        >
                            {s.resetSaveState === 'saving' ? 'Resetting...' : 'Reset All Settings'}
                        </button>
                    </div>

                    {s.resetError && <p className="text-[10px] text-[#ff5f56] mt-2">{s.resetError}</p>}
                </section>

            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// Risk Field — inline component (not exported, stays in this file)
// ════════════════════════════════════════════════════════════════

function RiskField({
    label,
    value,
    unit,
    prefix = false,
    editing,
    onClickDisplay,
    onChange,
    onSave,
}: {
    label: string;
    value: number;
    unit: string;
    prefix?: boolean;
    editing: boolean;
    onClickDisplay: () => void;
    onChange: (val: number) => void;
    onSave: () => void;
}) {
    const displayValue = prefix
        ? `${unit}${value.toLocaleString()}`
        : `${value}${unit}`;

    return (
        <div>
            <div className="text-[9px] uppercase tracking-widest text-[#44403C]/50 mb-1">{label}</div>
            {editing ? (
                <div className="flex items-center gap-3">
                    {prefix && <span className="text-sm text-[#44403C]">{unit}</span>}
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                        className="w-20 text-sm text-center bg-[#FAFAF9] border border-[#CA8A04] rounded-lg px-2 py-1 focus:outline-none"
                        autoFocus
                    />
                    {!prefix && <span className="text-sm text-[#44403C]">{unit}</span>}
                    <button
                        onClick={onSave}
                        className="text-[9px] font-bold uppercase tracking-widest text-[#CA8A04] hover:text-[#A16207] cursor-default"
                    >
                        Save
                    </button>
                </div>
            ) : (
                <button
                    onClick={onClickDisplay}
                    className="text-sm font-sans text-[#1C1917] cursor-default hover:text-[#CA8A04] transition-colors"
                >
                    {displayValue}
                </button>
            )}
        </div>
    );
}
