"use client";

import { useState, useCallback } from 'react';

export function useTradeCard() {
    const [showPopover, setShowPopover] = useState(false);

    const handleAbortClick = useCallback(() => {
        setShowPopover(true);
    }, []);

    const handleIntentCapture = useCallback((intent: string, onAbort: (intent: string) => void) => {
        setShowPopover(false);
        onAbort(intent);
    }, []);

    const closePopover = useCallback(() => {
        setShowPopover(false);
    }, []);

    return {
        showPopover,
        handleAbortClick,
        handleIntentCapture,
        closePopover,
    };
}
