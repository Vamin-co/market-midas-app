"use client";

import React from 'react';
import { useTradeTracker } from '@/hooks/useTradeTracker';

// ════════════════════════════════════════════════════════════════
// Trade Tracker — Active Position Manager
// ════════════════════════════════════════════════════════════════

export default function TradeTracker() {
    const {
        trackerData,
        hasData,
        livePrices,
        isEditingBalance,
        editableBalance,
        setEditableBalance,
        handleBalanceSave,
        startEditingBalance,
        cancelEditingBalance,
        closingTradeId,
        markSoldTradeId,
        markSoldPrice,
        setMarkSoldPrice,
        manualPriceTradeId,
        manualPriceInput,
        setManualPriceInput,
        actionError,
        handleClosePosition,
        handleManualPriceSubmit,
        handleMarkSold,
        cancelManualPrice,
        startMarkSold,
        cancelMarkSold,
        dismissError,
        closedPage,
        setClosedPage,
        closedPerPage,
        totalPages,
        formatCurrency,
        formatPnl,
        getUnrealizedPnl,
    } = useTradeTracker();

    if (!hasData || !trackerData) {
        return (
            <div className="bg-[#1C1917] p-10 rounded-2xl shadow-sm border border-white/5 text-center">
                <span className="text-stone-500 text-sm font-sans">Loading tracker data...</span>
            </div>
        );
    }

    // totalPages provided by useTradeTracker hook

    return (
        <section className="bg-[#1C1917] p-10 rounded-2xl shadow-sm border border-white/5 text-[#FAFAF9] space-y-8 animate-in fade-in duration-700">

            {/* ── ZONE 1: Wallet Summary Bar ── */}
            <div>
                <h3 className="font-serif text-2xl font-bold uppercase tracking-widest text-[#FAFAF9] mb-6 flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#CA8A04]">account_balance</span>
                    Active Trade Tracker
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Balance Card (editable) */}
                    <div className="bg-[#141210] border border-white/10 rounded-xl p-6 group">
                        <span className="text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] block mb-2">Balance</span>
                        {isEditingBalance ? (
                            <div className="flex items-center gap-2">
                                <span className="text-stone-400 text-lg">$</span>
                                <input
                                    type="number"
                                    value={editableBalance}
                                    onChange={(e) => setEditableBalance(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleBalanceSave();
                                        if (e.key === 'Escape') cancelEditingBalance();
                                    }}
                                    autoFocus
                                    className="bg-transparent border-b border-[#CA8A04]/40 text-white font-sans text-2xl tabular-nums outline-none w-full"
                                />
                                <button onClick={handleBalanceSave} className="text-[#27c93f] hover:text-white">
                                    <span className="material-symbols-outlined text-lg">check</span>
                                </button>
                                <button onClick={cancelEditingBalance} className="text-[#ff5f56] hover:text-white">
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="font-sans text-3xl font-semibold tabular-nums">{formatCurrency(trackerData.walletBalance)}</span>
                                <button
                                    onClick={startEditingBalance}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-[#CA8A04]"
                                    aria-label="Edit wallet balance"
                                >
                                    <span className="material-symbols-outlined text-sm">edit</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Invested Card */}
                    <div className="bg-[#141210] border border-white/10 rounded-xl p-6">
                        <span className="text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] block mb-2">Invested</span>
                        <span className="font-sans text-3xl font-semibold tabular-nums">{formatCurrency(trackerData.totalInvested)}</span>
                    </div>

                    {/* Realized P/L Card */}
                    <div className="bg-[#141210] border border-white/10 rounded-xl p-6">
                        <span className="text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] block mb-2">Realized P/L</span>
                        <span className={`font-sans text-3xl font-semibold tabular-nums ${trackerData.realizedPnl >= 0 ? 'text-[#27c93f]' : 'text-[#ff5f56]'}`}>
                            {formatPnl(trackerData.realizedPnl)}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Error Banner ── */}
            {actionError && (
                <div className="bg-[#ff5f56]/10 border border-[#ff5f56]/30 rounded-lg px-4 py-3 flex items-center gap-3 text-[#ff5f56] text-sm animate-in fade-in">
                    <span className="material-symbols-outlined text-lg">error</span>
                    <span className="font-sans">{actionError}</span>
                    <button onClick={dismissError} className="ml-auto hover:text-white">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {/* ── Manual Price Modal (Fallback Waterfall Step 4) ── */}
            {manualPriceTradeId && (
                <div className="bg-[#141210] border border-[#CA8A04]/30 rounded-xl p-6 space-y-4 animate-in slide-in-from-top-2 fade-in">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#CA8A04]">warning</span>
                        <h4 className="font-serif font-bold text-lg text-[#FAFAF9]">Manual Price Required</h4>
                    </div>
                    <p className="text-stone-400 text-sm font-sans">
                        All automated price sources are unavailable. Enter the current market price for
                        <strong className="text-white mx-1">
                            {trackerData.openPositions.find(t => t.id === manualPriceTradeId)?.ticker}
                        </strong>
                        to close this position.
                    </p>
                    <div className="flex items-center gap-3">
                        <span className="text-stone-400">$</span>
                        <input
                            type="number"
                            value={manualPriceInput}
                            onChange={(e) => setManualPriceInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleManualPriceSubmit(manualPriceTradeId)}
                            placeholder="0.00"
                            autoFocus
                            className="bg-transparent border-b border-[#CA8A04]/40 text-white font-sans text-xl tabular-nums outline-none flex-1"
                        />
                        <button
                            onClick={() => handleManualPriceSubmit(manualPriceTradeId)}
                            className="bg-[#CA8A04] text-[#1C1917] px-4 py-2 rounded-md font-bold text-[10px] uppercase tracking-widest hover:bg-white transition-colors"
                        >
                            Confirm
                        </button>
                        <button
                            onClick={cancelManualPrice}
                            className="text-stone-400 hover:text-white px-4 py-2 text-[10px] uppercase tracking-widest font-bold"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── ZONE 2: Open Positions Table ── */}
            <div>
                <h4 className="text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#CA8A04]"></span>
                    Open Positions ({trackerData.openPositions.length})
                </h4>

                {trackerData.openPositions.length === 0 ? (
                    <div className="bg-[#141210] border border-white/10 rounded-xl p-8 text-center">
                        <span className="material-symbols-outlined text-stone-600 text-3xl mb-2 block">inbox</span>
                        <p className="text-stone-500 text-sm font-sans">No open positions. Execute a trade to get started.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/5">
                                    <th className="text-left text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Ticker</th>
                                    <th className="text-left text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Action</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Qty</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Entry Price</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Position</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Unreal. P/L</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trackerData.openPositions.map((trade) => {
                                    const unrealizedPnl = getUnrealizedPnl(trade);
                                    const liveData = livePrices[trade.ticker];
                                    const isClosing = closingTradeId === trade.id;

                                    return (
                                        <tr key={trade.id} className="border-b border-white/5 hover:bg-white/5 transition-colors duration-300">
                                            <td className="py-4 px-2 font-serif font-bold text-lg tracking-wider">{trade.ticker}</td>
                                            <td className="py-4 px-2">
                                                <span className="bg-[#CA8A04] text-[#1C1917] px-2 py-1 rounded text-[9px] tracking-widest uppercase font-bold">
                                                    {trade.action}
                                                </span>
                                            </td>
                                            <td className="py-4 px-2 text-right font-sans tabular-nums">{trade.quantity}</td>
                                            <td className="py-4 px-2 text-right font-sans tabular-nums">{formatCurrency(trade.price)}</td>
                                            <td className="py-4 px-2 text-right font-sans tabular-nums">{formatCurrency(trade.dollar_amount)}</td>
                                            <td className="py-4 px-2 text-right">
                                                {unrealizedPnl !== null ? (
                                                    <div className="flex flex-col items-end">
                                                        <span className={`font-sans tabular-nums font-semibold ${unrealizedPnl >= 0 ? 'text-[#27c93f]' : 'text-[#ff5f56]'}`}>
                                                            {formatPnl(unrealizedPnl)}
                                                        </span>
                                                        {liveData?.stale && (
                                                            <span className="text-[#CA8A04] text-[8px] uppercase tracking-widest mt-0.5">
                                                                ⚠ stale
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-stone-600 text-xs">—</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-2 text-right">
                                                {markSoldTradeId === trade.id ? (
                                                    <div className="flex items-center gap-2 justify-end">
                                                        <span className="text-stone-400 text-sm">$</span>
                                                        <input
                                                            type="number"
                                                            value={markSoldPrice}
                                                            onChange={(e) => setMarkSoldPrice(e.target.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleMarkSold(trade.id)}
                                                            placeholder="0.00"
                                                            autoFocus
                                                            className="bg-transparent border-b border-white/20 text-white font-sans text-sm tabular-nums outline-none w-24"
                                                        />
                                                        <button onClick={() => handleMarkSold(trade.id)} className="text-[#27c93f] text-xs hover:text-white">
                                                            <span className="material-symbols-outlined text-sm">check</span>
                                                        </button>
                                                        <button onClick={cancelMarkSold} className="text-[#ff5f56] text-xs hover:text-white">
                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 justify-end">
                                                        <button
                                                            onClick={() => handleClosePosition(trade.id)}
                                                            disabled={isClosing}
                                                            className="border border-[#CA8A04]/30 text-[#CA8A04] px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest hover:bg-[#CA8A04] hover:text-[#1C1917] transition-all duration-300 disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            {isClosing ? 'Closing...' : 'Close (AI)'}
                                                        </button>
                                                        <button
                                                            onClick={() => startMarkSold(trade.id)}
                                                            className="border border-white/10 text-stone-400 px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all duration-300 whitespace-nowrap"
                                                        >
                                                            Mark Sold
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── ZONE 3: Closed Positions (Paginated) ── */}
            {trackerData.totalClosedCount > 0 && (
                <div>
                    <h4 className="text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-500"></span>
                        Closed Positions · Showing {((closedPage - 1) * closedPerPage) + 1}–{Math.min(closedPage * closedPerPage, trackerData.totalClosedCount)} of {trackerData.totalClosedCount}
                    </h4>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/5">
                                    <th className="text-left text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Ticker</th>
                                    <th className="text-left text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Type</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Qty</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Entry</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Exit</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">P/L</th>
                                    <th className="text-right text-stone-500 text-[9px] font-bold uppercase tracking-[0.2em] py-3 px-2">Closed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trackerData.closedPositions.map((trade) => (
                                    <tr key={trade.id} className="border-b border-white/5 hover:bg-white/5 transition-colors duration-300">
                                        <td className="py-3 px-2 font-serif font-bold tracking-wider">{trade.ticker}</td>
                                        <td className="py-3 px-2">
                                            <span className="text-stone-400 text-[9px] uppercase tracking-widest">
                                                {trade.action === 'BUY' ? 'BUY→SELL' : trade.action}
                                            </span>
                                            {trade.status === 'closed_manual_override' && (
                                                <span className="ml-2 text-[#CA8A04] text-[8px] font-bold uppercase tracking-widest bg-[#CA8A04]/10 px-1.5 py-0.5 rounded">
                                                    ⚠ MO
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-right font-sans tabular-nums text-sm">{trade.quantity}</td>
                                        <td className="py-3 px-2 text-right font-sans tabular-nums text-sm">{formatCurrency(trade.price)}</td>
                                        <td className="py-3 px-2 text-right font-sans tabular-nums text-sm">{trade.exitPrice ? formatCurrency(trade.exitPrice) : '—'}</td>
                                        <td className="py-3 px-2 text-right">
                                            {trade.pnl !== undefined ? (
                                                <span className={`font-sans tabular-nums text-sm font-semibold ${trade.pnl >= 0 ? 'text-[#27c93f]' : 'text-[#ff5f56]'}`}>
                                                    {formatPnl(trade.pnl)}
                                                </span>
                                            ) : (
                                                <span className="text-stone-600 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-right text-stone-500 text-xs font-sans">
                                            {trade.closedAt ? new Date(trade.closedAt).toLocaleDateString() : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-6">
                            <button
                                onClick={() => setClosedPage(Math.max(1, closedPage - 1))}
                                disabled={closedPage === 1}
                                className="text-stone-400 hover:text-white disabled:opacity-30 transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">chevron_left</span>
                            </button>
                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                let page: number;
                                if (totalPages <= 5) {
                                    page = i + 1;
                                } else if (closedPage <= 3) {
                                    page = i + 1;
                                } else if (closedPage >= totalPages - 2) {
                                    page = totalPages - 4 + i;
                                } else {
                                    page = closedPage - 2 + i;
                                }
                                return (
                                    <button
                                        key={page}
                                        onClick={() => setClosedPage(page)}
                                        className={`w-8 h-8 rounded text-xs font-bold transition-colors ${closedPage === page
                                            ? 'bg-[#CA8A04] text-[#1C1917]'
                                            : 'text-stone-400 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        {page}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => setClosedPage(Math.min(totalPages, closedPage + 1))}
                                disabled={closedPage === totalPages}
                                className="text-stone-400 hover:text-white disabled:opacity-30 transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">chevron_right</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
