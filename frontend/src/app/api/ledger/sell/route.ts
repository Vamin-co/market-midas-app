import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

interface RawTrade {
    id?: string;
    timestamp: string;
    action: string;
    ticker: string;
    quantity: number;
    price: number;
    dollar_amount: number;
    mode: string;
    status?: string;
    pnl?: number;
    closedAt?: string;
    exitPrice?: number;
}

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════

const BACKEND_URL = 'http://localhost:8000';

function getTradesPath(): string {
    return path.join(process.cwd(), '..', 'logs', 'paper_trades.json');
}

async function readTrades(): Promise<RawTrade[]> {
    try {
        const data = await fs.readFile(getTradesPath(), 'utf-8');
        const trades = JSON.parse(data);
        return Array.isArray(trades) ? trades : [];
    } catch {
        return [];
    }
}

async function writeTrades(trades: RawTrade[]): Promise<void> {
    await fs.writeFile(getTradesPath(), JSON.stringify(trades, null, 2));
}

// ════════════════════════════════════════════════════════════════
// Fallback Waterfall — Price Resolution
// ════════════════════════════════════════════════════════════════

async function fetchLivePriceWithRetry(ticker: string): Promise<{
    price: number | null;
    source: 'live' | 'stale' | 'finnhub' | null;
    staleTimestamp?: string;
}> {
    // Step 1: Retry with exponential backoff (1s, 2s, 4s)
    const delays = [1000, 2000, 4000];
    for (let i = 0; i < delays.length; i++) {
        try {
            const res = await fetch(`${BACKEND_URL}/prices?tickers=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                const entry = data[ticker];
                if (entry && entry.price !== null) {
                    if (!entry.stale) {
                        return { price: entry.price, source: 'live' };
                    }
                    // Step 2: Stale cache — accept if available
                    return {
                        price: entry.price,
                        source: 'stale',
                        staleTimestamp: entry.timestamp,
                    };
                }
            }
        } catch {
            // Transient error — will retry
        }
        // Wait before retrying (skip wait on last attempt)
        if (i < delays.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delays[i]));
        }
    }

    // Step 3: Finnhub stub (future integration)
    const finnhubPrice = await fetchFinnhubPrice(ticker);
    if (finnhubPrice !== null) {
        return { price: finnhubPrice, source: 'finnhub' };
    }

    // Step 4: All automated sources failed — return null
    // Frontend will prompt for manual input
    return { price: null, source: null };
}

// Architectural stub for Finnhub failover
// TODO: Integrate Finnhub API when yfinance is unreachable
async function fetchFinnhubPrice(_ticker: string): Promise<number | null> {
    // Future: const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`);
    return null;
}

// ════════════════════════════════════════════════════════════════
// POST /api/ledger/sell
// ════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tradeId, manualPrice } = body;

        if (!tradeId) {
            return NextResponse.json({ error: 'Missing tradeId' }, { status: 400 });
        }

        const trades = await readTrades();
        const tradeIndex = trades.findIndex(t => t.id === tradeId);

        if (tradeIndex === -1) {
            return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
        }

        const trade = trades[tradeIndex];
        if (trade.status !== 'open') {
            return NextResponse.json({ error: 'Trade is already closed' }, { status: 409 });
        }

        // Resolve exit price via Fallback Waterfall
        let exitPrice: number;
        let priceSource: string;

        if (manualPrice !== undefined && manualPrice !== null) {
            // User provided manual price (Step 4 of waterfall)
            exitPrice = parseFloat(manualPrice);
            priceSource = 'manual';
        } else {
            // Attempt automated price resolution
            const priceResult = await fetchLivePriceWithRetry(trade.ticker);

            if (priceResult.price === null) {
                // All automated sources failed — tell frontend to prompt user
                return NextResponse.json({
                    error: 'PRICE_UNAVAILABLE',
                    message: 'All automated price sources unavailable. Please provide a manual price.',
                    tradeId,
                    ticker: trade.ticker,
                }, { status: 503 });
            }

            exitPrice = priceResult.price;
            priceSource = priceResult.source || 'unknown';
        }

        // Calculate P/L
        const pnl = Math.round((exitPrice - trade.price) * trade.quantity * 100) / 100;
        const exitDollarAmount = Math.round(exitPrice * trade.quantity * 100) / 100;
        const now = new Date().toISOString();

        // Update original BUY trade
        trades[tradeIndex] = {
            ...trade,
            status: 'closed',
            pnl,
            closedAt: now,
            exitPrice,
        };

        // Append companion SELL record
        trades.push({
            id: `${trade.id}-sell`,
            timestamp: now,
            action: 'SELL',
            ticker: trade.ticker,
            quantity: trade.quantity,
            price: exitPrice,
            dollar_amount: exitDollarAmount,
            mode: trade.mode,
            status: 'closed',
            pnl,
            closedAt: now,
            exitPrice,
        });

        await writeTrades(trades);

        return NextResponse.json({
            success: true,
            pnl,
            exitPrice,
            exitDollarAmount,
            priceSource,
            tradeId,
        });
    } catch (error: any) {
        console.error('Error closing position:', error);
        return NextResponse.json(
            { error: 'Failed to close position', details: error.message },
            { status: 500 },
        );
    }
}
