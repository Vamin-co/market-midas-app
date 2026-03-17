"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { API_BASE_URL } from '@/lib/api';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

export interface ModelOption {
    id: string;
    label: string;
    tier: 'high' | 'mid' | 'low';
}

export interface ProviderConfig {
    label: string;
    models: ModelOption[];
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface UseSettingsReturn {
    // Providers
    providers: Record<string, ProviderConfig> | null;
    providersLoading: boolean;

    // AI config draft state
    selectedProvider: string;
    selectedModel: string;
    apiKey: string;
    apiKeyVisible: boolean;
    apiKeyHasSavedValue: boolean;
    aiSaveState: SaveState;
    aiError: string | null;

    // Trading mode draft state
    mode: 'paper' | 'live';
    pendingMode: 'paper' | 'live' | null;
    tradingSaveState: SaveState;
    tradingError: string | null;

    // Risk controls draft state
    stopLossThreshold: number;
    maxDailyDrawdown: number;
    defaultTradeSize: number;
    maxPositionPercent: number;
    alertThreshold: number;
    riskSaveState: SaveState;
    riskError: string | null;

    // Buying power draft state
    walletBalance: number;
    buyingPowerEditOpen: boolean;
    buyingPowerSaveState: SaveState;
    buyingPowerError: string | null;

    // Danger zone
    resetConfirmInput: string;
    resetSaveState: SaveState;
    resetError: string | null;

    // ── Functions ──

    // AI provider section
    setSelectedProvider: (provider: string) => void;
    setSelectedModel: (model: string) => void;
    setApiKey: (key: string) => void;
    toggleApiKeyVisible: () => void;
    saveAiConfig: () => Promise<void>;

    // Trading mode section
    requestModeChange: (newMode: 'paper' | 'live') => void;
    confirmLiveMode: () => Promise<void>;
    cancelModeChange: () => void;

    // Risk controls section
    setStopLoss: (val: number) => void;
    setMaxDrawdown: (val: number) => void;
    setDefaultTradeSize: (val: number) => void;
    setMaxPositionPercent: (val: number) => void;
    saveRiskControls: () => Promise<void>;

    // Buying power section
    setWalletBalance: (val: number) => void;
    setBuyingPowerEditOpen: (open: boolean) => void;
    saveBuyingPower: () => Promise<void>;

    // Danger zone
    setResetConfirmInput: (val: string) => void;
    resetAllSettings: () => Promise<boolean>;
}

// ════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════

const SAVED_RESET_MS = 2000;

// ════════════════════════════════════════════════════════════════
// Hook
// ════════════════════════════════════════════════════════════════

export function useSettings(): UseSettingsReturn {
    const { userPreferences, updatePreferences, refreshPreferences } = useAppContext();

    // ── Providers ──
    const [providers, setProviders] = useState<Record<string, ProviderConfig> | null>(null);
    const [providersLoading, setProvidersLoading] = useState(true);

    // ── AI config draft ──
    const [selectedProvider, setSelectedProviderState] = useState('openai');
    const [selectedModel, setSelectedModelState] = useState('gpt-5-mini');
    const [apiKey, setApiKeyState] = useState('');
    const [apiKeyVisible, setApiKeyVisible] = useState(false);
    const [apiKeyHasSavedValue, setApiKeyHasSavedValue] = useState(false);
    const [aiSaveState, setAiSaveState] = useState<SaveState>('idle');
    const [aiError, setAiError] = useState<string | null>(null);

    // ── Trading mode draft ──
    const [mode, setMode] = useState<'paper' | 'live'>('paper');
    const [pendingMode, setPendingMode] = useState<'paper' | 'live' | null>(null);
    const [tradingSaveState, setTradingSaveState] = useState<SaveState>('idle');
    const [tradingError, setTradingError] = useState<string | null>(null);
    const lastSavedModeRef = useRef<'paper' | 'live'>('paper');

    // ── Risk controls draft ──
    const [stopLossThreshold, setStopLossThresholdState] = useState(5);
    const [maxDailyDrawdown, setMaxDailyDrawdownState] = useState(5);
    const [defaultTradeSize, setDefaultTradeSizeState] = useState(1000);
    const [maxPositionPercent, setMaxPositionPercentState] = useState(25);
    const [alertThreshold, setAlertThresholdState] = useState(5);
    const [riskSaveState, setRiskSaveState] = useState<SaveState>('idle');
    const [riskError, setRiskError] = useState<string | null>(null);

    // ── Buying power draft ──
    const [walletBalance, setWalletBalanceState] = useState(100_000);
    const [buyingPowerEditOpen, setBuyingPowerEditOpen] = useState(false);
    const [buyingPowerSaveState, setBuyingPowerSaveState] = useState<SaveState>('idle');
    const [buyingPowerError, setBuyingPowerError] = useState<string | null>(null);

    // ── Danger zone ──
    const [resetConfirmInput, setResetConfirmInput] = useState('');
    const [resetSaveState, setResetSaveState] = useState<SaveState>('idle');
    const [resetError, setResetError] = useState<string | null>(null);

    // ════════════════════════════════════════════════════════════
    // Initialization
    // ════════════════════════════════════════════════════════════

    // Populate draft fields from AppContext.userPreferences
    useEffect(() => {
        setStopLossThresholdState(userPreferences.stopLossThreshold);
        setMaxDailyDrawdownState(userPreferences.maxDailyDrawdown);
        setDefaultTradeSizeState(userPreferences.defaultTradeSize);
        setMaxPositionPercentState(userPreferences.maxPositionPercent * 100);
        setAlertThresholdState(userPreferences.alertThreshold);
        setWalletBalanceState(userPreferences.walletBalance);

        // API key: if non-empty on server, mark as saved but don't pre-populate
        if (userPreferences.apiKey && userPreferences.apiKey !== '') {
            setApiKeyHasSavedValue(true);
        } else {
            setApiKeyHasSavedValue(false);
        }
        setApiKeyState('');
    }, [userPreferences]);

    // Fetch provider + model + mode from backend settings on mount
    useEffect(() => {
        let cancelled = false;

        const fetchInitialData = async () => {
            // Fetch providers
            try {
                setProvidersLoading(true);
                const res = await fetch(`${API_BASE_URL}/settings/providers`);
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) setProviders(data.providers);
                }
            } catch (err) {
                console.error("Failed to fetch providers:", err);
            } finally {
                if (!cancelled) setProvidersLoading(false);
            }

            // Fetch full settings to get provider, model, mode
            try {
                const res = await fetch(`${API_BASE_URL}/settings`);
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) {
                        if (data.provider) setSelectedProviderState(data.provider);
                        if (data.model) setSelectedModelState(data.model);
                        const settingsMode = data.mode === 'live' ? 'live' : 'paper';
                        setMode(settingsMode);
                        lastSavedModeRef.current = settingsMode;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch settings:", err);
            }
        };

        fetchInitialData();
        return () => { cancelled = true; };
    }, []);

    // ════════════════════════════════════════════════════════════
    // Helper: auto-reset SaveState after delay
    // ════════════════════════════════════════════════════════════

    const autoReset = useCallback((setter: (s: SaveState) => void) => {
        setTimeout(() => setter('idle'), SAVED_RESET_MS);
    }, []);

    // ════════════════════════════════════════════════════════════
    // AI Provider section
    // ════════════════════════════════════════════════════════════

    const setSelectedProvider = useCallback((provider: string) => {
        setSelectedProviderState(provider);
        // Auto-select first mid-tier model, or first model if no mid
        if (providers && providers[provider]) {
            const models = providers[provider].models;
            const midModel = models.find(m => m.tier === 'mid');
            setSelectedModelState(midModel ? midModel.id : models[0]?.id || '');
        }
        // Clear API key state for new provider
        setApiKeyState('');
        setApiKeyHasSavedValue(false);
        setAiSaveState('idle');
        setAiError(null);
    }, [providers]);

    const setSelectedModel = useCallback((model: string) => {
        setSelectedModelState(model);
    }, []);

    const setApiKey = useCallback((key: string) => {
        setApiKeyState(key);
        setAiError(null);
    }, []);

    const toggleApiKeyVisible = useCallback(() => {
        setApiKeyVisible(prev => !prev);
    }, []);

    const saveAiConfig = useCallback(async () => {
        // Validation
        if (!apiKeyHasSavedValue && apiKey === '') {
            setAiError('API key is required');
            return;
        }

        setAiSaveState('saving');

        try {
            const payload: Record<string, string> = {
                provider: selectedProvider,
                model: selectedModel,
            };
            if (apiKey !== '') {
                payload.apiKey = apiKey;
            }

            const res = await fetch(`${API_BASE_URL}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Save failed' }));
                throw new Error(err.detail || 'Save failed');
            }

            await refreshPreferences();

            if (apiKey !== '') {
                setApiKeyHasSavedValue(true);
                setApiKeyState('');
            }

            setAiSaveState('saved');
            setAiError(null);
            autoReset(setAiSaveState);
        } catch (err: any) {
            setAiSaveState('error');
            setAiError(err.message || 'Failed to save AI config');
        }
    }, [apiKey, apiKeyHasSavedValue, selectedProvider, selectedModel, refreshPreferences, autoReset]);

    // ════════════════════════════════════════════════════════════
    // Trading mode section
    // ════════════════════════════════════════════════════════════

    const saveModeToBackend = useCallback(async (newMode: 'paper' | 'live') => {
        setTradingSaveState('saving');
        try {
            const res = await fetch(`${API_BASE_URL}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: newMode }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Save failed' }));
                throw new Error(err.detail || 'Save failed');
            }

            await refreshPreferences();
            setMode(newMode);
            lastSavedModeRef.current = newMode;
            setTradingSaveState('saved');
            setTradingError(null);
            autoReset(setTradingSaveState);
        } catch (err: any) {
            setTradingSaveState('error');
            setTradingError(err.message || 'Failed to save trading mode');
            throw err;
        }
    }, [refreshPreferences, autoReset]);

    const requestModeChange = useCallback((newMode: 'paper' | 'live') => {
        if (newMode === 'live') {
            setPendingMode('live');
        } else {
            // Paper is safe — save immediately
            saveModeToBackend('paper').catch(() => {
                // Error state already set in saveModeToBackend
            });
        }
    }, [saveModeToBackend]);

    const confirmLiveMode = useCallback(async () => {
        try {
            await saveModeToBackend('live');
            setPendingMode(null);
        } catch {
            setPendingMode(null);
        }
    }, [saveModeToBackend]);

    const cancelModeChange = useCallback(() => {
        setPendingMode(null);
        setMode(lastSavedModeRef.current);
    }, []);

    // ════════════════════════════════════════════════════════════
    // Risk controls section
    // ════════════════════════════════════════════════════════════

    const setStopLoss = useCallback((val: number) => {
        setStopLossThresholdState(val);
    }, []);

    const setMaxDrawdown = useCallback((val: number) => {
        setMaxDailyDrawdownState(val);
    }, []);

    const setDefaultTradeSize = useCallback((val: number) => {
        setDefaultTradeSizeState(val);
    }, []);

    const setMaxPositionPercent = useCallback((val: number) => {
        setMaxPositionPercentState(val);
    }, []);

    const saveRiskControls = useCallback(async () => {
        setRiskSaveState('saving');
        try {
            const payload = {
                stopLossThreshold,
                maxDailyDrawdown,
                defaultTradeSize,
                maxPositionPercent: Math.max(0, Math.min(maxPositionPercent, 100)) / 100,
                alertThreshold,
            };

            await updatePreferences(payload);
            setRiskSaveState('saved');
            setRiskError(null);
            autoReset(setRiskSaveState);
        } catch (err: any) {
            setRiskSaveState('error');
            setRiskError(err.message || 'Failed to save risk controls');
        }
    }, [
        stopLossThreshold,
        maxDailyDrawdown,
        defaultTradeSize,
        maxPositionPercent,
        alertThreshold,
        updatePreferences,
        autoReset,
    ]);

    // ════════════════════════════════════════════════════════════
    // Buying power section
    // ════════════════════════════════════════════════════════════

    const setWalletBalance = useCallback((val: number) => {
        setWalletBalanceState(val);
    }, []);

    const saveBuyingPower = useCallback(async () => {
        setBuyingPowerSaveState('saving');
        try {
            await updatePreferences({ walletBalance });
            setBuyingPowerEditOpen(false);
            setBuyingPowerSaveState('saved');
            setBuyingPowerError(null);
            autoReset(setBuyingPowerSaveState);
        } catch (err: any) {
            setBuyingPowerSaveState('error');
            setBuyingPowerError(err.message || 'Failed to save buying power');
        }
    }, [walletBalance, updatePreferences, autoReset]);

    // ════════════════════════════════════════════════════════════
    // Danger zone
    // ════════════════════════════════════════════════════════════

    const resetAllSettings = useCallback(async (): Promise<boolean> => {
        if (resetConfirmInput !== 'RESET') return false;

        setResetSaveState('saving');
        try {
            const defaults = {
                provider: 'openai',
                model: 'gpt-5-mini',
                apiKey: '',
                walletBalance: 100_000,
                defaultTradeSize: 1_000,
                maxPositionPercent: 0.25,
                alertThreshold: 5,
                maxDailyDrawdown: 5,
                stopLossThreshold: 5,
                mode: 'paper',
            };

            const res = await fetch(`${API_BASE_URL}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(defaults),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Reset failed' }));
                throw new Error(err.detail || 'Reset failed');
            }

            await refreshPreferences();
            setResetSaveState('saved');
            return true;
        } catch (err: any) {
            setResetSaveState('error');
            setResetError(err.message || 'Failed to reset settings');
            return false;
        }
    }, [resetConfirmInput, refreshPreferences]);

    // ════════════════════════════════════════════════════════════
    // Return
    // ════════════════════════════════════════════════════════════

    return {
        // Providers
        providers,
        providersLoading,

        // AI config
        selectedProvider,
        selectedModel,
        apiKey,
        apiKeyVisible,
        apiKeyHasSavedValue,
        aiSaveState,
        aiError,

        // Trading mode
        mode,
        pendingMode,
        tradingSaveState,
        tradingError,

        // Risk controls
        stopLossThreshold,
        maxDailyDrawdown,
        defaultTradeSize,
        maxPositionPercent,
        alertThreshold,
        riskSaveState,
        riskError,

        // Buying power
        walletBalance,
        buyingPowerEditOpen,
        buyingPowerSaveState,
        buyingPowerError,

        // Danger zone
        resetConfirmInput,
        resetSaveState,
        resetError,

        // Functions — AI
        setSelectedProvider,
        setSelectedModel,
        setApiKey,
        toggleApiKeyVisible,
        saveAiConfig,

        // Functions — Trading mode
        requestModeChange,
        confirmLiveMode,
        cancelModeChange,

        // Functions — Risk
        setStopLoss,
        setMaxDrawdown,
        setDefaultTradeSize,
        setMaxPositionPercent,
        saveRiskControls,

        // Functions — Buying power
        setWalletBalance,
        setBuyingPowerEditOpen,
        saveBuyingPower,

        // Functions — Danger zone
        setResetConfirmInput: setResetConfirmInput,
        resetAllSettings,
    };
}
