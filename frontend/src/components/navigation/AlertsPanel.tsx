"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/context/AppContext";

export function AlertsPanel() {
    const { alerts, fetchAlerts } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    // Needed to calculate distance for progress bar.
    const [livePrices, setLivePrices] = useState<Record<string, { price: number }>>({});

    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev);
        const handleOpen = () => setIsOpen(true);

        window.addEventListener('toggle-alerts-panel', handleToggle);
        window.addEventListener('open-alerts-panel', handleOpen);

        return () => {
            window.removeEventListener('toggle-alerts-panel', handleToggle);
            window.removeEventListener('open-alerts-panel', handleOpen);
        };
    }, []);

    const pathname = usePathname();
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Fetch prices for alerts when panel opens
    useEffect(() => {
        if (!isOpen) return;
        
        const fetchPrices = async () => {
            if (alerts.length === 0) return;
            const tickers = [...new Set(alerts.map(a => a.ticker))].join(',');
            try {
                const priceRes = await fetch(`http://localhost:8000/prices?tickers=${tickers}`);
                if (priceRes.ok) {
                    setLivePrices(await priceRes.json());
                }
            } catch (e) {
                // silent
            }
        };

        fetchPrices();
    }, [isOpen, alerts]);

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        try {
            await fetch(`/api/alerts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ active: !currentActive })
            });
            await fetchAlerts();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/alerts/${id}`, { method: "DELETE" });
            await fetchAlerts();
        } catch (e) {
            console.error(e);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
    };

    // If panel is logically closed and transition finishes, we still want it in DOM for the animation,
    // so we render conditionally based on standard visibility tracking but keep DOM node.
    
    return (
        <>
            {/* Dim Overlay */}
            {isOpen && (
                <div 
                    className="fixed inset-0 z-40 animate-in fade-in duration-200"
                    style={{ 
                        background: 'rgba(28, 25, 23, 0.15)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)'
                    }}
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Panel */}
            <div 
                className={`fixed top-[40px] right-3 bottom-3 w-[380px] z-[60] bg-white border border-[#1C1917]/5 shadow-2xl rounded-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${isOpen ? 'translate-x-0' : 'translate-x-[calc(100%+24px)] duration-200 ease-in'}`}
            >
                {/* Header */}
                <div className="h-14 px-6 flex items-center justify-between border-b border-[#1C1917]/8 shrink-0">
                    <div className="font-serif text-xl text-[#1C1917]">Alerts</div>
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="text-[#44403C]/40 text-xl hover:text-[#1C1917] transition-colors duration-200"
                        style={{ WebkitAppRegion: 'no-drag' } as any}
                    >
                        &times;
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto px-4 py-4">
                    {alerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                            <div className="font-serif text-xl text-[#1C1917]/30">No alerts</div>
                            <div className="text-xs text-[#44403C]/40 text-center px-4">
                                Set an alert from any position or after analyzing
                            </div>
                        </div>
                    ) : (
                        alerts.map(alert => {
                            const isTriggered = alert.triggered;

                            // Progress bar math
                            const currentPrice = livePrices[alert.ticker]?.price || alert.entryPrice;
                            const totalDistance = Math.abs(alert.thresholdPrice - alert.entryPrice);
                            const currentDistance = Math.abs(currentPrice - alert.entryPrice);
                            let progressPct = totalDistance > 0 ? (currentDistance / totalDistance) * 100 : 0;
                            progressPct = Math.min(100, Math.max(0, progressPct));
                            const isNearTrigger = progressPct >= 90;
                            
                            let thresholdText = "";
                            if (alert.type === "stop_loss") {
                                thresholdText = `-${alert.threshold}% at ${formatCurrency(alert.thresholdPrice)}`;
                            } else {
                                thresholdText = `${formatCurrency(alert.thresholdPrice)} target`;
                            }

                            return (
                                <div 
                                    key={alert.id}
                                    className={`bg-[#FAFAF9] rounded-2xl border border-[#1C1917]/5 shadow-sm p-4 mb-3 flex flex-col gap-2 relative ${isTriggered ? 'ring-1 ring-[#CA8A04]' : ''}`}
                                >
                                    {isTriggered && (
                                        <div className="absolute -top-2 right-2 px-2 py-0.5 bg-[#CA8A04] rounded text-[8px] font-bold uppercase tracking-widest text-[#1C1917]">
                                            TRIGGERED
                                        </div>
                                    )}

                                    {/* Row 1 */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <div className="font-serif text-lg text-[#1C1917]">{alert.ticker}</div>
                                            <div className="text-[9px] uppercase tracking-widest text-[#44403C]/50 ml-2">
                                                {alert.type.replace('_', ' ')}
                                            </div>
                                        </div>
                                        <div className="flex items-center">
                                            <button 
                                                onClick={() => handleToggleActive(alert.id, alert.active)}
                                                className="hover:opacity-80 transition-opacity"
                                            >
                                                {alert.active ? (
                                                    <div className="text-[#27c93f] text-[9px] font-bold uppercase tracking-widest">● ACTIVE</div>
                                                ) : (
                                                    <div className="text-[#44403C]/40 text-[9px] uppercase tracking-widest">○ PAUSED</div>
                                                )}
                                            </button>
                                            
                                            <button 
                                                onClick={() => handleDelete(alert.id)}
                                                className="text-[#44403C]/30 hover:text-[#ff5f56] transition-colors ml-3 pb-0.5"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    </div>

                                    {/* Row 2 */}
                                    <div className="font-sans text-sm text-[#44403C]">
                                        {alert.type === "stop_loss" 
                                            ? `-${alert.threshold}% (triggers at ${formatCurrency(alert.thresholdPrice)})` 
                                            : `${formatCurrency(alert.thresholdPrice)} target`
                                        }
                                    </div>

                                    {/* Row 3 */}
                                    <div className="w-full h-1 bg-[#1C1917]/8 rounded-full overflow-hidden mt-1">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-500 ${isNearTrigger ? 'bg-[#ff5f56]' : 'bg-[#CA8A04]'}`}
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-[#1C1917]/8 shrink-0">
                    <button 
                        onClick={() => {
                            setIsOpen(false);
                            window.dispatchEvent(new CustomEvent('open-alert-modal'));
                        }}
                        className="bg-[#CA8A04] text-[#1C1917] w-full py-3 rounded-xl font-bold uppercase tracking-widest text-xs hover:scale-[1.02] transition-transform duration-200"
                    >
                        Add Alert +
                    </button>
                </div>
            </div>
        </>
    );
}
