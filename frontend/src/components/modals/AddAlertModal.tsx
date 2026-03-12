"use client";

import React, { useEffect, useState } from "react";
import { useAppContext } from "@/context/AppContext";

export function AddAlertModal() {
    const { fetchAlerts, trackerData } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const [ticker, setTicker] = useState("");
    const [alertTab, setAlertTab] = useState<'stop_loss' | 'price_target'>('stop_loss');
    const [alertInput, setAlertInput] = useState("");

    // Listen for events to open modal
    useEffect(() => {
        const handleOpen = (e: any) => {
            const prefilledTicker = e.detail?.ticker || "";
            setTicker(prefilledTicker);
            setAlertTab("stop_loss");
            setAlertInput("");
            setIsOpen(true);
        };

        window.addEventListener('open-alert-modal', handleOpen);
        return () => window.removeEventListener('open-alert-modal', handleOpen);
    }, []);

    if (!isOpen) return null;

    // Derived computation variables for helper text
    const parsedAlertInput = parseFloat(alertInput) || 0;
    
    // Find if the ticker is owned in current positions to prefill entry price
    const ownedPositionTrades = trackerData?.openPositions.filter(p => p.ticker === ticker.toUpperCase()) || [];
    let entryPrice = 0;
    
    if (ownedPositionTrades.length > 0) {
        let totalShares = 0;
        let totalCost = 0;
        ownedPositionTrades.forEach(trade => {
            if (trade.action === "BUY") {
                totalShares += trade.quantity;
                totalCost += trade.dollar_amount;
            } else if (trade.action === "SELL") {
                totalShares -= trade.quantity;
                const prevAvg = totalCost / (totalShares + trade.quantity);
                totalCost -= trade.quantity * prevAvg;
            }
        });
        if (totalShares > 0) {
            entryPrice = totalCost / totalShares;
        }
    }

    const computedStopLoss = entryPrice > 0 ? entryPrice * (1 - parsedAlertInput / 100) : 0;
    const computedTargetPct = entryPrice > 0 ? ((parsedAlertInput - entryPrice) / entryPrice) * 100 : 0;

    const handleSetAlert = async () => {
        if (!ticker) return;
        if (parsedAlertInput <= 0) return;

        let thresholdPrice = 0;
        if (alertTab === 'stop_loss') {
            // Price falls by X% - note we let the backend calculate this if entryPrice is 0,
            // but we'll try to calculate it locally if we have it, else we'll just send threshold%
            // In a robust system, the backend computes the missing `thresholdPrice` when the rule is created.
            thresholdPrice = computedStopLoss;
        } else {
            // Target price reaches $X
            thresholdPrice = parsedAlertInput;
        }

        try {
            await fetch('/api/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker: ticker.toUpperCase(),
                    type: alertTab,
                    threshold: parsedAlertInput,
                    thresholdPrice,
                    entryPrice,
                    active: true,
                    triggered: false
                })
            });
            await fetchAlerts();
            setIsOpen(false);
            window.dispatchEvent(new CustomEvent('open-alerts-panel'));
        } catch (e) {
            console.error(e);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
    };

    return (
        <div 
            className="fixed inset-0 z-[60] flex flex-col"
            style={{ 
                background: 'rgba(28, 25, 23, 0.15)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
            }}
        >
            <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-auto mt-[20vh] shadow-xl animate-[modalMount_300ms_ease-out_forwards]">
                <div className="font-serif text-xl text-[#1C1917]">Set Alert</div>
                
                <div className="mt-6 mb-2">
                    <label className="block text-[9px] uppercase tracking-widest text-[#44403C]/60 mb-1">TICKER</label>
                    <input 
                        type="text" 
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                        placeholder="e.g. AAPL"
                        style={{ WebkitUserSelect: "text", cursor: "text" } as any}
                        className="w-full border border-[#1C1917]/20 rounded-md px-4 py-2.5 font-sans text-sm uppercase focus:border-[#1C1917]/60 outline-none"
                    />
                </div>

                <div className="flex border-b border-[#1C1917]/10 mt-4 mb-3">
                    <button 
                        className={`flex-1 pb-2 text-xs uppercase tracking-widest border-b-2 ${alertTab === 'stop_loss' ? 'border-[#CA8A04] text-[#1C1917] font-medium' : 'border-transparent text-[#44403C]/50'}`}
                        onClick={() => { setAlertTab('stop_loss'); setAlertInput(''); }}
                    >
                        Stop Loss
                    </button>
                    <button 
                        className={`flex-1 pb-2 text-xs uppercase tracking-widest border-b-2 ${alertTab === 'price_target' ? 'border-[#CA8A04] text-[#1C1917] font-medium' : 'border-transparent text-[#44403C]/50'}`}
                        onClick={() => { setAlertTab('price_target'); setAlertInput(''); }}
                    >
                        Price Target
                    </button>
                </div>

                {alertTab === 'stop_loss' ? (
                    <>
                        <label className="block text-xs text-[#44403C]/60 mb-1">Trigger if price falls by</label>
                        <input 
                            type="number" 
                            placeholder="8"
                            value={alertInput}
                            onChange={e => setAlertInput(e.target.value)}
                            className="w-full border border-[#1C1917]/20 rounded-md px-4 py-3 font-sans text-sm outline-none focus:border-[#CA8A04]"
                        />
                        <div className="text-xs text-[#44403C]/40 mt-1">
                            Triggers if price drops {parsedAlertInput > 0 ? parsedAlertInput : 'X'}% from entry
                        </div>
                        {entryPrice > 0 && parsedAlertInput > 0 && (
                            <div className="text-xs text-[#44403C]/60 mt-1">
                                Triggers at {formatCurrency(computedStopLoss)} (Entry: {formatCurrency(entryPrice)})
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <label className="block text-xs text-[#44403C]/60 mb-1">Trigger when price reaches</label>
                        <input 
                            type="number" 
                            placeholder="0.00"
                            value={alertInput}
                            onChange={e => setAlertInput(e.target.value)}
                            className="w-full border border-[#1C1917]/20 rounded-md px-4 py-3 font-sans text-sm outline-none focus:border-[#CA8A04]"
                        />
                        {parsedAlertInput > 0 && entryPrice > 0 ? (
                            <div className={`text-xs mt-1 ${computedTargetPct >= 0 ? 'text-[#27c93f]' : 'text-[#ff5f56]'}`}>
                                {computedTargetPct >= 0 ? '+' : ''}{computedTargetPct.toFixed(2)}% from entry price
                            </div>
                        ) : (
                            <div className="text-xs text-[#44403C]/40 mt-1">
                                Enter target price
                            </div>
                        )}
                    </>
                )}
                
                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="border border-[#1C1917]/20 text-[#44403C] px-6 py-2.5 rounded-md text-xs uppercase tracking-widest hover:bg-[#1C1917]/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSetAlert}
                        disabled={parsedAlertInput <= 0 || !ticker}
                        className="bg-[#CA8A04] text-[#1C1917] px-6 py-2.5 rounded-md text-xs font-bold uppercase tracking-widest hover:scale-[1.03] active:scale-[0.98] transition-transform duration-300 disabled:opacity-50"
                    >
                        Set Alert →
                    </button>
                </div>
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes modalMount {
                    from { transform: translateY(16px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}} />
        </div>
    );
}
