import { NextResponse, type NextRequest } from "next/server";

import { transcribeFormData } from "../../../lib/transcribe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await transcribeFormData(await request.formData()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transcription failed." }, { status: 400 });
  }
}
