"use client";

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';

export type ExecStatus = 'IDLE' | 'EXECUTING' | 'SUCCESS' | 'ERROR';

export function useDebate() {
    const { runData, analysisStream, resetAnalysisStream } = useAppContext();
    const router = useRouter();

    useEffect(() => {
        if (!runData && !analysisStream.ticker) {
            router.push('/');
        }
    }, [runData, analysisStream.ticker, router]);

    // Keyboard-First Safety Interlocks
    const handleAbort = useCallback(() => {
        const currentTicker = runData?.ticker || '';
        resetAnalysisStream();
        if (currentTicker && currentTicker !== '...') {
            router.push(`/?ticker=${currentTicker}`);
        } else {
            router.push('/');
        }
    }, [runData, resetAnalysisStream, router]);

    const handleConfirm = useCallback(async () => {
        return;
    }, []);

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

    const ticker = runData?.ticker || analysisStream.ticker || '...';
    const tech = runData?.technicals || {} as any;
    const sent = runData?.sentiment || { score: 0, sources: [] };
    const debate = (runData as any)?.debate || {} as any;
    const sources = sent.sources || [];
    const bullStreamedText = analysisStream.bullText || debate?.bull_argument || '';
    const bearStreamedText = analysisStream.bearText || debate?.bear_argument || '';
    const isGenerating = analysisStream.isStreaming && !runData;
    const isBullStreaming = analysisStream.isBullStreaming;
    const isBearStreaming = analysisStream.isBearStreaming;
    const debateComplete = Boolean(
        analysisStream.phase === 'COMPLETE'
        || debate?.winner === 'BULL'
        || debate?.winner === 'BEAR'
        || debate?.winner === 'DRAW'
    );

    return {
        // State
        isGenerating,
        execStatus: 'IDLE' as ExecStatus,
        execMessage: '',
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
