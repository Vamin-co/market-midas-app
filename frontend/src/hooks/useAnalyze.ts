"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';

export interface Suggestion {
    symbol: string;
    name: string;
}

export function useAnalyze() {
    const { runData, setRunData, executionMode, setExecutionMode, isAuthenticated } = useAppContext();

    const [tickerInput, setTickerInput] = useState("");
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [ignoreNextSearch, setIgnoreNextSearch] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

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

        try {
            const res = await fetch("http://localhost:8000/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticker: tickerInput.toUpperCase(), mode: executionMode }),
            });

            if (!res.ok) {
                throw new Error("Target asset unverified or execution engine offline.");
            }

            const data = await res.json();
            setRunData(data); // State remains here for Analysis Results view

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Execution error.");
        } finally {
            setIsGenerating(false);
        }
    }, [tickerInput, executionMode, setRunData]);

    const openDropdownOnFocus = useCallback(() => {
        if (tickerInput.trim()) setIsDropdownOpen(true);
    }, [tickerInput]);

    const clearRunData = useCallback(() => {
        setRunData(null);
        setTickerInput("");
    }, [setRunData, setTickerInput]);

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
