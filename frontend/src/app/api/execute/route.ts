import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, ticker, quantity, price } = body;

        if (!action || !ticker) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Path to the python project root
        const projectRoot = path.join(process.cwd(), '..');

        // Simulated Playwright execution via our dummy python script
        const cmd = `python -m src.execute_trade --ticker ${ticker} --action ${action} --qty ${quantity || 0} --price ${price || 0}`;

        console.log('Spawning Python child process:', cmd);

        const { stdout, stderr } = await execAsync(cmd, { cwd: projectRoot });

        return NextResponse.json({ success: true, stdout, stderr });
    } catch (error: any) {
        console.error('Execution error:', error);
        return NextResponse.json({ error: 'Execution failed', details: error.message }, { status: 500 });
    }
}
