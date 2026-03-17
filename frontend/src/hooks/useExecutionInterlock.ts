"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { API_BASE_URL } from '@/lib/api';
import { useRouter } from 'next/navigation';

export function useExecutionInterlock(ticker: string, action: string = 'BUY') {
    const { runData, refreshTracker, userPreferences } = useAppContext();

    const [status, setStatus] = useState<'IDLE' | 'EXECUTING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [message, setMessage] = useState('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const router = useRouter();

    // Position sizing — editable, pre-filled with AI recommendation
    const riskData = runData?.risk;
    const currentPrice = runData?.technicals?.price || 0;
    const [positionDollars, setPositionDollars] = useState('');

    useEffect(() => {
        if (riskData?.recommended_dollars) {
            setPositionDollars(riskData.recommended_dollars.toFixed(2));
        }
    }, [riskData?.recommended_dollars]);

    const computedShares = useMemo(() => {
        const dollars = parseFloat(positionDollars);
        if (isNaN(dollars) || currentPrice <= 0) return 0;
        return Math.floor(dollars / currentPrice);
    }, [positionDollars, currentPrice]);

    const positionPct = useMemo(() => {
        const dollars = parseFloat(positionDollars);
        if (isNaN(dollars) || userPreferences.walletBalance <= 0) return 0;
        return (dollars / userPreferences.walletBalance) * 100;
    }, [positionDollars, userPreferences.walletBalance]);

    const maxPositionPct = userPreferences.maxPositionPercent * 100;
    const isOverCap = positionPct > maxPositionPct;
    const stopLoss = riskData?.stop_loss;

    const handleAbort = useCallback(() => {
        console.warn('Execution ABORTED via Kill-Switch');
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setStatus('ERROR');
        setMessage('Execution aborted by supervisor.');
        router.push('/');
    }, [router]);

    const handleConfirm = useCallback(async () => {
        if (status === 'EXECUTING' || status === 'SUCCESS') return;

        if (isOverCap) {
            setStatus('ERROR');
            setMessage(`Position size exceeds ${maxPositionPct}% cap. Reduce to continue.`);
            return;
        }

        setStatus('EXECUTING');
        abortControllerRef.current = new AbortController();

        try {
            const dollars = parseFloat(positionDollars);
            const res = await fetch(`${API_BASE_URL}/trade`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    ticker,
                    mode: userPreferences.mode.toUpperCase(),
                    quantity: computedShares,
                    price: currentPrice,
                    dollar_amount: dollars,
                }),
                signal: abortControllerRef.current.signal
            });
            const data = await res.json();
            if (res.ok && !data.detail) {
                setStatus('SUCCESS');
                setMessage('Trade executed successfully.');
                // Refresh tracker data
                await refreshTracker();
            } else {
                setStatus('ERROR');
                setMessage(data.detail || data.error || 'Execution failed.');
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                return; // Abort already handled
            }
            setStatus('ERROR');
            setMessage('Network error during broker connection.');
        } finally {
            abortControllerRef.current = null;
        }
    }, [
        action,
        ticker,
        status,
        positionDollars,
        computedShares,
        currentPrice,
        isOverCap,
        maxPositionPct,
        refreshTracker,
        userPreferences.mode,
    ]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                handleAbort();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleAbort]);

    return {
        status,
        message,
        riskData,
        currentPrice,
        positionDollars,
        setPositionDollars,
        computedShares,
        positionPct,
        isOverCap,
        stopLoss,
        handleAbort,
        handleConfirm,
    };
}
