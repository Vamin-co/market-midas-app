import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json(
        {
            error: 'LEGACY_ROUTE_DISABLED',
            message: 'This legacy route is disabled. Use the backend POST /portfolio/mark-sold endpoint instead.',
        },
        { status: 410 },
    );
}
