import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { DEFAULT_RESIDENT_ID } from "../../../lib/data";
import { syncRecordToGBrain } from "../../../lib/gbrain";
import { appendRecord, loadRecords, nextRecordId } from "../../../lib/records";
import { RecordTypeSchema } from "../../../lib/schema";

export const runtime = "nodejs";

const CreateRecordBodySchema = z.object({
  residentId: z.string().min(1).optional(),
  type: RecordTypeSchema,
  body: z.string().min(1),
  author: z
    .object({
      role: z.string().min(1),
      name: z.string().optional(),
    })
    .optional(),
  occurredAt: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const residentId = request.nextUrl.searchParams.get("residentId") ?? DEFAULT_RESIDENT_ID;
  const records = await loadRecords(residentId);
  const sorted = [...records].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
  return NextResponse.json({ records: sorted });
}

export async function POST(request: NextRequest) {
  try {
    const body = CreateRecordBodySchema.parse(await request.json());
    const id = await nextRecordId(body.type);
    const record = await appendRecord({
      id,
      residentId: body.residentId ?? DEFAULT_RESIDENT_ID,
      type: body.type,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      author: body.author ?? { role: "nurse" },
      body: body.body,
    });

    void syncRecordToGBrain(record).catch(() => {});

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create record." }, { status: 400 });
  }
}
