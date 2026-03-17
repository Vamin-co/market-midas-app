"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface Suggestion {
    symbol: string;
    name: string;
}

export function useAnalyze() {
    const {
        runData,
        setRunData,
        setAnalysisStream,
        resetAnalysisStream,
        executionMode,
        setExecutionMode,
        isAuthenticated,
        userPreferences,
    } = useAppContext();

    const [tickerInput, setTickerInput] = useState("");
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [ignoreNextSearch, setIgnoreNextSearch] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    // Cache to prevent duplicate API requests
    const searchCache = useRef<Record<string, Suggestion[]>>({});

    // Dynamic search effect
    useEffect(() => {
        if (ignoreNextSearch) {
            setIgnoreNextSearch(false);
            return;
        }

        const timeoutId = setTimeout(async () => {
            const queryRaw = tickerInput.trim();
            if (!queryRaw) {
                setSuggestions([]);
                setIsDropdownOpen(false);
                return;
            }

            const query = queryRaw.toLowerCase();

            // Check cache first to avoid hitting API limits
            if (searchCache.current[query]) {
                setSuggestions(searchCache.current[query]);
                setIsDropdownOpen(searchCache.current[query].length > 0);
                return;
            }

            setIsSearching(true);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(queryRaw)}`);
                if (res.ok) {
                    const data = await res.json();
                    searchCache.current[query] = data; // Save to cache
                    setSuggestions(data);
                    setIsDropdownOpen(data.length > 0);
                }
            } catch (err) {
                console.error("Search fetch error", err);
            } finally {
                setIsSearching(false);
            }
        }, 500); // Increased debounce to 500ms for better rate limiting

        return () => clearTimeout(timeoutId);
    }, [tickerInput, ignoreNextSearch]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        return () => {
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
        };
    }, []);

    const handleSelectSuggestion = useCallback((symbol: string) => {
        setIgnoreNextSearch(true);
        setTickerInput(symbol);
        setIsDropdownOpen(false);
    }, []);

    const handleGenerate = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!tickerInput.trim()) return;

        setIsGenerating(true);
        setError(null);
        setIsDropdownOpen(false);
        setRunData(null);
        resetAnalysisStream();
        eventSourceRef.current?.close();

        try {
            const params = new URLSearchParams({
                ticker: tickerInput.toUpperCase(),
                mode: executionMode,
                wallet_balance: String(userPreferences.walletBalance),
            });
            const eventSource = new EventSource(`${API_BASE_URL}/analyze/stream?${params.toString()}`);
            eventSourceRef.current = eventSource;
            let didComplete = false;

            setAnalysisStream({
                ticker: tickerInput.toUpperCase(),
                phase: 'CONNECTING',
                bullText: '',
                bearText: '',
                bullScore: 0,
                bearScore: 0,
                winner: 'NONE',
                recommendation: '',
                isStreaming: true,
                isBullStreaming: false,
                isBearStreaming: false,
                error: null,
            });

            eventSource.addEventListener('status', ((rawEvent: Event) => {
                const event = rawEvent as MessageEvent<string>;
                const data = JSON.parse(event.data);
                setAnalysisStream((current) => ({
                    ...current,
                    ticker: data.ticker || current.ticker,
                    phase: data.phase === 'analysis_started' ? 'ANALYSIS' : current.phase,
                    isStreaming: true,
                    error: null,
                }));
            }) as EventListener);

            eventSource.addEventListener('technicals', ((rawEvent: Event) => {
                const event = rawEvent as MessageEvent<string>;
                JSON.parse(event.data);
                setAnalysisStream((current) => ({
                    ...current,
                    phase: 'TECHNICALS',
                    isStreaming: true,
                }));
            }) as EventListener);

            eventSource.addEventListener('sentiment', ((rawEvent: Event) => {
                const event = rawEvent as MessageEvent<string>;
                JSON.parse(event.data);
                setAnalysisStream((current) => ({
                    ...current,
                    phase: 'SENTIMENT',
                    isStreaming: true,
                }));
            }) as EventListener);

            eventSource.addEventListener('bull_turn', ((rawEvent: Event) => {
                const event = rawEvent as MessageEvent<string>;
                const data = JSON.parse(event.data);
                setAnalysisStream((current) => ({
                    ...current,
                    phase: 'BULL',
                    bullText: data.text || '',
                    bullScore: data.score || 0,
                    isStreaming: true,
                    isBullStreaming: false,
                    isBearStreaming: true,
                }));
            }) as EventListener);

            eventSource.addEventListener('bear_turn', ((rawEvent: Event) => {
                const event = rawEvent as MessageEvent<string>;
                const data = JSON.parse(event.data);
                setAnalysisStream((current) => ({
                    ...current,
                    phase: 'BEAR',
                    bearText: data.text || '',
                    bearScore: data.score || 0,
                    isStreaming: true,
                    isBullStreaming: false,
                    isBearStreaming: false,
                }));
            }) as EventListener);

            eventSource.addEventListener('verdict', ((rawEvent: Event) => {
                const event = rawEvent as MessageEvent<string>;
                const data = JSON.parse(event.data);
                setAnalysisStream((current) => ({
                    ...current,
                    phase: 'VERDICT',
                    winner: data.winner || 'NONE',
                    recommendation: data.recommendation || '',
                    bullScore: data.bull_score ?? current.bullScore,
                    bearScore: data.bear_score ?? current.bearScore,
                }));
            }) as EventListener);

            eventSource.addEventListener('result', ((rawEvent: Event) => {
                const event = rawEvent as MessageEvent<string>;
                const data = JSON.parse(event.data);
                didComplete = true;
                setRunData(data);
                setAnalysisStream((current) => ({
                    ...current,
                    ticker: data.ticker || current.ticker,
                    phase: 'COMPLETE',
                    isStreaming: false,
                    isBullStreaming: false,
                    isBearStreaming: false,
                    winner: data.debate?.winner || current.winner,
                    bullText: data.debate?.bull_argument || current.bullText,
                    bearText: data.debate?.bear_argument || current.bearText,
                    bullScore: data.debate?.bull_score ?? current.bullScore,
                    bearScore: data.debate?.bear_score ?? current.bearScore,
                }));
                setIsGenerating(false);
                eventSource.close();
                eventSourceRef.current = null;
            }) as EventListener);

            eventSource.addEventListener('error', ((rawEvent: Event) => {
                const event = rawEvent as MessageEvent<string>;
                let message = 'Execution error.';
                if (event.data) {
                    try {
                        const data = JSON.parse(event.data);
                        message = data.message || message;
                    } catch {
                        message = 'Execution error.';
                    }
                }
                setError(message);
                setAnalysisStream((current) => ({
                    ...current,
                    phase: 'ERROR',
                    isStreaming: false,
                    isBullStreaming: false,
                    isBearStreaming: false,
                    error: message,
                }));
                setIsGenerating(false);
                eventSource.close();
                eventSourceRef.current = null;
            }) as EventListener);

            eventSource.onerror = () => {
                if (eventSource.readyState === EventSource.CLOSED && !didComplete) {
                    setError("Target asset unverified or execution engine offline.");
                    setAnalysisStream((current) => ({
                        ...current,
                        phase: 'ERROR',
                        isStreaming: false,
                        isBullStreaming: false,
                        isBearStreaming: false,
                        error: "Target asset unverified or execution engine offline.",
                    }));
                    setIsGenerating(false);
                    eventSourceRef.current = null;
                }
            };
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Execution error.");
            setAnalysisStream((current) => ({
                ...current,
                phase: 'ERROR',
                isStreaming: false,
                isBullStreaming: false,
                isBearStreaming: false,
                error: err.message || "Execution error.",
            }));
            setIsGenerating(false);
        }
    }, [
        tickerInput,
        executionMode,
        userPreferences.walletBalance,
        setRunData,
        setAnalysisStream,
        resetAnalysisStream,
    ]);

    const openDropdownOnFocus = useCallback(() => {
        if (tickerInput.trim()) setIsDropdownOpen(true);
    }, [tickerInput]);

    const clearRunData = useCallback(() => {
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        setRunData(null);
        resetAnalysisStream();
        setTickerInput("");
    }, [setRunData, setTickerInput, resetAnalysisStream]);

    return {
        // State
        runData,
        tickerInput,
        setTickerInput,
        suggestions,
        isDropdownOpen,
        isGenerating,
        error,
        isSearching,
        executionMode,
        setExecutionMode,
        isAuthenticated,
        wrapperRef,

        // Handlers
        handleSelectSuggestion,
        handleGenerate,
        openDropdownOnFocus,
        clearRunData,
    };
}
