"use client";

import React from 'react';
import { useExplainabilityChip } from '@/hooks/useExplainabilityChip';

interface ExplainabilityChipProps {
    label: string;
    explanation: React.ReactNode;
    counterfactual?: React.ReactNode;
}

export const ExplainabilityChip: React.FC<ExplainabilityChipProps> = ({ label, explanation, counterfactual }) => {
    const { isOpen, handleMouseEnter, handleMouseLeave, handleClick } = useExplainabilityChip();

    return (
        <div className="relative inline-block text-left">
            <button
                type="button"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
                aria-expanded={isOpen}
                className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-1 rounded border border-primary/20 uppercase transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
                {label}
            </button>

            {isOpen && (
                <div
                    role="tooltip"
                    className="absolute z-10 w-64 p-3 mt-2 -ml-2 opacity-0 animate-in fade-in slide-in-from-top-2 origin-top-left bg-background-light border border-charcoal/10 rounded-lg shadow-xl ring-1 ring-black/5"
                >
                    <div className="text-xs font-serif text-charcoal/80 leading-relaxed font-normal normal-case tracking-normal">
                        {explanation}
                        {counterfactual && (
                            <div className="mt-2 pt-2 border-t border-charcoal/10 text-[10px] font-sans text-charcoal/60 italic">
                                <span className="font-bold not-italic font-poppins text-primary uppercase text-[9px] block mb-0.5">Counterfactual</span>
                                {counterfactual}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
