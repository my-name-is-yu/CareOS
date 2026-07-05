import { NextResponse } from "next/server";

import { loadProposals } from "../../../lib/profiles";

export const runtime = "nodejs";

const RESIDENT_ID = "aiko-mori";

export async function GET() {
  const proposals = await loadProposals(RESIDENT_ID);
  const sorted = [...proposals].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return NextResponse.json({ proposals: sorted });
}
