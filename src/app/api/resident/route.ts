import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_RESIDENT_ID, loadResident } from "../../../lib/data";
import { loadLatestProfile } from "../../../lib/profiles";
import { loadRecords } from "../../../lib/records";

export async function GET(request: NextRequest) {
  const residentId = request.nextUrl.searchParams.get("residentId") ?? DEFAULT_RESIDENT_ID;

  const [resident, profile, records] = await Promise.all([
    loadResident(residentId),
    loadLatestProfile(residentId),
    loadRecords(residentId),
  ]);

  const recentRecords = [...records]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
    .slice(0, 10);

  return NextResponse.json({ resident, profile, recentRecords });
}
