import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json(
        {
            error: 'LEGACY_ROUTE_DISABLED',
            message: 'This legacy route is disabled. Use the backend GET /portfolio endpoint instead.',
        },
        { status: 410 },
    );
}
