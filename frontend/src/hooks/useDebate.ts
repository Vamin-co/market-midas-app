"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';

export type ExecStatus = 'IDLE' | 'EXECUTING' | 'SUCCESS' | 'ERROR';

export function useDebate() {
    const { runData } = useAppContext();
    const router = useRouter();

    const [isGenerating, setIsGenerating] = useState(true);
    const [execStatus, setExecStatus] = useState<ExecStatus>('IDLE');
    const [execMessage, setExecMessage] = useState('');
    const abortControllerRef = useRef<AbortController | null>(null);

    const [isBullStreaming, setIsBullStreaming] = useState(false);
    const [bullStreamedText, setBullStreamedText] = useState('');

    const [isBearStreaming, setIsBearStreaming] = useState(false);
    const [bearStreamedText, setBearStreamedText] = useState('');

    const [debateComplete, setDebateComplete] = useState(false);

    useEffect(() => {
        if (!runData) {
            router.push('/');
            return;
        }
        // Simulate Agentic Processing State
        const timer = setTimeout(() => {
            setIsGenerating(false);
        }, 3000);
        return () => clearTimeout(timer);
    }, [runData, router]);

    // Streaming Simulation
    useEffect(() => {
        const bullText = (runData as any)?.debate?.bull_argument;
        const bearText = (runData as any)?.debate?.bear_argument;

        if (isGenerating || !bullText || !bearText) return;

        let isCancelled = false;

        const runStreams = async () => {
            setIsBullStreaming(false);
            setBullStreamedText('');
            setIsBearStreaming(false);
            setBearStreamedText('');
            setDebateComplete(false);

            const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

            setIsBullStreaming(true);

            // Stream Bull
            for (let i = 1; i <= bullText.length; i += 3) {
                if (isCancelled) return;
                setBullStreamedText(bullText.substring(0, i));
                await delay(10); // Fast typing
            }
            if (isCancelled) return;
            setBullStreamedText(bullText);
            setIsBullStreaming(false);

            await delay(600); // Dramatic pause between agents

            if (isCancelled) return;

            setIsBearStreaming(true);

            // Stream Bear
            for (let i = 1; i <= bearText.length; i += 3) {
                if (isCancelled) return;
                setBearStreamedText(bearText.substring(0, i));
                await delay(10);
            }
            if (isCancelled) return;
            setBearStreamedText(bearText);
            setIsBearStreaming(false);

            setDebateComplete(true);
        };

        runStreams();

        return () => {
            isCancelled = true;
        };
    }, [isGenerating, runData]);

    // Keyboard-First Safety Interlocks
    const handleAbort = useCallback(() => {
        console.warn('Execution ABORTED via Kill-Switch (Escape)');
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;

        setExecStatus('ERROR');
        setExecMessage('Execution aborted by supervisor.');

        // Clear streaming state
        setIsBullStreaming(false);
        setIsBearStreaming(false);
        setDebateComplete(false);

        // Navigate back to / with ticker preserved
        const currentTicker = runData?.ticker || '';
        if (currentTicker && currentTicker !== '...') {
            router.push(`/?ticker=${currentTicker}`);
        } else {
            router.push('/');
        }
    }, [runData, router]);

    const handleConfirm = useCallback(async () => {
        if (execStatus === 'EXECUTING' || execStatus === 'SUCCESS') return;
        if (!runData) return;
        setExecStatus('EXECUTING');

        abortControllerRef.current = new AbortController();

        try {
            const res = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: runData.status?.action, ticker: runData.ticker, quantity: 10, price: runData.technicals?.price }),
                signal: abortControllerRef.current.signal
            });
            const result = await res.json();
            if (result.success) {
                setExecStatus('SUCCESS');
                setExecMessage('Order filled via Playwright.');
            } else {
                setExecStatus('ERROR');
                setExecMessage(result.error || 'Execution failed.');
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                return; // Abort already handled
            }
            setExecStatus('ERROR');
            setExecMessage('Network error.');
        } finally {
            abortControllerRef.current = null;
        }
    }, [execStatus, runData]);

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

    const ticker = runData?.ticker || '...';
    const tech = runData?.technicals || {} as any;
    const sent = runData?.sentiment || { score: 0, sources: [] };
    const debate = (runData as any)?.debate || {} as any;
    const sources = sent.sources || [];

    return {
        // State
        isGenerating,
        execStatus,
        execMessage,
        ticker,
        tech,
        sent,
        debate,
        sources,
        runData,

        // Streaming State
        isBullStreaming,
        bullStreamedText,
        isBearStreaming,
        bearStreamedText,
        debateComplete,

        // Handlers
        handleAbort,
        handleConfirm,
    };
}
