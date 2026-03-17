"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAppContext, TrackerTrade } from '@/context/AppContext';
import { API_BASE_URL } from '@/lib/api';

export function useTradeTracker() {
    const { trackerData, refreshTracker, userPreferences, updatePreferences } = useAppContext();

    // Zone 1: Inline wallet edit
    const [isEditingBalance, setIsEditingBalance] = useState(false);
    const [editableBalance, setEditableBalance] = useState('');

    // Zone 2: Action states
    const [closingTradeId, setClosingTradeId] = useState<string | null>(null);
    const [markSoldTradeId, setMarkSoldTradeId] = useState<string | null>(null);
    const [markSoldPrice, setMarkSoldPrice] = useState('');
    const [manualPriceTradeId, setManualPriceTradeId] = useState<string | null>(null);
    const [manualPriceInput, setManualPriceInput] = useState('');
    const [actionError, setActionError] = useState<string | null>(null);

    // Zone 3: Pagination
    const [closedPage, setClosedPage] = useState(1);
    const closedPerPage = 10;

    // Live price polling (60-second interval)
    const [livePrices, setLivePrices] = useState<Record<string, { price: number; stale: boolean; timestamp?: string }>>({});

    const pollPrices = useCallback(async () => {
        if (!trackerData?.openPositions.length) return;
        const tickers = [...new Set(trackerData.openPositions.map(t => t.ticker))].join(',');
        try {
            const res = await fetch(`${API_BASE_URL}/prices?tickers=${tickers}`);
            if (res.ok) {
                setLivePrices(await res.json());
            }
        } catch { /* silent fail for polling */ }
    }, [trackerData?.openPositions]);

    useEffect(() => {
        pollPrices();
        const interval = setInterval(pollPrices, 60_000);
        return () => clearInterval(interval);
    }, [pollPrices]);

    // Refetch with pagination changes
    useEffect(() => {
        refreshTracker({ closedPage, closedPerPage });
    }, [closedPage, closedPerPage, refreshTracker]);

    // ── Handlers ──

    const handleBalanceSave = useCallback(async () => {
        const val = parseFloat(editableBalance);
        if (!isNaN(val) && val >= 0) {
            await updatePreferences({ walletBalance: val });
            await refreshTracker({ closedPage, closedPerPage });
        }
        setIsEditingBalance(false);
    }, [editableBalance, updatePreferences, refreshTracker, closedPage, closedPerPage]);

    const startEditingBalance = useCallback(() => {
        if (trackerData) {
            setEditableBalance(trackerData.walletBalance.toString());
            setIsEditingBalance(true);
        }
    }, [trackerData]);

    const cancelEditingBalance = useCallback(() => {
        setIsEditingBalance(false);
    }, []);

    const handleClosePosition = useCallback(async (tradeId: string) => {
        setClosingTradeId(tradeId);
        setActionError(null);

        try {
            const res = await fetch(`${API_BASE_URL}/portfolio/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tradeId }),
            });

            const data = await res.json();

            if (res.status === 503 && data.error === 'PRICE_UNAVAILABLE') {
                // Fallback Waterfall Step 4: Prompt for manual price
                setManualPriceTradeId(tradeId);
                setClosingTradeId(null);
                return;
            }

            if (!res.ok) {
                setActionError(data.error || 'Failed to close position');
                setClosingTradeId(null);
                return;
            }

            await refreshTracker({ closedPage, closedPerPage });
        } catch {
            setActionError('Network error closing position');
        }
        setClosingTradeId(null);
    }, [refreshTracker, closedPage, closedPerPage]);

    const handleManualPriceSubmit = useCallback(async (tradeId: string) => {
        const price = parseFloat(manualPriceInput);
        if (isNaN(price) || price <= 0) {
            setActionError('Please enter a valid price');
            return;
        }
        setClosingTradeId(tradeId);
        try {
            const res = await fetch(`${API_BASE_URL}/portfolio/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tradeId, manualPrice: price }),
            });
            if (res.ok) {
                await refreshTracker({ closedPage, closedPerPage });
                setManualPriceTradeId(null);
                setManualPriceInput('');
            } else {
                const data = await res.json();
                setActionError(data.error || 'Failed to close position');
            }
        } catch {
            setActionError('Network error');
        }
        setClosingTradeId(null);
    }, [manualPriceInput, refreshTracker, closedPage, closedPerPage]);

    const handleMarkSold = useCallback(async (tradeId: string) => {
        const price = parseFloat(markSoldPrice);
        if (isNaN(price) || price <= 0) {
            setActionError('Please enter a valid sell price');
            return;
        }
        setClosingTradeId(tradeId);
        try {
            const res = await fetch(`${API_BASE_URL}/portfolio/mark-sold`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tradeId, sellPrice: price }),
            });
            if (res.ok) {
                await refreshTracker({ closedPage, closedPerPage });
                setMarkSoldTradeId(null);
                setMarkSoldPrice('');
            } else {
                const data = await res.json();
                setActionError(data.error || 'Failed to mark as sold');
            }
        } catch {
            setActionError('Network error');
        }
        setClosingTradeId(null);
    }, [markSoldPrice, refreshTracker, closedPage, closedPerPage]);

    const cancelManualPrice = useCallback(() => {
        setManualPriceTradeId(null);
        setManualPriceInput('');
    }, []);

    const startMarkSold = useCallback((tradeId: string) => {
        setMarkSoldTradeId(tradeId);
    }, []);

    const cancelMarkSold = useCallback(() => {
        setMarkSoldTradeId(null);
        setMarkSoldPrice('');
    }, []);

    const dismissError = useCallback(() => {
        setActionError(null);
    }, []);

    // ── Computed Values ──

    const formatCurrency = useCallback((val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    }, []);

    const formatPnl = useCallback((val: number) => {
        const formatted = formatCurrency(Math.abs(val));
        return val >= 0 ? `+${formatted}` : `-${formatted}`;
    }, [formatCurrency]);

    const getUnrealizedPnl = useCallback((trade: TrackerTrade) => {
        const liveData = livePrices[trade.ticker];
        if (!liveData?.price) return null;
        return Math.round((liveData.price - trade.price) * trade.quantity * 100) / 100;
    }, [livePrices]);

    const hasData = !!trackerData;
    const totalPages = trackerData ? Math.ceil(trackerData.totalClosedCount / closedPerPage) : 0;

    return {
        // Data
        trackerData,
        hasData,
        livePrices,

        // Balance editing
        isEditingBalance,
        editableBalance,
        setEditableBalance,
        handleBalanceSave,
        startEditingBalance,
        cancelEditingBalance,

        // Trade actions
        closingTradeId,
        markSoldTradeId,
        markSoldPrice,
        setMarkSoldPrice,
        manualPriceTradeId,
        manualPriceInput,
        setManualPriceInput,
        actionError,
        handleClosePosition,
        handleManualPriceSubmit,
        handleMarkSold,
        cancelManualPrice,
        startMarkSold,
        cancelMarkSold,
        dismissError,

        // Pagination
        closedPage,
        setClosedPage,
        closedPerPage,
        totalPages,

        // Formatters
        formatCurrency,
        formatPnl,
        getUnrealizedPnl,
    };
}
