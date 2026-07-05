import { NextResponse } from "next/server";

import { loadLatestProfile, loadProposals, updateProposalStatus } from "../../../../../lib/profiles";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const proposals = await loadProposals();
  const proposal = proposals.find((entry) => entry.id === id);
  if (!proposal) {
    return NextResponse.json({ error: `Proposal not found: ${id}` }, { status: 404 });
  }
  if (proposal.status !== "proposed") {
    return NextResponse.json({ error: `Proposal ${id} is already resolved (${proposal.status}).` }, { status: 409 });
  }

  const latestProfile = await loadLatestProfile(proposal.residentId);
  if (!latestProfile || proposal.baseVersion !== latestProfile.version) {
    return NextResponse.json(
      { error: `Proposal base version ${proposal.baseVersion} does not match latest profile version.` },
      { status: 409 },
    );
  }

  const updatedProposal = await updateProposalStatus(id, "rejected");
  return NextResponse.json({ proposal: updatedProposal });
}
