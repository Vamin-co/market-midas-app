"use client";

import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';

export function useDashboard() {
    const { runData, executionMode } = useAppContext();
    const router = useRouter();

    const hasData = !!runData;

    // Destructure with fallback for when runData exists
    const ticker = (runData as any)?.ticker;
    const confidence = (runData as any)?.confidence;
    const zone = (runData as any)?.zone;
    const technicals = runData?.technicals;
    const sentiment = runData?.sentiment;
    const status = runData?.status;

    const isMarginal = zone === 'MARGINAL';

    return {
        hasData,
        ticker,
        confidence,
        zone,
        technicals,
        sentiment,
        status,
        executionMode,
        isMarginal,
    };
}
