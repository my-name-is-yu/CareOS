import { NextResponse } from "next/server";

import { loadResidents } from "../../../lib/data";

export async function GET() {
  const residents = await loadResidents();
  return NextResponse.json({ residents });
}
