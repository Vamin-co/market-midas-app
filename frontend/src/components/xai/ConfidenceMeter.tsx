import React, { useEffect, useState } from 'react';

interface ConfidenceMeterProps {
    score: number; // 0-100
    color?: string; // Optional hex or Tailwind class for the fill bar
}

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({ score, color = 'bg-[#CA8A04]' }) => {
    const [width, setWidth] = useState(0);

    useEffect(() => {
        // Trigger the animation on mount
        const timer = setTimeout(() => {
            setWidth(score);
        }, 10);
        return () => clearTimeout(timer);
    }, [score]);

    // Handle dynamic color injection cleanly
    const barClass = color.startsWith('bg-') ? color : '';
    const barStyle = !color.startsWith('bg-') ? { width: `${width}%`, backgroundColor: color } : { width: `${width}%` };

    return (
        <div className="w-full h-1 bg-[#1C1917]/8 rounded-full overflow-hidden flex-shrink-0">
            <div
                className={`h-full transition-all duration-600 ease-out ${barClass}`}
                style={barStyle}
            />
        </div>
    );
};
