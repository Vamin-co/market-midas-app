"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { API_BASE_URL } from '@/lib/api';

// ════════════════════════════════════════════════════════════════
// Route & Onboarding Types (Phase 2 — unchanged)
// ════════════════════════════════════════════════════════════════

export type AppRoute = "ONBOARDING" | "COMMAND_CENTER" | "DASHBOARD" | "DEBATE_ARENA";
export type OnboardingStep = "WELCOME" | "API_KEY" | "COMPLIANCE" | "COMPLETED";

export interface DebateArgument {
    claim?: string;
    evidence?: string;
}

export interface AnalysisStreamState {
    ticker: string | null;
    phase: 'IDLE' | 'CONNECTING' | 'ANALYSIS' | 'TECHNICALS' | 'SENTIMENT' | 'BULL' | 'BEAR' | 'VERDICT' | 'COMPLETE' | 'ERROR';
    bullText: string;
    bearText: string;
    bullScore: number;
    bearScore: number;
    winner: "BULL" | "BEAR" | "DRAW" | "NONE";
    recommendation: string;
    isStreaming: boolean;
    isBullStreaming: boolean;
    isBearStreaming: boolean;
    error: string | null;
}

// ════════════════════════════════════════════════════════════════
// Run Data Types (Phase 2 — extended with risk block)
// ════════════════════════════════════════════════════════════════

export interface RunData {
    ticker: string;
    company_name?: string;
    technicals: {
        rsi: number | null;
        sma_50: number | null;
        price: number;
    };
    sentiment: {
        score: number;
        sources: Array<{ title: string; url: string; source: string }>;
    };
    debate: {
        bull_argument: string;
        bear_argument: string;
        bull_score: number;
        bear_score: number;
        winner: "BULL" | "BEAR" | "DRAW" | "NONE";
    };
    risk?: {
        recommended_dollars: number;
        recommended_shares: number;
        position_pct: number;
        max_position_pct: number;
        wallet_balance: number;
        stop_loss: number;
    };
    state?: string;
    reason?: string;
    message?: string;
    cache_age_days?: number | null;
    using_cached_data?: boolean;
    market_status?: {
        status: string;
        label: string;
        next_event: string;
        is_trading_day: boolean;
    };
    quant?: {
        daily_change_percent: number | null;
        fifty_two_week_high: number | null;
        fifty_two_week_low: number | null;
        volume_24h: number | null;
        avg_volume_10d: number | null;
        market_cap: number | null;
        next_earnings_date: string | null;
    };
    status?: {
        awaiting_human_approval: boolean;
        action: string;
    };
}

// ════════════════════════════════════════════════════════════════
// Phase 3: Trade Tracker Types
// ════════════════════════════════════════════════════════════════

export type TradeStatus = "open" | "closed" | "closed_manual_override";

export interface PaperTrade {
    id: string;
    timestamp: string;
    action: "BUY" | "SELL";
    ticker: string;
    quantity: number;
    price: number;
    dollar_amount: number;
    mode: "paper" | "live";
    status: TradeStatus;
    pnl?: number;
    closedAt?: string;
    exitPrice?: number;
}

// ════════════════════════════════════════════════════════════════
// Phase 4/6: Alerts Types
// ════════════════════════════════════════════════════════════════

export interface Alert {
    id: string;
    ticker: string;
    type: "stop_loss" | "price_target";
    threshold: number;
    thresholdPrice: number;
    entryPrice: number;
    active: boolean;
    triggered: boolean;
    createdAt?: string;
}

export type TrackerTrade = PaperTrade;

export interface TrackerSnapshot {
    walletBalance: number;
    startingBalance: number;
    totalInvested: number;
    realizedPnl: number;
    openPositions: TrackerTrade[];
    closedPositions: TrackerTrade[];
    totalClosedCount: number;
}

export interface UserPreferences {
    walletBalance: number;
    defaultTradeSize: number;
    maxPositionPercent: number;
    alertThreshold: number;
    maxDailyDrawdown: number;
    stopLossThreshold: number;
    apiKey: string;
    apiKeySet: boolean;
    provider: string;
    model: string;
    mode: 'paper' | 'live';
}

const DEFAULT_PREFERENCES: UserPreferences = {
    walletBalance: 100_000,
    defaultTradeSize: 1_000,
    maxPositionPercent: 0.25,
    alertThreshold: 5,
    maxDailyDrawdown: 5,
    stopLossThreshold: 5,
    apiKey: "",
    apiKeySet: false,
    provider: "openai",
    model: "gpt-5-mini",
    mode: "paper",
};

// ════════════════════════════════════════════════════════════════
// Context Type
// ════════════════════════════════════════════════════════════════

interface AppContextType {
    // Phase 2
    currentRoute: AppRoute;
    setCurrentRoute: (route: AppRoute) => void;
    onboardingStep: OnboardingStep;
    setOnboardingStep: (step: OnboardingStep) => void;
    apiKey: string;
    setApiKey: (key: string) => void;
    complianceAccepted: boolean;
    setComplianceAccepted: (accepted: boolean) => void;
    runData: RunData | null;
    setRunData: (data: RunData | null) => void;
    analysisStream: AnalysisStreamState;
    setAnalysisStream: React.Dispatch<React.SetStateAction<AnalysisStreamState>>;
    resetAnalysisStream: () => void;
    executionMode: "PAPER" | "LIVE";
    setExecutionMode: (mode: "PAPER" | "LIVE") => void;
    isAuthenticated: boolean;
    setIsAuthenticated: (auth: boolean) => void;

    // Phase 3: Tracker
    trackerData: TrackerSnapshot | null;
    refreshTracker: (options?: { closedPage?: number; closedPerPage?: number }) => Promise<void>;

    // Phase 3: Settings (server-backed)
    userPreferences: UserPreferences;
    refreshPreferences: () => Promise<void>;
    updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;

    // Phase 4/6: Alerts
    alerts: Alert[];
    fetchAlerts: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_ANALYSIS_STREAM: AnalysisStreamState = {
    ticker: null,
    phase: 'IDLE',
    bullText: '',
    bearText: '',
    bullScore: 0,
    bearScore: 0,
    winner: 'NONE',
    recommendation: '',
    isStreaming: false,
    isBullStreaming: false,
    isBearStreaming: false,
    error: null,
};

// ════════════════════════════════════════════════════════════════
// Provider
// ════════════════════════════════════════════════════════════════

export function AppProvider({ children }: { children: ReactNode }) {
    // Phase 2 state
    const [currentRoute, setCurrentRoute] = useState<AppRoute>("ONBOARDING");
    const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("WELCOME");
    const [apiKey, setApiKey] = useState("");
    const [complianceAccepted, setComplianceAccepted] = useState(false);
    const [runData, setRunData] = useState<RunData | null>(null);
    const [analysisStream, setAnalysisStream] = useState<AnalysisStreamState>(DEFAULT_ANALYSIS_STREAM);
    const [executionMode, setExecutionMode] = useState<"PAPER" | "LIVE">("PAPER");
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Phase 3 state
    const [trackerData, setTrackerData] = useState<TrackerSnapshot | null>(null);
    const [userPreferences, setUserPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

    // Phase 6 state
    const [alerts, setAlerts] = useState<Alert[]>([]);

    const resetAnalysisStream = useCallback(() => {
        setAnalysisStream(DEFAULT_ANALYSIS_STREAM);
    }, []);

    // ── Settings (server-backed) ──

    const refreshPreferences = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/settings`);
            if (res.ok) {
                const data = await res.json();
                const modeValue = data.mode === 'live' ? 'live' : 'paper';
                setUserPreferences({
                    walletBalance: data.walletBalance ?? DEFAULT_PREFERENCES.walletBalance,
                    defaultTradeSize: data.defaultTradeSize ?? DEFAULT_PREFERENCES.defaultTradeSize,
                    maxPositionPercent: data.maxPositionPercent ?? DEFAULT_PREFERENCES.maxPositionPercent,
                    alertThreshold: data.alertThreshold ?? DEFAULT_PREFERENCES.alertThreshold,
                    maxDailyDrawdown: data.maxDailyDrawdown ?? DEFAULT_PREFERENCES.maxDailyDrawdown,
                    stopLossThreshold: data.stopLossThreshold ?? DEFAULT_PREFERENCES.stopLossThreshold,
                    apiKey: data.apiKey ?? "",
                    apiKeySet: data.apiKeySet ?? false,
                    provider: data.provider ?? DEFAULT_PREFERENCES.provider,
                    model: data.model ?? DEFAULT_PREFERENCES.model,
                    mode: modeValue,
                });
                setExecutionMode(modeValue === 'live' ? 'LIVE' : 'PAPER');
            }
        } catch (err) {
            console.error("Failed to fetch settings:", err);
        }
    }, []);

    const updatePreferences = useCallback(async (prefs: Partial<UserPreferences>) => {
        try {
            // Merge with current to send a full payload
            const payload = {
                walletBalance: prefs.walletBalance ?? userPreferences.walletBalance,
                defaultTradeSize: prefs.defaultTradeSize ?? userPreferences.defaultTradeSize,
                maxPositionPercent: prefs.maxPositionPercent ?? userPreferences.maxPositionPercent,
                alertThreshold: prefs.alertThreshold ?? userPreferences.alertThreshold,
                maxDailyDrawdown: prefs.maxDailyDrawdown ?? userPreferences.maxDailyDrawdown,
                stopLossThreshold: prefs.stopLossThreshold ?? userPreferences.stopLossThreshold,
                apiKey: prefs.apiKey ?? userPreferences.apiKey,
                provider: prefs.provider ?? userPreferences.provider,
                model: prefs.model ?? userPreferences.model,
                mode: prefs.mode ?? userPreferences.mode,
            };
            const res = await fetch(`${API_BASE_URL}/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                await refreshPreferences();
            }
        } catch (err) {
            console.error("Failed to save settings:", err);
        }
    }, [userPreferences, refreshPreferences]);

    // ── Tracker ──

    const refreshTracker = useCallback(async (options?: { closedPage?: number; closedPerPage?: number }) => {
        try {
            const params = new URLSearchParams({
                mode: userPreferences.mode,
                closed_page: String(options?.closedPage ?? 1),
                closed_per_page: String(options?.closedPerPage ?? 10),
            });
            const res = await fetch(`${API_BASE_URL}/portfolio?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setTrackerData(data);
            }
        } catch (err) {
            console.error("Failed to fetch tracker data:", err);
        }
    }, [userPreferences.mode]);

    // ── Alerts ──

    const fetchAlerts = useCallback(async () => {
        try {
            const res = await fetch("/api/alerts");
            if (res.ok) {
                const data = await res.json();
                setAlerts(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Failed to fetch alerts:", err);
        }
    }, []);

    // ── Hydrate on mount ──

    useEffect(() => {
        refreshPreferences();
        fetchAlerts();
    }, [refreshPreferences, fetchAlerts]);

    useEffect(() => {
        if (userPreferences.walletBalance > 0) {
            refreshTracker();
        }
    }, [userPreferences.walletBalance, refreshTracker]);

    return (
        <AppContext.Provider value={{
            currentRoute, setCurrentRoute,
            onboardingStep, setOnboardingStep,
            apiKey, setApiKey,
            complianceAccepted, setComplianceAccepted,
            runData, setRunData,
            analysisStream, setAnalysisStream, resetAnalysisStream,
            executionMode, setExecutionMode,
            isAuthenticated, setIsAuthenticated,
            trackerData, refreshTracker,
            userPreferences, refreshPreferences, updatePreferences,
            alerts, fetchAlerts,
        }}>
            {children}
        </AppContext.Provider>
    );
}

export function useAppContext() {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error("useAppContext must be used within an AppProvider");
    }
    return context;
}
