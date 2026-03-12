const BACKEND = "http://localhost:8000";

export async function PATCH(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const res = await fetch(`${BACKEND}/alerts/${id}`, { method: "PATCH" });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch {
        return Response.json({ error: "Backend unreachable" }, { status: 502 });
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const res = await fetch(`${BACKEND}/alerts/${id}`, { method: "DELETE" });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch {
        return Response.json({ error: "Backend unreachable" }, { status: 502 });
    }
}
