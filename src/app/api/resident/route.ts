import { NextResponse } from "next/server";

import { loadResident } from "../../../lib/data";
import { loadLatestProfile } from "../../../lib/profiles";
import { loadRecords } from "../../../lib/records";

const RESIDENT_ID = "aiko-mori";

export async function GET() {
  const [resident, profile, records] = await Promise.all([
    loadResident(),
    loadLatestProfile(RESIDENT_ID),
    loadRecords(RESIDENT_ID),
  ]);

  const recentRecords = [...records]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
    .slice(0, 10);

  return NextResponse.json({ resident, profile, recentRecords });
}
