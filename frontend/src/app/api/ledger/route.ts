import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

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

function generateId(ticker: string, timestamp: string): string {
    const hash = createHash('sha256').update(`${ticker}-${timestamp}`).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

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

function migrateTrade(trade: RawTrade): RawTrade {
    const migrated = { ...trade };
    if (!migrated.id) {
        migrated.id = generateId(migrated.ticker, migrated.timestamp);
    }
    if (!migrated.status) {
        migrated.status = trade.action === 'BUY' ? 'open' : 'closed';
    }
    return migrated;
}

// ════════════════════════════════════════════════════════════════
// GET /api/ledger
// ════════════════════════════════════════════════════════════════

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startingBalance = parseFloat(searchParams.get('balance') || '100000');
        const closedPage = parseInt(searchParams.get('closedPage') || '1', 10);
        const closedPerPage = parseInt(searchParams.get('closedPerPage') || '10', 10);

        const rawTrades = await readTrades();

        // Migrate all trades (backfill id, status)
        const trades = rawTrades.map(migrateTrade);

        // Write back migrated data if any changes were made
        const needsMigration = rawTrades.some(t => !t.id || !t.status);
        if (needsMigration) {
            await writeTrades(trades);
        }

        // Separate open and closed positions
        const openPositions = trades
            .filter(t => t.status === 'open' && t.action === 'BUY')
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const allClosed = trades
            .filter(t => t.status === 'closed' || t.status === 'closed_manual_override')
            .sort((a, b) => {
                const dateA = new Date(a.closedAt || a.timestamp).getTime();
                const dateB = new Date(b.closedAt || b.timestamp).getTime();
                return dateB - dateA;
            });

        // Paginate closed positions
        const totalClosedCount = allClosed.length;
        const startIdx = (closedPage - 1) * closedPerPage;
        const closedPositions = allClosed.slice(startIdx, startIdx + closedPerPage);

        // Compute derived values
        const totalInvested = openPositions.reduce((sum, t) => sum + (t.dollar_amount || 0), 0);
        const realizedPnl = allClosed.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const walletBalance = startingBalance - totalInvested + realizedPnl;

        return NextResponse.json({
            walletBalance: Math.round(walletBalance * 100) / 100,
            startingBalance,
            totalInvested: Math.round(totalInvested * 100) / 100,
            realizedPnl: Math.round(realizedPnl * 100) / 100,
            openPositions,
            closedPositions,
            totalClosedCount,
        });
    } catch (error) {
        console.error('Error reading ledger:', error);
        return NextResponse.json({ error: 'Failed to read ledger data' }, { status: 500 });
    }
}
