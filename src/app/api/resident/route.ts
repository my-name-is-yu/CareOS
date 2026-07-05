import { NextResponse } from "next/server";

import { loadHistory, loadMemory, loadResident } from "../../../lib/data";

export const runtime = "nodejs";

export async function GET() {
  const [resident, memory, history] = await Promise.all([loadResident(), loadMemory(), loadHistory()]);
  return NextResponse.json({ resident, memory, history });
}
