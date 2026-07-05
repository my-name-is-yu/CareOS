import { NextResponse } from "next/server";

import { loadHistory, loadMemory, loadResident } from "../../../lib/data";

export async function GET() {
  const [resident, history, memory] = await Promise.all([loadResident(), loadHistory(), loadMemory()]);
  return NextResponse.json({ resident, history, memory });
}
