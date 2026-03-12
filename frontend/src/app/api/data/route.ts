import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
    try {
        // Navigate from frontend/ to project root (2 levels up if started from frontend/)
        // Assuming structure: /Users/.../Market-Midas/frontend/...
        const filePath = path.join(process.cwd(), '..', 'artifacts', 'latest_run.json');
        const data = await fs.readFile(filePath, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading JSON artifact:', error);
        return NextResponse.json({ error: 'Failed to find latest run data' }, { status: 500 });
    }
}
