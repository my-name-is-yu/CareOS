import { NextResponse } from "next/server";

import { loadHistory, loadResident } from "../../../lib/data";

export const runtime = "nodejs";

export async function GET() {
  const [resident, history] = await Promise.all([loadResident(), loadHistory()]);
  return NextResponse.json({ resident, history });
}
