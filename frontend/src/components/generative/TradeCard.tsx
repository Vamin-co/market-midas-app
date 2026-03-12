import React from 'react';
import { useTradeCard } from '@/hooks/useTradeCard';

interface TradeCardProps {
    ticker: string;
    action: string;
    onExecute: () => void;
    onAbort: (intent: string) => void;
}

export default function TradeCard({ ticker, action, onExecute, onAbort }: TradeCardProps) {
    const { showPopover, handleAbortClick, handleIntentCapture, closePopover } = useTradeCard();

    return (
        <article className="bg-[#1C1917] p-10 rounded-2xl shadow-sm border border-white/5 text-[#FAFAF9] relative flex flex-col gap-6 w-full max-w-2xl">
            <header className="flex justify-between items-center border-b border-white/10 pb-4">
                <h2 className="font-serif text-2xl font-bold flex items-center gap-3">
                    <span className="bg-[#CA8A04] text-[#1C1917] px-2 py-1 rounded text-xs tracking-widest uppercase">{action}</span>
                    {ticker}
                </h2>
                <span className="text-white/40 text-sm font-mono tracking-wider">AI RECOMMENDATION</span>
            </header>

            <div className="text-[#FAFAF9] font-light leading-relaxed">
                <p>Based on Anthropic reasoning and current market structure, executing this trade is structurally optimal with a 72% confidence threshold.</p>
            </div>

            <nav className="flex gap-4 mt-4 relative">
                <button
                    onClick={onExecute}
                    className="group relative overflow-hidden bg-[#27c93f] text-[#141210] px-8 py-3 rounded-md font-bold uppercase tracking-widest text-xs transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:scale-[1.03] active:scale-[0.98] flex items-center gap-2"
                >
                    <span>Execute</span>
                    <span className="opacity-60 text-[10px] ml-2 font-mono tracking-tighter">⌘ E</span>
                </button>

                <button
                    onClick={handleAbortClick}
                    className="group relative overflow-hidden border border-white/20 text-[#FAFAF9] px-8 py-3 rounded-md font-bold uppercase tracking-widest text-xs transition-transform duration-300 hover:border-white/40 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:scale-[1.03] active:scale-[0.98] flex items-center gap-2"
                >
                    <span>Abort</span>
                    <span className="opacity-40 text-[10px] ml-2 font-mono tracking-tighter">⌘ ⌫</span>
                </button>

                {showPopover && (
                    <div className="absolute top-16 left-32 z-50 bg-[#141210] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-2 w-64">
                        <button onClick={closePopover} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors text-xs">✕</button>
                        <h3 className="font-sans font-bold text-sm tracking-widest uppercase text-[#FAFAF9] mb-2">Capture Intent</h3>
                        {["Just exploring", "Market changed", "AI reasoning incorrect", "Position size too large", "Other manual reason"].map(intent => (
                            <button
                                key={intent}
                                onClick={() => handleIntentCapture(intent, onAbort)}
                                className="text-left text-sm text-[#FAFAF9] hover:text-[#CA8A04] py-1"
                            >
                                {intent}
                            </button>
                        ))}
                    </div>
                )}
            </nav>
        </article>
    );
}
