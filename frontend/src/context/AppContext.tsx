"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ════════════════════════════════════════════════════════════════
// Route & Onboarding Types (Phase 2 — unchanged)
// ════════════════════════════════════════════════════════════════

export type AppRoute = "ONBOARDING" | "COMMAND_CENTER" | "DASHBOARD" | "DEBATE_ARENA";
export type OnboardingStep = "WELCOME" | "API_KEY" | "COMPLIANCE" | "COMPLETED";

export interface DebateArgument {
    claim?: string;
    evidence?: string;
}

// ════════════════════════════════════════════════════════════════
// Run Data Types (Phase 2 — extended with risk block)
// ════════════════════════════════════════════════════════════════

export interface RunData {
    ticker: string;
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
    status: {
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

export interface TrackerData {
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

export interface TrackerData {
    walletBalance: number;
    startingBalance: number;
    totalInvested: number;
    realizedPnl: number;
    openPositions: PaperTrade[];
    closedPositions: PaperTrade[];
    totalClosedCount: number;
}

export interface UserPreferences {
    walletBalance: number;
    defaultTradeSize: number;
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
    executionMode: "PAPER" | "LIVE";
    setExecutionMode: (mode: "PAPER" | "LIVE") => void;
    isAuthenticated: boolean;
    setIsAuthenticated: (auth: boolean) => void;

    // Phase 3: Tracker
    trackerData: TrackerData | null;
    refreshTracker: () => Promise<void>;

    // Phase 3: Settings (server-backed)
    userPreferences: UserPreferences;
    refreshPreferences: () => Promise<void>;
    updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;

    // Phase 4/6: Alerts
    alerts: Alert[];
    fetchAlerts: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const BACKEND_URL = "http://localhost:8000";

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
    const [executionMode, setExecutionMode] = useState<"PAPER" | "LIVE">("PAPER");
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Phase 3 state
    const [trackerData, setTrackerData] = useState<TrackerData | null>(null);
    const [userPreferences, setUserPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

    // Phase 6 state
    const [alerts, setAlerts] = useState<Alert[]>([]);

    // ── Settings (server-backed) ──

    const refreshPreferences = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/settings`);
            if (res.ok) {
                const data = await res.json();
                const modeValue = data.mode === 'live' ? 'live' : 'paper';
                setUserPreferences({
                    walletBalance: data.walletBalance ?? DEFAULT_PREFERENCES.walletBalance,
                    defaultTradeSize: data.defaultTradeSize ?? DEFAULT_PREFERENCES.defaultTradeSize,
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
                alertThreshold: prefs.alertThreshold ?? userPreferences.alertThreshold,
                maxDailyDrawdown: prefs.maxDailyDrawdown ?? userPreferences.maxDailyDrawdown,
                stopLossThreshold: prefs.stopLossThreshold ?? userPreferences.stopLossThreshold,
                apiKey: prefs.apiKey ?? userPreferences.apiKey,
                provider: prefs.provider ?? userPreferences.provider,
                model: prefs.model ?? userPreferences.model,
                mode: prefs.mode ?? userPreferences.mode,
            };
            const res = await fetch(`${BACKEND_URL}/settings`, {
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

    const refreshTracker = useCallback(async () => {
        try {
            const balance = userPreferences.walletBalance;
            const res = await fetch(`/api/ledger?balance=${balance}`);
            if (res.ok) {
                const data = await res.json();
                setTrackerData(data);
            }
        } catch (err) {
            console.error("Failed to fetch tracker data:", err);
        }
    }, [userPreferences.walletBalance]);

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
