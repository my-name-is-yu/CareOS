import type { CareRecord, FieldDiff, ProfileCitation, ProfileFieldName } from "./schema";

export function normalizeCitationText(text: string): string {
  return text
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// MemoryPath: Profile Update Proposal citation verification
// ---------------------------------------------------------------------------

const structuredProfileFields: ReadonlySet<ProfileFieldName> = new Set([
  "recentChanges",
  "careRecommendations",
  "trendFlags",
]);

type StructuredFieldItem = { citations: ProfileCitation[] };

export type ProposalVerification = {
  changes: FieldDiff[];
  droppedCitations: number;
  droppedChanges: number;
};

/**
 * Verifies every citation on a proposed set of FieldDiffs against the supplied
 * care records. A citation is valid iff a record with that id exists and its
 * body contains the normalized quote verbatim. Invalid citations are dropped;
 * a change with zero valid top-level citations is dropped entirely. For
 * structured field values (recentChanges/careRecommendations/trendFlags),
 * item-level citations are verified the same way and items left with zero
 * valid citations are dropped from the value array.
 */
export function verifyProposalChanges(changes: FieldDiff[], records: CareRecord[]): ProposalVerification {
  const bodies = new Map(records.map((record) => [record.id, normalizeCitationText(record.body)]));

  const isValidCitation = (citation: ProfileCitation): boolean => {
    const body = bodies.get(citation.recordId);
    if (!body) return false;
    return body.includes(normalizeCitationText(citation.quote));
  };

  let droppedCitations = 0;
  let droppedChanges = 0;
  const kept: FieldDiff[] = [];

  for (const change of changes) {
    const topCitations = change.citations.filter(isValidCitation);
    droppedCitations += change.citations.length - topCitations.length;

    let after = change.after;
    let structuredIsEmpty = false;

    if (structuredProfileFields.has(change.field)) {
      const items = (Array.isArray(after) ? after : []) as StructuredFieldItem[];
      const filteredItems = items
        .map((item) => {
          const itemCitations = item.citations.filter(isValidCitation);
          droppedCitations += item.citations.length - itemCitations.length;
          if (itemCitations.length === 0) return null;
          return { ...item, citations: itemCitations };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      after = filteredItems;
      structuredIsEmpty = filteredItems.length === 0;
    }

    if (topCitations.length === 0 || structuredIsEmpty) {
      droppedChanges += 1;
      continue;
    }

    kept.push({ ...change, citations: topCitations, after });
  }

  return { changes: kept, droppedCitations, droppedChanges };
}

export function needsCorrectiveProposalRerun(verification: ProposalVerification): boolean {
  return verification.droppedChanges > 0 && verification.changes.length === 0;
}
