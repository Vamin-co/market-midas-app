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
// POST /api/ledger/mark-sold
// ════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tradeId, sellPrice } = body;

        if (!tradeId || sellPrice === undefined || sellPrice === null) {
            return NextResponse.json(
                { error: 'Missing required fields: tradeId, sellPrice' },
                { status: 400 },
            );
        }

        const numericPrice = parseFloat(sellPrice);
        if (isNaN(numericPrice) || numericPrice <= 0) {
            return NextResponse.json(
                { error: 'sellPrice must be a positive number' },
                { status: 400 },
            );
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

        // Calculate P/L
        const pnl = Math.round((numericPrice - trade.price) * trade.quantity * 100) / 100;
        const exitDollarAmount = Math.round(numericPrice * trade.quantity * 100) / 100;
        const now = new Date().toISOString();

        // Update original BUY trade with manual override status
        trades[tradeIndex] = {
            ...trade,
            status: 'closed_manual_override',
            pnl,
            closedAt: now,
            exitPrice: numericPrice,
        };

        // Append companion SELL record with manual override tag
        trades.push({
            id: `${trade.id}-manual-sell`,
            timestamp: now,
            action: 'SELL',
            ticker: trade.ticker,
            quantity: trade.quantity,
            price: numericPrice,
            dollar_amount: exitDollarAmount,
            mode: trade.mode,
            status: 'closed_manual_override',
            pnl,
            closedAt: now,
            exitPrice: numericPrice,
        });

        await writeTrades(trades);

        return NextResponse.json({
            success: true,
            pnl,
            exitPrice: numericPrice,
            exitDollarAmount,
            priceSource: 'manual_override',
            tradeId,
        });
    } catch (error: any) {
        console.error('Error marking trade as sold:', error);
        return NextResponse.json(
            { error: 'Failed to mark trade as sold', details: error.message },
            { status: 500 },
        );
    }
}
