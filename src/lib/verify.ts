import type { CompileResult } from "./schema";
import type { HistoryNote } from "./data";

export type VerificationResult = {
  result: CompileResult;
  verified: boolean;
  droppedFlags: number;
  droppedCitations: number;
};

export function normalizeCitationText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function verifyCompileResult(result: CompileResult, history: HistoryNote[]): VerificationResult {
  const historyById = new Map(history.map((note) => [note.note_id, normalizeCitationText(note.text)]));
  let droppedFlags = 0;
  let droppedCitations = 0;

  const drift_flags = result.drift_flags.flatMap((flag) => {
    const citations = flag.citations.filter((citation) => {
      const source = historyById.get(citation.note_id);
      const verified = source ? source.includes(normalizeCitationText(citation.quote)) : false;
      if (!verified) {
        droppedCitations += 1;
      }
      return verified;
    });

    if (citations.length === 0) {
      droppedFlags += 1;
      return [];
    }

    return [{ ...flag, citations }];
  });

  return {
    result: { ...result, drift_flags },
    verified: droppedFlags === 0 && droppedCitations === 0,
    droppedFlags,
    droppedCitations,
  };
}

export function needsCorrectiveRerun(verification: VerificationResult): boolean {
  return verification.droppedFlags > 0 && verification.result.drift_flags.length === 0;
}
