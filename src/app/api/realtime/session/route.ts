import { NextResponse } from "next/server";

import { createRealtimeSession } from "../../../../lib/realtime-session";

export const runtime = "nodejs";

export async function POST() {
  try {
    return NextResponse.json(await createRealtimeSession());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Realtime session failed." }, { status: 400 });
  }
}
