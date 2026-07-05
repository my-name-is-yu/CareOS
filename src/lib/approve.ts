import { LivingCareProfileSchema, type FieldDiff, type LivingCareProfile } from "./schema";

export class StaleProposalError extends Error {}

/**
 * Guards against applying a proposal that was computed against an older
 * profile version than what is currently the latest. Throws StaleProposalError
 * if the proposal's baseVersion no longer matches the latest profile version.
 */
export function assertProposalIsCurrent(baseVersion: number, latestProfile: LivingCareProfile): void {
  if (baseVersion !== latestProfile.version) {
    throw new StaleProposalError(
      `Proposal base version ${baseVersion} does not match latest profile version ${latestProfile.version}.`,
    );
  }
}

/**
 * Applies a set of FieldDiffs to the latest Living Care Profile, producing the
 * next profile version. Only the fields present in `changes` are touched;
 * every other field carries over unchanged (same value/citations/updatedInVersion).
 * The touched fields get their value/citations set from the diff's `after` and
 * `citations`, with updatedInVersion set to the new version number.
 */
export function applyProposalToProfile(
  profile: LivingCareProfile,
  changes: FieldDiff[],
  approvedBy: string,
  now: string,
): LivingCareProfile {
  const nextVersion = profile.version + 1;
  const draft: Record<string, unknown> = {
    ...profile,
    version: nextVersion,
    approvedBy,
    approvedAt: now,
  };

  for (const change of changes) {
    draft[change.field] = {
      value: change.after,
      citations: change.citations,
      updatedInVersion: nextVersion,
    };
  }

  return LivingCareProfileSchema.parse(draft);
}
