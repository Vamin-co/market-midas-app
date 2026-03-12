"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';

export interface AppAlert {
    id: string;
    ticker: string;
    type: 'STOP LOSS' | 'PRICE TARGET';
    thresholdPrice: number;
    thresholdPercentage?: number;
    isActive: boolean;
    isTriggered: boolean;
    initialPrice: number;
}

export function useAlerts() {
    const { trackerData } = useAppContext();
    const [alerts, setAlerts] = useState<AppAlert[]>([]);
    const [livePrices, setLivePrices] = useState<Record<string, { price: number }>>({});

    // Load from local storage on mount
    useEffect(() => {
        const stored = localStorage.getItem('mm_alerts');
        if (stored) {
            try {
                setAlerts(JSON.parse(stored));
            } catch {
                setAlerts([]);
            }
        } else {
            // Seed a mock alert if empty just to show UI if preferred, but empty state is requested.
            setAlerts([]);
        }
    }, []);

    // Save to local storage on change
    useEffect(() => {
        localStorage.setItem('mm_alerts', JSON.stringify(alerts));
    }, [alerts]);

    const pollPrices = useCallback(async () => {
        if (alerts.length === 0) return;
        const tickers = [...new Set(alerts.map(a => a.ticker))].join(',');
        try {
            const res = await fetch(`http://localhost:8000/prices?tickers=${tickers}`);
            if (res.ok) {
                const data = await res.json();
                setLivePrices(data);

                // Auto-trigger alerts that cross threshold
                setAlerts(prev => prev.map(alert => {
                    if (alert.isTriggered || !alert.isActive) return alert;

                    const priceData = data[alert.ticker];
                    if (!priceData || !priceData.price) return alert;

                    const current = priceData.price;
                    let triggered = false;

                    if (alert.type === 'STOP LOSS' && current <= alert.thresholdPrice) {
                        triggered = true;
                    } else if (alert.type === 'PRICE TARGET' && current >= alert.thresholdPrice) {
                        triggered = true;
                    }

                    if (triggered) {
                        return { ...alert, isTriggered: true, isActive: false };
                    }
                    return alert;
                }));
            }
        } catch { /* silent fail for polling */ }
    }, [alerts]);

    useEffect(() => {
        pollPrices();
        const interval = setInterval(pollPrices, 60_000);
        return () => clearInterval(interval);
    }, [pollPrices]);

    const toggleAlert = useCallback((id: string) => {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
    }, []);

    const deleteAlert = useCallback((id: string) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
    }, []);

    const addAlert = useCallback((alert: Omit<AppAlert, 'id' | 'isTriggered'>) => {
        const newAlert: AppAlert = {
            ...alert,
            id: Math.random().toString(36).substr(2, 9),
            isTriggered: false
        };
        setAlerts(prev => [...prev, newAlert]);
    }, []);

    return {
        alerts,
        livePrices,
        toggleAlert,
        deleteAlert,
        addAlert
    };
}
