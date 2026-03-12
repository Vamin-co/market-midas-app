"use client";

import { useTradeTracker } from '@/hooks/useTradeTracker';
import { PaperTrade } from '@/context/AppContext';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PositionAgg {
    ticker: string;
    totalShares: number;
    avgEntryPrice: number;
    currentPrice: number;
    totalCost: number;
    currentValue: number;
    unrealizedPnL: number;
    unrealizedPnLPct: number;
    portfolioPct: number;
    firstBuyDate: string;
    orders: PaperTrade[];
}

export default function PositionsPage() {
    const tracker = useTradeTracker();
    const router = useRouter();

    const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

    // Modal states - these handle local moding based on tracker logic
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

    // Set alert modal
    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
    const [alertTab, setAlertTab] = useState<'stop_loss' | 'price_target'>('stop_loss');
    const [alertInput, setAlertInput] = useState('');

    const positions = useMemo(() => {
        if (!tracker.trackerData?.openPositions) return [];

        const map = new Map<string, PositionAgg>();

        // 1. Group and accumulate
        tracker.trackerData.openPositions.forEach(trade => {
            if (!map.has(trade.ticker)) {
                map.set(trade.ticker, {
                    ticker: trade.ticker,
                    totalShares: 0,
                    avgEntryPrice: 0,
                    currentPrice: 0,
                    totalCost: 0,
                    currentValue: 0,
                    unrealizedPnL: 0,
                    unrealizedPnLPct: 0,
                    portfolioPct: 0,
                    firstBuyDate: trade.timestamp, // Initialize with first seen
                    orders: []
                });
            }

            const agg = map.get(trade.ticker)!;
            agg.orders.push(trade);

            if (trade.action === 'BUY') {
                agg.totalShares += trade.quantity;
                agg.totalCost += trade.dollar_amount;
            } else if (trade.action === 'SELL') {
                agg.totalShares -= trade.quantity;
                // Average down cost basis proportionally
                if (agg.totalShares > 0 && agg.totalCost > 0) {
                    // For a simple model, reducing total cost proportionally
                    const previousAvg = agg.totalCost / (agg.totalShares + trade.quantity);
                    agg.totalCost -= trade.quantity * previousAvg;
                } else if (agg.totalShares === 0) {
                    agg.totalCost = 0;
                }
            }

            // Keep earliest buy date
            if (trade.action === 'BUY' && new Date(trade.timestamp) < new Date(agg.firstBuyDate)) {
                agg.firstBuyDate = trade.timestamp;
            }
        });

        // 2. Filter out closed (totalShares <= 0) and calculate current values
        let allPositionsCurrentValue = 0;
        const activePositions = Array.from(map.values()).filter(p => p.totalShares > 0);

        activePositions.forEach(p => {
            // Sort orders descending for UI
            p.orders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            p.avgEntryPrice = p.totalCost / p.totalShares;
            p.currentPrice = tracker.livePrices[p.ticker]?.price || p.avgEntryPrice; // Fallback to entry if no live price

            // Latest trade price fallback if API polling is empty
            if (!tracker.livePrices[p.ticker]?.price && p.orders.length > 0) {
                p.currentPrice = p.orders[0].price; // most recent trade price
            }

            p.currentValue = p.totalShares * p.currentPrice;
            p.unrealizedPnL = p.currentValue - p.totalCost;
            p.unrealizedPnLPct = p.totalCost > 0 ? (p.unrealizedPnL / p.totalCost) * 100 : 0;

            allPositionsCurrentValue += p.currentValue;
        });

        // 3. Calculate portfolio % and sort
        activePositions.forEach(p => {
            p.portfolioPct = allPositionsCurrentValue > 0 ? (p.currentValue / allPositionsCurrentValue) * 100 : 0;
        });

        return activePositions.sort((a, b) => b.currentValue - a.currentValue);

    }, [tracker.trackerData, tracker.livePrices]);

    const totalPortfolioValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalCost = positions.reduce((sum, p) => sum + p.totalCost, 0);
    const totalPnL = totalPortfolioValue - totalCost;

    const selectedPosition = positions.find(p => p.ticker === selectedTicker) || null;

    // Donut chart colors
    const colors = ["#CA8A04", "#27c93f", "#44403C", "#ff5f56", "#1C1917"];

    // Set Alert Submission
    const handleSetAlert = async () => {
        if (!selectedPosition) return;

        let thresholdVal = parseFloat(alertInput);
        if (isNaN(thresholdVal) || thresholdVal <= 0) return;

        let thresholdPrice = 0;
        if (alertTab === 'stop_loss') {
            // Price falls by X%
            thresholdPrice = selectedPosition.currentPrice * (1 - thresholdVal / 100);
        } else {
            // Target price reaches $X
            thresholdPrice = thresholdVal;
        }

        try {
            await fetch('/api/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker: selectedPosition.ticker,
                    type: alertTab,
                    threshold: thresholdVal,
                    thresholdPrice,
                    entryPrice: selectedPosition.avgEntryPrice,
                    active: true,
                    triggered: false
                })
            });
            setIsAlertModalOpen(false);
            setAlertInput('');
        } catch (e) {
            console.error(e);
        }
    };

    // Math for alert modal helper text
    const parsedAlertInput = parseFloat(alertInput) || 0;
    const computedStopLoss = selectedPosition ? selectedPosition.currentPrice * (1 - parsedAlertInput / 100) : 0;
    const computedTargetPct = selectedPosition ? ((parsedAlertInput - selectedPosition.currentPrice) / selectedPosition.currentPrice) * 100 : 0;

    return (
        <div className="bg-[#FAFAF9] h-full flex flex-row overflow-hidden">

            {/* LEFT COLUMN */}
            <div className="w-72 shrink-0 flex flex-col border-r border-[#1C1917]/8 overflow-hidden">
                {/* Fixed Summary Card */}
                <div className="p-6 border-b border-[#1C1917]/8 shrink-0">
                    <div className="text-[9px] uppercase tracking-widest text-[#44403C]/50 mb-3">
                        PORTFOLIO
                    </div>

                    {!tracker.trackerData ? (
                        <>
                            <div className="h-9 w-32 bg-[#1C1917]/5 animate-pulse rounded mb-2" />
                            <div className="h-5 w-20 bg-[#1C1917]/5 animate-pulse rounded" />
                        </>
                    ) : (
                        <>
                            <div className="font-serif text-3xl text-[#1C1917]">
                                {tracker.formatCurrency(totalPortfolioValue)}
                            </div>
                            <div className={`font-sans text-sm mt-1 ${totalPnL > 0 ? "text-[#27c93f]" : totalPnL < 0 ? "text-[#ff5f56]" : "text-[#44403C]"}`}>
                                {totalPnL > 0 ? '+' : ''}{tracker.formatCurrency(totalPnL)}
                            </div>

                            {/* SVG Donut Chart */}
                            {positions.length > 0 && (
                                <div className="mt-4 flex flex-col items-center">
                                    <div className="relative w-[120px] h-[120px]">
                                        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                                            {/* We use stroke-dasharray based on circumference */}
                                            {(() => {
                                                const r = 40;
                                                const c = 2 * Math.PI * r;
                                                let offset = 0;
                                                return positions.map((p, i) => {
                                                    const dash = (p.portfolioPct / 100) * c;
                                                    const gap = c - dash;
                                                    const currentOffset = offset;
                                                    offset += dash;
                                                    return (
                                                        <circle
                                                            key={p.ticker}
                                                            cx="50" cy="50" r={r}
                                                            fill="transparent"
                                                            stroke={colors[i % colors.length]}
                                                            strokeWidth="12"
                                                            strokeDasharray={`${dash} ${gap}`}
                                                            strokeDashoffset={-currentOffset}
                                                            className="transition-all duration-500"
                                                        />
                                                    );
                                                });
                                            })()}
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <div className="font-sans text-lg text-[#1C1917]">{positions.length}</div>
                                            <div className="text-[8px] text-[#44403C]/50">POSITIONS</div>
                                        </div>
                                    </div>

                                    <div className="w-full mt-4 flex flex-col gap-2">
                                        {positions.slice(0, 5).map((p, i) => (
                                            <div key={p.ticker} className="flex items-center justify-between text-[10px] text-[#44403C]">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
                                                    <span>{p.ticker}</span>
                                                </div>
                                                <span>{p.portfolioPct.toFixed(1)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Position List */}
                <div className="flex-1 overflow-auto p-3">
                    {!tracker.trackerData ? (
                        <>
                            <div className="bg-[#1C1917]/5 animate-pulse h-16 rounded-xl mb-2" />
                            <div className="bg-[#1C1917]/5 animate-pulse h-16 rounded-xl mb-2" />
                            <div className="bg-[#1C1917]/5 animate-pulse h-16 rounded-xl mb-2" />
                        </>
                    ) : positions.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 h-full mt-10">
                            <div className="font-serif text-lg text-[#1C1917]/30">
                                No positions
                            </div>
                            <div className="text-xs text-[#44403C]/40 text-center">
                                Analyze a stock to get started
                            </div>
                            <button
                                onClick={() => router.push('/')}
                                className="border border-[#1C1917]/20 px-4 py-2 rounded-md text-[10px] uppercase tracking-widest text-[#44403C] mt-2 hover:-translate-y-[1px] transition-transform duration-300"
                            >
                                Analyze Ticker
                            </button>
                        </div>
                    ) : (
                        positions.map((p, i) => {
                            const isSelected = selectedTicker === p.ticker;
                            return (
                                <div
                                    key={p.ticker}
                                    onClick={() => setSelectedTicker(p.ticker)}
                                    // Removed initial opacity 0 logic for simplicity, rely on parent mount if needed. Or add animation inline.
                                    className={`
                                        rounded-xl border p-4 mb-2 cursor-pointer transition-all duration-200 flex items-center justify-between
                                        ${isSelected ? 'border-[#CA8A04] bg-[#CA8A04]/5' : 'border-[#1C1917]/5 bg-white hover:border-[#1C1917]/20'}
                                    `}
                                    style={{
                                        animation: `cardMount 300ms ease-out forwards ${i * 50}ms`,
                                        opacity: 0,
                                        transform: 'translateY(8px)'
                                    }}
                                >
                                    <div>
                                        <div className="font-serif text-lg text-[#1C1917]">{p.ticker}</div>
                                        <div className="text-[10px] text-[#44403C]/60">{p.totalShares.toFixed(2)} shares</div>
                                    </div>
                                    <div className={`text-sm font-sans ${p.unrealizedPnL > 0 ? "text-[#27c93f]" : p.unrealizedPnL < 0 ? "text-[#ff5f56]" : "text-[#44403C]"}`}>
                                        {p.unrealizedPnL > 0 ? '+' : ''}{tracker.formatCurrency(p.unrealizedPnL)}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {!tracker.trackerData ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-pulse w-3 h-3 rounded-full bg-[#CA8A04]" />
                    </div>
                ) : !selectedPosition ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="font-serif text-2xl text-[#1C1917]/20">
                            Select a position
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col h-full overflow-hidden animate-[fadeIn_150ms_ease-out]">

                        {/* Header */}
                        <div className="px-8 pt-6 pb-4 shrink-0 border-b border-[#1C1917]/8">
                            <div className="flex items-end justify-between">
                                <div className="font-serif text-5xl text-[#1C1917]">{selectedPosition.ticker}</div>
                                <div className="font-serif text-2xl text-[#44403C] pb-1">{tracker.formatCurrency(selectedPosition.currentPrice)}</div>
                            </div>
                            <div className="flex items-center gap-4 mt-1">
                                <div className={`font-sans text-lg ${selectedPosition.unrealizedPnL > 0 ? "text-[#27c93f]" : selectedPosition.unrealizedPnL < 0 ? "text-[#ff5f56]" : "text-[#1C1917]"}`}>
                                    {selectedPosition.unrealizedPnL > 0 ? '+' : ''}{tracker.formatCurrency(selectedPosition.unrealizedPnL)}
                                </div>
                                <div className={`font-sans text-sm ${selectedPosition.unrealizedPnL > 0 ? "text-[#27c93f]" : selectedPosition.unrealizedPnL < 0 ? "text-[#ff5f56]" : "text-[#1C1917]"}`}>
                                    {selectedPosition.unrealizedPnL > 0 ? '+' : ''}{selectedPosition.unrealizedPnLPct.toFixed(2)}%
                                </div>
                                <div className="text-[#44403C]/30 flex items-center justify-center">·</div>
                                <div className="text-sm text-[#44403C]/60">
                                    {Math.max(0, Math.floor((new Date().getTime() - new Date(selectedPosition.firstBuyDate).getTime()) / (1000 * 60 * 60 * 24)))} days held
                                </div>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="px-8 py-4 shrink-0">
                            <div className="grid grid-cols-4 gap-4 bg-white rounded-2xl border border-[#1C1917]/5 shadow-sm p-6">
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-[#44403C]/50 mb-1">Total Shares</div>
                                    <div className="font-sans text-base text-[#1C1917]">{selectedPosition.totalShares.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-[#44403C]/50 mb-1">Avg Entry</div>
                                    <div className="font-sans text-base text-[#1C1917]">{tracker.formatCurrency(selectedPosition.avgEntryPrice)}</div>
                                </div>
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-[#44403C]/50 mb-1">Total Cost</div>
                                    <div className="font-sans text-base text-[#1C1917]">{tracker.formatCurrency(selectedPosition.totalCost)}</div>
                                </div>
                                <div>
                                    <div className="text-[9px] uppercase tracking-widest text-[#44403C]/50 mb-1">Current Value</div>
                                    <div className="font-sans text-base text-[#1C1917]">{tracker.formatCurrency(selectedPosition.currentValue)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Order History */}
                        <div className="flex-1 overflow-auto px-8 py-4">
                            <div className="text-[9px] uppercase tracking-widest text-[#44403C]/50 mb-3">
                                ORDER HISTORY
                            </div>

                            {selectedPosition.orders.map((order, idx) => (
                                <div key={order.id + idx} className="flex items-center py-3 border-b border-[#1C1917]/5 last:border-0">
                                    <div className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full w-10 text-center shrink-0 ${order.action === 'BUY' ? 'bg-[#27c93f]/10 text-[#27c93f]' : 'bg-[#ff5f56]/10 text-[#ff5f56]'}`}>
                                        {order.action}
                                    </div>
                                    <div className="ml-3 flex-1 flex flex-col">
                                        <div className="font-sans text-sm text-[#1C1917]">
                                            {order.quantity} shares @ {tracker.formatCurrency(order.price)}
                                        </div>
                                        <div className="text-[10px] text-[#44403C]/50 mt-0.5">
                                            {new Date(order.timestamp).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="font-sans text-sm text-[#44403C] shrink-0">
                                        {tracker.formatCurrency(order.dollar_amount)}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Action Bar */}
                        <div className="px-8 py-4 shrink-0 border-t border-[#1C1917]/8 flex items-center gap-3">
                            <button
                                onClick={() => router.push(`/trade?ticker=${selectedPosition.ticker}&action=BUY&owned=true`)}
                                className="bg-[#CA8A04] text-[#1C1917] px-6 py-2.5 rounded-md text-xs font-bold uppercase tracking-widest hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                            >
                                Add to Position →
                            </button>
                            <button
                                onClick={() => setIsCloseModalOpen(true)}
                                className="border border-[#ff5f56]/30 text-[#ff5f56] px-6 py-2.5 rounded-md text-xs uppercase tracking-widest hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] bg-white/5"
                            >
                                Close Position
                            </button>
                            <button
                                onClick={() => setIsAlertModalOpen(true)}
                                className="border border-[#1C1917]/20 text-[#44403C] px-6 py-2.5 rounded-md text-xs uppercase tracking-widest hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] bg-white/5"
                            >
                                Set Alert
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Close Position Modal */}
            {isCloseModalOpen && selectedPosition && (
                <div className="fixed inset-0 bg-[#1C1917]/40 backdrop-blur-sm z-50 flex flex-col">
                    <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-auto mt-[20vh] shadow-xl animate-[modalMount_300ms_ease-out_forwards]">
                        <div className="font-serif text-xl text-[#1C1917]">Close Position</div>
                        <div className="text-sm text-[#44403C] mt-1">
                            {selectedPosition.totalShares.toFixed(2)} shares of {selectedPosition.ticker}
                        </div>

                        <div className="mt-4 p-4 rounded-xl border border-[#1C1917]/10 bg-[#FAFAF9]">
                            <div className="text-xs text-[#44403C]/60 uppercase tracking-widest mb-1">Unrealized P&L</div>
                            <div className={`font-sans text-xl ${selectedPosition.unrealizedPnL > 0 ? "text-[#27c93f]" : selectedPosition.unrealizedPnL < 0 ? "text-[#ff5f56]" : "text-[#1C1917]"}`}>
                                {selectedPosition.unrealizedPnL > 0 ? '+' : ''}{tracker.formatCurrency(selectedPosition.unrealizedPnL)}
                            </div>
                        </div>

                        {tracker.actionError && (
                            <div className="mt-4 text-xs text-[#ff5f56]">
                                Error: {tracker.actionError}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setIsCloseModalOpen(false)}
                                className="border border-[#1C1917]/20 text-[#44403C] px-6 py-2.5 rounded-md text-xs uppercase tracking-widest hover:scale-[1.03] active:scale-[0.98] transition-transform duration-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    // In a real app we'd close all open trades making up this position.
                                    // Here we just close the first one for demonstration, 
                                    // or we could iterate through all open orders for this ticker.
                                    // Given the hook handles tradeId, we should loop:
                                    const tradeIds = selectedPosition.orders.filter(o => o.action === 'BUY' && o.status === 'open').map(o => o.id);
                                    for (const id of tradeIds) {
                                        await tracker.handleClosePosition(id);
                                    }
                                    setIsCloseModalOpen(false);
                                }}
                                disabled={!!tracker.closingTradeId}
                                className="bg-[#CA8A04] text-[#1C1917] px-6 py-2.5 rounded-md text-xs font-bold uppercase tracking-widest hover:scale-[1.03] active:scale-[0.98] transition-transform duration-300 disabled:opacity-50"
                            >
                                Confirm Close →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Set Alert Modal */}
            {isAlertModalOpen && selectedPosition && (
                <div className="fixed inset-0 bg-[#1C1917]/40 backdrop-blur-sm z-50 flex flex-col">
                    <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-auto mt-[20vh] shadow-xl animate-[modalMount_300ms_ease-out_forwards]">
                        <div className="font-serif text-xl text-[#1C1917]">Set Alert</div>
                        <div className="text-sm text-[#44403C] mt-1">{selectedPosition.ticker}</div>

                        <div className="flex border-b border-[#1C1917]/10 mt-6 mb-4">
                            <button
                                className={`flex-1 pb-2 text-xs uppercase tracking-widest border-b-2 ${alertTab === 'stop_loss' ? 'border-[#CA8A04] text-[#1C1917]' : 'border-transparent text-[#44403C]/50'}`}
                                onClick={() => { setAlertTab('stop_loss'); setAlertInput(''); }}
                            >
                                Stop Loss
                            </button>
                            <button
                                className={`flex-1 pb-2 text-xs uppercase tracking-widest border-b-2 ${alertTab === 'price_target' ? 'border-[#CA8A04] text-[#1C1917]' : 'border-transparent text-[#44403C]/50'}`}
                                onClick={() => { setAlertTab('price_target'); setAlertInput(''); }}
                            >
                                Price Target
                            </button>
                        </div>

                        {alertTab === 'stop_loss' ? (
                            <>
                                <label className="block text-sm text-[#1C1917] mb-2">Trigger if price falls by (%)</label>
                                <input
                                    type="number"
                                    placeholder="8"
                                    value={alertInput}
                                    onChange={e => setAlertInput(e.target.value)}
                                    className="w-full border border-[#1C1917]/20 rounded-md px-4 py-3 font-sans outline-none focus:border-[#CA8A04]"
                                />
                                {parsedAlertInput > 0 && (
                                    <div className="text-xs text-[#44403C]/60 mt-2">
                                        Triggers at {tracker.formatCurrency(computedStopLoss)}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <label className="block text-sm text-[#1C1917] mb-2">Trigger when price reaches ($)</label>
                                <input
                                    type="number"
                                    placeholder={selectedPosition.currentPrice.toFixed(2)}
                                    value={alertInput}
                                    onChange={e => setAlertInput(e.target.value)}
                                    className="w-full border border-[#1C1917]/20 rounded-md px-4 py-3 font-sans outline-none focus:border-[#CA8A04]"
                                />
                                {parsedAlertInput > 0 && (
                                    <div className={`text-xs mt-2 ${computedTargetPct >= 0 ? 'text-[#27c93f]' : 'text-[#ff5f56]'}`}>
                                        {computedTargetPct >= 0 ? '+' : ''}{computedTargetPct.toFixed(2)}% from current price
                                    </div>
                                )}
                            </>
                        )}

                        <div className="flex justify-end gap-3 mt-8">
                            <button
                                onClick={() => setIsAlertModalOpen(false)}
                                className="border border-[#1C1917]/20 text-[#44403C] px-6 py-2.5 rounded-md text-xs uppercase tracking-widest hover:scale-[1.03] active:scale-[0.98] transition-transform duration-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSetAlert}
                                disabled={parsedAlertInput <= 0}
                                className="bg-[#CA8A04] text-[#1C1917] px-6 py-2.5 rounded-md text-xs font-bold uppercase tracking-widest hover:scale-[1.03] active:scale-[0.98] transition-transform duration-300 disabled:opacity-50"
                            >
                                Set Alert →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes cardMount {
                    from { transform: translateY(8px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes modalMount {
                    from { transform: translateY(16px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}} />
        </div>
    );
}
