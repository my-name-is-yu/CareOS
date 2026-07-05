import { NextResponse, type NextRequest } from "next/server";

import { compileFromBody, type CompileRequestBody } from "../../../lib/compile";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const envelope = await compileFromBody((await request.json()) as CompileRequestBody);
    return NextResponse.json(envelope);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Compile failed." }, { status: 400 });
  }
}
