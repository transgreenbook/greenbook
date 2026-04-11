import { NextRequest, NextResponse } from "next/server";

const VALHALLA_URL = "https://valhalla1.openstreetmap.de/route";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(VALHALLA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Routing service returned an unexpected response." },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error ?? "Routing request failed." },
      { status: res.status }
    );
  }

  return NextResponse.json(data);
}
