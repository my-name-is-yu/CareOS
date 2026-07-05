import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { applyProposalToProfile, assertProposalIsCurrent, StaleProposalError } from "../../../../../lib/approve";
import { loadLatestProfile, loadProposals, saveProfileVersion, updateProposalStatus } from "../../../../../lib/profiles";
import { FieldDiffSchema } from "../../../../../lib/schema";

export const runtime = "nodejs";

const ApproveBodySchema = z
  .object({
    approvedBy: z.string().min(1).optional(),
    editedChanges: z.array(FieldDiffSchema).optional(),
  })
  .strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let rawBody: unknown = {};
  try {
    const text = await request.text();
    rawBody = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let body: z.infer<typeof ApproveBodySchema>;
  try {
    body = ApproveBodySchema.parse(rawBody);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request body." }, { status: 400 });
  }

  const proposals = await loadProposals();
  const proposal = proposals.find((entry) => entry.id === id);
  if (!proposal) {
    return NextResponse.json({ error: `Proposal not found: ${id}` }, { status: 404 });
  }
  if (proposal.status !== "proposed") {
    return NextResponse.json({ error: `Proposal ${id} is already resolved (${proposal.status}).` }, { status: 409 });
  }

  const latestProfile = await loadLatestProfile(proposal.residentId);
  if (!latestProfile) {
    return NextResponse.json({ error: `No Living Care Profile found for resident: ${proposal.residentId}` }, { status: 409 });
  }

  try {
    assertProposalIsCurrent(proposal.baseVersion, latestProfile);
  } catch (error) {
    if (error instanceof StaleProposalError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  const approvedBy = body.approvedBy ?? "nurse";
  const now = new Date().toISOString();
  const changes = body.editedChanges ?? proposal.changes;
  const wasEdited = Boolean(body.editedChanges);

  const nextProfile = applyProposalToProfile(latestProfile, changes, approvedBy, now);
  const savedProfile = await saveProfileVersion(nextProfile);
  const updatedProposal = await updateProposalStatus(id, wasEdited ? "edited_and_approved" : "approved");

  return NextResponse.json({ profile: savedProfile, proposal: updatedProposal });
}
