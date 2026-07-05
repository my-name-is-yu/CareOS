import { DEFAULT_RESIDENT_ID, loadResident } from "./data";
import { loadGBrainKnowledgeContext } from "./gbrain";
import { lintClinicalLanguage } from "./lint";
import { parseFieldValue, runProfileUpdateAgent, type ProfileAgentInput, type ProposedChanges } from "./profile-agent";
import { loadLatestProfile, nextProposalId, saveProposal } from "./profiles";
import { loadRecords } from "./records";
import {
  FieldDiffSchema,
  ProfileUpdateProposalSchema,
  type CareRecord,
  type FieldDiff,
  type LivingCareProfile,
  type ProfileUpdateProposal,
} from "./schema";
import { needsCorrectiveProposalRerun, verifyProposalChanges } from "./verify";

const correctiveInstruction =
  "Previous changes had unsupported or fabricated citations. Only propose a change if every citation quote (top-level " +
  "and, for list items, item-level) is copied verbatim from the provided record bodies.";

export type ProposalEnvelope = {
  proposal: ProfileUpdateProposal | null;
  warnings: string[];
  verified: boolean;
  latencyMs: number;
};

export type GenerateProposalOptions = {
  residentId?: string;
  recordIds?: string[];
  hasOpenAIKey?: boolean;
  now?: () => number;
};

function buildFieldDiffs(raw: ProposedChanges, currentProfile: LivingCareProfile): FieldDiff[] {
  return raw.changes.map((change) => {
    const after = parseFieldValue(change.field, change.after);
    const before = currentProfile[change.field].value;
    return FieldDiffSchema.parse({
      field: change.field,
      before,
      after,
      citations: change.citations,
      rationale: change.rationale,
    });
  });
}

async function resolveGBrainContext(resident: ProfileAgentInput["resident"], newRecords: CareRecord[]): Promise<string | null> {
  if (globalThis.process.env.CAREOS_MEMORY_BACKEND !== "gbrain") {
    return null;
  }
  try {
    const currentNote = newRecords.map((record) => record.body).join(" ");
    return await loadGBrainKnowledgeContext(resident, currentNote);
  } catch {
    return null;
  }
}

/**
 * Generates a ProfileUpdateProposal from new care records against the current
 * Living Care Profile. Never modifies the profile itself; the proposal is
 * saved with status "proposed" for later human approval (Phase 4).
 */
export async function generateProposal(options: GenerateProposalOptions = {}): Promise<ProposalEnvelope> {
  const started = options.now?.() ?? Date.now();
  const hasOpenAIKey = options.hasOpenAIKey ?? Boolean(globalThis.process?.env.OPENAI_API_KEY);
  if (!hasOpenAIKey) {
    throw new Error("OPENAI_API_KEY is required.");
  }

  const residentId = options.residentId ?? DEFAULT_RESIDENT_ID;

  const [resident, allRecords, currentProfile] = await Promise.all([
    loadResident(residentId),
    loadRecords(residentId),
    loadLatestProfile(residentId),
  ]);

  if (!currentProfile) {
    throw new Error(`No Living Care Profile found for resident: ${residentId}`);
  }

  let newRecords: CareRecord[];
  if (options.recordIds && options.recordIds.length > 0) {
    const missing = options.recordIds.filter((id) => !allRecords.some((record) => record.id === id));
    if (missing.length > 0) {
      throw new Error(`Unknown record id(s): ${missing.join(", ")}`);
    }
    const idSet = new Set(options.recordIds);
    newRecords = allRecords.filter((record) => idSet.has(record.id));
  } else {
    newRecords = allRecords.filter((record) => record.occurredAt > currentProfile.approvedAt);
  }

  if (newRecords.length === 0) {
    throw new Error("No new care records to generate a proposal from.");
  }

  const gbrainContext = await resolveGBrainContext(resident, newRecords);
  const baseInput: ProfileAgentInput = { resident, currentProfile, newRecords, allRecords, gbrainContext };

  let raw = await runProfileUpdateAgent(baseInput);
  let built = buildFieldDiffs(raw, currentProfile);
  let verification = verifyProposalChanges(built, allRecords);

  if (needsCorrectiveProposalRerun(verification)) {
    raw = await runProfileUpdateAgent({ ...baseInput, extraInstruction: correctiveInstruction });
    built = buildFieldDiffs(raw, currentProfile);
    verification = verifyProposalChanges(built, allRecords);
  }

  const warnings = lintClinicalLanguage(verification.changes);
  const verified = verification.droppedCitations === 0 && verification.droppedChanges === 0;
  const latencyMs = Math.max(0, (options.now?.() ?? Date.now()) - started);

  if (verification.changes.length === 0) {
    return { proposal: null, warnings, verified, latencyMs };
  }

  const proposal = ProfileUpdateProposalSchema.parse({
    id: await nextProposalId(),
    residentId,
    baseVersion: currentProfile.version,
    triggeredBy: newRecords.map((record) => record.id),
    createdAt: new Date().toISOString(),
    changes: verification.changes,
    status: "proposed",
  } satisfies ProfileUpdateProposal);

  const saved = await saveProposal(proposal);

  return { proposal: saved, warnings, verified, latencyMs };
}
