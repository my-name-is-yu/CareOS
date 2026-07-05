import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_RESIDENT_ID } from "../../../lib/data";
import { loadProposals } from "../../../lib/profiles";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const residentId = request.nextUrl.searchParams.get("residentId") ?? DEFAULT_RESIDENT_ID;
  const proposals = await loadProposals(residentId);
  const sorted = [...proposals].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return NextResponse.json({ proposals: sorted });
}
