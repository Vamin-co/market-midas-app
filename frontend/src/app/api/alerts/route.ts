const BACKEND = "http://localhost:8000";

export async function GET() {
    try {
        const res = await fetch(`${BACKEND}/alerts`, { cache: "no-store" });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch {
        return Response.json([], { status: 502 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const res = await fetch(`${BACKEND}/alerts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch {
        return Response.json({ error: "Backend unreachable" }, { status: 502 });
    }
}
