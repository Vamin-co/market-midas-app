import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    await request.json().catch(() => null);
    return NextResponse.json(
        {
            error: 'LEGACY_ROUTE_DISABLED',
            message: 'This legacy route is disabled. Use the backend /analyze or /analyze/stream endpoints for analysis and /trade for execution.',
        },
        { status: 410 },
    );
}
