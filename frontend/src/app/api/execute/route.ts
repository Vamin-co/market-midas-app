import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import util from 'util';
import path from 'path';

const execFileAsync = util.promisify(execFile);

const ALLOWED_ACTIONS = new Set(['BUY', 'SELL']);
const ALLOWED_MODES = new Set(['PAPER', 'LIVE']);
const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

function parseNonNegativeNumber(value: unknown): number | null {
    if (value == null || value === '') {
        return 0;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
}

export async function POST(request: Request) {
    try {
        const body: unknown = await request.json();
        const payload = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

        const rawAction = typeof payload.action === 'string' ? payload.action.toUpperCase() : '';
        const rawTicker = typeof payload.ticker === 'string' ? payload.ticker.toUpperCase() : '';
        const rawMode = typeof payload.mode === 'string' ? payload.mode.toUpperCase() : undefined;
        const quantity = parseNonNegativeNumber(payload.quantity);
        const price = parseNonNegativeNumber(payload.price);

        if (!rawAction || !rawTicker) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        if (!ALLOWED_ACTIONS.has(rawAction)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        if (!TICKER_PATTERN.test(rawTicker)) {
            return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
        }

        if (rawMode && !ALLOWED_MODES.has(rawMode)) {
            return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
        }

        if (quantity == null || price == null) {
            return NextResponse.json({ error: 'Invalid quantity or price' }, { status: 400 });
        }

        // Path to the python project root
        const projectRoot = path.join(process.cwd(), '..');
        const args = [
            '-m',
            'src.execute_trade',
            '--ticker',
            rawTicker,
            '--action',
            rawAction,
            '--qty',
            String(quantity),
            '--price',
            String(price),
        ];

        console.log('Spawning Python child process:', { command: 'python', args });

        const { stdout, stderr } = await execFileAsync('python', args, { cwd: projectRoot });

        return NextResponse.json({ success: true, stdout, stderr });
    } catch (error: any) {
        console.error('Execution error:', error);
        return NextResponse.json({ error: 'Execution failed', details: error.message }, { status: 500 });
    }
}
