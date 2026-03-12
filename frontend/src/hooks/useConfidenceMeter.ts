"use client";

import { useMemo } from 'react';

export function useConfidenceMeter(score: number) {
    // Circular variant: score → rotation math
    const rotation = useMemo(() => {
        return 45 + (180 * (score / 100)); // 45deg is flat left, to 225deg flat right
    }, [score]);

    return {
        rotation,
    };
}
