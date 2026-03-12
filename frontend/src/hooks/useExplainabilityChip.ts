"use client";

import { useState, useCallback } from 'react';

export function useExplainabilityChip() {
    const [isOpen, setIsOpen] = useState(false);

    const handleMouseEnter = useCallback(() => {
        setIsOpen(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsOpen(false);
    }, []);

    const handleClick = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    return {
        isOpen,
        handleMouseEnter,
        handleMouseLeave,
        handleClick,
    };
}
