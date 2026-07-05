import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { generateProposal } from "../../../../lib/proposal";

export const runtime = "nodejs";

const GenerateProposalBodySchema = z
  .object({
    residentId: z.string().min(1).optional(),
    recordIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

function isValidationLikeError(message: string): boolean {
  return (
    message.includes("OPENAI_API_KEY") ||
    message.includes("No new care records") ||
    message.includes("Unknown record id") ||
    message.includes("No Living Care Profile")
  );
}

export async function POST(request: NextRequest) {
  let rawBody: unknown = {};
  try {
    const text = await request.text();
    rawBody = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let parsedBody: z.infer<typeof GenerateProposalBodySchema>;
  try {
    parsedBody = GenerateProposalBodySchema.parse(rawBody);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request body." }, { status: 400 });
  }

  try {
    const envelope = await generateProposal({ residentId: parsedBody.residentId, recordIds: parsedBody.recordIds });
    return NextResponse.json(envelope);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate proposal.";
    const status = isValidationLikeError(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
